// TIM-34 auto-roster, the filling algorithm (feature sheet rule 11 in docs/yukthix/time-design-map.md), pure apart from
// the injected check: slots are filled in a fixed order (day, then start time, then shift code); for each slot the
// candidates are tried in the fair order (fewest scheduled minutes that week, then fewest nights, then employee code,
// then id) and the first ones the check lets through are placed. Every skip keeps its reason, so an unfilled slot can
// say why each candidate was not used. The rules themselves live in the RosterGuard; nothing here re-implements them.

export type SkipKind = 'planned' | 'placed' | 'leave' | 'holiday' | 'locked' | 'rest' | 'overlap' | 'hours' | 'spread' | 'week' | 'weekly_off' | 'licence' | 'night';

/** Plain words for each reason (the UI groups by these). */
export const SKIP_LABEL: Record<SkipKind, string> = {
  planned: 'Already planned that day',
  placed: 'Already placed on another shift that day',
  leave: 'On leave (approved or waiting)',
  holiday: 'Holiday',
  locked: 'Attendance period locked',
  rest: 'Not enough rest between shifts',
  overlap: 'Overlaps another shift',
  hours: 'Too many hours that day',
  spread: 'Working day spreads too long',
  week: 'Would pass the weekly hours',
  weekly_off: 'Would lose the weekly off',
  licence: 'No valid licence',
  night: 'Night work not allowed',
};

/** At most this many skipped candidates are kept per unfilled slot (the counts cover everyone). */
export const MAX_EXPLAINED = 50;

export interface Slot {
  on: string;
  shiftId: string;
  code: string;
  /** Start, minutes after midnight (orders the slots of a day). */
  start: number;
  /** Scheduled minutes (shift less its break): what a placement adds to the person's week. */
  minutes: number;
  night: boolean;
  need: number;
  /** People already on this shift that day (published, drafts, pattern). */
  had: number;
  /** Who may be tried for this slot (works at the location that day, planned by the viewer). */
  candidates: string[];
}

export interface Candidate {
  employeeId: string;
  name: string;
  code: string | null;
  /** Scheduled minutes in the week so far (updated as placements are made). */
  minutes: number;
  nights: number;
}

export interface Skip {
  employeeId: string;
  name: string;
  kind: SkipKind;
  why: string;
}

export interface SlotResult {
  on: string;
  shiftId: string;
  need: number;
  had: number;
  /** had + placed. */
  got: number;
  placed: { employeeId: string; name: string }[];
  /** Only for a slot still short: who was tried and why each was skipped (the first MAX_EXPLAINED). */
  skipped: Skip[];
  /** Every skip counted by reason, for a slot still short. */
  reasons: { kind: SkipKind; label: string; count: number }[];
  /** Short with no one at the location to try. */
  noCandidates: boolean;
}

export type Check = (c: Candidate, slot: Slot) => Promise<{ kind: SkipKind; why: string } | null>;

const byCode = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'en', { numeric: true }));

/** Fair order: fewest minutes that week, then fewest nights, then employee code (none last), then id. */
export function fairOrder<T extends Candidate>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.minutes - b.minutes || a.nights - b.nights || byCode(a.code, b.code) || a.employeeId.localeCompare(b.employeeId));
}

/** Slots are filled day by day, earliest shift first. */
export function slotOrder<T extends Pick<Slot, 'on' | 'start' | 'code'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.on.localeCompare(b.on) || a.start - b.start || a.code.localeCompare(b.code));
}

export function reasonCounts(skips: readonly Skip[]): SlotResult['reasons'] {
  const n = new Map<SkipKind, number>();
  for (const s of skips) n.set(s.kind, (n.get(s.kind) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([kind, count]) => ({ kind, label: SKIP_LABEL[kind], count }));
}

/**
 * Fills the slots. `people` is mutated (minutes and nights grow with each placement, so the fair order follows the run);
 * `place` writes a placement and answers false when the day was taken meanwhile (then the next candidate is tried).
 */
export async function fill(slots: readonly Slot[], people: Map<string, Candidate>, check: Check, place: (c: Candidate, slot: Slot) => Promise<boolean>): Promise<SlotResult[]> {
  const onDay = new Map<string, string>();
  const out: SlotResult[] = [];
  for (const slot of slotOrder(slots)) {
    const short = slot.need - slot.had;
    const placed: SlotResult['placed'] = [];
    const skipped: Skip[] = [];
    if (short > 0) {
      const pool = fairOrder(slot.candidates.map((id) => people.get(id)).filter((c): c is Candidate => Boolean(c)));
      for (const c of pool) {
        if (placed.length >= short) break;
        const already = onDay.get(`${c.employeeId}|${slot.on}`);
        const r = already ? { kind: 'placed' as const, why: `Placed on ${already} that day` } : await check(c, slot);
        if (r) {
          skipped.push({ employeeId: c.employeeId, name: c.name, ...r });
          continue;
        }
        if (!(await place(c, slot))) {
          skipped.push({ employeeId: c.employeeId, name: c.name, kind: 'planned', why: 'Planned by someone else while this ran' });
          continue;
        }
        placed.push({ employeeId: c.employeeId, name: c.name });
        onDay.set(`${c.employeeId}|${slot.on}`, slot.code);
        c.minutes += slot.minutes;
        if (slot.night) c.nights += 1;
      }
    }
    const got = slot.had + placed.length;
    const still = got < slot.need;
    out.push({ on: slot.on, shiftId: slot.shiftId, need: slot.need, had: slot.had, got, placed, skipped: still ? skipped.slice(0, MAX_EXPLAINED) : [], reasons: still ? reasonCounts(skipped) : [], noCandidates: still && slot.candidates.length === 0 });
  }
  return out;
}

/** Coverage over all slots: required, filled (never more than required per slot), short and over-staffed slots. */
export function coverage(results: readonly Pick<SlotResult, 'need' | 'got'>[]) {
  const required = results.reduce((n, r) => n + r.need, 0);
  const filled = results.reduce((n, r) => n + Math.min(r.need, r.got), 0);
  return { required, filled, unfilled: required - filled, shortSlots: results.filter((r) => r.got < r.need).length, overSlots: results.filter((r) => r.got > r.need).length };
}
