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
  // M14 §11.2 Service Desk (3b-1).
  { type: 'helpdesk.note.mention', group: 'mentions', label: 'You are mentioned in a ticket note' },
  { type: 'helpdesk.ticket.assigned', group: 'assignments', label: 'A ticket is assigned to you' },
  { type: 'helpdesk.seat.granted', group: 'assignments', label: 'Someone was given a seat on a desk' },
  { type: 'helpdesk.ticket.sla_warning', group: 'reminders', label: 'A ticket is close to missing a response target' },
  { type: 'helpdesk.ticket.sla_breached', group: 'reminders', label: 'A ticket missed a response target' },
  { type: 'helpdesk.reminder.due', group: 'reminders', label: 'A desk reminder you set is due' },
  { type: 'helpdesk.email.held', group: 'reminders', label: 'An email to your desk is held for a check' },
  { type: 'helpdesk.plan.used_up', group: 'reminders', label: 'A customer has used up their support plan' },
  // Batch 4 (SD-1.24 … SD-1.30).
  { type: 'helpdesk.kb.outdated', group: 'reminders', label: 'An article you own was flagged out of date' },
  { type: 'helpdesk.kb.review_due', group: 'reminders', label: 'An article you own is due for review' },
  { type: 'helpdesk.kb.updated', group: 'reminders', label: 'An article you follow has a new version' },
  { type: 'helpdesk.rating.low', group: 'reminders', label: 'A requester gave a low rating' },
  { type: 'helpdesk.nps.detractor', group: 'reminders', label: 'A customer gave a low NPS score' },
  { type: 'helpdesk.backlog.alert', group: 'reminders', label: 'A desk queue is above its alert line' },
  { type: 'helpdesk.privacy.request', group: 'approvals', label: 'A privacy request about desk data is waiting' },
  // P03 approvals engine and Service Desk 3b-2 (SD-2.03 … SD-2.05, SD-2.12).
  { type: 'workflow.approval.needed', group: 'approvals', label: 'A request needs your approval' },
  { type: 'workflow.approval.reminder', group: 'reminders', label: 'A request is still waiting for your approval' },
  { type: 'workflow.approval.decided', group: 'approvals', label: 'A request you sent or were asked about was decided' },
  { type: 'helpdesk.request.stage', group: 'reminders', label: 'Something you ordered moved to its next stage' },
  { type: 'helpdesk.rule.notify', group: 'assignments', label: 'A desk rule sent you a message' },
  { type: 'helpdesk.rule.failed', group: 'reminders', label: 'A desk rule failed or stopped at its limit' },
];

export const NOTIFICATION_TYPE_BY_KEY = new Map(NOTIFICATION_TYPES.map((t) => [t.type, t]));
