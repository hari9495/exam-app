// Batch G3a (M07) rules that need no database.

/** Share of the required items done, 0-100 (a course with no required item counts every item). */
export function progressOf(items: { id: string; required: boolean }[], done: string[]): number {
  const req = items.some((i) => i.required) ? items.filter((i) => i.required) : items;
  if (!req.length) return 0;
  const d = new Set(done);
  return Math.round((req.filter((i) => d.has(i.id)).length / req.length) * 100);
}

/** "2026-11-30" plus n months, the month end kept when the day does not exist. */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
