// HIR-20 Talent CRM and HIR-05 under-18 rules, kept pure so they are tested without a database.

export type Channel = 'email' | 'whatsapp';
export type Step = { kind: 'message'; templateId: string } | { kind: 'wait'; days: number };

/** Why a pool member is not enrolled (the builder's "Who gets it" list). */
export type Skip = 'no_consent' | 'opted_out' | 'minor' | 'erased';

export interface AudienceFacts {
  /** A current talent-pool consent (given, not withdrawn). */
  poolConsent: boolean;
  emailOptedOut: boolean;
  whatsappOptedIn: boolean;
  whatsappOptedOut: boolean;
  hasPhone: boolean;
  /** Under the HIR.MINOR age with no guardian consent: never enrolled. */
  minor: boolean;
  erased: boolean;
}

/**
 * Consent-based audience: talent-pool consent plus the channel's opt-in. Email: not unsubscribed. WhatsApp: the
 * candidate opted in (their own choice), has not opted out and has a number. Under 18 is never enrolled.
 */
export function audienceSkip(f: AudienceFacts, channel: Channel): Skip | null {
  if (f.erased) return 'erased';
  if (f.minor) return 'minor';
  if (channel === 'email' && f.emailOptedOut) return 'opted_out';
  if (channel === 'whatsapp' && f.whatsappOptedOut) return 'opted_out';
  if (!f.poolConsent) return 'no_consent';
  if (channel === 'whatsapp' && (!f.whatsappOptedIn || !f.hasPhone)) return 'no_consent';
  return null;
}

/** Steps as saved: 1 to 10, a message names a template, a wait is 1 to 60 days; at least one message. */
export function validSteps(raw: unknown): Step[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'Add at least one step.';
  if (raw.length > 10) return 'A sequence has at most 10 steps.';
  const out: Step[] = [];
  for (const [i, s] of raw.entries()) {
    const r = s as { kind?: unknown; templateId?: unknown; days?: unknown };
    if (r.kind === 'message' && typeof r.templateId === 'string' && /^[0-9a-f-]{36}$/i.test(r.templateId)) out.push({ kind: 'message', templateId: r.templateId });
    else if (r.kind === 'wait' && Number.isInteger(r.days) && (r.days as number) >= 1 && (r.days as number) <= 60) out.push({ kind: 'wait', days: r.days as number });
    else return `Step ${i + 1}: choose a template, or wait 1 to 60 days.`;
  }
  if (!out.some((s) => s.kind === 'message')) return 'Add at least one message step.';
  return out;
}

/** The IST hour of a moment (India has no daylight saving). */
export const istHour = (at: Date) => new Date(at.getTime() + 330 * 60_000).getUTCHours();
/** The IST day (YYYY-MM-DD) of a moment, and its start as a UTC instant. */
export const istDay = (at: Date) => new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
export const istDayStart = (at: Date) => new Date(`${istDay(at)}T00:00:00+05:30`);

/** Is `at` inside the company's send window ("09-21": from 9:00 to before 21:00 IST; "00-24": any time)? */
export function inWindow(window: string, at: Date): boolean {
  const m = /^(\d{2})-(\d{2})$/.exec(window);
  if (!m) return false;
  const h = istHour(at);
  return h >= Number(m[1]) && h < Number(m[2]);
}

/** Whole years between a date of birth and a day (both YYYY-MM-DD). */
export function ageOn(dob: string, day: string): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** A sourced profile's days left before it is erased (never below 0). */
export function daysLeft(purgeAfter: Date, now: Date): number {
  return Math.max(0, Math.ceil((purgeAfter.getTime() - now.getTime()) / 86_400_000));
}
