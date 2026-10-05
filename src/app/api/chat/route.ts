import { currentUser } from '@/lib/auth';
import { baseUrl } from '@/lib/config';
import { atomicQuery as query } from '@/lib/db';
import { AssistantError, AssistantService, assistantConfig, assistantConfigured } from '@/lib/assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (body: unknown, status = 200) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(baseUrl).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
async function handle(run: () => Promise<Response>) {
  try { return await run(); }
  catch (error) { return json({error:error instanceof AssistantError ? error.message : 'Jelly este temporar indisponibil.'},error instanceof AssistantError ? error.status : 503); }
}
export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({error:'Intră în cont pentru a vorbi cu Jelly.'},401);
    if (!assistantConfigured()) return json({configured:false});
    return json({configured:true,...await new AssistantService(query,assistantConfig()).status(user.id)});
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    if (!sameOrigin(request)) return json({error:'Originea solicitării este invalidă.'},403);
    const user = await currentUser();
    if (!user) return json({error:'Intră în cont pentru a vorbi cu Jelly.'},401);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Trimite un mesaj JSON.'},415);
    if (Number(request.headers.get('content-length') || 0)>40000) return json({error:'Mesaj prea lung.'},413);
    // Bound bytes while reading, including chunked bodies without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return json({error:'Mesajul lipsește.'},400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size>40000) { await reader.cancel(); return json({error:'Mesaj prea lung.'},413); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return json({error:'Mesaj JSON invalid.'},400); }
    return json(await new AssistantService(query,assistantConfig()).reply(user.id,input));
  });
}
export async function DELETE(request: Request) {
  return handle(async () => {
    if (!sameOrigin(request)) return json({error:'Originea solicitării este invalidă.'},403);
    const user = await currentUser();
    if (!user) return json({error:'Intră în cont.'},401);
    // Clearing saved replies also works while the provider is disconnected.
    await query('DELETE FROM assistant_cache WHERE user_id=$1',[user.id]);
    return json({cleared:true});
  });
}
