import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from '../src/lib/db';
import { installCuratedTeachers } from '../src/lib/curated-teachers';

let db: Awaited<ReturnType<typeof openDatabase>>, directory: string;
beforeAll(async () => {
  await mkdir('.data', { recursive: true });
  directory = await mkdtemp(path.resolve('.data', 'curated-test-'));
  db = await openDatabase(directory, true);
  await db.query("INSERT INTO schools(id,official_id,name,county,city,type,search_text,source_id) VALUES('school79','4061101539','Școala Gimnazială nr. 79','București','București','gimnaziu','scoala 79','demo')");
});
afterAll(async () => {
  await db?.close();
  if (directory && path.dirname(directory) === path.resolve('.data') && path.basename(directory).startsWith('curated-test-')) await rm(directory, { recursive: true });
});
it('adds only the requested profiles without claims, verified experience or fabricated reviews', async () => {
  await installCuratedTeachers(db.query);
  const profiles = await db.query("SELECT id,claimed_by,experience_confirmed,start_year,demo FROM teachers WHERE source_id='curated-school79' ORDER BY id");
  expect(profiles.map(t => t.id)).toEqual(['ciprian-augustin', 'elena-hulber']);
  for (const t of profiles) expect([t.claimed_by, t.experience_confirmed, t.start_year, t.demo]).toEqual([null, false, null, false]);
  expect(await db.query("SELECT * FROM reviews WHERE teacher_id IN ('ciprian-augustin','elena-hulber')")).toEqual([]);
  expect(await db.query("SELECT school_id FROM affiliations WHERE teacher_id='elena-hulber'")).toEqual([{school_id:'school79'}]);
});
it('preserves corrections and withdrawn profiles when the installer runs again', async () => {
  await db.query("UPDATE teachers SET bio='Corectat de profesor',withdrawn=true WHERE id='elena-hulber'");
  await db.query("DELETE FROM app_meta WHERE key='curated-school79-v1'");
  await installCuratedTeachers(db.query);
  expect((await db.query("SELECT bio,withdrawn FROM teachers WHERE id='elena-hulber'"))[0]).toEqual({bio:'Corectat de profesor',withdrawn:true});
});
it('respects a profile suppression on reinstallation', async () => {
  await db.query("DELETE FROM affiliations WHERE teacher_id='ciprian-augustin'");
  await db.query("DELETE FROM teachers WHERE id='ciprian-augustin'");
  await db.query("INSERT INTO suppressions(source_key) VALUES('contributor-school79:ciprian-augustin')");
  await db.query("DELETE FROM app_meta WHERE key='curated-school79-v1'");
  await installCuratedTeachers(db.query);
  expect(await db.query("SELECT id FROM teachers WHERE id='ciprian-augustin'")).toEqual([]);
});
