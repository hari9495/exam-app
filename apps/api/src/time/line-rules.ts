// Projects P-2 (PRJ-02, founder answers 1406, 1407, 1442): the pure rules of line-by-line timesheet approval.

/** A line's minutes per day as approved: the submitted minutes (approved), none (rejected), or fewer (reduced). */
export function lineApproved(l: { minutes: number[]; status: string | null; approvedMinutes: number[] }): number[] {
  if (l.status === 'rejected') return l.minutes.map(() => 0);
  // Projects P-6 (1416): a corrected line counts its corrected minutes, like a reduced one.
  if ((l.status === 'reduced' || l.status === 'corrected') && l.approvedMinutes.length === l.minutes.length) return l.approvedMinutes;
  return l.minutes;
}

/**
 * A reduction to `total` minutes spread over the days the person booked, in proportion, whole minutes; the rounding
 * left over goes to the latest days first. Never more than booked on a day.
 */
export function reduceMinutes(minutes: number[], total: number): number[] {
  const booked = minutes.reduce((a, b) => a + b, 0);
  if (total < 0 || total >= booked) throw new RangeError('A reduction is to fewer minutes than booked.');
  const out = minutes.map((m) => Math.floor((m * total) / booked));
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let k = minutes.length - 1; left > 0 && k >= 0; k--) {
    const room = minutes[k]! - out[k]!;
    const add = Math.min(room, left);
    out[k]! += add;
    left -= add;
  }
  return out;
}

/** Answer 1407: hours a person may have on a project in a week within their allocation (share of a 40-hour week). */
// shortcut: a 40-hour week, as the PRJ-01 team tab shows; upgrade to the company's normal week when it is set per company.
export const allocationMinutes = (percent: number) => Math.round((percent / 100) * 40 * 60);

/** A line may be approved in bulk: booked inside the allocation (never an unallocated line), within its share. */
export function bulkOk(p: { unallocated: boolean; weekMinutesOnProject: number; allocationPercent: number | null; withinAllocation: boolean }): boolean {
  if (p.unallocated) return false;
  if (!p.withinAllocation) return true;
  return p.allocationPercent != null && p.weekMinutesOnProject <= allocationMinutes(p.allocationPercent);
}

/** The week once every line is decided: approved when any minutes are approved, else rejected; null while lines wait. */
export function weekOutcome(lines: { status: string | null; minutes: number[]; approvedMinutes: number[] }[]): 'approved' | 'rejected' | null {
  if (lines.some((l) => l.status === 'pending' || l.status === null)) return null;
  return lines.some((l) => lineApproved(l).some((m) => m > 0)) ? 'approved' : 'rejected';
}

/** Answers 1731 to 1733: words in a timesheet note (runs of non-space characters). */
export const wordCount = (note: string | null | undefined) => (note ?? '').trim().split(/\s+/).filter(Boolean).length;

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Answer 1787: the days of a row whose comment is short (the company's rule: required, at least N words on each day
 * with hours); days with no hours need none.
 */
export function dayCommentProblems(rule: { required: boolean; minWords: number }, minutes: number[], comments: readonly (string | null | undefined)[]): { day: number; words: number }[] {
  if (!rule.required) return [];
  return minutes.flatMap((m, day) => {
    if (!(m > 0)) return [];
    const words = wordCount(comments[day]);
    return words >= rule.minWords ? [] : [{ day, words }];
  });
}

/** Seven comments, Monday to Sunday, trimmed (an empty text for none). */
export const sevenComments = (c: readonly (string | null | undefined)[] | null | undefined) => Array.from({ length: 7 }, (_, k) => (c?.[k] ?? '').trim());

/** The day comments as one text for readers outside the timesheet ("Mon: …; Tue: …"). */
export const commentsText = (c: readonly (string | null | undefined)[] | null | undefined) =>
  sevenComments(c)
    .map((t, k) => (t ? `${DAY_NAMES[k]}: ${t}` : ''))
    .filter(Boolean)
    .join('\n');
