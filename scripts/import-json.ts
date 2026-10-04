import { readFile } from 'node:fs/promises';
import { dataDir } from '../src/lib/config';
import { openDatabase } from '../src/lib/db';
import { stageImport, publishImport, importSchemas, type ImportKind } from '../src/lib/imports';
async function main() {
const [kind, file, source, publish] = process.argv.slice(2);
if (!(kind in importSchemas) || !file || !source) {
  console.error('Utilizare: npm run import:json -- schools|teachers|statistics fișier.json source-id [--publish]');
  process.exit(1);
}
const payload: unknown = JSON.parse(await readFile(file, 'utf8'));
const db = await openDatabase(dataDir, true);
try {
  await db.query('BEGIN');
  const id = await stageImport(db.query, kind as ImportKind, source, payload);
  if (publish === '--publish') await publishImport(db.query, id);
  await db.query('COMMIT');
  console.log((await db.query('SELECT id,status,errors,jsonb_array_length(payload) AS row_count FROM import_batches WHERE id=$1', [id]))[0]);
} catch (error) {
  await db.query('ROLLBACK'); throw error;
} finally { await db.close(); }

}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
