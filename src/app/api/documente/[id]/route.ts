import { currentUser } from '@/lib/auth';
import { query, serialized } from '@/lib/db';
import { Service } from '@/lib/service';
import { readDocument, purgeDocuments } from '@/lib/documents';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser(); if(!user) return new Response(null,{status:401});
  const {id}=await params;
  return serialized(async()=>{
    try {
      const s=new Service(query); await s.staff(user.id,true); await purgeDocuments(query);
      const d=(await query('SELECT * FROM documents WHERE id=$1 AND deleted_at IS NULL',[id]))[0]; if(!d) return new Response(null,{status:404});
      await s.audit(user.id,'document.read',id,'Consultare pentru verificare manuală.');
      return new Response(new Uint8Array(await readDocument(id)),{headers:{'Content-Type':d.mime,'Content-Disposition':`attachment; filename="${d.file_name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    } catch { return new Response(null,{status:403}); }
  });
}
