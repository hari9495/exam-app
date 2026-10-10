import { checkAnswers } from '../rules-engine/forms';
import { capSegments } from '../employee-history/history-rules';
import { todayIst } from '../org-structure/org-validation';
import { EXIT_INTERVIEW_FORM, alumniUntil, lwdStage, noticeLabel, parseNotice, standardLwd, wagesDueBy } from './exit-rules';

describe('exit rules (lifecycle 6c)', () => {
  it('notice in calendar days runs from the day after the resignation', () => {
    expect(standardLwd('2027-01-01', '30d')).toBe('2027-01-31');
    expect(standardLwd('2026-12-20', '15d')).toBe('2027-01-04');
    expect(standardLwd('2026-10-09', '0d')).toBe('2026-10-09');
  });

  it('notice in months keeps the day of the month, clamped to the month end (31 Jan + 1 month)', () => {
    expect(standardLwd('2027-01-31', '1m')).toBe('2027-02-28');
    expect(standardLwd('2028-01-31', '1m')).toBe('2028-02-29');
    expect(standardLwd('2026-11-30', '3m')).toBe('2027-02-28');
    expect(standardLwd('2026-10-15', '2m')).toBe('2026-12-15');
  });

  it('labels and refuses bad periods', () => {
    expect(noticeLabel('30d')).toBe('30 days');
    expect(noticeLabel('1m')).toBe('1 month');
    expect(noticeLabel('0d')).toBe('No notice');
    expect(() => parseNotice('30')).toThrow();
  });

  it('the starter exit interview form checks its answers', () => {
    expect(checkAnswers(EXIT_INTERVIEW_FORM, { main_reason: 'manager', would_return: 'no', rating: 2 }).errors).toEqual({});
    expect(Object.keys(checkAnswers(EXIT_INTERVIEW_FORM, { main_reason: 'manager' }).errors)).toEqual(expect.arrayContaining(['would_return', 'rating']));
  });

  it('final dues within two working days after the last day (YX-LC-08)', () => {
    expect(wagesDueBy('2026-10-30', new Set())).toBe('2026-11-03');
    expect(wagesDueBy('2026-10-30', new Set(['2026-11-02']))).toBe('2026-11-04');
    expect(wagesDueBy('2026-11-03', new Set())).toBe('2026-11-05');
  });

  it('the last day ends at the end of the IST day', () => {
    // 18:29 UTC on 30 Oct is 23:59 IST: still the last day; 18:31 UTC is 31 Oct in India.
    expect(lwdStage('2026-10-30', todayIst(new Date('2026-10-30T18:29:00Z')))).toBe('today');
    expect(lwdStage('2026-10-30', todayIst(new Date('2026-10-30T18:31:00Z')))).toBe('over');
    expect(lwdStage('2026-10-30', '2026-10-29')).toBe('ahead');
  });

  it('alumni access and the exit cut of dated facts', () => {
    expect(alumniUntil('2026-10-30', 7)).toBe('2033-10-30');
    const segs = [{ from: '2026-04-01', to: '2026-09-30', changeId: 'a', values: 1 }, { from: '2026-10-01', to: null, changeId: 'b', values: 2 }, { from: '2026-12-01', to: null, changeId: 'c', values: 3 }];
    expect(capSegments(segs, '2026-10-30')).toEqual([segs[0], { ...segs[1], to: '2026-10-30' }]);
  });
});
