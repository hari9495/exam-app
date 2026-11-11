import { remindOn } from './access-requests.service';

// Answer 973: a waiting request is reminded on the 2nd working day (Monday to Friday, less company holidays) after the
// IST day it was sent.
const ist = (s: string) => new Date(`${s}+05:30`);
const none = new Set<string>();

describe('remindOn (answer 973)', () => {
  it('Monday to Wednesday; Thursday to Monday; Friday and the weekend to Tuesday', () => {
    expect(remindOn(ist('2026-11-09T10:00:00'), none)).toBe('2026-11-11');
    expect(remindOn(ist('2026-11-12T10:00:00'), none)).toBe('2026-11-16');
    expect(remindOn(ist('2026-11-13T10:00:00'), none)).toBe('2026-11-17');
    expect(remindOn(ist('2026-11-14T10:00:00'), none)).toBe('2026-11-17');
    expect(remindOn(ist('2026-11-15T10:00:00'), none)).toBe('2026-11-17');
  });

  it('counts the IST day: 23:30 IST on Monday is still Monday (18:00 UTC), 00:30 IST Tuesday is Tuesday', () => {
    expect(remindOn(ist('2026-11-09T23:30:00'), none)).toBe('2026-11-11');
    expect(remindOn(ist('2026-11-10T00:30:00'), none)).toBe('2026-11-12');
  });

  it("skips the company's holidays, and a full holiday week", () => {
    expect(remindOn(ist('2026-11-12T23:30:00'), new Set(['2026-11-13']))).toBe('2026-11-17');
    expect(remindOn(ist('2026-11-09T10:00:00'), new Set(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']))).toBe('2026-11-17');
  });

  it('negative: a holiday on the day it was sent does not count it as a working day either way', () => {
    expect(remindOn(ist('2026-11-09T10:00:00'), new Set(['2026-11-09']))).toBe('2026-11-11');
  });
});
