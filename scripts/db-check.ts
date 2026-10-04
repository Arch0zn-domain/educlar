import { dataDir } from '../src/lib/config';
import { openDatabase } from '../src/lib/db';
async function main() {
const db = await openDatabase(dataDir, true);
try {
  for (const table of ['schools', 'teachers', 'profiles', 'reviews', 'requests', 'privacy_requests']) {
    const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM ${table}`);
    console.log(`${table}: ${count}`);
  }
  console.log('Migrații și persistență: OK');
} finally { await db.close(); }

}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
