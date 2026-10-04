import { createHash } from 'node:crypto';

export class DomainError extends Error {}
export function ensure(value: unknown, message: string): asserts value { if (!value) throw new DomainError(message); }
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ş/g,'s').replace(/ţ/g,'t');
export function publicStatistics(row: Record<string, any>): Record<string, any> & { suppressed: boolean; passRate: number | null } {
  const { candidates, distribution } = row;
  const suppressed = candidates < 10 || Object.values(distribution || {}).some(v => Number(v) > 0 && Number(v) < 5);
  return { ...row, suppressed, mean: suppressed ? null : row.mean, minimum: suppressed ? null : row.minimum,
    promoted: suppressed ? null : row.promoted, attended: suppressed ? null : row.attended, valid: suppressed ? null : row.valid,
    distribution: suppressed ? {} : distribution,
    passRate: !suppressed && row.exam === 'BAC' && row.promoted !== null && row.promoted !== undefined && Number(row.attended) > 0 ? Math.round(Number(row.promoted) / Number(row.attended) * 1000) / 10 : null };
}
export function aggregateResults(records: { grade: number | null; present: boolean; passed: boolean }[]) {
  const valid = records.filter(r => r.present && r.grade !== null && Number.isFinite(r.grade) && r.grade >= 0 && r.grade <= 10);
  const distribution: Record<string,number> = { 'sub 5': 0, '5–6': 0, '6–7': 0, '7–8': 0, '8–9': 0, '9–10': 0 };
  for(const r of valid) { const g = r.grade!; distribution[g < 5 ? 'sub 5' : g < 6 ? '5–6' : g < 7 ? '6–7' : g < 8 ? '7–8' : g < 9 ? '8–9' : '9–10']++; }
  return { candidates: records.length, attended: records.filter(r=>r.present).length, valid: valid.length, promoted: records.filter(r=>r.present && r.passed).length,
    mean: valid.length ? Math.round(valid.reduce((sum,r)=>sum+r.grade!,0)/valid.length*100)/100 : null, distribution };
}
export const pseudonym = (id: string) => 'Explorator ' + createHash('sha256').update(id).digest('hex').slice(0,6).toUpperCase();
