// Admin B1 (batch B item 29): an audit entry as one plain English sentence, for the activity log and its CSV.
// About 1,500 action codes exist, so the sentence is built from the code's shape ("area.thing.done" -> "Thing done by
// Priya Nair.") with a short list of hand-written sentences for sign-in and security events, where the code reads worst.

const SECURITY: Record<string, string> = {
  'login.success': '{actor} signed in.',
  'login.break_glass': '{actor} signed in with the emergency (break-glass) account.',
  'step_up.used': '{actor} confirmed it was them before a sensitive action.',
  'mfa.step_up': '{actor} confirmed it was them with their second sign-in step.',
  'mfa.step_up_failed': '{actor} failed to confirm it was them (wrong second-step code).',
  'mfa.enrolled': '{actor} set up a second sign-in step.',
  'mfa.removed': '{actor} removed a second sign-in step.',
  'mfa.reset': '{actor} reset two-step verification{label}.',
  'mfa.recovery_code_used': '{actor} signed in with a recovery code.',
  'mfa.recovery_codes_generated': '{actor} made new recovery codes.',
  'password.changed': '{actor} changed their password.',
  'password.reset': '{actor} reset a password{label}.',
  'session.revoked': '{actor} signed a session out.',
  'session.revoked_others': '{actor} signed out their other sessions.',
  'auth.token_reuse_detected': 'A reused sign-in token was blocked and the session was signed out.',
  'user.deactivated': '{actor} turned off sign-in{label}.',
  'user.reactivated': '{actor} turned sign-in back on{label}.',
  'user.impersonate_start': '{actor} started acting as another user{label}.',
  'user.impersonate_stop': '{actor} stopped acting as another user{label}.',
  'audit.exported': '{actor} exported the audit log.',
};

// Area prefixes that add nothing to the sentence ("ats.candidate.merged" -> "Candidate merged").
const NOISE = new Set(['ats', 'asmt', 'sd', 'yx']);
const WORD: Record<string, string> = { updated: 'changed', org: 'company', sd: 'helpdesk', pf: 'PF', esi: 'ESI', tds: 'TDS', pt: 'PT', lwf: 'LWF', lop: 'loss of pay', fnf: 'full and final', mfa: 'two-step verification', api: 'API', ewa: 'earned wage access', otp: 'one-time code', sms: 'SMS', jit: 'automatic', idp: 'identity provider', posh: 'POSH' };
// Details fields that name the record, in order of preference. Values are already masked by the caller.
const LABELS = ['name', 'title', 'label', 'employeeName', 'personName', 'subjectName', 'email', 'code'];

const words = (s: string) => s.split('_').filter(Boolean).map((w) => WORD[w] ?? w).join(' ');

function labelOf(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const d = details as Record<string, unknown>;
  for (const k of LABELS) {
    const v = d[k];
    if (typeof v === 'string' && v.trim() && v.length <= 120 && !/^\*+$|•/.test(v)) return v.trim();
  }
  return null;
}

export function auditSentence(action: string, actor: string, details: unknown): string {
  const label = labelOf(details);
  const fixed = SECURITY[action];
  if (fixed) return fixed.replace('{actor}', actor).replace('{label}', label ? ` for "${label}"` : '');
  const parts = action.split('.').filter(Boolean);
  const done = words(parts.pop() ?? action);
  const thing = parts.filter((p) => !NOISE.has(p)).map(words).join(' ');
  const head = thing ? `${thing}${label ? ` "${label}"` : ''} ${done}` : `${done}${label ? ` "${label}"` : ''}`;
  const by = actor === 'YukthiX system' ? 'by YukthiX' : `by ${actor}`;
  return `${head.charAt(0).toUpperCase()}${head.slice(1)} ${by}.`;
}
