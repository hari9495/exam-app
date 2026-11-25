import { addMonths, progressOf } from './learning-rules';

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
});
