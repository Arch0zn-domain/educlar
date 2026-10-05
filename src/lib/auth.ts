import { betterAuth } from 'better-auth';
import { phoneNumber } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { database } from './db';
import { assertRuntime, baseUrl, secret, isHostedDemo } from './config';
import { demoAccounts } from './demo-accounts';
import { headers } from 'next/headers';

const state = globalThis as unknown as { eduAuth?: ReturnType<typeof createAuth>; eduOtp?: Map<string,{code:string;expires:number}> };
export const otpInbox = () => state.eduOtp ??= new Map();
async function createAuth() {
  assertRuntime();
  const db = await database();
  return betterAuth({
    baseURL: baseUrl, secret: secret('BETTER_AUTH_SECRET'),
    database: drizzleAdapter(db.orm, { provider: 'pg' }),
    trustedOrigins: [baseUrl],
    rateLimit: { enabled: true, window: 60, max: 30 },
    plugins: [phoneNumber({
      phoneNumberValidator: phone => /^\+[1-9]\d{7,14}$/.test(phone) && (!isHostedDemo || demoAccounts.some(a => a.phone === phone)),
      expiresIn: 300, allowedAttempts: 5,
      sendOTP: async ({ phoneNumber: phone, code }) => {
        if (isHostedDemo) await db.query("INSERT INTO demo_otp(phone,code,expires_at) VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT(phone) DO UPDATE SET code=excluded.code,expires_at=excluded.expires_at",[phone,code]);
        else otpInbox().set(phone,{code,expires:Date.now()+300000});
      },
      signUpOnVerification: { getTempEmail: phone => `${phone.replace('+','')}@phone.educlar.invalid`, getTempName: () => 'Membru EduClar' },
    })],
  });
}
export async function auth() { return state.eduAuth ??= createAuth(); }
export async function currentUser() {
  return (await (await auth()).api.getSession({ headers: await headers() }))?.user || null;
}
