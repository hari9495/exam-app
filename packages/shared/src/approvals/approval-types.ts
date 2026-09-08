export const APPROVAL_GATES = ['requisition', 'offer'] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

export const APPROVER_TYPES = ['users', 'reporting_manager', 'hiring_manager', 'group'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVAL_NOTIFICATION_TYPES = {
  requested: 'approval.requested',
  approved: 'approval.approved',
  rejected: 'approval.rejected',
  cancelled: 'approval.cancelled',
} as const;

export const APPROVAL_EMAIL_EVENT_TYPES = [
  APPROVAL_NOTIFICATION_TYPES.requested,
  APPROVAL_NOTIFICATION_TYPES.approved,
  APPROVAL_NOTIFICATION_TYPES.rejected,
  APPROVAL_NOTIFICATION_TYPES.cancelled,
] as const;

export type ApprovalEmailEventType = (typeof APPROVAL_EMAIL_EVENT_TYPES)[number];

export function isApprovalEmailEventType(type: string): type is ApprovalEmailEventType {
  return !!type && (APPROVAL_EMAIL_EVENT_TYPES as readonly string[]).includes(type);
}

export interface ResolvedStep {
  position: number;
  name: string;
  approverType: ApproverType;
  approverUserIds: string[];
}

// The frozen chain is stored as JSON on the request; the current step's approvers are the only
// people who can act on it right now. Shared by the approvals inbox and the Today home so the
// definition of "pending for me" exists exactly once.
export function currentStepApproverIds(chainSnapshotJson: string, currentStepPosition: number): string[] {
  try {
    const steps = JSON.parse(chainSnapshotJson) as { approverUserIds?: unknown }[];
    const ids = steps?.[currentStepPosition]?.approverUserIds;
    return Array.isArray(ids) && ids.every((x) => typeof x === 'string') ? (ids as string[]) : [];
  } catch {
    return [];
  }
}

export function isPendingForApprover(
  row: { status: string; chainSnapshotJson: string; currentStepPosition: number },
  userId: string,
): boolean {
  return row.status === 'pending_approval' && currentStepApproverIds(row.chainSnapshotJson, row.currentStepPosition).includes(userId);
}
