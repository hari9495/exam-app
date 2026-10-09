import { checkAnswers } from '../rules-engine/forms';
import { EXIT_INTERVIEW_FORM, noticeLabel, parseNotice, standardLwd } from './exit-rules';

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
});
