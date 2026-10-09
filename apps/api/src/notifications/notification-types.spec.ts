import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_BY_KEY } from './notification-types';

describe('notification catalog', () => {
  it('is exactly the set of types emitted by notify() call sites', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    const expected = [
      'mention',
      'assigned',
      'approval.requested',
      'approval.approved',
      'approval.rejected',
      'approval.step_skipped',
      'approval.cancelled',
      'reminder.pending_grading',
      'reminder.stale_invitation',
      'reminder.offer_expiring',
      'reminder.interview_upcoming',
      'reminder.feedback_owed',
      'helpdesk.note.mention',
      'helpdesk.ticket.assigned',
      'helpdesk.seat.granted',
      'helpdesk.ticket.sla_warning',
      'helpdesk.ticket.sla_breached',
      'helpdesk.reminder.due',
      'helpdesk.email.held',
      'helpdesk.plan.used_up',
      'helpdesk.kb.outdated',
      'helpdesk.kb.review_due',
      'helpdesk.kb.updated',
      'helpdesk.rating.low',
      'helpdesk.nps.detractor',
      'helpdesk.backlog.alert',
      'helpdesk.privacy.request',
      'workflow.approval.needed',
      'workflow.approval.reminder',
      'workflow.approval.decided',
      'workflow.approval.no_approver',
      'helpdesk.request.stage',
      'helpdesk.rule.notify',
      'helpdesk.rule.failed',
      'time.roster.published',
    ];
    for (const k of expected) expect(keys).toContain(k);
    expect(NOTIFICATION_TYPES.length).toBe(expected.length);
  });
  it('has no duplicate types and only valid groups', () => {
    const keys = NOTIFICATION_TYPES.map((t) => t.type);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of NOTIFICATION_TYPES) expect(['mentions', 'assignments', 'approvals', 'reminders']).toContain(t.group);
  });
  it('indexes by key', () => {
    expect(NOTIFICATION_TYPE_BY_KEY.get('mention')?.group).toBe('mentions');
  });
});
