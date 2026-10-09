import { DateTime } from 'luxon';

// SD-2.26 (US-G-076, US-G-077): pure maths for the staff forecast and the availability report. No ML: the forecast of a
// day is the average of the same weekday over the last weeks of history (a seasonal moving average); a weekday with no
// history uses the average of all days. Staff needed = forecast ÷ tickets one agent handles a day, rounded up.

export interface DayCount {
  /** YYYY-MM-DD (India time, the day the counts were taken). */
  day: string;
  created: number;
}

export interface ForecastDay {
  day: string;
  weekday: number;
  expected: number;
  staffNeeded: number;
  /** How many past same weekdays the figure rests on. */
  basis: number;
}

export const FORECAST_WEEKS = 8;

export function forecast(history: readonly DayCount[], fromDay: string, days: number, perAgentPerDay: number, weeks = FORECAST_WEEKS): ForecastDay[] {
  const start = DateTime.fromISO(fromDay, { zone: 'utc' });
  const since = start.minus({ weeks }).toISODate()!;
  const recent = history.filter((h) => h.day >= since && h.day < fromDay);
  const byWeekday = new Map<number, number[]>();
  for (const h of recent) {
    const wd = DateTime.fromISO(h.day, { zone: 'utc' }).weekday;
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), h.created]);
  }
  const all = recent.map((h) => h.created);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const rate = Math.max(1, perAgentPerDay);
  return Array.from({ length: Math.max(0, Math.min(days, 28)) }, (_, i) => {
    const d = start.plus({ days: i });
    const same = byWeekday.get(d.weekday) ?? [];
    const expected = Math.round((same.length ? mean(same) : mean(all)) * 10) / 10;
    return { day: d.toISODate()!, weekday: d.weekday, expected, staffNeeded: expected > 0 ? Math.ceil(expected / rate) : 0, basis: same.length };
  });
}

export interface PresenceSpan {
  status: string;
  startedAt: Date;
  endedAt: Date | null;
}

/** Minutes in each status between from and to (spans clipped to the window; an open span runs to now). */
export function presenceMinutes(spans: readonly PresenceSpan[], from: Date, to: Date, now = new Date()): Record<'available' | 'away' | 'busy' | 'offline', number> {
  const out = { available: 0, away: 0, busy: 0, offline: 0 };
  for (const s of spans) {
    const a = Math.max(s.startedAt.getTime(), from.getTime());
    const b = Math.min((s.endedAt ?? now).getTime(), to.getTime());
    if (b > a && s.status in out) out[s.status as keyof typeof out] += (b - a) / 60_000;
  }
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = Math.round(out[k]);
  return out;
}

/** Replies per online hour; null when the agent was not online. */
export const perHour = (count: number, onlineMinutes: number) => (onlineMinutes >= 1 ? Math.round((count / (onlineMinutes / 60)) * 10) / 10 : null);
