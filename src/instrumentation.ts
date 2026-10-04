export async function register() {
  if(process.env.NEXT_RUNTIME!=='nodejs'||process.env.NEXT_PHASE==='phase-production-build')return;
  const {query,serialized}=await import('./lib/db');
  const {runMaintenance,startRetentionJob}=await import('./lib/maintenance');
  // Runs at server startup and hourly, including when there are no HTTP requests.
  startRetentionJob(()=>serialized(()=>runMaintenance(query)));
}
