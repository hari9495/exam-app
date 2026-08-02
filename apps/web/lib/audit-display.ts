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
  'exam.created': 'Exam created',
  'exam.duplicated': 'Exam duplicated',
  'exam.published': 'Exam published',
  'exam.unpublished': 'Exam unpublished',
  'exam.updated': 'Exam updated',
  'invitation.accommodation_updated': 'Extra time updated',
  'invitation.created': 'Candidate(s) invited',
  'invitation.resent': 'Invitation resent',
  'invitation.revoked': 'Invitation revoked',
  'question.archived': 'Question archived',
  'question.bulk_uploaded': 'Questions bulk-uploaded',
  'question.created': 'Question created',
  'question.published': 'Question published',
  'question.updated': 'Question updated',
  'login.success': 'Signed in',
  'organization.ai_key_configured': 'AI API key configured',
  'organization.api_key_generated': 'Public API key generated',
  'organization.api_key_revoked': 'Public API key revoked',
  'organization.branding_updated': 'Branding updated',
  'organization.created': 'Organization created',
  'organization.logo_updated': 'Logo updated',
  'organization.smtp_configured': 'Email (SMTP) configured',
  'organization.sso_configured': 'SSO configured',
  'organization.sso_enabled': 'SSO enabled',
  'organization.sso_disabled': 'SSO disabled',
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

// View/session events, not data changes -- kept in sync with the backend's copy
// in apps/api/src/audit/audit-query.service.ts (ACCESS_ACTIONS). Both are short,
// stable lists of action *keys*; duplicating them is simpler and safer than
// sharing a backend package with the browser bundle for five string literals.
export const ACCESS_ACTIONS = [
  'super_admin.org_switch_in',
  'super_admin.org_switch_out',
  'login.success',
  'user.impersonate_start',
  'user.impersonate_stop',
];

export function isAccessEvent(action: string): boolean {
  return ACCESS_ACTIONS.includes(action);
}

// The prefix before the first "." groups related actions in the Action filter
// dropdown -- "Exams", "Questions", etc. -- rather than one flat 51-item list.
const GROUP_LABELS: Record<string, string> = {
  attempt: 'Attempts',
  auth: 'Security',
  candidate: 'Candidates',
  exam: 'Exams',
  invitation: 'Invitations',
  login: 'Security',
  organization: 'Organization',
  password: 'Security',
  platform: 'Platform',
  question: 'Questions',
  super_admin: 'Super-admin',
  user: 'Users',
};

export interface AuditActionOption {
  value: string;
  label: string;
  group: string;
}

// Every known action as a { value, label, group } option, sorted by group then
// label, for a grouped <select> -- built once from AUDIT_ACTION_LABELS so a
// newly-added action key only needs adding there, not in two places.
export const AUDIT_ACTION_OPTIONS: AuditActionOption[] = Object.keys(AUDIT_ACTION_LABELS)
  .map((action) => {
    const prefix = action.split('.')[0];
    return { value: action, label: AUDIT_ACTION_LABELS[action], group: GROUP_LABELS[prefix] ?? 'Other' };
  })
  .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

// The entity types the audit log actually records against today (matches
// AuditQueryService's own resolvable set plus the read-only ones like attempt).
export const AUDIT_ENTITY_TYPE_OPTIONS = [
  { value: 'exam', label: 'Exam' },
  { value: 'question', label: 'Question' },
  { value: 'candidate', label: 'Candidate' },
  { value: 'invitation', label: 'Invitation' },
  { value: 'attempt', label: 'Attempt' },
  { value: 'user', label: 'Staff user' },
  { value: 'organization', label: 'Organization' },
];

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

// The human-readable specifics for a row, WITHOUT repeating the action label
// (the table shows the label separately as a badge). Leads with the resolved
// entity name ("Backend Round") when the backend could resolve it, then adds
// metadata highlights. Returns '' when there's nothing extra to say.
// Everything in metadata is still shown in full in the detail view.
export function auditDetail(entry: AuditLogEntry): string {
  const meta = entry.metadata ?? {};
  const bits: string[] = [];

  if (entry.entityName) bits.push(`“${entry.entityName}”`);
  // Only fall back to the metadata title when the entity name wasn't resolved,
  // to avoid printing the same name twice.
  else if (typeof meta.examTitle === 'string') bits.push(`“${meta.examTitle}”`);

  if (typeof meta.count === 'number') bits.push(`${meta.count} record${meta.count === 1 ? '' : 's'}`);
  if (Array.isArray(meta.fields) && meta.fields.length > 0) bits.push(`changed: ${meta.fields.join(', ')}`);
  if (typeof meta.reason === 'string' && meta.reason.trim()) bits.push(meta.reason.trim());
  if (typeof meta.questionId === 'string') bits.push(`question ${meta.questionId}`);

  return bits.join(', ');
}

// The actor's display name: their name, then email, then "System" when no actor
// identity was captured (a genuine system event, or an unresolvable actor).
export function auditActor(entry: AuditLogEntry): string {
  return entry.actorName ?? entry.actorEmail ?? 'System';
}

// Full timestamp for the detail view / hover; the table shows a relative form.
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

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
];

// "2 hours ago" for the table row; formatAuditTimestamp (exact) is what the
// hover title and detail modal show, so precision is never actually lost, just
// deferred until the reader wants it. `now` is injectable for deterministic
// tests -- otherwise this reads real time on every render.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffSeconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    const value = Math.floor(diffSeconds / secondsInUnit);
    if (value >= 1) return rtf.format(-value, unit);
  }
  return 'just now';
}
