export interface DayWindow { start: Date; end: Date; iso: string; timeZone: string }

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Wall-clock parts of `d` as seen in `tz`.
function wallParts(d: Date, tz: string): { y: number; m: number; day: number; h: number; min: number; s: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, day: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second };
}

// The UTC instant at which the wall clock in `tz` reads 00:00 on the local date of `now`.
// Two correction passes absorb the zone's offset (and a DST change on that day).
export function dayWindow(now: Date, timeZone: string | null | undefined): DayWindow {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const p = wallParts(now, tz);
  const iso = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const targetWall = Date.UTC(p.y, p.m - 1, p.day, 0, 0, 0);
  let start = new Date(targetWall);
  for (let i = 0; i < 2; i++) {
    const w = wallParts(start, tz);
    const asWall = Date.UTC(w.y, w.m - 1, w.day, w.h, w.min, w.s);
    start = new Date(start.getTime() - (asWall - targetWall));
  }
  // ponytail: end = start + 24h; a DST-transition day is 23/25h and shifts the boundary by ≤1h. Acceptable for
  // "interviews today"; switch to a second zonedMidnight(iso + 1 day) if a reviewer ever hits it.
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), iso, timeZone: tz };
}
