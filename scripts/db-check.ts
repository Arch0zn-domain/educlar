import { dataDir } from '../src/lib/config';
import { openDatabase } from '../src/lib/db';
import { installOfficialSnapshot } from '../src/lib/official-data';
async function main() {
const db = await openDatabase(dataDir, true);
try {
  await installOfficialSnapshot(db.query);
  for (const table of ['schools', 'statistics', 'teachers', 'profiles', 'reviews', 'requests', 'privacy_requests']) {
    const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM ${table}`);
    console.log(`${table}: ${count}`);
  }
  console.log((await db.query('SELECT count(*)::int AS active_official_schools FROM schools WHERE active AND NOT demo'))[0]);
  console.log(await db.query('SELECT year,exam,count(*)::int AS cohorts FROM statistics WHERE NOT demo GROUP BY year,exam ORDER BY year,exam'));
  console.log('Migrații și persistență: OK');
} finally { await db.close(); }

}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
