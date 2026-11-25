// Sessions, the pure rules (LRN-04, 05, 06): a seat or the waitlist, the result once attendance is confirmed, and the
// window of the rotating check-in code.

/** Seats are held by these enrolment statuses (a waitlist place is not a seat). */
export const SEAT_STATUSES = ['enrolled', 'in_progress', 'completed', 'no_show', 'failed'] as const;

/** YX-LRN-06: a seat while one is free, else the waitlist (first come, first served). */
export const placeIn = (seatsTaken: number, seats: number): 'enrolled' | 'waitlisted' => (seatsTaken < seats ? 'enrolled' : 'waitlisted');

export type SessionResult = { status: 'completed' | 'no_show' | 'failed'; reason: string };

/**
 * YX-LRN-01: an attendee who attended no slot is a no-show (never completed); below the course's attendance share they
 * have not completed it; otherwise it is complete.
 */
export function sessionResult(attended: number, total: number, pct: number): SessionResult {
  if (attended === 0) return { status: 'no_show', reason: 'Did not attend any slot' };
  const share = total ? attended / total : 0;
  if (share * 100 < pct) return { status: 'failed', reason: `Attended ${attended} of ${total} slots; needs ${pct}%` };
  return { status: 'completed', reason: `Attended ${attended} of ${total} slots` };
}

/** The check-in code changes every CODE_SECONDS; the one just before still counts, for a slow scan. */
export const CODE_SECONDS = 30;
export const codeWindow = (now: number) => Math.floor(now / 1000 / CODE_SECONDS);
export const secondsLeft = (now: number) => CODE_SECONDS - (Math.floor(now / 1000) % CODE_SECONDS);
/** Six digits from a keyed hash (hex). */
export const sixDigits = (hex: string) => String(parseInt(hex.slice(0, 12), 16) % 1_000_000).padStart(6, '0');
