// Helpdesk ITSM (docs/yukthix/helpdesk-itsm-plan.md; answers 1933, 1936): the risk questions and the change window and
// freeze rules, as pure functions. Days and times are India days and times (IST), as for the maintenance rules.

export type Risk = 'low' | 'medium' | 'high';
export interface RiskQuestion {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Answer 1933: the five starter questions (the same as the drawn New change drawer). Each answer is worth 0 to 2 points. */
export const DEFAULT_RISK_QUESTIONS: RiskQuestion[] = [
  { id: 'people', label: 'How many people does it affect?', options: [{ value: '0', label: 'Fewer than 10' }, { value: '1', label: '10 to 100' }, { value: '2', label: 'More than 100, or a whole location' }] },
  { id: 'undo', label: 'Can it be undone?', options: [{ value: '0', label: 'Yes, in minutes' }, { value: '1', label: 'Yes, in hours' }, { value: '2', label: 'No, or not fully' }] },
  { id: 'tested', label: 'Was it tested?', options: [{ value: '0', label: 'Yes, in a test system' }, { value: '1', label: 'Partly' }, { value: '2', label: 'No' }] },
  { id: 'before', label: 'Has the team done this before?', options: [{ value: '0', label: 'Yes, often' }, { value: '1', label: 'Once or twice' }, { value: '2', label: 'Never' }] },
  { id: 'money', label: 'Does it touch payroll, attendance or payments?', options: [{ value: '0', label: 'No' }, { value: '2', label: 'Yes' }] },
];

/** Why a desk's own questions cannot be saved (null: they can). */
export function questionsProblem(qs: unknown): string | null {
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > 8) return 'Ask between 1 and 8 risk questions.';
  const ids = new Set<string>();
  for (const q of qs as RiskQuestion[]) {
    if (!q || typeof q.id !== 'string' || !/^[a-z][a-z0-9_]{0,19}$/.test(q.id) || ids.has(q.id)) return 'Each question needs its own short id (lower-case letters).';
    ids.add(q.id);
    if (typeof q.label !== 'string' || q.label.trim().length < 5 || q.label.length > 120) return 'Each question needs a label of 5 to 120 characters.';
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return `"${q.label}" needs 2 to 4 answers.`;
    for (const o of q.options) {
      if (!o || !['0', '1', '2'].includes(o.value)) return `Each answer of "${q.label}" is worth 0, 1 or 2 points.`;
      if (typeof o.label !== 'string' || !o.label.trim() || o.label.length > 80) return `Each answer of "${q.label}" needs a label up to 80 characters.`;
    }
  }
  return null;
}

/**
 * Low under 3 points, Medium 3 to 5, High 6 or more; with the starter questions, "touches payroll" together with "cannot
 * be undone" is High whatever the rest. Null while a question is unanswered or an answer is not one of its choices.
 */
export function riskOf(qs: RiskQuestion[], answers: Record<string, string>): Risk | null {
  if (qs.some((q) => !q.options.some((o) => o.value === answers?.[q.id]))) return null;
  const sum = qs.reduce((t, q) => t + Number(answers[q.id]), 0);
  if (sum >= 6 || (answers.money === '2' && answers.undo === '2')) return 'high';
  return sum >= 3 ? 'medium' : 'low';
}
export const RISK_ORDER: Risk[] = ['low', 'medium', 'high'];

export interface CompanyWindow {
  weekdayFrom: string;
  weekdayTo: string;
  weekends: boolean;
  freezeFirstDays: number;
  freezeLastDays: number;
  freezeDates: number[];
}
export const DEFAULT_WINDOW: CompanyWindow = { weekdayFrom: '20:00', weekdayTo: '06:00', weekends: true, freezeFirstDays: 7, freezeLastDays: 3, freezeDates: [7, 15, 20] };

/** "7, 15,20" as dates of the month (1 to 31); anything else is dropped. */
export const parseFreezeDates = (v: string): number[] => [...new Set(v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31))].sort((a, b) => a - b);

const IST = 330 * 60_000;
const ist = (d: Date) => new Date(d.getTime() + IST);
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** The India date of an instant, "2026-11-13". */
export const istDate = (d: Date) => ist(d).toISOString().slice(0, 10);

/** Whether one India day is frozen, and why in plain words (null: not frozen). */
export function freezeReasonOn(date: string, w: CompanyWindow): string | null {
  const [y, m, day] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (day <= w.freezeFirstDays) return `the first ${w.freezeFirstDays} days of the month`;
  if (day > last - w.freezeLastDays) return `the last ${w.freezeLastDays} days of the month`;
  if (w.freezeDates.includes(day)) return `the ${day}th, a freeze date`;
  return null;
}

/** The frozen India days a window touches, with why each is frozen. */
export function frozenDaysIn(from: Date, to: Date, w: CompanyWindow): { date: string; why: string }[] {
  const out: { date: string; why: string }[] = [];
  const last = istDate(new Date(to.getTime() - 1));
  for (let d = istDate(from); d <= last; d = nextDate(d)) {
    const why = freezeReasonOn(d, w);
    if (why) out.push({ date: d, why });
  }
  return out;
}
const nextDate = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The freeze days from `from` (an India date) for `days` days, for the changes calendar. */
export function freezeCalendar(from: string, days: number, w: CompanyWindow): { date: string; why: string }[] {
  const out: { date: string; why: string }[] = [];
  for (let d = from, i = 0; i < days; i++, d = nextDate(d)) {
    const why = freezeReasonOn(d, w);
    if (why) out.push({ date: d, why });
  }
  return out;
}

/** Whether one instant is inside the change window: weekends (when on), else between from and to (overnight when from > to). */
function inWindow(at: Date, w: CompanyWindow): boolean {
  const x = ist(at);
  const dow = x.getUTCDay();
  if (w.weekends && (dow === 0 || dow === 6)) return true;
  const t = x.getUTCHours() * 60 + x.getUTCMinutes();
  const a = minutesOf(w.weekdayFrom);
  const b = minutesOf(w.weekdayTo);
  return a === b ? true : a < b ? t >= a && t < b : t >= a || t < b;
}

/** Why a planned window is outside the change window (null: it fits). Checked minute by minute; a window is at most 3 days. */
export function outsideWindow(from: Date, to: Date, w: CompanyWindow): string | null {
  if (to.getTime() <= from.getTime()) return 'The window must end after it starts.';
  if (to.getTime() - from.getTime() > 72 * 3_600_000) return 'A change window can be at most 72 hours.';
  for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
    if (!inWindow(new Date(t), w)) {
      const when = ist(new Date(t)).toISOString().slice(0, 16).replace('T', ' ');
      return `It runs outside the change window at ${when} (weekdays ${w.weekdayFrom} to ${w.weekdayTo}${w.weekends ? ', and weekends' : ''}).`;
    }
  }
  return null;
}
