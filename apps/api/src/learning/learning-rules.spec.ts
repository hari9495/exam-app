import { addMonths, attendedShare, progressOf } from './learning-rules';
import { checkInCode } from './sessions.service';

describe('learning rules', () => {
  it('progress counts required items only', () => {
    const items = [{ id: 'a', required: true }, { id: 'b', required: true }, { id: 'c', required: false }];
    expect(progressOf(items, [])).toBe(0);
    expect(progressOf(items, ['a', 'c'])).toBe(50);
    expect(progressOf(items, ['a', 'b'])).toBe(100);
    expect(progressOf([{ id: 'x', required: false }], ['x'])).toBe(100);
    expect(progressOf([], [])).toBe(0);
  });
  it('adds months, keeping the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-25', 12)).toBe('2027-11-25');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });
  it('attendance share and the check-in code', () => {
    expect(attendedShare(3, 4)).toBe(75);
    expect(attendedShare(0, 0)).toBe(0);
    const a = checkInCode('secret', 's1', 1_000_000);
    expect(a).toMatch(/^\d{6}$/);
    expect(checkInCode('secret', 's1', 1_010_000)).toBe(a);
    expect(checkInCode('secret', 's2', 1_000_000)).not.toBe(a);
    expect(checkInCode('other', 's1', 1_000_000)).not.toBe(a);
  });
});
