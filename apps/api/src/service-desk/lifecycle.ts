import { FieldDef, Group, RecordValues, RuleError, evaluate, parseGroup } from '../rules-engine/conditions';

// SD-2.11 (US-G-062): a ticket type's lifecycle. Data, checked here (pure, no database): which of the desk's statuses
// it uses, where a ticket starts, and the allowed moves, each with the fields it needs filled, who may make it (an
// agent, or a lead only) and an optional P19 condition over the ticket. A published version never changes; a ticket
// keeps the version it started with. Moves the desk makes by itself (auto-close, a requester's reply reopening a
// ticket, a settled request) are not checked against it: they are the desk's own rules (YX-SD-10).

export const REQUIRABLE = ['category', 'group', 'assignee', 'resolution_code', 'resolution_note', 'impact', 'urgency'] as const;
export type Requirable = (typeof REQUIRABLE)[number];
export const REQUIRABLE_LABEL: Record<Requirable, string> = {
  category: 'Category',
  group: 'Team',
  assignee: 'Owner',
  resolution_code: 'Resolution code',
  resolution_note: 'Resolution note',
  impact: 'Impact',
  urgency: 'Urgency',
};

export interface Transition {
  from: string;
  to: string;
  require: Requirable[];
  who: 'agent' | 'lead';
  when?: Group;
}
export interface LifecycleDef {
  startStatusId: string;
  statusIds: string[];
  transitions: Transition[];
}
export interface StatusInfo {
  id: string;
  label: string;
  systemState: string;
}

/** What a move's condition may read: the ticket's own fields (ids of the desk's set-up, numbers, yes / no). */
export const LIFECYCLE_FIELDS: FieldDef[] = [
  { key: 'category', label: 'Category', type: 'choice' },
  { key: 'group', label: 'Team', type: 'choice' },
  { key: 'priority', label: 'Priority (1 highest)', type: 'number' },
  { key: 'tier', label: 'Tier', type: 'choice', options: ['L1', 'L2', 'L3'].map((v) => ({ value: v, label: v })) },
  { key: 'assigned', label: 'Has an owner', type: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  { key: 'vip', label: 'Requester is a VIP', type: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
  { key: 'tags', label: 'Tags', type: 'text' },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const MAX = { statuses: 30, transitions: 200 };

/** Checks a lifecycle from outside against the type's statuses. Throws RuleError with a plain message. */
export function parseLifecycle(input: unknown, statuses: readonly StatusInfo[]): LifecycleDef {
  if (!isObj(input)) throw new RuleError('The lifecycle is not in the expected shape.');
  for (const k of Object.keys(input)) if (!['startStatusId', 'statusIds', 'transitions'].includes(k)) throw new RuleError(`The lifecycle has an unknown part "${k.slice(0, 20)}".`);
  const known = new Map(statuses.map((s) => [s.id, s]));
  const name = (id: string) => known.get(id)?.label ?? 'a status';
  if (!Array.isArray(input.statusIds) || input.statusIds.length < 2 || input.statusIds.length > MAX.statuses) throw new RuleError(`Use 2 to ${MAX.statuses} statuses.`);
  const statusIds = input.statusIds.map((x) => {
    if (typeof x !== 'string' || !UUID.test(x) || !known.has(x)) throw new RuleError('Choose statuses of this desk and ticket type.');
    return x;
  });
  if (new Set(statusIds).size !== statusIds.length) throw new RuleError('Each status appears once.');
  const start = typeof input.startStatusId === 'string' ? input.startStatusId : '';
  if (!statusIds.includes(start)) throw new RuleError('Choose where a new ticket starts.');
  if (known.get(start)!.systemState !== 'new') throw new RuleError(`A ticket starts in a "new" status; "${name(start)}" is not one.`);
  if (!Array.isArray(input.transitions) || input.transitions.length > MAX.transitions) throw new RuleError(`Use up to ${MAX.transitions} moves.`);
  const seen = new Set<string>();
  const transitions = input.transitions.map((t, i): Transition => {
    if (!isObj(t)) throw new RuleError(`Move ${i + 1} is not in the expected shape.`);
    for (const k of Object.keys(t)) if (!['from', 'to', 'require', 'who', 'when'].includes(k)) throw new RuleError(`Move ${i + 1} has an unknown part "${k.slice(0, 20)}".`);
    const from = String(t.from ?? '');
    const to = String(t.to ?? '');
    if (!statusIds.includes(from) || !statusIds.includes(to)) throw new RuleError(`Move ${i + 1}: choose statuses of this lifecycle.`);
    if (from === to) throw new RuleError(`Move ${i + 1}: a move goes to another status.`);
    const key = `${from}>${to}`;
    if (seen.has(key)) throw new RuleError(`The move from "${name(from)}" to "${name(to)}" appears twice.`);
    seen.add(key);
    const require = t.require === undefined ? [] : t.require;
    if (!Array.isArray(require) || require.some((f) => !REQUIRABLE.includes(f as Requirable))) throw new RuleError(`"${name(from)}" to "${name(to)}": choose fields from the list.`);
    const who = t.who === undefined ? 'agent' : t.who;
    if (who !== 'agent' && who !== 'lead') throw new RuleError(`"${name(from)}" to "${name(to)}": choose who may make this move.`);
    const out: Transition = { from, to, require: [...new Set(require as Requirable[])], who };
    if (t.when !== undefined && t.when !== null) {
      const g = parseGroup(t.when, LIFECYCLE_FIELDS);
      if (g.items.length) out.when = g;
    }
    return out;
  });
  // Every status can be reached from the start, a ticket can always end, and only closed statuses are dead ends.
  const next = new Map<string, string[]>();
  for (const t of transitions) next.set(t.from, [...(next.get(t.from) ?? []), t.to]);
  const reach = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const n of next.get(queue.shift()!) ?? []) {
      if (reach.has(n)) continue;
      reach.add(n);
      queue.push(n);
    }
  }
  const lost = statusIds.find((s) => !reach.has(s));
  if (lost) throw new RuleError(`"${name(lost)}" cannot be reached from the start. Add a move to it or take it out.`);
  if (!statusIds.some((s) => ['solved', 'closed'].includes(known.get(s)!.systemState))) throw new RuleError('Add a resolved or closed status, so a ticket can end.');
  const stuck = statusIds.find((s) => known.get(s)!.systemState !== 'closed' && !(next.get(s) ?? []).length);
  if (stuck) throw new RuleError(`A ticket in "${name(stuck)}" cannot move on. Add a move from it.`);
  return { startStatusId: start, statusIds, transitions };
}

/** The ticket values a move reads: its fields for the condition, and which requirable fields are filled. */
export interface MoveInput {
  values: RecordValues;
  filled: Record<Requirable, boolean>;
  lead: boolean;
}

/** Why this move is not allowed (plain English), or null when it is. */
export function checkMove(def: Pick<LifecycleDef, 'transitions'>, from: string, to: string, input: MoveInput, label: (id: string) => string): string | null {
  const t = def.transitions.find((x) => x.from === from && x.to === to);
  if (!t) {
    const allowed = def.transitions.filter((x) => x.from === from).map((x) => `"${label(x.to)}"`);
    return `A ticket cannot move from "${label(from)}" to "${label(to)}".${allowed.length ? ` It can go to ${allowed.join(', ')}.` : ''}`;
  }
  if (t.who === 'lead' && !input.lead) return `Only a team lead moves a ticket from "${label(from)}" to "${label(to)}".`;
  const missing = t.require.filter((f) => !input.filled[f]);
  if (missing.length) return `Fill in ${missing.map((f) => REQUIRABLE_LABEL[f]).join(', ')} first.`;
  if (t.when && !evaluate(t.when, input.values, LIFECYCLE_FIELDS).pass) return `This ticket does not meet the condition for moving to "${label(to)}".`;
  return null;
}
