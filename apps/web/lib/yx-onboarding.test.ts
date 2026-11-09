import { probationRows } from './yx-onboarding';

// Answer 392: the probation queue carries the open "before confirmation" background checks the API sends HR.
describe('probationRows', () => {
  const row = { employeeId: 'e1', name: 'Ravi Kumar', startOn: '2026-05-01', originalEndOn: '2026-10-31', plannedEndOn: '2026-10-31', extendedMonths: 0, reviewDueOn: '2026-10-16', escalatedOn: null, confirmedFrom: null, pendingConfirmationId: null, stage: 'review_due', maxTotalMonths: 12 } as never;

  it('passes the open check count through for HR', () => {
    expect(probationRows([{ ...(row as object), bgvOpenBeforeConfirmation: 1 } as never])[0]!.bgvOpen).toBe(1);
  });

  it('a manager (the API sends nothing) sees no open check', () => {
    expect(probationRows([row])[0]!.bgvOpen).toBe(0);
  });
});
