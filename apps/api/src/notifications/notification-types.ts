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
  // Console C-2 (answer 1048): a message from YukthiX staff to the company's System Admins.
  { type: 'yukthix.admin_message', group: 'reminders', label: 'A message from YukthiX to your System Admins' },
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
  // HLP-10 / HLP-11 company policies.
  { type: 'helpdesk.policy.to_acknowledge', group: 'reminders', label: 'A company policy is waiting for you to acknowledge it' },
  { type: 'helpdesk.policy.overdue_report', group: 'reminders', label: 'Someone in your team is overdue acknowledging a policy' },
  { type: 'helpdesk.policy.to_publish', group: 'approvals', label: 'A policy version is waiting for you to publish it' },
  { type: 'helpdesk.policy.decided', group: 'approvals', label: 'A policy version you wrote was published or sent back' },
  // HLP-06 speak-up.
  { type: 'helpdesk.speakup.received', group: 'assignments', label: 'A speak-up report was routed to you' },
  // HLP-07/08/09 cases.
  { type: 'helpdesk.case.update', group: 'assignments', label: 'There is an update on a case you are part of' },
  { type: 'helpdesk.case.task', group: 'assignments', label: 'A case needs you to carry out an action (interim relief)' },
  // HLP-08 founder answer 73: a manager's misconduct report is waiting for HR in scope.
  { type: 'helpdesk.case.misconduct_reported', group: 'assignments', label: 'A manager reported misconduct by someone in your HR scope' },
  // HLP-12 accident cases.
  { type: 'helpdesk.accident.reported', group: 'assignments', label: 'A workplace accident was reported to the safety team' },
  { type: 'helpdesk.accident.update', group: 'assignments', label: 'An accident case needs you (you handle it, or injury leave was recorded for your team)' },
  { type: 'helpdesk.accident.contractor_late', group: 'reminders', label: 'A contractor has not filed the ESIC accident report of a contract worker' },
  // HLP-13 collective disputes.
  { type: 'helpdesk.dispute.settlement', group: 'assignments', label: 'A dispute settlement waits for your approval, or was approved or sent back' },
  // P03 approvals engine and Service Desk 3b-2 (SD-2.03 … SD-2.05, SD-2.12).
  { type: 'workflow.approval.needed', group: 'approvals', label: 'A request needs your approval' },
  { type: 'workflow.approval.reminder', group: 'reminders', label: 'A request is still waiting for your approval' },
  { type: 'workflow.approval.decided', group: 'approvals', label: 'A request you sent or were asked about was decided' },
  { type: 'workflow.approval.no_approver', group: 'approvals', label: 'No approver was found for a request step, so someone else got it (HR, or the desk leads for desk requests)' },
  { type: 'helpdesk.request.stage', group: 'reminders', label: 'Something you ordered moved to its next stage' },
  { type: 'helpdesk.rule.notify', group: 'assignments', label: 'A desk rule sent you a message' },
  { type: 'helpdesk.rule.failed', group: 'reminders', label: 'A desk rule failed or stopped at its limit' },
  // Service Desk 3b-2 batch 3 (founder decision 9 Oct 2026).
  { type: 'helpdesk.msg.link_ended', group: 'reminders', label: 'A phone linked to your desk was linked in another company' },
  // M02 step 4 batch 2 (YX-AT-07).
  { type: 'time.roster.published', group: 'assignments', label: 'Your shifts for the coming days were published or changed' },
  // TIM-40: a licence your work needs expires soon, or HR asked you to renew it.
  { type: 'time.licence.expiring', group: 'reminders', label: 'A licence your work needs expires soon or must be renewed' },
  // M01 lifecycle batches 6a / 6b.
  { type: 'lifecycle.joiner.added', group: 'assignments', label: 'Someone is joining your team' },
  { type: 'journey.task.assigned', group: 'assignments', label: 'An onboarding or offboarding task was given to you or your team' },
  { type: 'journey.task.due', group: 'reminders', label: 'A checklist task is due today' },
  { type: 'journey.task.overdue', group: 'reminders', label: 'A checklist task you own is overdue' },
  { type: 'document.requested', group: 'reminders', label: 'HR asked you to upload a document' },
  { type: 'document.rejected', group: 'reminders', label: 'A document you uploaded was not accepted' },
  { type: 'document.expiring', group: 'reminders', label: 'A document of yours expires soon' },
  { type: 'work_auth.expiring', group: 'reminders', label: 'A work permit or visa of someone you look after expires soon (HR)' },
  { type: 'letter.ready', group: 'assignments', label: 'A letter for you is ready' },
  { type: 'payroll.fnf.due', group: 'reminders', label: 'A full and final settlement is due' },
  { type: 'payroll.overpayment.consent', group: 'approvals', label: 'Payroll asks you to agree to a repayment plan' },
  { type: 'payroll.bonus.submitted', group: 'approvals', label: 'A statutory bonus waits for your approval' },
  { type: 'letter.signed', group: 'reminders', label: 'A joiner or employee accepted a letter' },
  { type: 'preboarding.completed', group: 'reminders', label: 'A joiner finished their pre-boarding forms' },
  { type: 'preboarding.declined', group: 'reminders', label: 'A joiner declined the offer in the joining portal' },
  // HIR-09 answer 335: on the joining day, the offer's conditions still open (HR decides; nothing lapses by itself).
  { type: 'ats.offer.conditions_open', group: 'reminders', label: 'Someone joins today with offer conditions still open' },
  // Batch 6c: exits, clearance, exit interviews, assets, probation reviews.
  { type: 'exit.case.update', group: 'reminders', label: 'A resignation or exit you are part of moved on (received, accepted, withdrawn, new last day)' },
  { type: 'exit.clearance.assigned', group: 'assignments', label: 'A clearance item for a leaver was given to you or your team' },
  { type: 'exit.interview.sent', group: 'reminders', label: 'Your exit interview is ready' },
  { type: 'asset.assigned', group: 'assignments', label: 'A company asset was issued to you' },
  { type: 'exit.deprovisioning.failed', group: 'reminders', label: 'A step after someone left did not go through (HR)' },
  { type: 'probation.review.done', group: 'reminders', label: 'A manager reviewed a probation' },
  // HIR-13 (founder decision 6): the manager is told, never asked.
  { type: 'hiring.internal.applied', group: 'reminders', label: 'Someone in your team applied for an internal job' },
  // M06 performance PM2.
  { type: 'perf.goal.checkin_due', group: 'reminders', label: 'Your goals are due a check-in' },
  // PM3: feedback and 1:1s.
  { type: 'perf.feedback.received', group: 'mentions', label: 'A colleague gave you feedback' },
  { type: 'perf.feedback.requested', group: 'assignments', label: 'Someone asked you for feedback about a colleague' },
  { type: 'perf.one_on_one.reminder', group: 'reminders', label: 'You have a 1:1 tomorrow' },
  // PM4: review cycles.
  { type: 'perf.cycle.launched', group: 'assignments', label: 'A review cycle started and you have a review to write' },
  { type: 'perf.review.stage_due', group: 'reminders', label: 'A review you owe is ready, due soon or overdue' },
  { type: 'perf.review.released', group: 'reminders', label: 'Your review is released for you to read' },
  { type: 'perf.review.disagreed', group: 'assignments', label: 'An employee disagrees with their review (HR)' },
  // PM5: peer and 360° feedback.
  { type: 'perf.nomination.proposed', group: 'approvals', label: 'Someone on your team suggested a colleague to give feedback' },
  { type: 'perf.feedback.task', group: 'assignments', label: 'You were asked for feedback on a colleague\u2019s review' },
  // PM6: calibration.
  { type: 'perf.calibration.signed_off', group: 'reminders', label: 'A calibration session was signed off (HR)' },
  { type: 'perf.feedback.author_revealed', group: 'reminders', label: 'The author of an anonymous review answer was revealed (admins)' },
  // PM8: improvement plans.
  { type: 'perf.pip.started', group: 'assignments', label: 'An improvement plan for you to read and acknowledge' },
  { type: 'perf.pip.warning', group: 'approvals', label: 'Check with the case owner before deciding on an improvement plan (HR)' },
  { type: 'perf.pip.checkin_missed', group: 'reminders', label: 'An improvement plan check-in was missed (HR and the manager)' },
  { type: 'perf.pip.handed_over', group: 'assignments', label: 'An improvement plan was handed over to you' },
  { type: 'perf.pip.extended', group: 'reminders', label: 'An improvement plan was extended after it was not met' },
  // M05 E4: trips and advances.
  { type: 'expense.trip.update', group: 'assignments', label: 'A trip was approved, or needs bookings from the travel desk' },
  { type: 'expense.advance.update', group: 'reminders', label: 'An expense advance was paid, is due to be settled, or is overdue' },
  // PLT-02 Team today: a manager or HR reminded you about something still waiting (today: checking in).
  { type: 'time.web_device.requested', group: 'approvals', label: 'Someone asked HR to approve a computer for web clock-in' },
  { type: 'nudge.reminder', group: 'reminders', label: 'Your manager or HR reminded you about something waiting' },
  // M05 E3: payment of approved claims.
  { type: 'expense.payment.update', group: 'reminders', label: 'An expense claim was paid, or its payment did not go through' },
  // EXP-08: a company card line to explain, and its reminders.
  { type: 'expense.card.update', group: 'reminders', label: 'A company card line needs you to explain it' },
  // Contract labour CL-1 (answer 627): a contractor's licence ends soon.
  { type: 'clra.licence.expiring', group: 'reminders', label: 'A contractor’s licence ends soon (contract labour)' },
  // CL-5 (answer 743): a new liability alert on Vendor compliance.
  { type: 'clra.alert.new', group: 'reminders', label: 'A new contract labour compliance alert (wage, challan or proofs)' },
  // Visitors slice 2 (answer 604): a walk-in asked for you; approve within the location's minutes.
  { type: 'visitor.walkin.approval.host', group: 'approvals', label: 'A walk-in visitor is asking for you at reception' },
];

export const NOTIFICATION_TYPE_BY_KEY = new Map(NOTIFICATION_TYPES.map((t) => [t.type, t]));
