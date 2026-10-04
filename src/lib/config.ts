import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const dataDir = path.resolve(process.env.DATA_DIR || '.data');
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
  const file = path.join(dataDir, name.toLowerCase());
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  return readFileSync(file, 'utf8').trim();
}
