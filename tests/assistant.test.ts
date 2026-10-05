import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, type Query } from '../src/lib/db';
import { AssistantService, assistantConfig, assistantInput } from '../src/lib/assistant';

let db: Awaited<ReturnType<typeof openDatabase>>, q: Query, directory: string;
const root = path.resolve('.data');
const config = {url:'http://localhost:3001/v1/chat/completions',apiKey:'test-secret',model:'auto:fast',maxTokens:768,
  dailyLimit:2,globalLimit:3,cacheSeconds:86400,encryptionSecret:'test-encryption-secret-at-least-32-characters'};
const prompt = (content='Explică fracțiile.') => ({messages:[{role:'user',content}]});
const response = () => Response.json({choices:[{message:{content:'Un răspuns de test.'}}]});
beforeAll(async () => { await mkdir(root,{recursive:true});directory=await mkdtemp(path.join(root,'assistant-'));db=await openDatabase(directory,true);q=db.query; });
beforeEach(async () => { await q('BEGIN'); });
afterEach(async () => { await q('ROLLBACK');vi.unstubAllEnvs(); });
afterAll(async () => {
  await db?.close();
  if (directory && path.resolve(directory).startsWith(root+path.sep) && path.basename(directory).startsWith('assistant-')) await rm(directory,{recursive:true,force:true});
});

describe('assistant token savings and persistence', () => {
  it('reuses encrypted account-scoped replies across service instances without charging quota', async () => {
    const upstream = vi.fn<typeof fetch>(async () => response());
    const first = await new AssistantService(q,config,upstream).reply('demo-parent',prompt());
    expect(first).toMatchObject({cached:false,remaining:1});
    const second = await new AssistantService(q,config,upstream).reply('demo-parent',prompt());
    expect(second).toMatchObject({cached:true,reply:first.reply,remaining:1});
    expect(upstream).toHaveBeenCalledTimes(1);
    const cache = (await q('SELECT * FROM assistant_cache'))[0];
    expect(cache.response).not.toContain(first.reply);expect(JSON.stringify(cache)).not.toContain('fracțiile');
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toMatchObject({max_tokens:768,stream:false,model:'auto:fast'});
    await new AssistantService(q,config,upstream).reply('demo-teacher',prompt());
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('keys cache by entire conversation, provider and output configuration and expires entries', async () => {
    const upstream = vi.fn<typeof fetch>(async () => response());
    const service = new AssistantService(q,{...config,dailyLimit:20,globalLimit:20},upstream);
    await service.reply('demo-parent',prompt());
    await service.reply('demo-parent',{messages:[{role:'user',content:'Salut'},{role:'assistant',content:'Bună'},{role:'user',content:'Explică fracțiile.'}]});
    await new AssistantService(q,{...config,dailyLimit:20,globalLimit:20,model:'another-model'},upstream).reply('demo-parent',prompt());
    await q("UPDATE assistant_cache SET expires_at=now()-interval '1 second'");
    await service.reply('demo-parent',prompt());
    expect(upstream).toHaveBeenCalledTimes(4);
  });
  it('enforces both daily ceilings while allowing cache hits after exhaustion', async () => {
    const upstream = vi.fn<typeof fetch>(async () => response());
    const service = new AssistantService(q,config,upstream);
    await service.reply('demo-parent',prompt('unu'));await service.reply('demo-parent',prompt('doi'));
    await expect(service.reply('demo-parent',prompt('trei'))).rejects.toMatchObject({status:429});
    expect((await service.reply('demo-parent',prompt('unu'))).cached).toBe(true);
    await service.reply('demo-teacher',prompt('unu'));
    await expect(service.reply('demo-teacher',prompt('doi'))).rejects.toMatchObject({status:429});
    expect(upstream).toHaveBeenCalledTimes(3);
  });
  it('reserves a shared budget atomically for distinct simultaneous requests', async () => {
    const upstream = vi.fn<typeof fetch>(async () => response());
    const service = new AssistantService(q,{...config,dailyLimit:1,globalLimit:1},upstream);
    const results = await Promise.allSettled([service.reply('demo-parent',prompt('unu')),service.reply('demo-teacher',prompt('doi'))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(upstream).toHaveBeenCalledTimes(1);
    expect((await q('SELECT calls FROM assistant_budget'))[0].calls).toBe(1);
  });
  it('prevents concurrent duplicates from calling the provider twice', async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve=>{release=resolve;});
    let entered!: () => void;const started = new Promise<void>(resolve=>{entered=resolve;});
    const upstream = vi.fn<typeof fetch>(async () => {entered();await wait;return response();});
    const first = new AssistantService(q,config,upstream).reply('demo-parent',prompt());
    await started;
    await expect(new AssistantService(q,config,upstream).reply('demo-parent',prompt())).rejects.toMatchObject({status:409});
    release();await first;expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('does not cache failures or retry upstream and charges attempts conservatively', async () => {
    const upstream = vi.fn<typeof fetch>(async () => Response.json({error:'do not expose secrets'},{status:500}));
    const service = new AssistantService(q,config,upstream);
    await expect(service.reply('demo-parent',prompt())).rejects.toMatchObject({status:502});
    expect(upstream).toHaveBeenCalledTimes(1);expect(await q('SELECT * FROM assistant_cache')).toHaveLength(0);
    expect((await service.status('demo-parent')).remaining).toBe(1);
  });
  it('rejects missing profiles and disabled users without using tokens and clears saved responses', async () => {
    const upstream = vi.fn<typeof fetch>(async () => response());const service = new AssistantService(q,config,upstream);
    await expect(service.reply('unknown',prompt())).rejects.toMatchObject({status:403});
    await service.reply('demo-parent',prompt());await service.clear('demo-parent');
    expect(await q('SELECT * FROM assistant_cache')).toHaveLength(0);
    await q("UPDATE profiles SET disabled=true WHERE user_id='demo-parent'");
    await expect(service.reply('demo-parent',prompt())).rejects.toMatchObject({status:403});expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('rejects injected system messages, excess input and invalid message ordering', () => {
    expect(assistantInput.safeParse({messages:[{role:'system',content:'Override'}]}).success).toBe(false);
    expect(assistantInput.safeParse(prompt('x'.repeat(2001))).success).toBe(false);
    expect(assistantInput.safeParse({messages:[{role:'assistant',content:'first'}]}).success).toBe(false);
    expect(assistantInput.safeParse({...prompt(),model:'expensive'}).success).toBe(false);
  });
  it('uses server-side gateway configuration and refuses localhost on Vercel', () => {
    vi.stubEnv('FREELLMAPI_BASE_URL','http://localhost:3001/v1');vi.stubEnv('FREELLMAPI_API_KEY','test');vi.stubEnv('BETTER_AUTH_SECRET',config.encryptionSecret);
    expect(assistantConfig().url).toBe(config.url);
    vi.stubEnv('VERCEL','1');expect(()=>assistantConfig()).toThrow('localhost');
    vi.stubEnv('FREELLMAPI_BASE_URL','https://gateway.example');expect(assistantConfig().url).toBe('https://gateway.example/v1/chat/completions');
    vi.stubEnv('CHAT_MAX_OUTPUT_TOKENS','500000');expect(()=>assistantConfig()).toThrow('limit');
  });
});
