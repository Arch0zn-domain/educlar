import { PGlite } from '@electric-sql/pglite';
import { drizzle as liteDrizzle } from 'drizzle-orm/pglite';
import { drizzle as pgDrizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as schema from './schema';
import { assertRuntime, dataDir } from './config';

export type Row = Record<string, any>;
export type Query = <T extends Row = Row>(sql: string, params?: any[]) => Promise<T[]>;
type Database = { query: Query; atomicQuery: Query; orm: ReturnType<typeof liteDrizzle<typeof schema>> | NodePgDatabase<typeof schema>; close: () => Promise<void> };
const globalDb = globalThis as unknown as { eduDb?: Promise<Database>; eduQueue?: Promise<unknown> };
export async function openDatabase(directory: string, seed = false, install = false): Promise<Database> {
  assertRuntime();
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }) : null;
  if (!pool) await mkdir(directory, { recursive: true });
  const client = pool ? await pool.connect() : null;
  const statements = pool ? new Pool({ connectionString:process.env.DATABASE_URL,max:2,idleTimeoutMillis:10000 }) : null;
  const lite = pool ? null : new PGlite(path.join(directory, 'postgres'));
  const query: Query = async (sql, params = []) => (client ? await client.query(sql, params) : await lite!.query(sql, params)).rows as any;
  const close = async () => { if(pool) { client!.release(); await statements!.end(); await pool.end(); } else await lite!.close(); };
  // A pinned connection makes migrations, seeding and snapshot transactions safe
  // across simultaneous serverless cold starts.
  try {
  if (client) await query('SELECT pg_advisory_lock(193122026)');
  await query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  for (const name of (await readdir(path.join(process.cwd(), 'migrations'))).filter(n => n.endsWith('.sql')).sort()) {
    if ((await query('SELECT name FROM migrations WHERE name=$1', [name])).length) continue;
    const sql = await readFile(path.join(process.cwd(), 'migrations', name), 'utf8');
    await query('BEGIN');
    try {
      if (client) await client.query(sql); else await lite!.exec(sql);
      await query('INSERT INTO migrations(name) VALUES($1)', [name]);
      await query('COMMIT');
    } catch(e) { await query('ROLLBACK'); throw e; }
  }
  // Budget/cache statements must never join an unrelated domain transaction.
  const atomicQuery: Query = statements ? async (sql,params) => (await statements.query(sql,params)).rows as any : (sql,params) => serialized(()=>query(sql,params));
  const db: Database = { query, atomicQuery, orm: client ? pgDrizzle(client, { schema }) : liteDrizzle(lite!, { schema }), close };
  if (seed && !(await query("SELECT key FROM app_meta WHERE key='seed-v1'")).length) {
    const { seedDatabase } = await import('./seed');
    await seedDatabase(query);
  }
  if (install) {
    const { installOfficialSnapshot } = await import('./official-data');
    await installOfficialSnapshot(query);
    const { installCuratedTeachers } = await import('./curated-teachers');
    await installCuratedTeachers(query);
  }
  if (client) await query('SELECT pg_advisory_unlock(193122026)');
  return db;
  } catch (error) { await close(); throw error; }
}
export async function database() {
  return globalDb.eduDb ??= openDatabase(dataDir, true, true).catch(error => {
    globalDb.eduDb = undefined;
    throw error;
  });
}
export const query: Query = async (sql, params) => (await database()).query(sql, params);
export const atomicQuery: Query = async (sql, params) => (await database()).atomicQuery(sql, params);
// PGlite owns one connection; serialize complete domain operations, including reads.
export async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = (globalDb.eduQueue || Promise.resolve()).then(fn, fn);
  globalDb.eduQueue = run.catch(() => {});
  return run;
}
