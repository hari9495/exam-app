export type NotificationGroup = 'mentions' | 'assignments' | 'approvals' | 'reminders';
export interface NotificationTypeDef { type: string; group: NotificationGroup; label: string; }

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  { type: 'mention', group: 'mentions', label: 'You are @mentioned in feedback' },
  { type: 'assigned', group: 'assignments', label: 'A candidate is assigned to you' },
  { type: 'approval.requested', group: 'approvals', label: 'A request needs your approval' },
  { type: 'approval.approved', group: 'approvals', label: 'Your submission was approved' },
  { type: 'approval.rejected', group: 'approvals', label: 'Your submission was rejected' },
  { type: 'approval.step_skipped', group: 'approvals', label: 'An approval step was skipped' },
  { type: 'approval.cancelled', group: 'approvals', label: 'An approval request was cancelled' },
  { type: 'reminder.pending_grading', group: 'reminders', label: 'An attempt is waiting for your grading' },
  { type: 'reminder.stale_invitation', group: 'reminders', label: 'An invited candidate has not started' },
  { type: 'reminder.offer_expiring', group: 'reminders', label: 'An offer you sent is about to expire' },
  { type: 'reminder.interview_upcoming', group: 'reminders', label: 'You have an interview coming up' },
  { type: 'reminder.feedback_owed', group: 'reminders', label: 'You still owe interview feedback' },
];

export const NOTIFICATION_TYPE_BY_KEY = new Map(NOTIFICATION_TYPES.map((t) => [t.type, t]));
