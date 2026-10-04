import importlib.util
import io
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('official', Path(__file__).resolve().parents[1] / 'scripts/fetch-official.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)

class OfficialImportTests(unittest.TestCase):
    def test_identifiers_and_missing_grades(self):
        self.assertEqual(official.siiir('161102892'), '0161102892')
        self.assertIsNone(official.number(''))
        self.assertIsNone(official.number('ABSENT'))
        self.assertEqual(official.number(0), 0)
        self.assertEqual(official.number('9,25'), 9.25)

    def test_bac_appeals_failed_candidates_and_absences(self):
        row = {'STATUS': 'Nepromovat', 'Medie': '', 'NOTA_EA': '4', 'NOTA_EC': '6', 'NOTA_ED': '8',
               'CONTESTATIE_EA': 'Da', 'NOTA_CONTESTATIE_EA': '5'}
        present, grade, passed = official.exam_result(row, 'BAC')
        self.assertTrue(present)
        self.assertEqual(str(grade), '6.33')
        self.assertFalse(passed)
        self.assertEqual(official.exam_result({'STATUS': 'Absent', 'Medie': ''}, 'BAC'), (False, None, False))
        self.assertEqual(official.exam_result({'STATUS': 'Eliminat', 'Medie': '9'}, 'BAC'), (True, None, False))

    def test_en_requires_every_mandatory_paper(self):
        row = {'STATUS ROMANA': 'PREZENT', 'STATUS MATEMATICA': 'PREZENT', 'STATUS LIMBA MATERNA': '-', 'MEDIA': '9'}
        self.assertEqual(official.exam_result(row, 'EN'), (True, 9, False))
        self.assertEqual(official.exam_result(dict(row, **{'STATUS LIMBA MATERNA': 'ABSENT'}), 'EN'), (False, None, False))

    def test_full_xlsx_reader_preserves_text_codes_and_detects_headers(self):
        data = io.BytesIO()
        with ZipFile(data, 'w') as archive:
            archive.writestr('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>COD SIIIR</t></si><si><t>0161102892</t></si></sst>')
            archive.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>')
        self.assertEqual(list(official.records(data.getvalue(), {'COD SIIIR'})), [{'COD SIIIR': '0161102892'}])
        with self.assertRaises(ValueError): list(official.records(data.getvalue(), {'Unexpected header'}))

    def test_unmatched_candidates_are_not_attached_to_similar_names(self):
        row = {'COD UNIC CANDIDAT': '1', 'COD SIIIR': '9999999999', 'MEDIA': '9', 'STATUS ROMANA': 'PREZENT', 'STATUS MATEMATICA': 'PREZENT'}
        statistics, counts = official.aggregate([row], 'EN', {})
        self.assertEqual(statistics, [])
        self.assertEqual(counts['unmatched_candidates'], 1)
        with self.assertRaises(ValueError): official.aggregate([row, row], 'EN', {})

    def test_each_historical_cohort_keeps_verified_year_and_no_candidate_identifiers(self):
        code = '0161102892'
        row = {'COD UNIC CANDIDAT': 'fixture-candidate', 'COD SIIIR': code, 'MEDIA': '9', 'STATUS ROMANA': 'PREZENT', 'STATUS MATEMATICA': 'PREZENT'}
        for year in [2023, 2024, 2025, 2026]:
            data, counts = official.aggregate([row], 'EN', {code: {}}, year, 'vară')
            self.assertEqual(data[0]['year'], year)
            self.assertEqual(data[0]['session'], 'vară')
            self.assertEqual(counts['input_rows'], 1)
            self.assertNotIn('fixture-candidate', json.dumps(data))
            self.assertEqual(data[0]['school_id'], official.school_id(code))
        with self.assertRaises(ValueError): official.aggregate([row], 'EN', {code: {}}, 2022)
        with self.assertRaises(ValueError): official.aggregate([row], 'EN', {code: {}}, 2025, 'toamnă')

    def test_authoritative_entity_type_excludes_clubs_with_school_names(self):
        base = {'An': '2025-2026', 'Denumire lunga unitate': 'COLEGIUL EXEMPLU', 'Judet PJ': 'AB', 'Localitate unitate': 'Alba Iulia'}
        rows = [dict(base, **{'Cod SIIIR unitate': '161102892', 'Tip unitate': 'Unitate de învățământ'}),
                dict(base, **{'Cod SIIIR unitate': '4082106925', 'Tip unitate': 'Club sportiv școlar'}),
                dict(base, **{'Cod SIIIR unitate': '2291107277', 'Tip unitate': 'Comisie universități'})]
        schools, counts = official.network(rows)
        self.assertEqual(list(schools), ['0161102892'])
        self.assertEqual(counts, {'network_rows': 3, 'included_schools': 1, 'excluded_non_school_entities': 2})
        with self.assertRaises(ValueError): official.network([dict(rows[0], An='2024-2025')])
        with self.assertRaises(ValueError): official.network([rows[0], rows[0]])

    def test_ckan_rejects_wrong_year_publisher_license_or_resource(self):
        name, rid, digest = official.EXAMS[2025]['bac']
        resource = {'id': rid, 'url': f'https://data.gov.ro/dataset/example/resource/{rid}/download/exam.xlsx'}
        package = {'name': name, 'title': 'Rezultate Bacalaureat sesiunea iunie 2025', 'organization': {'name': 'ministerul-educatiei'}, 'license_id': 'CC-BY-4.0', 'resources': [resource]}
        self.assertEqual(official.validated_resource(package, (name, rid, digest), 2025), resource)
        for invalid in [dict(package, title='Rezultate Bacalaureat 2024'), dict(package, name='rezultate_bacalaureat'),
                        dict(package, license_id='unknown'), dict(package, organization={'name': 'private-publisher'}),
                        dict(package, resources=[dict(resource, id='other')]), dict(package, resources=[resource, resource]),
                        dict(package, resources=[dict(resource, url=resource['url'].replace('data.gov.ro', 'example.com'))])]:
            with self.assertRaises(ValueError): official.validated_resource(invalid, (name, rid, digest), 2025)

    def test_workbook_cache_requires_matching_verified_content_hash(self):
        name, rid, _ = official.EXAMS[2025]['en']
        payload = b'fixture-content'
        digest = hashlib.sha256(payload).hexdigest()
        resource = {'id': rid, 'url': f'https://data.gov.ro/dataset/example/resource/{rid}/download/exam.xlsx'}
        package = {'name': name, 'title': 'Evaluarea Nationala 2025', 'organization': {'name': 'ministerul-educatiei', 'title': 'Ministerul Educației'}, 'license_id': 'CC-BY-4.0', 'resources': [resource], 'metadata_modified': '2026-01-01'}
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder)
            (cache / 'en-2025.meta.json').write_text(json.dumps(package), encoding='utf-8')
            (cache / 'en-2025.xlsx').write_bytes(payload)
            with patch.object(official, 'fetch', side_effect=AssertionError('Cache must avoid network access')):
                actual, source = official.ckan_resource('en-2025', (name, rid, digest), 2025, cache)
                self.assertEqual(actual, payload)
                self.assertEqual(source['id'], 'official-en-2025')
                (cache / 'en-2025.xlsx').write_bytes(b'different-year-content')
                with self.assertRaises(ValueError): official.ckan_resource('en-2025', (name, rid, digest), 2025, cache)

    def test_admission_cache_cannot_be_reused_for_another_county_or_year(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder)
            url = 'https://static.admitere.edu.ro/2025/repartizare/AB/data/specialization.json'
            payload = json.dumps([{'j': 'AB', 'lc': '0161102892', 'c': '101', 'sp': 'Matematică', 'lp': 'română', 'lb': '-', 'fi': 'Zi', 'nlo': '20', 'nlt': '24', 'um': '8.5'}]).encode()
            with patch.object(official, 'fetch', return_value=payload) as fetch:
                _, rows, actual_url = official.admission_resource(2025, 'AB', cache)
                self.assertEqual(actual_url, url)
                self.assertEqual(len(rows), 1)
                self.assertEqual(fetch.call_count, 1)
                official.admission_resource(2025, 'AB', cache)
                self.assertEqual(fetch.call_count, 1)
            with self.assertRaises(ValueError): official.admission_resource(2024, 'AB', cache)
            metadata_path = cache / 'admission-2025-AB.meta.json'
            metadata = json.loads(metadata_path.read_text())
            metadata['url'] = metadata['url'].replace('/2025/', '/2026/')
            metadata_path.write_text(json.dumps(metadata))
            with self.assertRaises(ValueError): official.admission_resource(2025, 'AB', cache)

    def test_raw_cache_is_restricted_to_gitignored_directories(self):
        with self.assertRaises(ValueError): official.cache_directory(official.ROOT / 'data' / 'official' / 'raw')

if __name__ == '__main__': unittest.main()
