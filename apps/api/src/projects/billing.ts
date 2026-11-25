// Projects P-6 (PRJ-05, PRJ-06; founder answers 1414 to 1416): the pure rules of project billing and corrections.

/** Minutes at a rate per hour, in whole paise (half a paisa rounds up). */
export const minutesAmount = (minutes: number, ratePaise: bigint) => (BigInt(minutes) * ratePaise + 30n) / 60n;

/** Hours shown for minutes (two decimals at most). */
export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/**
 * A week's day minutes changed to a new total: more goes on the last day already booked (then the days before it, at
 * most 24 h a day); less comes off the last booked day first. Null when the total cannot fit in the week.
 */
export function spreadMinutes(days: number[], total: number): number[] | null {
  if (total < 0 || total > days.length * 1440) return null;
  const out = [...days];
  let diff = total - out.reduce((s, m) => s + m, 0);
  const last = Math.max(0, out.reduce((at, m, i) => (m > 0 ? i : at), -1));
  // Adding: the last booked day backwards, then the days after it.
  const order = [...Array.from({ length: last + 1 }, (_, i) => last - i), ...Array.from({ length: out.length - last - 1 }, (_, i) => last + 1 + i)];
  for (const i of order) {
    if (!diff) break;
    if (diff > 0) {
      const add = Math.min(diff, 1440 - out[i]!);
      out[i]! += add;
      diff -= add;
    } else {
      const take = Math.min(-diff, out[i]!);
      out[i]! -= take;
      diff += take;
    }
  }
  // Taking off can reach the days after the last booked day only if they hold minutes: they hold none.
  return diff ? null : out;
}

/** Answer 1416: what a correction of billed time makes. */
export function correctionDocument(billed: boolean, beforeMinutes: number, afterMinutes: number): 'credit_note' | 'supplementary' | null {
  if (!billed || afterMinutes === beforeMinutes) return null;
  return afterMinutes < beforeMinutes ? 'credit_note' : 'supplementary';
}

/** Why an unbilled item cannot go on an invoice yet (null when it can). */
export function heldReason(o: { clientId: string | null; clientStatus?: string | null; ratePaise?: bigint | null; needsRate?: boolean; milestoneStatus?: string; fee?: number | null; needsFee?: boolean }): string | null {
  if (!o.clientId) return 'no client on the project';
  if (o.clientStatus === 'waiting') return 'waiting for client approval';
  if (o.clientStatus === 'sent_back') return 'sent back by the client';
  if (o.milestoneStatus === 'completed') return 'waiting for client acceptance';
  if (o.needsRate && !o.ratePaise) return 'no bill rate on the project';
  if (o.needsFee && !o.fee) return 'no fee on the project';
  return null;
}

/** "2026-Q3" → its three months (first days). */
export function quarterMonths(q: string): string[] {
  const y = Number(q.slice(0, 4));
  const n = Number(q.slice(6));
  return [0, 1, 2].map((i) => `${y}-${String((n - 1) * 3 + i + 1).padStart(2, '0')}-01`);
}
