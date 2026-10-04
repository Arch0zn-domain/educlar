import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Query } from './db';
import { importSchemas } from './imports';
import { normalize } from './domain';

const sourceSchema = z.object({
  id: z.string().min(1), title: z.string().min(3), url: z.string().url(), publisher: z.string().min(2),
  year: z.number().int(), license: z.string().min(5), resource_url: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const snapshotSchema = z.object({
  version: z.literal(1), retrieved_at: z.string().datetime({ offset: true }), coverage: z.record(z.string(), z.unknown()),
  sources: z.array(sourceSchema).min(1),
  schools: z.array(importSchemas.schools.extend({ source_id: z.string() })).min(1),
  statistics: z.array(importSchemas.statistics.safeExtend({ source_id: z.string() })),
});
export const officialSchoolId = (code: string) => 'ro-' + createHash('sha256').update(code).digest('hex').slice(0, 16);
// These exact source ID formats are reserved for the managed education pipeline.
const networkSourcePattern = '^official-network-[0-9]{4}$';
const statisticSourcePattern = '^official-((bac|en)-[0-9]{4}|admission-[0-9]{4}(-[A-Z]{1,2})?)$';
const installerRevision = '2';

export function validateOfficialSnapshot(input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  const sources = new Set(snapshot.sources.map(s => s.id));
  const schools = new Set(snapshot.schools.map(s => officialSchoolId(s.official_id)));
  if (sources.size !== snapshot.sources.length || schools.size !== snapshot.schools.length) throw new Error('Identificatori oficiali duplicați.');
  const statistics = new Set<string>();
  for (const school of snapshot.schools) if (!sources.has(school.source_id)) throw new Error('Sursa instituției lipsește.');
  for (const stat of snapshot.statistics) {
    if (!schools.has(stat.school_id) || !sources.has(stat.source_id)) throw new Error('Instituția sau sursa statisticii lipsește.');
    const key = JSON.stringify([stat.school_id, stat.exam, stat.year, stat.session, stat.specialization, stat.stage]);
    if (statistics.has(key)) throw new Error('Statistică oficială duplicată.');
    statistics.add(key);
  }
  return snapshot;
}

/** Apply a validated, aggregate-only snapshot atomically; never fetch at request time. */
export async function installOfficialSnapshot(q: Query) {
  const raw = await readFile(path.join(process.cwd(), 'data', 'official', 'snapshot.json'), 'utf8');
  const digest = createHash('sha256').update(raw).digest('hex');
  const marker = `${installerRevision}:${digest}`;
  if ((await q("SELECT value FROM app_meta WHERE key='official-snapshot'"))[0]?.value === marker) return;
  const snapshot = validateOfficialSnapshot(JSON.parse(raw));
  const schools = snapshot.schools.map(s => ({ ...s, id: officialSchoolId(s.official_id), search_text: normalize(`${s.name} ${s.county} ${s.city}`) }));
  const statistics = snapshot.statistics.map(s => ({ ...s, id: 'official-' + createHash('sha256').update(JSON.stringify([s.school_id, s.exam, s.year, s.session, s.specialization, s.stage])).digest('hex').slice(0, 32) }));
  await q('BEGIN');
  try {
    await q(`INSERT INTO sources(id,title,url,publisher,year,license,status,demo,fetched_at)
      SELECT id,title,url,publisher,year,license,'approved',false,$2::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,title text,url text,publisher text,year integer,license text)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,publisher=excluded.publisher,year=excluded.year,license=excluded.license,status='approved',demo=false,fetched_at=excluded.fetched_at`,
      [JSON.stringify(snapshot.sources), snapshot.retrieved_at]);
    await q(`INSERT INTO schools(id,official_id,name,county,city,type,enrolled,enrolled_year,source_id,demo,search_text,active)
      SELECT id,official_id,name,county,city,type,enrolled,enrolled_year,source_id,false,search_text,true
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,official_id text,name text,county text,city text,type text,enrolled integer,enrolled_year text,source_id text,search_text text)
      ON CONFLICT(official_id) DO UPDATE SET name=excluded.name,county=excluded.county,city=excluded.city,type=excluded.type,enrolled=excluded.enrolled,enrolled_year=excluded.enrolled_year,source_id=excluded.source_id,demo=false,search_text=excluded.search_text,active=true`, [JSON.stringify(schools)]);
    // Keep absent institutions for account and teacher references, but retire them from the current catalog.
    await q(`UPDATE schools SET active=false
      WHERE source_id ~ $2 AND NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS current(official_id text)
        WHERE current.official_id=schools.official_id
      )`, [JSON.stringify(schools), networkSourcePattern]);
    // A snapshot is authoritative for every managed exam source, including cohorts removed by corrections.
    await q('DELETE FROM statistics WHERE source_id ~ $1', [statisticSourcePattern]);
    // Resolve existing institution IDs after an upsert; imports must preserve affiliations.
    await q(`INSERT INTO statistics(id,school_id,exam,year,session,specialization,stage,candidates,attended,valid,promoted,mean,minimum,distribution,source_id,demo,suppressed)
      SELECT x.id,s.id,x.exam,x.year,x.session,x.specialization,x.stage,x.candidates,x.attended,x.valid,x.promoted,x.mean,x.minimum,x.distribution,x.source_id,false,x.suppressed
      FROM jsonb_to_recordset($1::jsonb) AS x(id text,school_id text,exam text,year integer,session text,specialization text,stage text,candidates integer,attended integer,valid integer,promoted integer,mean numeric,minimum numeric,distribution jsonb,source_id text,suppressed boolean)
      JOIN jsonb_to_recordset($2::jsonb) AS m(id text,official_id text) ON m.id=x.school_id
      JOIN schools s ON s.official_id=m.official_id
      ON CONFLICT(school_id,exam,year,session,specialization,stage) DO UPDATE SET candidates=excluded.candidates,attended=excluded.attended,valid=excluded.valid,promoted=excluded.promoted,mean=excluded.mean,minimum=excluded.minimum,distribution=excluded.distribution,source_id=excluded.source_id,demo=false,suppressed=excluded.suppressed`, [JSON.stringify(statistics), JSON.stringify(schools)]);
    const summary = { retrieved_at: snapshot.retrieved_at, ...snapshot.coverage };
    for (const [key, value] of [['official-snapshot', marker], ['official-coverage', JSON.stringify(summary)]]) {
      await q('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
    }
    await q('COMMIT');
  } catch (error) { await q('ROLLBACK'); throw error; }
}
