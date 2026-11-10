import { createHmac } from 'crypto';
import { DateTime } from 'luxon';

// Visitors slice 2 rules (answers 601, 604, 606, 610), kept pure so they are tested without a database.

/** Answer 606: an NDA counts for a year for the same person and company; the induction is every visit. */
export const NDA_VALID_DAYS = 365;

/** The person an NDA belongs to: a keyed hash of the mobile and the company name (never the number itself). */
export function personKey(org: string, mobile: string, company: string | null): string {
  const secret = process.env.JWT_SECRET ?? 'yukthix-visitors';
  return createHmac('sha256', `${secret}:visitor-person`).update(`${org}|${mobile}|${(company ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`).digest('hex');
}

/** Is the moment inside the location's allowed hours ("09:00" to "18:30", in its time zone)? */
export function inHours(at: Date, zone: string, from: string, to: string): boolean {
  const t = DateTime.fromJSDate(at, { zone }).toFormat('HH:mm');
  return t >= from && t < to;
}

/** Answer 604: when the host's time runs out (minutes from the walk-in's arrival). */
export const approvalDue = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);

/** Who may decide a waiting walk-in now: the host until the deadline; reception only after it. */
export function decider(v: { status: string; approvalDueAt: Date | null; hostUserId: string }, userId: string, isReception: boolean, now: Date, zone = 'Asia/Kolkata'): 'host' | 'reception' | string {
  if (v.status !== 'waiting') return 'This walk-in is not waiting for a decision.';
  if (userId === v.hostUserId) return 'host';
  if (!isReception) return 'Only the host or reception can decide.';
  if (v.approvalDueAt && now < v.approvalDueAt) return `The host has until ${DateTime.fromJSDate(v.approvalDueAt).setZone(zone).toFormat('h:mm a')} to answer; reception decides after that.`;
  return 'reception';
}

/** Plain text of a policy body (the Policies module stores HTML): what a visitor reads on the kiosk or their link. */
export function policyText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Answer 602: a photo is a JPEG or PNG of at most 600 KB (checked by its first bytes, never by the name). */
export function photoProblem(buf: Buffer): string | null {
  if (buf.length === 0) return 'The photo is empty. Take it again.';
  if (buf.length > 600 * 1024) return 'The photo is too large. Take it again.';
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return jpeg || png ? null : 'The photo must be a JPEG or PNG picture.';
}
