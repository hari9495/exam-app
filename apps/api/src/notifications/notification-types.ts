export type NotificationGroup = 'mentions' | 'assignments' | 'approvals';
export interface NotificationTypeDef { type: string; group: NotificationGroup; label: string; }

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  { type: 'mention', group: 'mentions', label: 'You are @mentioned in feedback' },
  { type: 'assigned', group: 'assignments', label: 'A candidate is assigned to you' },
  { type: 'approval.requested', group: 'approvals', label: 'A request needs your approval' },
  { type: 'approval.approved', group: 'approvals', label: 'Your submission was approved' },
  { type: 'approval.rejected', group: 'approvals', label: 'Your submission was rejected' },
  { type: 'approval.step_skipped', group: 'approvals', label: 'An approval step was skipped' },
];

export const NOTIFICATION_TYPE_BY_KEY = new Map(NOTIFICATION_TYPES.map((t) => [t.type, t]));
