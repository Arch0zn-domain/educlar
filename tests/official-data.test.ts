import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { openDatabase } from '../src/lib/db';
import { installOfficialSnapshot, officialSchoolId, validateOfficialSnapshot } from '../src/lib/official-data';
import { publicStatistics } from '../src/lib/domain';
import { stageImport, publishImport } from '../src/lib/imports';

const input = JSON.parse(await readFile(path.join(process.cwd(), 'data/official/snapshot.json'), 'utf8'));
let db: Awaited<ReturnType<typeof openDatabase>>;
let testDirectory: string;
beforeAll(async () => {
  await mkdir('.data', { recursive: true });
  testDirectory = await mkdtemp(path.resolve('.data', 'official-test-'));
  db = await openDatabase(testDirectory, true);
});
afterAll(async () => {
  await db?.close();
  const root = path.resolve('.data');
  if (testDirectory && path.dirname(testDirectory) === root && path.basename(testDirectory).startsWith('official-test-')) await rm(testDirectory, { recursive:true });
});

describe('official education snapshot', () => {
  it('validates all cohorts, references and suppressed records without candidate-level data', () => {
    const snapshot = validateOfficialSnapshot(input);
    expect(snapshot.schools).toHaveLength(input.coverage.included_schools);
    expect(snapshot.statistics.length).toBe(input.coverage.statistics_total ?? input.coverage.bac.school_cohorts + input.coverage.en.school_cohorts + input.coverage.admission.included_specializations);
    for (const stat of snapshot.statistics) {
      if (stat.suppressed) {
        expect([stat.mean, stat.minimum, stat.attended, stat.valid, stat.promoted]).toEqual([null, null, null, null, null]);
        expect(stat.distribution).toEqual({});
        expect(publicStatistics(stat).suppressed).toBe(true);
      }
    }
    expect(JSON.stringify(input)).not.toMatch(/COD UNIC CANDIDAT|Cod unic candidat|NOTA ROMANA|CONTESTATIE_EA/);
    expect(() => validateOfficialSnapshot({ ...input, statistics: [...input.statistics, input.statistics[0]] })).toThrow('duplicată');
  });

  it('installs atomically, preserves an existing school ID and is idempotent', async () => {
    const first = input.schools[0];
    await db.query("INSERT INTO schools(id,official_id,name,county,city,type,source_id,demo,search_text) VALUES('existing-official-school',$1,'Old name','Alba','ABRUD','liceu','demo',true,'old')", [first.official_id]);
    await installOfficialSnapshot(db.query);
    const school = (await db.query('SELECT id,demo,source_id,name FROM schools WHERE official_id=$1', [first.official_id]))[0];
    expect(school).toMatchObject({ id: 'existing-official-school', demo: false, source_id: first.source_id, name: first.name });
    expect((await db.query('SELECT count(*)::int AS n FROM schools WHERE NOT demo'))[0].n).toBe(input.schools.length);
    expect((await db.query('SELECT count(*)::int AS n FROM statistics WHERE NOT demo'))[0].n).toBe(input.statistics.length);
    const related = input.statistics.filter((s: { school_id: string }) => s.school_id === officialSchoolId(first.official_id));
    expect((await db.query("SELECT count(*)::int AS n FROM statistics WHERE school_id='existing-official-school'"))[0].n).toBe(related.length);
    await installOfficialSnapshot(db.query);
    expect((await db.query('SELECT count(*)::int AS n FROM statistics WHERE NOT demo'))[0].n).toBe(input.statistics.length);
  });

  it('updates source classification on JSON refresh and rejects leaking suppressed indicators', async () => {
    await db.query("INSERT INTO sources(id,title,url,publisher,year,license,status,demo) VALUES('refresh-official','Test official','https://example.invalid','Synthetic fixture',2026,'Test fixture only','approved',false)");
    const batch = await stageImport(db.query, 'schools', 'refresh-official', [{ official_id: 'DEMO-0', name: 'Refresh test school', county: 'București', city: 'București', type: 'colegiu' }]);
    await publishImport(db.query, batch);
    expect((await db.query("SELECT demo FROM schools WHERE official_id='DEMO-0'"))[0].demo).toBe(false);
    const suppressed = input.statistics.find((s: { suppressed: boolean }) => s.suppressed);
    const leaked = { ...suppressed, mean: 8.5 };
    expect(() => validateOfficialSnapshot({ ...input, statistics: [leaked] })).toThrow();
    const row = { school_id: 'orizont', exam: 'BAC', year: 2026, session: 'test', candidates: 20, attended: 20, valid: 20, promoted: 18, mean: 8.5, distribution: { '8–9': 20 } };
    const statisticsBatch = await stageImport(db.query, 'statistics', 'refresh-official', [row]);
    await publishImport(db.query, statisticsBatch);
    expect((await db.query("SELECT demo,suppressed FROM statistics WHERE school_id='orizont' AND session='test'"))[0]).toMatchObject({ demo: false, suppressed: false });
  });

  it('retires removed schools without breaking affiliations and rolls back a failed refresh', async () => {
    await db.query("INSERT INTO sources(id,title,url,publisher,year,license,status,demo) VALUES('official-network-2024','Previous fixture','https://example.invalid','Test fixture',2024,'Synthetic test fixture','approved',false),('official-bac-2022','Old exam fixture','https://example.invalid','Test fixture',2022,'Synthetic test fixture','approved',false)");
    await db.query("INSERT INTO schools(id,official_id,name,county,city,type,source_id,demo,search_text) VALUES('retired-fixture','retired-code','Club fixture','Alba','Alba','colegiu','official-network-2024',false,'club fixture')");
    await db.query("INSERT INTO affiliations(teacher_id,school_id) VALUES('ana-pop','retired-fixture')");
    await db.query("INSERT INTO statistics(id,school_id,exam,year,session,candidates,source_id,demo) VALUES('obsolete-statistic','retired-fixture','BAC',2022,'vară',20,'official-bac-2022',false)");
    const raw = await readFile(path.join(process.cwd(),'data/official/snapshot.json'),'utf8');
    const oldMarker = createHash('sha256').update(raw).digest('hex');
    await db.query("UPDATE app_meta SET value=$1 WHERE key='official-snapshot'",[oldMarker]);
    await expect(installOfficialSnapshot(async(sql,params)=>{
      if(sql.startsWith('INSERT INTO statistics')) throw new Error('Injected publication failure');
      return db.query(sql,params);
    })).rejects.toThrow('Injected publication failure');
    expect((await db.query("SELECT active FROM schools WHERE id='retired-fixture'"))[0].active).toBe(true);
    expect(await db.query("SELECT id FROM statistics WHERE id='obsolete-statistic'")).toHaveLength(1);
    expect((await db.query("SELECT value FROM app_meta WHERE key='official-snapshot'"))[0].value).toBe(oldMarker);
    await installOfficialSnapshot(db.query);
    expect((await db.query("SELECT active FROM schools WHERE id='retired-fixture'"))[0].active).toBe(false);
    expect(await db.query("SELECT * FROM affiliations WHERE school_id='retired-fixture'")).toHaveLength(1);
    expect(await db.query("SELECT id FROM statistics WHERE id='obsolete-statistic'")).toHaveLength(0);
    expect(await db.query("SELECT id FROM statistics WHERE source_id='refresh-official'")).toHaveLength(1);
    expect((await db.query("SELECT value FROM app_meta WHERE key='official-snapshot'"))[0].value).toBe(`2:${oldMarker}`);
    const count = (await db.query('SELECT count(*)::int AS n FROM statistics'))[0].n;
    await installOfficialSnapshot(db.query);
    expect((await db.query('SELECT count(*)::int AS n FROM statistics'))[0].n).toBe(count);
  });
});
