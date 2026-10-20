import { addMonths, dueOn, dueStatus, remindNow } from './reverification-rules';

describe('re-verification maths (PPL-42)', () => {
  it('adds months, clamping to the month end', () => {
    expect(addMonths('2023-10-20', 36)).toBe('2026-10-20');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('due N months after the last verification, or after joining if never verified', () => {
    expect(dueOn({ lastVerified: '2023-10-20', joinedOn: '2020-01-06', everyMonths: 36, onRoleChange: false, roleEnteredOn: null })).toBe('2026-10-20');
    expect(dueOn({ lastVerified: null, joinedOn: '2025-04-01', everyMonths: 12, onRoleChange: false, roleEnteredOn: null })).toBe('2026-04-01');
  });

  it('a move into the rule’s roles after the last check makes it due at once (if the rule says so)', () => {
    const base = { lastVerified: '2025-01-10', joinedOn: '2020-01-06', everyMonths: 36 };
    expect(dueOn({ ...base, onRoleChange: true, roleEnteredOn: '2026-06-01' })).toBe('2026-06-01');
    expect(dueOn({ ...base, onRoleChange: false, roleEnteredOn: '2026-06-01' })).toBe('2028-01-10');
    expect(dueOn({ ...base, onRoleChange: true, roleEnteredOn: '2024-06-01' })).toBe('2028-01-10'); // checked since the move
    expect(dueOn({ ...base, onRoleChange: true, roleEnteredOn: '2020-01-06' })).toBe('2028-01-10'); // joined into it
  });

  it('never due before the rule started', () => {
    expect(dueOn({ lastVerified: null, joinedOn: '2014-04-01', everyMonths: 24, onRoleChange: false, roleEnteredOn: null, notBefore: '2026-01-01' })).toBe('2026-01-01');
    expect(dueOn({ lastVerified: '2025-06-01', joinedOn: '2014-04-01', everyMonths: 24, onRoleChange: false, roleEnteredOn: null, notBefore: '2026-01-01' })).toBe('2027-06-01');
  });

  it('overdue, due soon (30 days) or not due', () => {
    expect(dueStatus('2026-10-19', '2026-10-20')).toBe('overdue');
    expect(dueStatus('2026-10-20', '2026-10-20')).toBe('due soon');
    expect(dueStatus('2026-11-19', '2026-10-20')).toBe('due soon');
    expect(dueStatus('2026-11-20', '2026-10-20')).toBe('not due');
  });

  it('reminds once it is due, then weekly', () => {
    expect(remindNow({ due: '2026-10-21', remindedOn: null, today: '2026-10-20' })).toBe(false);
    expect(remindNow({ due: '2026-10-20', remindedOn: null, today: '2026-10-20' })).toBe(true);
    expect(remindNow({ due: '2026-10-01', remindedOn: '2026-10-15', today: '2026-10-20' })).toBe(false);
    expect(remindNow({ due: '2026-10-01', remindedOn: '2026-10-13', today: '2026-10-20' })).toBe(true);
  });
});
