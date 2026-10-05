import { otpInbox } from '@/lib/auth';
import { isLocal, isHostedDemo, baseUrl } from '@/lib/config';
import { demoAccounts } from '@/lib/demo-accounts';
import { query } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  if((!isLocal && !isHostedDemo) || (isLocal && !['127.0.0.1','localhost'].includes(new URL(req.url).hostname)) || (req.headers.get('origin') && req.headers.get('origin')!==baseUrl) || req.headers.get('sec-fetch-site')==='cross-site') return new Response(null,{status:404});
  const phone = new URL(req.url).searchParams.get('phone') || '';
  if (isHostedDemo) {
    if (!demoAccounts.some(a => a.phone === phone)) return new Response(null,{status:404});
    const entry = (await query('SELECT code FROM demo_otp WHERE phone=$1 AND expires_at>now()',[phone]))[0];
    return Response.json({code:entry?.code || null},{headers:{'Cache-Control':'no-store'}});
  }
  const entry = otpInbox().get(phone);
  return Response.json({code: entry && entry.expires > Date.now() ? entry.code : null}, {headers:{'Cache-Control':'no-store'}});
}
