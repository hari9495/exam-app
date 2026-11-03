import { ackVersionNumber, addDays, daysBetween, daysSetting, dueOn, isDone, policyCode, remindNow, sameName, statusOf, tellManagerNow } from './policy-rules';

describe('HLP-10 / HLP-11 policy rules', () => {
  it('codes and day sums', () => {
    expect(policyCode(1)).toBe('POL-01');
    expect(policyCode(100)).toBe('POL-100');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-01', '2026-11-03')).toBe(2);
    expect(daysSetting('off')).toBeNull();
    expect(daysSetting('0')).toBeNull();
    expect(daysSetting('3')).toBe(3);
  });

  it('the version to acknowledge is the newest published one that asked for it; v1 always asks', () => {
    expect(ackVersionNumber([])).toBeNull();
    expect(ackVersionNumber([{ number: 1, reack: false }])).toBe(1);
    expect(ackVersionNumber([{ number: 1, reack: true }, { number: 2, reack: false }])).toBe(1);
    expect(ackVersionNumber([{ number: 1, reack: true }, { number: 2, reack: true }, { number: 3, reack: false }])).toBe(2);
  });

  it('done with that version or a later one, never an earlier one', () => {
    expect(isDone([], 1)).toBe(false);
    expect(isDone([1], 2)).toBe(false);
    expect(isDone([2], 2)).toBe(true);
    expect(isDone([3], 2)).toBe(true);
  });

  it('due from the later of the effective day and the joining day', () => {
    expect(dueOn('2026-11-01', null, 14)).toBe('2026-11-15');
    expect(dueOn('2026-11-01', '2026-10-01', 14)).toBe('2026-11-15');
    expect(dueOn('2026-11-01', '2026-11-10', 14)).toBe('2026-11-24');
  });

  it('overdue only the day after the due day', () => {
    expect(statusOf(false, '2026-11-15', '2026-11-15')).toBe('pending');
    expect(statusOf(false, '2026-11-15', '2026-11-16')).toBe('overdue');
    expect(statusOf(true, '2026-11-15', '2026-12-16')).toBe('acknowledged');
  });

  it('reminders every N days from the last one; off sends none', () => {
    expect(remindNow(null, '2026-11-03', 3)).toBe(true);
    expect(remindNow('2026-11-01', '2026-11-03', 3)).toBe(false);
    expect(remindNow('2026-11-01', '2026-11-04', 3)).toBe(true);
    expect(remindNow(null, '2026-11-03', null)).toBe(false);
  });

  it('the manager is told once, from M days overdue', () => {
    expect(tellManagerNow('2026-11-01', '2026-11-07', 7, false)).toBe(false);
    expect(tellManagerNow('2026-11-01', '2026-11-08', 7, false)).toBe(true);
    expect(tellManagerNow('2026-11-01', '2026-11-30', 7, true)).toBe(false);
    expect(tellManagerNow('2026-11-01', '2026-11-30', null, false)).toBe(false);
  });

  it('typed names match whatever the spacing and case', () => {
    expect(sameName('  divya   RAGHUNATHAN ', 'Divya Raghunathan')).toBe(true);
    expect(sameName('Divya', 'Divya Raghunathan')).toBe(false);
  });
});
