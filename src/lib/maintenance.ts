import { randomUUID } from 'node:crypto';
import type { Query } from './db';
import { purgeDocuments, type DeleteFile } from './documents';
export async function runMaintenance(q:Query,remove?:DeleteFile) {
  const id=randomUUID();await q('INSERT INTO maintenance_runs(id) VALUES($1)',[id]);
  try {
    const result=await purgeDocuments(q,remove);
    await q('UPDATE privacy_requests SET export_data=NULL,export_expires_at=NULL WHERE export_expires_at<=now()');
    await q("UPDATE privacy_requests SET contact='Contact eliminat',message='Conținut eliminat.',response=NULL,reason=NULL WHERE completed_at<now()-interval '30 days'");
    await q("UPDATE checks SET details='{}',reason=NULL WHERE status<>'pending' AND decided_at<now()-interval '30 days'");
    await q("UPDATE reports SET reason='Conținut eliminat.',resolution=NULL WHERE status='resolved' AND resolved_at<now()-interval '30 days'");
    await q("DELETE FROM audit WHERE created_at<now()-interval '30 days'");
    await q("DELETE FROM maintenance_runs WHERE started_at<now()-interval '30 days'");
    await q('UPDATE maintenance_runs SET finished_at=now(),status=$1,deleted_documents=$2,failed_documents=$3 WHERE id=$4',[result.failed?'failed':'completed',result.deleted,result.failed,id]);
    if(result.failed)console.error('EduClar retention: evidence deletions require retry',{run:id,failed:result.failed});
    return {id,...result};
  } catch(e) {
    await q("UPDATE maintenance_runs SET finished_at=now(),status='failed',error='MAINTENANCE_ERROR' WHERE id=$1",[id]);
    console.error('EduClar retention: maintenance run failed',{run:id});throw e;
  }
}
const runtime=globalThis as unknown as {eduRetentionTimer?:ReturnType<typeof setInterval>;eduRetentionRunning?:boolean};
export function startRetentionJob(run:()=>Promise<unknown>,intervalMs=60*60*1000) {
  if(runtime.eduRetentionTimer)return;
  async function tick() {
    if(runtime.eduRetentionRunning)return;runtime.eduRetentionRunning=true;
    try {await run();}catch {console.error('EduClar retention: scheduled job needs attention.');}
    finally {runtime.eduRetentionRunning=false;}
  }
  void tick();runtime.eduRetentionTimer=setInterval(()=>void tick(),intervalMs);runtime.eduRetentionTimer.unref();
}
export function stopRetentionJob() {if(runtime.eduRetentionTimer)clearInterval(runtime.eduRetentionTimer);runtime.eduRetentionTimer=undefined;}
