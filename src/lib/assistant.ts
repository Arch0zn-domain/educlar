import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Query } from './db';
import { secret } from './config';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export class AssistantError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const assistantInput = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(6000),
  }).strict()).min(1).max(9),
}).strict().superRefine(({messages}, context) => {
  if (messages.length % 2 !== 1 || messages.some((m,i) => m.role !== (i % 2 ? 'assistant' : 'user')))
    context.addIssue({ code:'custom', message:'Istoric de conversație invalid.' });
  if (messages.reduce((n,m) => n + m.content.length,0) > 8000 || messages.some(m => m.role === 'user' && m.content.length > 2000))
    context.addIssue({ code:'custom', message:'Scurtează mesajul sau începe o conversație nouă.' });
});

type AssistantConfig = {
  url: string; apiKey: string; model: string; maxTokens: number;
  dailyLimit: number; globalLimit: number; cacheSeconds: number; encryptionSecret: string;
};
const bounded = (value: string | undefined, fallback: number, max: number) => {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new AssistantError(503,'Configurarea limitelor asistentului este invalidă.');
  return n;
};
export function assistantConfigured() {
  return Boolean(process.env.FREELLMAPI_BASE_URL && process.env.FREELLMAPI_API_KEY || !process.env.FREELLMAPI_BASE_URL && process.env.GEMINI_API_KEY);
}
export function assistantConfig(): AssistantConfig {
  const gateway = process.env.FREELLMAPI_BASE_URL;
  const apiKey = gateway ? process.env.FREELLMAPI_API_KEY : process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AssistantError(503,'Jelly nu este configurat încă. Administratorul trebuie să conecteze furnizorul AI.');
  let url: URL;
  try { url = new URL(gateway || 'https://generativelanguage.googleapis.com/v1beta/openai'); }
  catch { throw new AssistantError(503,'Adresa furnizorului AI este invalidă.'); }
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (process.env.VERCEL && local) throw new AssistantError(503,'Vercel nu poate contacta FreeLLMAPI de pe localhost. Configurează un gateway HTTPS găzduit.');
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !process.env.VERCEL)))
    throw new AssistantError(503,'Furnizorul AI găzduit necesită o adresă HTTPS fără credențiale în URL.');
  const pathname = url.pathname.replace(/\/+$/,'');
  url.pathname = `${pathname}${gateway && !pathname.endsWith('/v1') ? '/v1' : ''}/chat/completions`;
  return {
    url: url.toString(), apiKey,
    model: gateway ? process.env.FREELLMAPI_MODEL || 'auto:fast' : process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    maxTokens: bounded(process.env.CHAT_MAX_OUTPUT_TOKENS,768,2048),
    dailyLimit: bounded(process.env.CHAT_DAILY_LIMIT,20,1000),
    globalLimit: bounded(process.env.CHAT_GLOBAL_DAILY_LIMIT,100,10000),
    cacheSeconds: bounded(process.env.CHAT_CACHE_TTL_SECONDS,86400,604800),
    encryptionSecret: secret('BETTER_AUTH_SECRET'),
  };
}

// Replies are account-scoped and encrypted. Raw prompts are never written to SQL.
export class AssistantService {
  constructor(private q: Query, private config: AssistantConfig, private fetcher: typeof fetch = fetch) {}
  private userKey(user: string) { return createHmac('sha256',this.config.encryptionSecret).update(user).digest('hex'); }
  private cipherKey() { return createHash('sha256').update(`educlar-assistant:${this.config.encryptionSecret}`).digest(); }
  private encrypt(text: string, key: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',this.cipherKey(),iv);
    cipher.setAAD(Buffer.from(key));
    return Buffer.concat([iv,cipher.update(text,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
  }
  private decrypt(text: string, key: string) {
    const bytes = Buffer.from(text,'base64'), cipher = createDecipheriv('aes-256-gcm',this.cipherKey(),bytes.subarray(0,12));
    cipher.setAAD(Buffer.from(key)); cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');
  }
  async status(user: string) {
    const row = (await this.q("SELECT calls,COALESCE((users->>$1)::integer,0) AS used FROM assistant_budget WHERE day=(now() AT TIME ZONE 'UTC')::date",[this.userKey(user)]))[0];
    return { remaining: Math.max(0,this.config.dailyLimit - Number(row?.used || 0)), dailyLimit:this.config.dailyLimit,
      available:Number(row?.calls || 0) < this.config.globalLimit, maxOutputTokens:this.config.maxTokens };
  }
  async clear(user: string) { await this.q('DELETE FROM assistant_cache WHERE user_id=$1',[user]); }
  async reply(user: string, input: unknown) {
    const parsed = assistantInput.safeParse(input);
    if (!parsed.success) throw new AssistantError(400,'Trimite cel mult 2.000 de caractere și un istoric scurt, alternând mesajele.');
    const messages = parsed.data.messages.map(m => ({...m,content:m.content.normalize('NFC')}));
    const actor = (await this.q('SELECT disabled FROM profiles WHERE user_id=$1',[user]))[0];
    if (!actor || actor.disabled) throw new AssistantError(403,'Completează profilul sau verifică starea contului.');
    const rate = (await this.q(`INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '1 minute')
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.count+1 END,
      expires_at=CASE WHEN rate_limits.expires_at<=now() THEN excluded.expires_at ELSE rate_limits.expires_at END RETURNING count`,[`chat:${user}`]))[0];
    if (rate.count > 30) throw new AssistantError(429,'Prea multe mesaje într-un minut. Încearcă puțin mai târziu.');
    await this.q('DELETE FROM assistant_cache WHERE expires_at<=now()');
    await this.q("DELETE FROM assistant_budget WHERE day<(now() AT TIME ZONE 'UTC')::date-35");
    const system = `Ești Jelly, asistentul EduClar. Răspunde în limba utilizatorului, implicit română, clar și concis.
Ajută cu explicații, învățare, scris, programare și întrebări generale. Nu ai acces la internet, conturi, documente sau catalog în timp real.
Nu inventa rezultate, surse, date despre școli sau persoane. Pentru informații EduClar îndrumă către /scoli, /compara, /profesori, /meditatii, /date și /metodologie.
Nu pretinde că ai executat acțiuni. Evită să ceri date personale. Spune când nu știi. Data UTC: ${new Date().toISOString().slice(0,10)}.`;
    const key = createHmac('sha256',this.config.encryptionSecret).update(JSON.stringify({version:1,user,url:this.config.url,
      credentials:createHash('sha256').update(this.config.apiKey).digest('hex'),model:this.config.model,maxTokens:this.config.maxTokens,system,messages})).digest('hex');
    const cached = async () => {
      const row = (await this.q('SELECT response FROM assistant_cache WHERE key=$1 AND user_id=$2 AND expires_at>now()',[key,user]))[0];
      return row?.response ? this.decrypt(row.response,key) : null;
    };
    const hit = await cached();
    if (hit) return {reply:hit,cached:true,...await this.status(user)};
    const owner = randomUUID();
    const claim = await this.q(`INSERT INTO assistant_cache(key,user_id,owner,expires_at) VALUES($1,$2,$3,now()+interval '90 seconds')
      ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,response=NULL,expires_at=excluded.expires_at
      WHERE assistant_cache.expires_at<=now() RETURNING owner`,[key,user,owner]);
    if (!claim.length) {
      const hit = await cached();
      if (hit) return {reply:hit,cached:true,...await this.status(user)};
      throw new AssistantError(409,'Acest mesaj este deja în lucru. Așteaptă răspunsul sau încearcă din nou peste puțin timp.');
    }
    try {
      // Atomic UPSERT: all Vercel instances share the same enforced daily ceiling.
      const budget = await this.q(`INSERT INTO assistant_budget(day,calls,users)
        VALUES((now() AT TIME ZONE 'UTC')::date,1,jsonb_build_object($1::text,1))
        ON CONFLICT(day) DO UPDATE SET calls=assistant_budget.calls+1,
        users=jsonb_set(assistant_budget.users,ARRAY[$1::text],to_jsonb(COALESCE((assistant_budget.users->>$1)::integer,0)+1))
        WHERE assistant_budget.calls<$2 AND COALESCE((assistant_budget.users->>$1)::integer,0)<$3 RETURNING calls`,
        [this.userKey(user),this.config.globalLimit,this.config.dailyLimit]);
      if (!budget.length) throw new AssistantError(429,'Limita zilnică de răspunsuri noi a fost atinsă. Răspunsurile salvate rămân disponibile; limita se resetează la 00:00 UTC.');
      // Do not retry automatically: even a failed upstream request may consume tokens.
      const response = await this.fetcher(this.config.url,{
        method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(45000),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.config.apiKey}`},
        body:JSON.stringify({model:this.config.model,messages:[{role:'system',content:system},...messages],
          max_tokens:this.config.maxTokens,temperature:0.3,stream:false}),
      });
      if (!response.ok) throw new AssistantError(response.status===429 ? 429 : 502,
        response.status===429 ? 'Furnizorul AI și-a atins limita. Încearcă mai târziu.' : 'Furnizorul AI nu a putut răspunde. Verifică legătura și configurarea serverului.');
      const payload = await response.json();
      const reply = payload?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim() || reply.length>24000) throw new AssistantError(502,'Furnizorul AI a trimis un răspuns invalid.');
      await this.q("UPDATE assistant_cache SET response=$1,expires_at=now()+($2 * interval '1 second') WHERE key=$3 AND owner=$4",[this.encrypt(reply,key),this.config.cacheSeconds,key,owner]);
      return {reply,cached:false,...await this.status(user)};
    } catch (error) {
      await this.q('DELETE FROM assistant_cache WHERE key=$1 AND owner=$2',[key,owner]);
      if (error instanceof AssistantError) throw error;
      throw new AssistantError(502,'Conexiunea cu furnizorul AI a eșuat sau a durat prea mult. Poți încerca din nou.');
    }
  }
}
