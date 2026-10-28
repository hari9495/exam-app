// TIM-41 hybrid office days (design-map rule 12): pure rules, no database. The policy is three settings per person
// (hybrid.office_days, hybrid.anchor_days, hybrid.evidence); the plan is one row per planned day.

export type Place = 'office' | 'home';
export type Evidence = 'geofence' | 'network' | 'kiosk';
export const ANCHOR_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export interface HybridRule {
  /** Office days a week; 0: no hybrid rule for this person. */
  officeDays: number;
  /** Weekday numbers 0 (Mon) to 4 (Fri) everyone is in the office. */
  anchors: number[];
  evidence: Evidence[];
}

/** The three setting values as a rule (multi values are comma lists; unknown parts are ignored). */
export function ruleOf(officeDays: string, anchors: string, evidence: string): HybridRule {
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    officeDays: Math.max(0, Math.min(5, Number(officeDays) || 0)),
    anchors: list(anchors).map((a) => ANCHOR_KEYS.indexOf(a as (typeof ANCHOR_KEYS)[number])).filter((i) => i >= 0).sort((a, b) => a - b),
    evidence: list(evidence).filter((e): e is Evidence => e === 'geofence' || e === 'network' || e === 'kiosk'),
  };
}

export type Closed = 'past' | 'started' | 'weekly_off' | 'holiday' | 'leave' | 'not_employed';

export interface DayFacts {
  on: string;
  employed: boolean;
  weeklyOff: boolean;
  /** A full-day holiday's name (a half-day holiday is still a working day). */
  holiday: string | null;
  /** Approved leave that day. */
  leave: 'full' | 'first' | 'second' | null;
}

/** Whether the person may still choose office or home for a day: not before today; editable until the day starts. */
export function closedWhy(d: DayFacts, today: string): Closed | null {
  if (!d.employed) return 'not_employed';
  if (d.weeklyOff) return 'weekly_off';
  if (d.holiday) return 'holiday';
  if (d.leave === 'full') return 'leave';
  if (d.on < today) return 'past';
  // The day starts at midnight in the location's zone: from then on the plan for it stays as it was.
  if (d.on === today) return 'started';
  return null;
}

/** A working day for the target: employed, not a weekly off, not a holiday. */
export const isWorkday = (d: DayFacts) => d.employed && !d.weeklyOff && !d.holiday;

export const CLOSED_TEXT: Record<Closed, string> = {
  past: 'This day is over.',
  started: 'This day has started, so its plan stays as it is.',
  weekly_off: 'This is a weekly off.',
  holiday: 'This is a holiday.',
  leave: 'You are on leave this day.',
  not_employed: 'Not employed on this day.',
};

/** Whether an accepted punch is office evidence under the policy: inside a geofence, on the office network, or a kiosk. */
export function isEvidence(p: { source: string; verdict: string }, kinds: readonly Evidence[]): boolean {
  if (p.source === 'kiosk') return kinds.includes('kiosk');
  if (p.verdict === 'inside') return kinds.includes('geofence');
  if (p.verdict === 'network') return kinds.includes('network');
  return false;
}

export interface ComplianceDay extends DayFacts {
  place: Place | null;
  anchor: boolean;
  evidence: boolean;
}

export interface WeekCompliance {
  noRule: boolean;
  /** The office days asked for this week: the rule, but never more than the week's working days. */
  target: number;
  /** Working days planned in the office (anchor days always). */
  planned: number;
  /** Working days with office evidence. */
  office: number;
  /** Working days on full-day leave without office evidence; they count toward the target. */
  leave: number;
  /** office + leave. */
  counted: number;
  met: boolean;
  short: number;
  /** Days planned in the office, already over, with no evidence and no leave. */
  missed: string[];
}

export function weekCompliance(rule: HybridRule, days: readonly ComplianceDay[], today: string): WeekCompliance {
  const work = days.filter(isWorkday);
  const target = Math.min(rule.officeDays, work.length);
  const planned = work.filter((d) => d.anchor || d.place === 'office').length;
  const office = work.filter((d) => d.evidence).length;
  const leave = work.filter((d) => !d.evidence && d.leave === 'full').length;
  const counted = office + leave;
  const missed = work.filter((d) => d.on < today && (d.anchor || d.place === 'office') && !d.evidence && d.leave !== 'full').map((d) => d.on);
  return { noRule: rule.officeDays === 0, target, planned, office, leave, counted, met: rule.officeDays > 0 && counted >= target, short: Math.max(0, target - counted), missed };
}
