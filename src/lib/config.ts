import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Runtime data and generated keys must never be bundled into a build.
export const dataDir = path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), '.data'));
export const isLocal = (process.env.APP_MODE || 'local') === 'local';
export const baseUrl = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3000';
export function assertRuntime() {
  if (!isLocal) throw new Error('Modul live necesită adaptoare SMS și stocare validate. Demo local nu poate servi utilizatori reali.');
  if (!['127.0.0.1','localhost','[::1]'].includes(new URL(baseUrl).hostname)) throw new Error('Modul local acceptă doar adrese loopback.');
}
export function secret(name: string): string {
  if (process.env[name]) return process.env[name]!;
  assertRuntime();
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(/* turbopackIgnore: true */ dataDir, name.toLowerCase());
  if (!existsSync(/* turbopackIgnore: true */ file)) writeFileSync(/* turbopackIgnore: true */ file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  return readFileSync(/* turbopackIgnore: true */ file, 'utf8').trim();
}
