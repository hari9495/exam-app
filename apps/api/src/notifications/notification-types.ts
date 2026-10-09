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
  { type: 'workflow.approval.no_approver', group: 'approvals', label: 'No approver was found for a request step, so the desk leads got it' },
  { type: 'helpdesk.request.stage', group: 'reminders', label: 'Something you ordered moved to its next stage' },
  { type: 'helpdesk.rule.notify', group: 'assignments', label: 'A desk rule sent you a message' },
  { type: 'helpdesk.rule.failed', group: 'reminders', label: 'A desk rule failed or stopped at its limit' },
  // M02 step 4 batch 2 (YX-AT-07).
  { type: 'time.roster.published', group: 'assignments', label: 'Your shifts for the coming days were published or changed' },
  // M01 lifecycle batches 6a / 6b.
  { type: 'lifecycle.joiner.added', group: 'assignments', label: 'Someone is joining your team' },
  { type: 'journey.task.assigned', group: 'assignments', label: 'An onboarding or offboarding task was given to you or your team' },
  { type: 'journey.task.due', group: 'reminders', label: 'A checklist task is due today' },
  { type: 'journey.task.overdue', group: 'reminders', label: 'A checklist task you own is overdue' },
  { type: 'document.requested', group: 'reminders', label: 'HR asked you to upload a document' },
  { type: 'document.rejected', group: 'reminders', label: 'A document you uploaded was not accepted' },
  { type: 'document.expiring', group: 'reminders', label: 'A document of yours expires soon' },
  { type: 'letter.ready', group: 'assignments', label: 'A letter for you is ready' },
  { type: 'letter.signed', group: 'reminders', label: 'A joiner or employee accepted a letter' },
  { type: 'preboarding.completed', group: 'reminders', label: 'A joiner finished their pre-boarding forms' },
  // Batch 6c: exits, clearance, exit interviews, assets, probation reviews.
  { type: 'exit.case.update', group: 'reminders', label: 'A resignation or exit you are part of moved on (received, accepted, withdrawn, new last day)' },
  { type: 'exit.clearance.assigned', group: 'assignments', label: 'A clearance item for a leaver was given to you or your team' },
  { type: 'exit.interview.sent', group: 'reminders', label: 'Your exit interview is ready' },
  { type: 'asset.assigned', group: 'assignments', label: 'A company asset was issued to you' },
  { type: 'probation.review.done', group: 'reminders', label: 'A manager reviewed a probation' },
];

export const NOTIFICATION_TYPE_BY_KEY = new Map(NOTIFICATION_TYPES.map((t) => [t.type, t]));
