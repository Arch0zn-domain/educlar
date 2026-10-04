import { openDatabase } from '../src/lib/db';
import { dataDir } from '../src/lib/config';
import { runMaintenance } from '../src/lib/maintenance';
async function main() {
  const db=await openDatabase(dataDir,false);
  try {const result=await runMaintenance(db.query);console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;}
  finally {await db.close();}
}
void main().catch(()=>{console.error('Retention job failed; inspect maintenance_runs.');process.exitCode=1;});
