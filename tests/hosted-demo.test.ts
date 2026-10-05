import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, type Query } from '../src/lib/db';
let db:Awaited<ReturnType<typeof openDatabase>>, q:Query, directory:string;
const root=path.resolve('.data');
beforeAll(async()=>{await mkdir(root,{recursive:true});directory=await mkdtemp(path.join(root,'hosted-test-'));db=await openDatabase(directory,true);q=db.query;});
beforeEach(async()=>{
  await q('BEGIN');vi.resetModules();vi.stubEnv('APP_MODE','demo');vi.stubEnv('BETTER_AUTH_URL','https://demo.example');
  vi.stubEnv('DATABASE_URL','postgresql://unused.test/demo');vi.stubEnv('BETTER_AUTH_SECRET','test-secret-with-at-least-32-characters');vi.stubEnv('DOCUMENT_KEY','a'.repeat(64));
});
afterEach(async()=>{await q('ROLLBACK');vi.unstubAllEnvs();vi.doUnmock('../src/lib/db');vi.resetModules();});
afterAll(async()=>{await db?.close();if(directory.startsWith(root+path.sep)&&path.basename(directory).startsWith('hosted-test-'))await rm(directory,{recursive:true,force:true});});
describe('hosted demo runtime',()=>{
  it('allows explicit HTTPS demo configuration and requires persistent database and secrets',async()=>{
    const config=await import('../src/lib/config');expect(()=>config.assertRuntime()).not.toThrow();
    vi.stubEnv('DATABASE_URL','');expect(()=>config.assertRuntime()).toThrow('DATABASE_URL');vi.stubEnv('DATABASE_URL','postgresql://unused.test/demo');
    vi.stubEnv('BETTER_AUTH_SECRET','');expect(()=>config.assertRuntime()).toThrow('BETTER_AUTH_SECRET');vi.stubEnv('BETTER_AUTH_SECRET','test-secret-with-at-least-32-characters');
    vi.stubEnv('DOCUMENT_KEY','invalid');expect(()=>config.assertRuntime()).toThrow('DOCUMENT_KEY');
  });
  it('rejects live mode and local URLs in hosted demo',async()=>{
    vi.stubEnv('BETTER_AUTH_URL','http://localhost:3000');let config=await import('../src/lib/config');expect(()=>config.assertRuntime()).toThrow('HTTPS');
    vi.resetModules();vi.stubEnv('APP_MODE','live');config=await import('../src/lib/config');expect(()=>config.assertRuntime()).toThrow('live');
  });
  it('persists encrypted demo documents in SQL and removes their bytes on deletion',async()=>{
    vi.doMock('../src/lib/db',()=>({query:q}));
    const {storeDocument,readDocument,deleteDocument}=await import('../src/lib/documents');
    const content='%PDF-1.4\nFictional demo evidence\n';
    const id=await storeDocument(q,'demo-parent',new File([content],'test.pdf',{type:'application/pdf'}));
    const row=(await q('SELECT encrypted_bytes FROM documents WHERE id=$1',[id]))[0];
    expect(Buffer.from(row.encrypted_bytes).toString()).not.toContain(content);
    expect((await readDocument(id)).toString()).toBe(content);
    await deleteDocument(q,id);expect((await q('SELECT encrypted_bytes,deleted_at FROM documents WHERE id=$1',[id]))[0].encrypted_bytes).toBeNull();
    await expect(readDocument(id)).rejects.toThrow('indisponibil');
  });
});
