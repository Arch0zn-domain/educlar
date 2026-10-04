import { currentUser } from '@/lib/auth';
import { query,serialized } from '@/lib/db';
import { privacyExport } from '@/lib/privacy';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();if(!user)return new Response(null,{status:401});
  const {id}=await params;
  return serialized(async()=>{
    try {const data=await privacyExport(query,user.id,id);
      return Response.json(data,{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="educlar-personal-data.json"','X-Content-Type-Options':'nosniff'}});
    }catch{return new Response(null,{status:404});}
  });
}
