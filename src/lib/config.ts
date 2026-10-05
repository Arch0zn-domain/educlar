import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Runtime data and generated keys must never be bundled into a build.
export const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), '.data'));
export const isLocal = (process.env.APP_MODE || 'local') === 'local';
export const isHostedDemo = process.env.APP_MODE === 'demo';
export const baseUrl = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3000';
export function assertRuntime() {
  if (isHostedDemo) {
    if (new URL(baseUrl).protocol !== 'https:') throw new Error('Demo găzduit necesită BETTER_AUTH_URL HTTPS.');
    if (!process.env.DATABASE_URL) throw new Error('Demo găzduit necesită DATABASE_URL PostgreSQL persistent.');
    if ((process.env.BETTER_AUTH_SECRET || '').length < 32) throw new Error('Configurează BETTER_AUTH_SECRET (minimum 32 caractere).');
    if (!/^[a-f0-9]{64}$/i.test(process.env.DOCUMENT_KEY || '')) throw new Error('Configurează DOCUMENT_KEY (64 caractere hexazecimale).');
    return;
  }
  if (!isLocal) throw new Error('Modul live necesită adaptoare SMS și stocare validate. Folosește local sau demo.');
  if (!['127.0.0.1','localhost','[::1]'].includes(new URL(baseUrl).hostname)) throw new Error('Modul local acceptă doar adrese loopback.');
}
export function secret(name: string): string {
  if (process.env[name]) return process.env[name]!;
  assertRuntime();
  if (isHostedDemo) throw new Error(`Configurează ${name} în mediul găzduit.`);
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(/* turbopackIgnore: true */ dataDir, name.toLowerCase());
  if (!existsSync(/* turbopackIgnore: true */ file)) writeFileSync(/* turbopackIgnore: true */ file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  return readFileSync(/* turbopackIgnore: true */ file, 'utf8').trim();
}
