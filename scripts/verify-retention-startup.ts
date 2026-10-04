import assert from 'node:assert/strict';
import { access,mkdir,mkdtemp,rm } from 'node:fs/promises';
import { spawn,type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// This check deliberately sends no HTTP requests. Run after npm run build.
async function main() {
  assert(!process.env.DATABASE_URL,'Run this check with the isolated local PGlite runtime.');
  const root=path.resolve('.data');await mkdir(root,{recursive:true});
  const dir=await mkdtemp(path.join(root,'retention-smoke-'));
  let child:ChildProcess|undefined,closed:Promise<void>|undefined,output='';
  const server=createServer();
  try {
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert(address&&typeof address!=='string');const port=address.port;
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    process.env.DATA_DIR=dir;process.env.APP_MODE='local';process.env.BETTER_AUTH_URL=`http://127.0.0.1:${port}`;
    const {openDatabase}=await import('../src/lib/db');
    const {storeDocument}=await import('../src/lib/documents');
    const db=await openDatabase(dir,true);let id:string;
    try {
      id=await storeDocument(db.query,'demo-student',new File(['%PDF-1.4\nSynthetic unattended retention fixture'],'fixture.pdf'));
      await db.query("UPDATE documents SET created_at=now()-interval '31 days' WHERE id=$1",[id]);
      await db.query("INSERT INTO checks(id,user_id,kind,document_id,created_at) VALUES('unattended-check','demo-student','school',$1,now()-interval '31 days')",[id]);
    } finally {await db.close();}
    const file=path.join(dir,'private-documents',id);await access(file);
    child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    closed=new Promise<void>(resolve=>child!.once('close',()=>resolve()));
    child.stdout?.on('data',chunk=>{output=(output+chunk.toString()).slice(-6000);});
    child.stderr?.on('data',chunk=>{output=(output+chunk.toString()).slice(-6000);});
    const deadline=Date.now()+30_000;let removed=false;
    while(Date.now()<deadline) {
      if(child.exitCode!==null)throw new Error(`Production server exited before retention completed. ${output}`);
      try {await access(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){removed=true;break;}throw e;}
      await delay(250);
    }
    assert(removed,`Evidence was not removed without HTTP traffic. ${output}`);
    // Allow the deletion bookkeeping to finish before stopping this child.
    await delay(500);child.kill();await closed;
    const checked=await openDatabase(dir,false);
    try {
      assert.equal((await checked.query("SELECT status FROM checks WHERE id='unattended-check'"))[0].status,'expired');
      assert((await checked.query('SELECT deleted_at FROM documents WHERE id=$1',[id]))[0].deleted_at);
      assert((await checked.query("SELECT id FROM maintenance_runs WHERE status='completed' AND deleted_documents=1")).length>0);
      console.log('PASS: production startup expired the pending check, deleted evidence and recorded a completed run without HTTP requests.');
    } finally {await checked.close();}
  } finally {
    if(server.listening)server.close();
    if(child&&child.exitCode===null){child.kill();await closed;}
    const target=path.resolve(dir);
    assert(target.startsWith(root+path.sep)&&path.basename(target).startsWith('retention-smoke-'));
    await rm(target,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
