import { createHash, randomBytes, randomInt } from 'crypto';

// TIM-13 / TIM-14 pure rules (feature sheet rules 13, 14): kiosk health from its last contact, the window an offline
// punch must fall in, the kiosk PIN lock, one-time set-up codes and device secrets. No database here.

/** A kiosk not heard from for this long is "stale", then "offline" (the TIM-14 design's note under the table). */
export const STALE_AFTER_MS = 15 * 60_000;
export const OFFLINE_AFTER_MS = 60 * 60_000;
/** An approved phone not seen for this long shows as inactive (HR may sign it out). */
export const PHONE_INACTIVE_AFTER_MS = 30 * 86_400_000;
/** A kiosk's one-time set-up code works for 30 minutes. */
export const SETUP_CODE_MS = 30 * 60_000;
/** Offline punches: the oldest accepted, and how far ahead of the server clock a device clock may run. */
export const MAX_PUNCH_AGE_MS = 72 * 3_600_000;
export const MAX_PUNCH_AHEAD_MS = 2 * 60_000;
/** Wrong kiosk PINs (kiosk.pin_tries) lock the code for this long. */
export const PIN_LOCK_MS = 15 * 60_000;
/** After a person is identified, the kiosk may act for them this long. */
export const KIOSK_PERSON_SECONDS = 120;
/** At most this many offline punches in one sync call. */
export const MAX_SYNC_ITEMS = 50;

export type KioskHealth = 'not_set_up' | 'online' | 'stale' | 'offline';

export function kioskHealth(k: { setUp: boolean; lastSeenAt: Date | null }, now = new Date()): KioskHealth {
  if (!k.setUp) return 'not_set_up';
  if (!k.lastSeenAt) return 'offline';
  const age = now.getTime() - k.lastSeenAt.getTime();
  return age < STALE_AFTER_MS ? 'online' : age < OFFLINE_AFTER_MS ? 'stale' : 'offline';
}

export const phoneInactive = (lastSeenAt: Date | null, since: Date, now = new Date()) => now.getTime() - (lastSeenAt ?? since).getTime() >= PHONE_INACTIVE_AFTER_MS;

/** Why a device punch time is refused, or null when it is inside the window. */
export function punchTimeProblem(at: Date, now = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return 'The punch time is not a valid time.';
  if (at.getTime() - now.getTime() > MAX_PUNCH_AHEAD_MS) return "The punch time is in the future. Check the device's clock and try again.";
  if (now.getTime() - at.getTime() > MAX_PUNCH_AGE_MS) return 'This punch is more than 72 hours old, so it cannot be synced. Ask your manager to fix the day as a regularisation.';
  return null;
}

/** The PIN credential after a wrong try: `tries` wrong in a row lock it for 15 minutes and start the count again. */
export function afterWrongPin(failed: number, tries: number, now = new Date()): { failed: number; lockedUntil: Date | null } {
  const n = failed + 1;
  return n >= tries ? { failed: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MS) } : { failed: n, lockedUntil: null };
}

export const pinLocked = (lockedUntil: Date | null, now = new Date()) => Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());

/** A 4-digit PIN that is not all one digit or a straight run (1234, 9876). */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'A PIN is 4 digits.';
  if (/^(\d)\1{3}$/.test(pin)) return 'Choose a PIN that is not one digit four times.';
  const steps = [1, 2, 3].map((i) => Number(pin[i]) - Number(pin[i - 1]));
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'Choose a PIN that is not a run like 1234.';
  return null;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** No 0/O, 1/I/L: a code typed from a screen. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A one-time set-up code, e.g. "K7PQ-M2XD-9RTA" (12 characters, about 59 bits). */
export function newSetupCode(): string {
  const c = Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
/** The code as typed (any case, spaces or dashes) in the stored form. */
export const normalSetupCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A kiosk's bearer secret: the company id (so the lookup stays inside the company) and 32 random bytes. */
export const newDeviceToken = (org: string) => `${org}.${randomBytes(32).toString('base64url')}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function tokenOrg(token: string): string | null {
  const [org, secret, extra] = token.split('.');
  return extra === undefined && org && secret && UUID.test(org) && /^[A-Za-z0-9_-]{43}$/.test(secret) ? org.toLowerCase() : null;
}
