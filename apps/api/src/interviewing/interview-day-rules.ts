// HIR-27 bulk interview day: the pure rules (YX-ATS-40). No database here, so every rule has a unit test.

export type AssignMode = 'by_slot' | 'by_panel';

export interface Cell {
  panelId: string;
  start: number;
}

/**
 * The free cells of a day in the order Auto-assign fills them. by_slot (as drawn): the earliest slot across every panel,
 * then the next slot; by_panel: one panel's slots before the next panel's. Taken cells (rows already sent) are skipped.
 */
export function freeCells(panelIds: string[], slots: number[], mode: AssignMode, taken: Cell[]): Cell[] {
  const busy = new Set(taken.map((t) => `${t.panelId}@${t.start}`));
  const sorted = [...slots].sort((a, b) => a - b);
  const all = mode === 'by_panel' ? panelIds.flatMap((panelId) => sorted.map((start) => ({ panelId, start }))) : sorted.flatMap((start) => panelIds.map((panelId) => ({ panelId, start })));
  return all.filter((c) => !busy.has(`${c.panelId}@${c.start}`));
}

/** Candidates in their order, each given the next free cell; the rest do not fit this day. */
export function assignDay<T>(candidates: T[], cells: Cell[]): { assigned: (Cell & { candidate: T })[]; unassigned: T[] } {
  return { assigned: candidates.slice(0, cells.length).map((candidate, i) => ({ candidate, ...cells[i]! })), unassigned: candidates.slice(cells.length) };
}

/** Slot starts (minutes after midnight): 1-20 whole minutes, distinct, and the last slot ends by midnight. Returns the reason, or null. */
export function slotProblem(slots: number[], slotMinutes: number): string | null {
  if (!slots.length || slots.length > 20) return 'Give 1 to 20 slots.';
  if (slots.some((s) => !Number.isInteger(s) || s < 0 || s > 1439)) return 'A slot starts at a time of day (00:00 to 23:59).';
  const sorted = [...slots].sort((a, b) => a - b);
  if (new Set(sorted).size !== sorted.length) return 'Two slots start at the same time.';
  if (sorted.some((s, i) => i > 0 && s < sorted[i - 1]! + slotMinutes)) return `Slots overlap: each interview lasts ${slotMinutes} minutes.`;
  if (sorted[sorted.length - 1]! + slotMinutes > 1440) return 'The last slot must end by midnight.';
  return null;
}

/** A panel member on two panels would be in two rooms at once. Returns the repeated user id, or null. */
export function memberOnTwoPanels(panels: { memberUserIds: string[] }[]): string | null {
  const seen = new Set<string>();
  for (const p of panels) for (const u of new Set(p.memberUserIds)) {
    if (seen.has(u)) return u;
    seen.add(u);
  }
  return null;
}
