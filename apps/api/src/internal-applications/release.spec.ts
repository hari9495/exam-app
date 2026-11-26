import { releaseOverdue, releaseProblem } from './internal-applications.service';
import { workingDaysAfter } from '../lifecycle/exit-rules';
import { SETTINGS } from '../org-structure/settings-registry';

// Answer 2761 / 2836: the manager releases an internal applicant; HR decides after 5 working days with no answer.
describe('internal move release (answers 2761, 2836)', () => {
  it('is a company setting, off by default', () => {
    expect(SETTINGS['hiring.internal.manager_release']).toMatchObject({ default: 'off', values: ['off', 'on'], scopes: ['tenant'] });
  });

  it('5 working days are Monday to Friday less the company-wide holidays; the manager has all five in full', () => {
    // Asked Monday 23 Nov 2026: the 5th working day is Monday 30 Nov; HR gets it from Tuesday 1 Dec.
    expect(workingDaysAfter('2026-11-23', 5, new Set())).toBe('2026-11-30');
    expect(releaseOverdue('2026-11-23', '2026-11-30', new Set())).toBe(false);
    expect(releaseOverdue('2026-11-23', '2026-12-01', new Set())).toBe(true);
    // Asked on a Friday: the weekend does not count.
    expect(workingDaysAfter('2026-11-27', 5, new Set())).toBe('2026-12-04');
    // A company holiday in between moves it a day.
    expect(workingDaysAfter('2026-11-23', 5, new Set(['2026-11-25']))).toBe('2026-12-01');
    expect(releaseOverdue('2026-11-23', '2026-12-01', new Set(['2026-11-25']))).toBe(false);
  });

  it('an offer waits for the release, and a refusal stops it; no release asked means nothing stops it', async () => {
    const tx = (status: string | null) => ({ internalApplication: { findFirst: jest.fn(async () => (status ? { releaseStatus: status } : null)) } });
    expect(await releaseProblem(tx('pending') as never, 'o', 'e')).toMatch(/has not released them yet/);
    expect(await releaseProblem(tx('refused') as never, 'o', 'e')).toMatch(/did not release them/);
    expect(await releaseProblem(tx(null) as never, 'o', 'e')).toBeNull();
  });
});
