import { AuditLogEntry } from './types';

// Every audit action is stored as a machine key ("<entity>.<verb>", e.g.
// "exam.published"). Recruiters and auditors read this page, not engineers, so
// map each known key to a plain-English label. Keys are added elsewhere in the
// app without this file's knowledge, so friendlyAction() falls back to
// prettifying the raw key rather than showing a blank.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'attempt.answer_graded': 'Answer graded',
  'attempt.blocked_ip': 'Attempt blocked — IP not allowed',
  'attempt.code_review_regenerated': 'Code review regenerated',
  'attempt.force_submit': 'Attempt force-submitted',
  'attempt.insight_regenerated': 'Attempt insight regenerated',
  'attempt.manually_graded': 'Attempt manually graded',
  'attempt.message_sent': 'Message sent to candidate',
  'attempt.proctoring_bypass_revoked': 'Proctoring bypass revoked',
  'attempt.proctoring_bypassed': 'Proctoring bypassed',
  'attempt.reanalyze_triggered': 'Re-analysis triggered',
  'attempt.settled': 'Attempt settled (graded)',
  'attempt.unblock': 'Attempt unblocked',
  'auth.token_reuse_detected': 'Security — token reuse detected',
  'candidate.data_exported': 'Candidate data exported',
  'candidate.deleted': 'Candidate deleted',
  'candidate.erased': 'Candidate data erased (GDPR)',
  'candidate.erased.evidence_deleted': 'Candidate evidence deleted (GDPR)',
  'candidate.updated': 'Candidate updated',
  'exam.archived': 'Exam archived',
  'exam.duplicated': 'Exam duplicated',
  'exam.published': 'Exam published',
  'exam.unpublished': 'Exam unpublished',
  'invitation.created': 'Candidate(s) invited',
  'invitation.revoked': 'Invitation revoked',
  'login.success': 'Signed in',
  'organization.ai_key_configured': 'AI API key configured',
  'organization.api_key_generated': 'Public API key generated',
  'organization.api_key_revoked': 'Public API key revoked',
  'organization.branding_updated': 'Branding updated',
  'organization.created': 'Organization created',
  'organization.logo_updated': 'Logo updated',
  'organization.smtp_configured': 'Email (SMTP) configured',
  'organization.sso_configured': 'SSO configured',
  'organization.webhook_secret_generated': 'Webhook signing secret generated',
  'organization.webhook_url_updated': 'Webhook URL updated',
  'password.changed': 'Password changed',
  'password.reset': 'Password reset',
  'platform.organization_deleted': 'Organization deleted (platform)',
  'platform.organization_reactivated': 'Organization reactivated (platform)',
  'platform.organization_suspended': 'Organization suspended (platform)',
  'platform.organization_updated': 'Organization updated (platform)',
  'super_admin.org_switch_in': 'Super-admin opened organization',
  'super_admin.org_switch_out': 'Super-admin left organization',
  'user.created': 'Staff user created',
  'user.deactivated': 'Staff user deactivated',
  'user.impersonate_start': 'Impersonation started',
  'user.impersonate_stop': 'Impersonation stopped',
  'user.password_reset_requested': 'Password reset requested',
  'user.reactivated': 'Staff user reactivated',
  'user.setup_wizard_completed': 'Setup wizard completed',
  'user.super_admin_invited': 'Super-admin invited',
  'user.super_admin_promoted': 'Super-admin promoted',
  'user.updated': 'Staff user updated',
};

export function friendlyAction(action: string): string {
  const known = AUDIT_ACTION_LABELS[action];
  if (known) return known;
  // Unknown key: turn "some_new.verb_here" into "Some new — verb here" so a
  // newly-added action still reads as words, never a raw dotted token.
  return action
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' — ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

// The human-readable specifics pulled from metadata, WITHOUT repeating the
// action label (the table shows the label separately as a badge). Returns ''
// when there's nothing extra to say. Everything in metadata is still shown in
// full in the detail view -- this is just the at-a-glance highlight.
export function auditDetail(entry: AuditLogEntry): string {
  const meta = entry.metadata ?? {};
  const bits: string[] = [];

  if (typeof meta.examTitle === 'string') bits.push(`“${meta.examTitle}”`);
  if (typeof meta.count === 'number') bits.push(`${meta.count} record${meta.count === 1 ? '' : 's'}`);
  if (Array.isArray(meta.fields) && meta.fields.length > 0) bits.push(`changed: ${meta.fields.join(', ')}`);
  if (typeof meta.reason === 'string' && meta.reason.trim()) bits.push(meta.reason.trim());
  if (typeof meta.questionId === 'string') bits.push(`question ${meta.questionId}`);

  return bits.join(', ');
}

// Full one-line summary (label + detail), used where the action label is not
// shown separately -- e.g. CSV/Excel export.
export function auditSummary(entry: AuditLogEntry): string {
  const detail = auditDetail(entry);
  const label = friendlyAction(entry.action);
  return detail ? `${label} — ${detail}` : label;
}

// Full timestamp for the detail view / hover; the table shows a shorter form.
export function formatAuditTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
