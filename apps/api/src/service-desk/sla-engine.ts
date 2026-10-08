import { CalendarSpec, addBusinessSeconds, businessSecondsBetween } from './business-time';

// SD-1.14 / SD-1.15 SLA engine, the pure part (§8): which policy fits a ticket, a timer's clock (used business seconds,
// due time, next milestone) and the picture of running, paused and breached stretches. The service does the reading,
// writing and job scheduling; everything that decides lives here and is unit tested.

export const SLA_METRICS = ['assign', 'first_response', 'next_response', 'resolution'] as const;
export const OLA_METRICS = ['group', 'task'] as const;
export type Metric = (typeof SLA_METRICS)[number] | (typeof OLA_METRICS)[number];
export const MILESTONE_ACTIONS = ['notify_assignee', 'notify_group_leads', 'notify_desk_leads', 'raise_priority', 'move_to_group'] as const;
export type MilestoneAction = { type: (typeof MILESTONE_ACTIONS)[number]; groupId?: string };
export interface Milestone {
  percent: number;
  actions: MilestoneAction[];
}
export interface Target {
  metric: Metric;
  /** Minutes for P1..P4; null = no target for that priority. */
  minutes: (number | null)[];
  milestones?: Milestone[];
}

/** US-G-014 starter: warn the owner at 75 %, tell the owner and the leads at the breach. */
export const DEFAULT_MILESTONES: Milestone[] = [
  { percent: 75, actions: [{ type: 'notify_assignee' }] },
  { percent: 100, actions: [{ type: 'notify_assignee' }, { type: 'notify_group_leads' }] },
];

// ------------------------------------------------------------------------------------------ scope (US-G-013)

// plan / product / account: a customer's support plan tier, product and account drive SLAs on Customer support desks (US-G-036, US-G-038).
export const SCOPE_FIELDS = ['priority', 'category', 'type', 'kind', 'channel', 'group', 'vip', 'tag', 'plan', 'product', 'account'] as const;
export type ScopeField = (typeof SCOPE_FIELDS)[number];
export interface ScopeRule {
  field: ScopeField;
  op: 'in' | 'not_in';
  values: string[];
}
export interface Scope {
  match: 'all' | 'any';
  rules: ScopeRule[];
}
export interface TicketFacts {
  priority: number;
  categoryId: string | null;
  typeId: string;
  kind: string;
  channel: string;
  groupId: string | null;
  vip: boolean;
  tags: string[];
  planTier?: string | null;
  productId?: string | null;
  customerAccountId?: string | null;
}

function factValues(t: TicketFacts, field: ScopeField): string[] {
  switch (field) {
    case 'priority':
      return [String(t.priority)];
    case 'category':
      return t.categoryId ? [t.categoryId] : [];
    case 'type':
      return [t.typeId];
    case 'kind':
      return [t.kind];
    case 'channel':
      return [t.channel];
    case 'group':
      return t.groupId ? [t.groupId] : [];
    case 'vip':
      return [String(t.vip)];
    case 'tag':
      return t.tags;
    case 'plan':
      return t.planTier ? [t.planTier] : [];
    case 'product':
      return t.productId ? [t.productId] : [];
    case 'account':
      return t.customerAccountId ? [t.customerAccountId] : [];
  }
}

/** AND / OR over ticket fields. No rules = every ticket (P19 expressions replace this when P19 lands). */
export function scopeMatches(scope: Scope | null | undefined, t: TicketFacts): boolean {
  const rules = scope?.rules ?? [];
  if (!rules.length) return true;
  const test = (r: ScopeRule) => {
    const hit = factValues(t, r.field).some((v) => r.values.includes(v));
    return r.op === 'in' ? hit : !hit;
  };
  return scope?.match === 'any' ? rules.some(test) : rules.every(test);
}

export function targetSeconds(target: Target, priority: number): number | null {
  const m = target.minutes[priority - 1];
  return m == null ? null : Math.round(m * 60);
}

// ------------------------------------------------------------------------------------------ the clock (§8.4)

export interface Clock {
  state: 'running' | 'paused' | 'met' | 'cancelled';
  resumedAt: Date | null;
  usedSeconds: number;
  targetSeconds: number;
}

/** Business seconds used so far. */
export function elapsed(cal: CalendarSpec, c: Clock, now: Date): number {
  return c.usedSeconds + (c.state === 'running' && c.resumedAt ? businessSecondsBetween(cal, c.resumedAt, now) : 0);
}

/** When a running clock reaches `percent` of its target (a moment already passed when it is behind). */
export function reachesAt(cal: CalendarSpec, c: Clock, percent: number): Date | null {
  if (c.state !== 'running' || !c.resumedAt) return null;
  const need = Math.ceil((c.targetSeconds * percent) / 100) - c.usedSeconds;
  return need <= 0 ? c.resumedAt : addBusinessSeconds(cal, c.resumedAt, need);
}

/** The percents that fire, in order; 100 (the breach) is always one of them. */
export function milestonePercents(target: Pick<Target, 'milestones'>): number[] {
  const list = (target.milestones?.length ? target.milestones : DEFAULT_MILESTONES).map((m) => m.percent);
  return [...new Set([...list, 100])].filter((p) => p > 0 && p <= 1000).sort((a, b) => a - b);
}

export function actionsAt(target: Pick<Target, 'milestones'>, percent: number): MilestoneAction[] {
  return (target.milestones?.length ? target.milestones : DEFAULT_MILESTONES).find((m) => m.percent === percent)?.actions ?? [];
}

/** The next milestone after those already fired, with when it falls. */
export function nextMilestone(cal: CalendarSpec, c: Clock, target: Pick<Target, 'milestones'>, fired: readonly number[]): { percent: number; at: Date } | null {
  const p = milestonePercents(target).find((x) => !fired.includes(x));
  if (p === undefined) return null;
  const at = reachesAt(cal, c, p);
  return at ? { percent: p, at } : null;
}

/** Milestones due now that have not fired yet (several when a job ran late). */
export function dueMilestones(cal: CalendarSpec, c: Clock, target: Pick<Target, 'milestones'>, fired: readonly number[], now: Date): number[] {
  if (c.state !== 'running') return [];
  const used = elapsed(cal, c, now);
  return milestonePercents(target).filter((p) => !fired.includes(p) && used * 100 >= c.targetSeconds * p);
}

// ------------------------------------------------------------------------------------------ the picture (US-G-016)

export interface TimerEventLite {
  kind: string;
  at: Date;
  reason?: string | null;
}
export interface Segment {
  from: Date;
  to: Date;
  state: 'running' | 'paused' | 'breached';
  reason?: string | null;
}

/** Running, paused and breached stretches from the timer's log, up to `now` (or when it stopped). */
export function segments(events: readonly TimerEventLite[], breachedAt: Date | null, now: Date): Segment[] {
  const out: Segment[] = [];
  let cur: { from: Date; state: 'running' | 'paused'; reason?: string | null } | null = null;
  const close = (to: Date) => {
    if (!cur || to <= cur.from) return;
    if (cur.state === 'running' && breachedAt && breachedAt < to) {
      if (breachedAt > cur.from) out.push({ from: cur.from, to: breachedAt, state: 'running' });
      out.push({ from: breachedAt > cur.from ? breachedAt : cur.from, to, state: 'breached' });
    } else out.push({ from: cur.from, to, state: cur.state, reason: cur.reason });
  };
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.kind === 'start' || e.kind === 'resume' || e.kind === 'restart') {
      close(e.at);
      cur = { from: e.at, state: 'running' };
    } else if (e.kind === 'pause') {
      close(e.at);
      cur = { from: e.at, state: 'paused', reason: e.reason };
    } else if (e.kind === 'met' || e.kind === 'cancel') {
      close(e.at);
      cur = null;
    }
  }
  close(now);
  return out;
}
