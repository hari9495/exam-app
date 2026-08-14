import type { SystemEventEntry } from '../system-events/system-events.service';

export type SeverityBand = 'immediate' | 'digest';

// ponytail: severityBand used to be a top-level field alongside tags, but nothing read it --
// SentryReporter only ever consumes payload.tags, and tags.severity_band already carries the
// same value. Dropped rather than wired up to a second consumer that doesn't exist yet.
export interface SentryPayload {
  tags: Record<string, string>;
}

// Allow-list, never a deny-list. A deny-list leaks the first PII field someone adds and
// forgets to list; this fails safe by construction. `stack` is deliberately absent -- the
// stack travels as the Sentry exception itself, not as an indexed tag.
const ALLOWED_CONTEXT_KEYS = ['status', 'method', 'route', 'attemptId', 'invitationId', 'userId'] as const;

// exam-runtime IS the candidate path by construction, and an error carrying an attemptId is
// by definition hurting someone mid-exam -- which is unrecoverable, unlike a recruiter
// retrying a page. Deriving the band this way costs zero extra queries; the alternative
// (querying for live attempts) would put a database round trip on the error path.
export function classifySeverity(service: string, hasAttempt: boolean): SeverityBand {
  return service === 'exam-runtime' || hasAttempt ? 'immediate' : 'digest';
}

export function buildSentryPayload(entry: SystemEventEntry): SentryPayload {
  const context = (entry.context ?? {}) as Record<string, unknown>;
  const hasAttempt = typeof context.attemptId === 'string' && context.attemptId.length > 0;
  const severityBand = classifySeverity(entry.service, hasAttempt);

  const tags: Record<string, string> = { service: entry.service, severity_band: severityBand };
  if (entry.organizationId) tags.organizationId = entry.organizationId;
  for (const key of ALLOWED_CONTEXT_KEYS) {
    const value = context[key];
    if (value !== undefined && value !== null) tags[key] = String(value);
  }
  return { tags };
}

// `now` is injected so the tests need no fake timers.
export function createRateLimiter(maxPerWindow: number, windowMs: number, now: () => number): () => boolean {
  let windowStart = now();
  let count = 0;
  return function allow(): boolean {
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    if (count >= maxPerWindow) return false;
    count += 1;
    return true;
  };
}
