import { otpInbox } from '@/lib/auth';
import { isLocal, baseUrl } from '@/lib/config';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  if(!isLocal || !['127.0.0.1','localhost'].includes(new URL(req.url).hostname) || (req.headers.get('origin') && req.headers.get('origin')!==baseUrl) || req.headers.get('sec-fetch-site')==='cross-site') return new Response(null,{status:404});
  const entry = otpInbox().get(new URL(req.url).searchParams.get('phone')||'');
  return Response.json({code: entry && entry.expires > Date.now() ? entry.code : null}, {headers:{'Cache-Control':'no-store'}});
}
