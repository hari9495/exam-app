import { createHash, randomBytes, randomInt } from 'crypto';
import { DateTime } from 'luxon';

// Visitors slice 1 (M02 §B11, YX-AT-22): the pure rules. No database here, so every rule has a unit test.

export const PURPOSES = ['meeting', 'interview', 'vendor', 'audit', 'delivery', 'maintenance'] as const;
export type Purpose = (typeof PURPOSES)[number];
export type VisitStatus = 'expected' | 'waiting' | 'on_site' | 'checked_out' | 'not_out' | 'no_show' | 'cancelled' | 'declined';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The pass code the QR carries and reception can type: "V-7KQ2-MX4P" (no 0/O or 1/I to misread). */
export function passCode(): string {
  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `V-${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`;
}

/** The visitor's link: 32 unguessable characters (192 bits). */
export const passToken = () => randomBytes(24).toString('base64url');

/** A typed pass code: upper case, spaces and missing hyphens forgiven. Null when it cannot be a code. */
export function normalCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^V([A-Z2-9]{4})([A-Z2-9]{4})$/);
  return m ? `V-${m[1]}-${m[2]}` : null;
}

/** A mobile number: 10 Indian digits (starting 6-9) become +91…; "+" and 8 to 15 digits stay international. */
export function normalMobile(raw: string): string | null {
  const t = raw.trim();
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

/** "+91 ••••• ••871": the visitor's own page shows only the last 3 digits. */
export const maskMobile = (m: string) => `${m.startsWith('+91') ? '+91 ••••• ••' : '•••• '}${m.slice(-3)}`;

/** The visit window from a day and two times in the location's time zone. Null with a reason when it is not usable. */
export function visitWindow(day: string, from: string, to: string, zone: string, now: Date): { startsAt: Date; endsAt: Date } | { problem: string } {
  const s = DateTime.fromISO(`${day}T${from}`, { zone });
  const e = DateTime.fromISO(`${day}T${to}`, { zone });
  if (!s.isValid || !e.isValid) return { problem: 'Enter the day and the arrival and leaving times.' };
  if (e <= s) return { problem: 'The visitor must leave after they arrive.' };
  if (e.toJSDate() <= now) return { problem: 'This visit would already be over. Choose a later time.' };
  if (s.diff(DateTime.fromJSDate(now), 'days').days > 180) return { problem: 'Invite a visitor up to 180 days ahead.' };
  return { startsAt: s.toJSDate(), endsAt: e.toJSDate() };
}

/** The location's day of an instant ("2026-11-12"). */
export const localDay = (at: Date, zone: string) => DateTime.fromJSDate(at, { zone }).toISODate()!;

/** The location's day as the UTC instants it starts and ends at. */
export function dayBounds(day: string, zone: string): { from: Date; to: Date } {
  const s = DateTime.fromISO(day, { zone }).startOf('day');
  return { from: s.toJSDate(), to: s.plus({ days: 1 }).toJSDate() };
}

/** Why reception may not check this visit in now, or null. */
export function checkInProblem(v: { status: VisitStatus; startsAt: Date; endsAt: Date }, zone: string, now: Date): string | null {
  if (v.status === 'cancelled') return 'This visit was cancelled. The host can invite them again.';
  if (v.status === 'on_site') return 'This visitor is already checked in.';
  if (v.status !== 'expected') return 'This pass was used or has expired. The host can invite them again.';
  if (now >= v.endsAt) return 'This pass has expired. The host can invite them again.';
  const today = localDay(now, zone);
  const day = localDay(v.startsAt, zone);
  if (day !== today) return `This pass is for ${DateTime.fromISO(day).toFormat('d LLL yyyy')}, not today.`;
  return null;
}

/** The notice's version: a short fingerprint of its text, so a changed notice is accepted again. */
export const noticeVersion = (text: string) => `v-${createHash('sha256').update(text.trim()).digest('hex').slice(0, 12)}`;

/** "V-0413": the badge number reception reads out. */
export const badgeText = (seq: number | null) => (seq ? `V-${String(seq).padStart(4, '0')}` : null);

/** Words for a status (the drawn badges). */
export const STATUS_WORDS: Record<VisitStatus, string> = { expected: 'Expected', waiting: 'Waiting for host', on_site: 'On site', checked_out: 'Checked out', not_out: 'Not checked out', no_show: 'No show', cancelled: 'Cancelled', declined: 'Rejected' };
