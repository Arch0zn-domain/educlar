"""Refresh the aggregate-only snapshot using Python 3's standard library."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
import hashlib
import io
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from urllib.request import urlopen, Request
from urllib.parse import urlparse
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
COUNTIES = dict(zip(
    'AB AR AG BC BH BN BT BR BV BZ CL CS CJ CT CV DB DJ GL GR GJ HR HD IL IS IF MM MH B MS NT OT PH SJ SM SB SV TR TM TL VS VL VN'.split(),
    ['Alba','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani','Brăila','Brașov','Buzău','Călărași','Caraș-Severin','Cluj','Constanța','Covasna','Dâmbovița','Dolj','Galați','Giurgiu','Gorj','Harghita','Hunedoara','Ialomița','Iași','Ilfov','Maramureș','Mehedinți','București','Mureș','Neamț','Olt','Prahova','Sălaj','Satu Mare','Sibiu','Suceava','Teleorman','Timiș','Tulcea','Vaslui','Vâlcea','Vrancea']))
# Resource IDs and hashes were checked against the ministry's actual CKAN files.
# A changed resource needs an explicit review; a similarly named file is not enough.
NETWORK = ('retea-scolara-2025-2026', '280d52b6-4c5e-489d-9b48-3dd8961f56e0',
           '35cb33c83752a6ac6334f1bd43a8bd53e9573684f949047aa05bd72056971a32')
EXAMS = {
    2023: {
        'bac': ('rezultate-bacalaureat-2023-sesiunea-1', '9635d473-edcb-4df6-af26-968f8030df54', '83a10e939e6f9e47370425ed44a89af01b7ead06fc80c066b36eed9dfc29e162'),
        'en': ('rezultatele-la-evaluarea-nationala-2023', '85276922-8ff7-4bb2-bb88-c27e03c67551', '25b5cc7328361b128411b9f629614f2c304ea03aa57eec0361b983931eaac681')},
    2024: {
        'bac': ('rezultate_bacalaureat', '46737b48-5873-4775-8621-f9b28fef6ed7', '918bea893551283297089e1fcf9984c1886e75939465a5dbffb69082cc11f3d5'),
        'en': ('evaluare_nationala_24', '39eefd94-485e-4ddf-86c8-c0395689b949', '201d4965a7642a0622b524c87f91808b2f90db6e8b20d1fdf53d7bfb65c6b383')},
    2025: {
        'bac': ('rezultate-bacalaureat-sesiunea-iunie-2025', 'c101dded-606c-4807-8059-e7f3cb4fd3aa', 'bc1677e9a48729f80060e8baec392b4758804a24f8119e12538bb535dea7f3d0'),
        'en': ('rezultate_evaluare_2025', '182f732d-4303-4985-9499-814a8789adba', 'e87e2b02a95c86f99adef2ff0fc489cb124b61e6451f72cd9d37db24f8f6355c')},
    2026: {
        'bac': ('rezultate_bacalaureat_2026', '53cbc02e-e846-43f7-bc86-0d4ec43ac792', '10faf6db86a27985d9a305e23e5310354f8a976f904ac717721fa25a5555492f'),
        'en': ('rezultate_evaluare_2026', 'e5672a85-6457-4cfd-b132-3307a70a10bc', 'd940aadd6010552923a763c0e1a78f15e0c752e4c30434051b3cc99b1fb98435')}}
ADMISSION_YEARS = {2025, 2026}

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD', str(value or '').strip().lower())
                   if unicodedata.category(c) != 'Mn').replace('ş', 's').replace('ţ', 't')

def siiir(value):
    text = str(value or '').strip()
    if not re.fullmatch(r'\d{1,10}', text):
        raise ValueError('Cod SIIIR invalid')
    return text.zfill(10)

def school_id(code):
    return 'ro-' + hashlib.sha256(code.encode()).hexdigest()[:16]

def number(value):
    text = str(value if value is not None else '').strip().replace(',', '.')
    if not re.fullmatch(r'\d+(?:\.\d+)?', text):
        return None
    grade = Decimal(text)
    return grade if 0 <= grade <= 10 else None

def fetch(url):
    if urlparse(url).hostname not in {'data.gov.ro', 'static.admitere.edu.ro'} or not url.startswith('https://'):
        raise ValueError('Sursă neașteptată')
    with urlopen(Request(url, headers={'User-Agent': 'EduClar/0.1 official-data-import'}), timeout=120) as response:
        if urlparse(response.url).hostname not in {'data.gov.ro', 'static.admitere.edu.ro'} or not response.url.startswith('https://'):
            raise ValueError('Redirecționare neașteptată')
        payload = response.read(70 * 1024 * 1024 + 1)
        if len(payload) > 70 * 1024 * 1024:
            raise ValueError('Resursă prea mare')
        return payload

def atomic_write(target, payload):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='wb', dir=target.parent, delete=False) as stream:
        stream.write(payload)
        temporary = Path(stream.name)
    temporary.replace(target)

def cache_directory(path):
    path = path.resolve()
    if not any(path == folder or folder in path.parents for folder in [(ROOT / '.data').resolve(), (ROOT / '.logs').resolve()]):
        raise ValueError('Fișierele brute se păstrează doar în .data sau .logs, excluse din Git')
    path.mkdir(parents=True, exist_ok=True)
    return path

def validated_resource(package, specification, year):
    name, resource_id, _ = specification
    if (package.get('name') != name or package.get('organization', {}).get('name') != 'ministerul-educatiei'
            or package.get('license_id') != 'CC-BY-4.0' or not re.search(r'(?<!\d)' + str(year) + r'(?!\d)', str(package.get('title', '')))):
        raise ValueError('Editorul, anul, setul sau licența sursei s-au schimbat')
    matches = [r for r in package.get('resources', []) if r.get('id') == resource_id]
    if len(matches) != 1:
        raise ValueError('Resursa oficială verificată lipsește sau este ambiguă')
    resource = matches[0]
    url = urlparse(resource.get('url', ''))
    if url.scheme != 'https' or url.hostname != 'data.gov.ro' or ('/resource/' + resource_id + '/download/') not in url.path or not url.path.lower().endswith('.xlsx'):
        raise ValueError('Adresa resursei oficiale s-a schimbat')
    return resource

def ckan_resource(key, specification, year, cache):
    name, _, expected_hash = specification
    metadata_path, workbook_path = cache / (key + '.meta.json'), cache / (key + '.xlsx')
    package = (json.loads(metadata_path.read_text(encoding='utf-8')) if metadata_path.exists()
               else json.loads(fetch('https://data.gov.ro/api/3/action/package_show?id=' + name))['result'])
    resource = validated_resource(package, specification, year)
    payload = workbook_path.read_bytes() if workbook_path.exists() else fetch(resource['url'])
    if hashlib.sha256(payload).hexdigest() != expected_hash:
        raise ValueError('Fișierul ' + key + ' nu coincide cu resursa oficială verificată; este necesară reverificarea sursei')
    if not workbook_path.exists(): atomic_write(workbook_path, payload)
    if not metadata_path.exists(): atomic_write(metadata_path, json.dumps(package, ensure_ascii=False).encode('utf-8'))
    source = {'id': 'official-' + key, 'title': package['title'], 'url': 'https://data.gov.ro/dataset/' + name,
              'publisher': package['organization']['title'], 'year': year,
              'license': 'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ ; prelucrare și agregare EduClar.',
              'resource_url': resource['url'], 'resource_id': resource['id'], 'sha256': expected_hash,
              'updated_at': package['metadata_modified']}
    return payload, source

def admission_resource(year, county, cache):
    if year not in ADMISSION_YEARS or county not in COUNTIES:
        raise ValueError('An sau județ de admitere neverificat')
    url = f'https://static.admitere.edu.ro/{year}/repartizare/{county}/data/specialization.json'
    target, metadata_path = cache / f'admission-{year}-{county}.json', cache / f'admission-{year}-{county}.meta.json'
    if target.exists() and metadata_path.exists():
        payload = target.read_bytes()
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        if metadata.get('url') != url or metadata.get('sha256') != hashlib.sha256(payload).hexdigest():
            raise ValueError('Cache de admitere invalid')
    else:
        payload = fetch(url)
    rows = json.loads(payload)
    if not isinstance(rows, list) or not rows:
        raise ValueError('Raport de admitere gol sau invalid')
    for row in rows:
        if not isinstance(row, dict) or not {'j','lc','c','sp','lp','lb','fi','nlo','nlt','um'}.issubset(row) or row['j'] != county:
            raise ValueError('Structura sau județul raportului de admitere s-a schimbat')
    if not target.exists() or not metadata_path.exists():
        atomic_write(target, payload)
        atomic_write(metadata_path, json.dumps({'url': url, 'sha256': hashlib.sha256(payload).hexdigest()}).encode())
    return payload, rows, url

def records(payload, required):
    """Read actual XLSX rows, preserving leading zeros and ignoring workbook styles."""
    with ZipFile(io.BytesIO(payload)) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            with archive.open('xl/sharedStrings.xml') as stream:
                for _, element in ET.iterparse(stream, events=('end',)):
                    if element.tag == NS + 'si':
                        strings.append(''.join(t.text or '' for t in element.iter(NS + 't')))
                        element.clear()
        with archive.open('xl/worksheets/sheet1.xml') as stream:
            header = None
            for _, element in ET.iterparse(stream, events=('end',)):
                if element.tag != NS + 'row':
                    continue
                values = {}
                for cell in element.findall(NS + 'c'):
                    column = re.match(r'[A-Z]+', cell.attrib['r'])[0]
                    v = cell.find(NS + 'v')
                    value = v.text if v is not None else ''
                    if cell.attrib.get('t') == 's':
                        value = strings[int(value)]
                    elif cell.attrib.get('t') == 'inlineStr':
                        value = ''.join(t.text or '' for t in cell.iter(NS + 't'))
                    values[column] = value
                if header is None:
                    titles = {column: str(value).strip() for column, value in values.items()}
                    if required.issubset(set(titles.values())):
                        header = titles
                elif values:
                    row = {title: values.get(column, '') for column, title in header.items()}
                    if any(str(v).strip() for v in row.values()):
                        yield row
                element.clear()
            if header is None:
                raise ValueError('Antetul oficial s-a schimbat: ' + ', '.join(sorted(required)))

def classify(name):
    name = normalize(name)
    if 'colegi' in name: return 'colegiu'
    if 'lice' in name or 'seminar' in name: return 'liceu'
    if 'gimnaz' in name: return 'gimnaziu'
    return None

def exam_result(row, exam):
    if exam == 'EN':
        required = ['STATUS ROMANA', 'STATUS MATEMATICA']
        if normalize(row.get('STATUS LIMBA MATERNA')) not in {'', '-', 'neevaluat'}:
            required.append('STATUS LIMBA MATERNA')
        present = all(normalize(row.get(k)) == 'prezent' for k in required)
        return present, number(row.get('MEDIA')) if present else None, False
    status = normalize(row.get('STATUS'))
    if status not in {'promovat', 'nepromovat', 'absent', 'eliminat'}:
        raise ValueError('Status BAC necunoscut: ' + status)
    present = status != 'absent'
    grade = number(row.get('Medie')) if status in {'promovat', 'nepromovat'} else None
    if grade is None and status == 'nepromovat':
        subjects = ['EA', 'EC', 'ED'] + (['EB'] if str(row.get('Subiect eb') or '').strip() else [])
        marks = [number(row.get('NOTA_CONTESTATIE_' + s)) if normalize(row.get('CONTESTATIE_' + s)) == 'da'
                 else number(row.get('NOTA_' + s)) for s in subjects]
        if all(mark is not None for mark in marks):
            grade = (sum(marks) / len(marks)).quantize(Decimal('.01'), rounding=ROUND_DOWN)
    return present, grade, status == 'promovat'

def network(rows):
    schools, total, excluded_entities = {}, 0, 0
    for row in rows:
        total += 1
        if row['An'] != '2025-2026':
            raise ValueError('An școlar neașteptat')
        name = str(row['Denumire lunga unitate']).strip()
        kind = classify(name)
        if str(row.get('Tip unitate') or '').strip() != 'Unitate de învățământ':
            excluded_entities += int(kind is not None)
            continue
        if not kind:
            continue
        code = siiir(row['Cod SIIIR unitate'])
        if code in schools:
            raise ValueError('Cod SIIIR duplicat în rețea')
        schools[code] = {'official_id': code, 'name': name, 'county': COUNTIES[row['Judet PJ']],
                         'city': str(row['Localitate unitate']).strip(), 'type': kind, 'enrolled': None, 'enrolled_year': None}
    return schools, {'network_rows': total, 'included_schools': len(schools), 'excluded_non_school_entities': excluded_entities}

def aggregate(rows, exam, schools, year=2026, session='vară'):
    if exam not in {'BAC', 'EN'} or year not in EXAMS or session != 'vară':
        raise ValueError('Examen, an sau sesiune neverificată')
    groups, seen, unmatched = {}, set(), 0
    for row in rows:
        candidate = str(row.get('Cod unic candidat' if exam == 'BAC' else 'COD UNIC CANDIDAT') or '')
        if not candidate or candidate in seen:
            raise ValueError('Identificator lipsă sau duplicat în rezultatele oficiale')
        seen.add(candidate)
        code = siiir(row['Unitate (SIIIR)' if exam == 'BAC' else 'COD SIIIR'])
        if code not in schools:
            unmatched += 1
            continue
        present, grade, passed = exam_result(row, exam)
        g = groups.setdefault(code, {'candidates': 0, 'attended': 0, 'valid': 0, 'promoted': 0, 'sum': Decimal(0),
                                    'distribution': dict.fromkeys(['sub 5','5–6','6–7','7–8','8–9','9–10'], 0)})
        g['candidates'] += 1
        g['attended'] += int(present)
        g['promoted'] += int(passed)
        if grade is not None:
            g['valid'] += 1
            g['sum'] += grade
            bucket = 'sub 5' if grade < 5 else '5–6' if grade < 6 else '6–7' if grade < 7 else '7–8' if grade < 8 else '8–9' if grade < 9 else '9–10'
            g['distribution'][bucket] += 1
    stats = []
    for code, g in sorted(groups.items()):
        total = g.pop('sum')
        stats.append(dict(g, school_id=school_id(code), exam=exam, year=year, session=session, specialization='', stage='',
                          mean=float((total / g['valid']).quantize(Decimal('.01'))) if g['valid'] else None,
                          minimum=None, promoted=g['promoted'] if exam == 'BAC' else None))
    return stats, {'input_rows': len(seen), 'unmatched_candidates': unmatched, 'school_cohorts': len(stats)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=ROOT / '.data' / 'source-cache', help='Persistent raw-file cache under .data or .logs (excluded from Git)')
    parser.add_argument('--years', nargs='+', type=int, choices=sorted(EXAMS), default=sorted(EXAMS), help='Verified BAC/EN years; admission is available for 2025 and 2026')
    args = parser.parse_args()
    cache, years = cache_directory(args.cache_dir), sorted(set(args.years))
    payload, source = ckan_resource('network-2025', NETWORK, 2025, cache)
    sources = [source]
    schools, coverage = network(records(payload, {'Cod SIIIR unitate', 'Denumire lunga unitate', 'Judet PJ', 'An', 'Tip unitate'}))
    print('Schools: ' + str(len(schools)), flush=True)
    statistics = []
    coverage['years'], coverage['by_year'] = years, {}
    for year in years:
        annual = coverage['by_year'][str(year)] = {}
        for key, exam in [('bac', 'BAC'), ('en', 'EN')]:
            payload, source = ckan_resource(f'{key}-{year}', EXAMS[year][key], year, cache)
            sources.append(source)
            required = {'Unitate (SIIIR)', 'STATUS', 'Medie'} if exam == 'BAC' else {'COD SIIIR', 'MEDIA', 'STATUS ROMANA', 'STATUS MATEMATICA'}
            data, annual[key] = aggregate(records(payload, required), exam, schools, year, 'vară')
            statistics.extend(dict(row, source_id=source['id']) for row in data)
            print(f'{exam} {year}: ' + json.dumps(annual[key]), flush=True)
        if year not in ADMISSION_YEARS:
            annual['admission'] = {'available': False, 'reason': 'Resursele de specializări ale arhivei oficiale nu sunt disponibile (HTTP 404 la verificare); nu s-au substituit date din alt an.'}
            continue
        admissions, missed = 0, 0
        for county in COUNTIES:
            payload, rows, url = admission_resource(year, county, cache)
            sid = f'official-admission-{year}-{county}'
            sources.append({'id': sid, 'title': f'Admitere {year} — ' + COUNTIES[county], 'url': url.replace('data/specialization.json', 'index.html'),
                            'publisher': 'Ministerul Educației și Cercetării', 'year': year,
                            'license': 'Indicatori factuali din raportul public de repartizare; fără date de candidați. Portalul nu specifică o licență CC BY.',
                            'resource_url': url, 'sha256': hashlib.sha256(payload).hexdigest()})
            seen_specializations = set()
            for row in rows:
                code = siiir(row['lc'])
                identity = (code, str(row['c']))
                if identity in seen_specializations:
                    raise ValueError('Specializare duplicată în raportul oficial de admitere')
                seen_specializations.add(identity)
                count = int(row['nlo'])
                minimum = number(row['um'])
                if not 0 <= count <= int(row['nlt']): raise ValueError('Locuri ocupate inconsistente')
                if count and minimum is None: raise ValueError('Medie de admitere invalidă pentru locuri ocupate')
                if code not in schools:
                    missed += 1
                    continue
                statistics.append({'school_id': school_id(code), 'exam': 'ADMITERE', 'year': year, 'session': 'iulie',
                                   'specialization': ' · '.join(str(row[k]) for k in ['sp','lp','lb','fi']) + ' · cod ' + str(row['c']),
                                   'stage': 'repartizare computerizată', 'candidates': count, 'attended': None, 'valid': None,
                                   'promoted': None, 'mean': None, 'minimum': float(minimum) if minimum is not None and count else None,
                                   'distribution': {}, 'source_id': sid})
                admissions += 1
        annual['admission'] = {'available': True, 'included_specializations': admissions, 'unmatched_specializations': missed}
        print(f'ADMITERE {year}: ' + json.dumps(annual['admission']), flush=True)
    # Keep the latest-year summaries compatible with the original UI/importer.
    for key in ['bac', 'en', 'admission']:
        coverage[key] = coverage['by_year'][str(max(years))][key]
    suppressed = 0
    for stat in statistics:
        stat['suppressed'] = stat['candidates'] < 10 or any(0 < n < 5 for n in stat['distribution'].values())
        if stat['suppressed']:
            suppressed += 1
            for key in ['attended', 'valid', 'promoted', 'mean', 'minimum']:
                stat[key] = None
            stat['distribution'] = {}
    coverage['suppressed_cohorts'] = suppressed
    coverage['statistics_total'] = len(statistics)
    snapshot = {'version': 1, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'coverage': coverage,
                'sources': sources, 'schools': [dict(s, source_id='official-network-2025') for _, s in sorted(schools.items())],
                'statistics': statistics}
    target = ROOT / 'data' / 'official' / 'snapshot.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    # Replace only after every resource and cohort has validated successfully.
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, delete=False) as stream:
        json.dump(snapshot, stream, ensure_ascii=False, separators=(',', ':'))
        stream.write('\n')
        temporary = Path(stream.name)
    temporary.replace(target)
    print(json.dumps(coverage, ensure_ascii=True), flush=True)

if __name__ == '__main__':
    main()
