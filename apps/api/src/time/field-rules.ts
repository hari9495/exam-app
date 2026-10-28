import { addDays, distanceM } from './time-maths';

// Field force (TIM-32 / TIM-33), the pure rules. DPDP Act 2023 s.5–6: tracking needs consent against a notice for one
// purpose, may be withdrawn at any time, and the data is kept only as long as the purpose needs (s.8(7)).

/** The notice a person consents to; a new wording gets a new version and asks again. */
export const NOTICE_VERSION = '2026-10';

export function noticeFor(retentionDays: number, pingMinutes: number) {
  return {
    version: NOTICE_VERSION,
    purpose: 'Attendance and customer visits while you are on duty.',
    collected: `Your phone's location every ${pingMinutes} minutes while you are checked in and moving, how accurate it was, and whether the phone reported a fake location. Nothing is recorded before you check in, after you check out, on leave or on weekly offs.`,
    retention: `The trail is deleted after ${retentionDays} days. Visits stay with your attendance.`,
    withdraw: 'Withdraw any time in the app. Tracking stops at once and your trail is deleted. Your attendance and visits are not affected.',
  };
}

/** A ping more than this away from its neighbour, faster than a road vehicle can go, is flagged (never a penalty). */
export const MAX_SPEED_KMH = 200;
/** The phone clock this far from the server clock: every ping of that upload is flagged. */
export const MAX_SKEW_MS = 5 * 60_000;
/** A check-in with no check-out is treated as duty for at most this long (a forgotten check-out never tracks forever). */
export const MAX_DUTY_HOURS = 18;
/** Pings are uploaded late (offline) at most this long after they were taken. */
export const MAX_LATE_HOURS = 24;
export const MAX_BATCH = 100;

export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end';

/** Duty windows from accepted punches: an "in" opens one, the next "out" closes it; an open one ends now (capped). */
export function dutyWindows(punches: readonly { kind: string; at: Date }[], now: Date): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  let open: Date | null = null;
  const cap = (from: Date, to: Date) => new Date(Math.min(to.getTime(), from.getTime() + MAX_DUTY_HOURS * 3_600_000));
  for (const p of [...punches].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (p.kind === 'in' && !open) open = p.at;
    else if (p.kind === 'out' && open) {
      out.push({ from: open, to: cap(open, p.at) });
      open = null;
    }
  }
  if (open) out.push({ from: open, to: cap(open, now) });
  return out;
}

export const onDutyAt = (windows: readonly { from: Date; to: Date }[], at: Date) => windows.some((w) => at >= w.from && at <= w.to);

/** Speed between two pings beyond what their accuracy explains, in km/h (0 when within the accuracy circles). */
export function speedKmh(a: { lat: number; lng: number; accuracyM: number; at: Date }, b: { lat: number; lng: number; accuracyM: number; at: Date }): number {
  const metres = Math.max(0, distanceM(a, b) - a.accuracyM - b.accuracyM);
  const hours = Math.abs(b.at.getTime() - a.at.getTime()) / 3_600_000;
  if (!metres) return 0;
  return hours === 0 ? Infinity : metres / 1000 / hours;
}

export type PingFlag = 'mock' | 'speed' | 'accuracy' | 'skew';

/**
 * Integrity flags of one ping. A poor fix is kept (flagged) rather than dropped so the manager sees a gap is a weak
 * signal, not a missing person; it is left out of the drawn trail, the distance and the speed check.
 */
export function pingFlags(p: { lat: number; lng: number; accuracyM: number; at: Date; mock?: boolean }, prevGood: { lat: number; lng: number; accuracyM: number; at: Date } | null, maxAccuracyM: number, skewed: boolean): PingFlag[] {
  const flags: PingFlag[] = [];
  if (p.mock) flags.push('mock');
  if (p.accuracyM > maxAccuracyM) flags.push('accuracy');
  else if (prevGood && speedKmh(prevGood, p) > MAX_SPEED_KMH) flags.push('speed');
  if (skewed) flags.push('skew');
  return flags;
}

/** A visit check-in point against the site circle. */
export function visitVerdict(point: { lat: number; lng: number }, site: { lat: number; lng: number; radiusM: number } | null): { distanceM: number | null; inside: boolean | null } {
  if (!site) return { distanceM: null, inside: null };
  const d = distanceM(point, site);
  return { distanceM: d, inside: d <= site.radiusM };
}

/** Distance along the good pings (km, one decimal). */
export function trailKm(pings: readonly { lat: number; lng: number }[]): number {
  let m = 0;
  for (let i = 1; i < pings.length; i++) m += distanceM(pings[i - 1], pings[i]);
  return Math.round(m / 100) / 10;
}

/** Pings of a work day before this date are deleted (keeps `days` whole days before today, and today). */
export const retentionCutoff = (today: string, days: number) => addDays(today, -days);
