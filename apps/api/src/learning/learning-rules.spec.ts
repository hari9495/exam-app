import { addMonths, covers, durationText, progressPct, reminderDue, ruleEnrols, shownStatus, validOn } from './learning-rules';

describe('learning rules', () => {
  const job = { legalEntityId: 'ka', locationId: 'hsr', departmentId: 'ops', designation: 'Line Supervisor' };
  it('a rule covers a job in every listed set; empty sets mean any; designation by words', () => {
    expect(covers({ legalEntityIds: [], locationIds: [], departmentIds: [], designation: null }, job)).toBe(true);
    expect(covers({ legalEntityIds: ['ka'], locationIds: ['hsr'], departmentIds: ['ops', 'qa'], designation: 'supervisor' }, job)).toBe(true);
    expect(covers({ legalEntityIds: ['tn'], locationIds: [], departmentIds: [], designation: null }, job)).toBe(false);
    expect(covers({ legalEntityIds: [], locationIds: [], departmentIds: [], designation: 'manager' }, job)).toBe(false);
  });

  it('enrols with no completion; never while open; a renewal 30 days before it runs out, due that day', () => {
    expect(ruleEnrols({ today: '2026-10-21', dueDays: 30, repeatMonths: 0, open: false, lastCompleted: null })).toEqual({ enrol: true, dueOn: '2026-11-20', renewal: false });
    expect(ruleEnrols({ today: '2026-10-21', dueDays: 30, repeatMonths: 12, open: true, lastCompleted: null })).toEqual({ enrol: false });
    expect(ruleEnrols({ today: '2026-10-21', dueDays: 30, repeatMonths: 0, open: false, lastCompleted: '2025-01-01' })).toEqual({ enrol: false });
    expect(ruleEnrols({ today: '2026-10-21', dueDays: 30, repeatMonths: 12, open: false, lastCompleted: '2025-12-01' })).toEqual({ enrol: false });
    expect(ruleEnrols({ today: '2026-11-01', dueDays: 30, repeatMonths: 12, open: false, lastCompleted: '2025-11-20' })).toEqual({ enrol: true, dueOn: '2026-11-20', renewal: true });
    // Already run out: due in the rule's days from today.
    expect(ruleEnrols({ today: '2026-10-21', dueDays: 14, repeatMonths: 12, open: false, lastCompleted: '2025-01-10' })).toEqual({ enrol: true, dueOn: '2026-11-04', renewal: true });
  });

  it('months on keep the day, or the last day of a shorter month', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2025-11-20', 24)).toBe('2027-11-20');
  });

  it('reminders: 7 and 2 days before, the manager the day after, HR after 7 days', () => {
    expect(reminderDue('2026-11-20', '2026-11-12')).toBeNull();
    expect(reminderDue('2026-11-20', '2026-11-13')).toBe('before_7');
    expect(reminderDue('2026-11-20', '2026-11-18')).toBe('before_2');
    expect(reminderDue('2026-11-20', '2026-11-20')).toBe('before_2');
    expect(reminderDue('2026-11-20', '2026-11-21')).toBe('overdue_manager');
    expect(reminderDue('2026-11-20', '2026-11-26')).toBe('overdue_manager');
    expect(reminderDue('2026-11-20', '2026-11-27')).toBe('overdue_hr');
  });

  it('status words, progress, validity and durations', () => {
    expect(shownStatus({ status: 'enrolled', dueOn: '2026-10-20' }, '2026-10-21')).toBe('Overdue');
    expect(shownStatus({ status: 'in_progress', dueOn: '2026-10-21' }, '2026-10-21')).toBe('In progress');
    expect(shownStatus({ status: 'completed', dueOn: '2026-01-01' }, '2026-10-21')).toBe('Completed');
    expect(shownStatus({ status: 'requested', dueOn: null }, '2026-10-21')).toBe('Requested');
    expect(progressPct(2, 3)).toBe(67);
    expect(progressPct(0, 0)).toBe(0);
    expect(validOn('2025-10-01', '2026-10-01', '2026-10-21')).toBe(false);
    expect(validOn('2025-10-01', null, '2026-10-21')).toBe(true);
    expect(durationText(45)).toBe('45 min');
    expect(durationText(150)).toBe('2 h 30 min');
  });
});
