import {
  APPROVAL_GATES,
  APPROVER_TYPES,
  APPROVAL_NOTIFICATION_TYPES,
  APPROVAL_EMAIL_EVENT_TYPES,
  isApprovalEmailEventType,
  currentStepApproverIds,
  isPendingForApprover,
} from './approval-types';

describe('approval-types', () => {
  it('defines the two gates and four approver types', () => {
    expect(APPROVAL_GATES).toEqual(['requisition', 'offer']);
    expect(APPROVER_TYPES).toEqual(['users', 'reporting_manager', 'hiring_manager', 'group']);
  });
});

describe('APPROVAL_EMAIL_EVENT_TYPES', () => {
  it('contains exactly the four approval.* values, single-sourced from APPROVAL_NOTIFICATION_TYPES', () => {
    expect(APPROVAL_EMAIL_EVENT_TYPES).toEqual([
      APPROVAL_NOTIFICATION_TYPES.requested,
      APPROVAL_NOTIFICATION_TYPES.approved,
      APPROVAL_NOTIFICATION_TYPES.rejected,
      APPROVAL_NOTIFICATION_TYPES.cancelled,
    ]);
    expect(APPROVAL_EMAIL_EVENT_TYPES).toEqual([
      'approval.requested',
      'approval.approved',
      'approval.rejected',
      'approval.cancelled',
    ]);
  });
});

describe('isApprovalEmailEventType', () => {
  it.each(APPROVAL_EMAIL_EVENT_TYPES as unknown as string[])('is true for %s', (type) => {
    expect(isApprovalEmailEventType(type)).toBe(true);
  });

  it('is false for approval.step_skipped', () => {
    expect(isApprovalEmailEventType('approval.step_skipped')).toBe(false);
  });

  it('is false for a mention type', () => {
    expect(isApprovalEmailEventType('mention')).toBe(false);
  });

  it('is false for empty string', () => {
    expect(isApprovalEmailEventType('')).toBe(false);
  });

  it('is false for null/undefined', () => {
    expect(isApprovalEmailEventType(null as unknown as string)).toBe(false);
    expect(isApprovalEmailEventType(undefined as unknown as string)).toBe(false);
  });
});

describe('currentStepApproverIds', () => {
  const snap = JSON.stringify([{ approverUserIds: ['u1'] }, { approverUserIds: ['u2', 'u3'] }]);
  it('returns the approver ids of the current step', () => {
    expect(currentStepApproverIds(snap, 1)).toEqual(['u2', 'u3']);
  });
  it('returns [] for a missing step, malformed JSON, or non-string ids', () => {
    expect(currentStepApproverIds(snap, 5)).toEqual([]);
    expect(currentStepApproverIds('not json', 0)).toEqual([]);
    expect(currentStepApproverIds(JSON.stringify([{ approverUserIds: [1, null] }]), 0)).toEqual([]);
  });
});

describe('isPendingForApprover', () => {
  const snap = JSON.stringify([{ approverUserIds: ['u1'] }, { approverUserIds: ['u2'] }]);
  it('is true only when pending and the user is on the current step', () => {
    expect(isPendingForApprover({ status: 'pending_approval', chainSnapshotJson: snap, currentStepPosition: 1 }, 'u2')).toBe(true);
    expect(isPendingForApprover({ status: 'pending_approval', chainSnapshotJson: snap, currentStepPosition: 1 }, 'u1')).toBe(false);
    expect(isPendingForApprover({ status: 'approved', chainSnapshotJson: snap, currentStepPosition: 1 }, 'u2')).toBe(false);
  });
});
