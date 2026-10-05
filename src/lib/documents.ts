import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { dataDir, secret, isHostedDemo } from './config';
import type { Query } from './db';
import { ensure } from './domain';

const folder = () => path.join(dataDir, 'private-documents');
export async function storeDocument(q: Query, owner: string, file: File) {
  ensure(file.size > 0 && file.size <= 5*1024*1024, 'Dovada trebuie să aibă între 1 octet și 5 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const pdf = bytes.subarray(0,5).toString() === '%PDF-';
  const png = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  ensure(pdf||png||jpg, 'Acceptăm doar PDF, PNG și JPEG valide.');
  const id = randomUUID(), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(secret('DOCUMENT_KEY'),'hex'), iv);
  const encrypted = Buffer.concat([iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
  if (isHostedDemo) {
    await q('INSERT INTO documents(id,owner_id,file_name,mime,encrypted_bytes) VALUES($1,$2,$3,$4,$5)',[id,owner,'dovada.'+(pdf?'pdf':png?'png':'jpg'),pdf?'application/pdf':png?'image/png':'image/jpeg',encrypted]);
    return id;
  }
  await mkdir(folder(),{recursive:true});
  await writeFile(path.join(folder(),id),encrypted,{mode:0o600});
  try { await q('INSERT INTO documents(id,owner_id,file_name,mime) VALUES($1,$2,$3,$4)',[id,owner,'dovada.'+(pdf?'pdf':png?'png':'jpg'),pdf?'application/pdf':png?'image/png':'image/jpeg']); }
  catch(e) { await unlink(path.join(folder(),id)); throw e; }
  return id;
}
export async function readDocument(id: string) {
  ensure(/^[a-f0-9-]{36}$/.test(id), 'Document invalid.');
  const { query } = await import('./db');
  const bytes = isHostedDemo ? (await query('SELECT encrypted_bytes FROM documents WHERE id=$1 AND deleted_at IS NULL',[id]))[0]?.encrypted_bytes as Buffer : await readFile(path.join(folder(),id));
  ensure(bytes, 'Document indisponibil.');
  const cipher = createDecipheriv('aes-256-gcm',Buffer.from(secret('DOCUMENT_KEY'),'hex'),bytes.subarray(0,12));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]);
}
export async function deleteDocument(q: Query, id: string) {
  if (!isHostedDemo) await unlink(path.join(folder(),id)).catch((e: NodeJS.ErrnoException) => { if(e.code!=='ENOENT') throw e; });
  await q('UPDATE documents SET deleted_at=now(),encrypted_bytes=NULL WHERE id=$1',[id]);
}
export async function purgeDocuments(q: Query) {
  await q("UPDATE checks SET status='expired',reason='Cerere expirată după 30 de zile.',decided_at=now() WHERE status='pending' AND created_at < now()-interval '30 days'");
  const docs = await q("SELECT d.id FROM documents d WHERE d.deleted_at IS NULL AND (d.created_at < now()-interval '30 days' OR EXISTS(SELECT 1 FROM checks c WHERE c.document_id=d.id AND c.status<>'pending'))");
  for(const d of docs) await deleteDocument(q,d.id);
}
