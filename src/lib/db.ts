import { PGlite } from '@electric-sql/pglite';
import { drizzle as liteDrizzle } from 'drizzle-orm/pglite';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as schema from './schema';
import { assertRuntime, dataDir } from './config';

export type Row = Record<string, any>;
export type Query = <T extends Row = Row>(sql: string, params?: any[]) => Promise<T[]>;
type Database = { query: Query; orm: ReturnType<typeof liteDrizzle<typeof schema>> | ReturnType<typeof pgDrizzle<typeof schema>>; close: () => Promise<void> };
const globalDb = globalThis as unknown as { eduDb?: Promise<Database>; eduQueue?: Promise<unknown>; eduOfficial?: Promise<void> };
export async function openDatabase(directory: string, seed = false): Promise<Database> {
  assertRuntime();
  await mkdir(directory, { recursive: true });
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }) : null;
  const lite = pool ? null : new PGlite(path.join(directory, 'postgres'));
  const query: Query = async (sql, params = []) => (pool ? await pool.query(sql, params) : await lite!.query(sql, params)).rows as any;
  await query('CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  for (const name of (await readdir(path.join(process.cwd(), 'migrations'))).filter(n => n.endsWith('.sql')).sort()) {
    if ((await query('SELECT name FROM migrations WHERE name=$1', [name])).length) continue;
    const sql = await readFile(path.join(process.cwd(), 'migrations', name), 'utf8');
    await query('BEGIN');
    try {
      if (pool) await pool.query(sql); else await lite!.exec(sql);
      await query('INSERT INTO migrations(name) VALUES($1)', [name]);
      await query('COMMIT');
    } catch(e) { await query('ROLLBACK'); throw e; }
  }
  const db: Database = { query, orm: pool ? pgDrizzle(pool, { schema }) : liteDrizzle(lite!, { schema }), close: async () => { if(pool) await pool.end(); else await lite!.close(); } };
  if (seed && !(await query("SELECT key FROM app_meta WHERE key='seed-v1'")).length) {
    const { seedDatabase } = await import('./seed');
    await seedDatabase(query);
  }
  return db;
}
export async function database() {
  const db = await (globalDb.eduDb ??= openDatabase(dataDir, true));
  await (globalDb.eduOfficial ??= (async () => {
    const { installOfficialSnapshot } = await import('./official-data');
    await installOfficialSnapshot(db.query);
    const { installCuratedTeachers } = await import('./curated-teachers');
    await installCuratedTeachers(db.query);
  })());
  return db;
}
export const query: Query = async (sql, params) => (await database()).query(sql, params);
// PGlite owns one connection; serialize complete domain operations, including reads.
export async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = (globalDb.eduQueue || Promise.resolve()).then(fn, fn);
  globalDb.eduQueue = run.catch(() => {});
  return run;
}
