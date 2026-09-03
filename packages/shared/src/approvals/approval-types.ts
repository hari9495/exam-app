export const APPROVAL_GATES = ['requisition', 'offer'] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

export const APPROVER_TYPES = ['users', 'reporting_manager', 'hiring_manager'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVAL_NOTIFICATION_TYPES = {
  requested: 'approval.requested',
  approved: 'approval.approved',
  rejected: 'approval.rejected',
  cancelled: 'approval.cancelled',
} as const;

export interface ResolvedStep {
  position: number;
  name: string;
  approverType: ApproverType;
  approverUserIds: string[];
}
