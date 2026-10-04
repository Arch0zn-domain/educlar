import { describe, expect, it } from 'vitest';
import { aggregateResults, publicStatistics, normalize } from '../src/lib/domain';
import { readConsent, CONSENT_MAX_AGE } from '../src/lib/preferences';
describe('public statistics and preferences', () => {
  it('counts absence separately and does not turn missing grades into zero', () => {
    const result = aggregateResults([{ grade: 9, present: true, passed: true }, { grade: null, present: false, passed: false }, { grade: null, present: true, passed: false }]);
    expect(result).toMatchObject({ candidates: 3, attended: 2, valid: 1, mean: 9, promoted: 1 });
  });
  it('suppresses a large cohort when its distribution identifies a small subgroup', () => {
    expect(publicStatistics({ candidates: 100, mean: 8, minimum: 5, attended: 100, valid:100,promoted: 99, exam: 'BAC', distribution: { high: 99, low: 1 } })).toMatchObject({ suppressed: true, mean: null, minimum: null, distribution: {}, passRate: null });
  });
  it('preserves unknown pass counts instead of publishing zero percent', () => {
    const cohort={candidates:100,exam:'BAC' as const,attended:100,valid:100,minimum:null,mean:8,distribution:{}};
    expect(publicStatistics({ ...cohort,promoted: null }).passRate).toBeNull();
    expect(publicStatistics({ ...cohort,promoted: 90 }).passRate).toBe(90);
  });
  it('matches Romanian diacritics, including legacy spelling', () => { expect(normalize('Iași Ştiinţă')).toBe('iasi stiinta'); });
  it('does not reuse corrupt, outdated, future or expired consent', () => {
    for (const raw of ['oops', '{}', JSON.stringify({ version: 0, preferences: true, savedAt: Date.now() }), JSON.stringify({ version: 1, preferences: true, savedAt: Date.now() + 60000 }), JSON.stringify({ version: 1, preferences: true, savedAt: Date.now() - CONSENT_MAX_AGE })]) expect(readConsent(raw)).toBeNull();
    expect(readConsent(JSON.stringify({ version: 1, preferences: false, savedAt: Date.now() }))?.preferences).toBe(false);
  });
});
