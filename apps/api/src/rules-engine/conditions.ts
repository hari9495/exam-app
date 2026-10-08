// P19 rule language, core (shared platform engine, not desk-only). A condition is DATA, never code: a typed tree of
// "field, operator, value" rows in AND / OR groups (the same shape as the yx-ui ConditionBuilder), checked against an
// allow-listed field schema when it is saved and read by this small interpreter. There is no eval, no Function, no
// template strings, no property paths: a field key is looked up as an own key of a plain object the module builds.
// Every module that wants "if … then …" rules (desk, later leave, attendance, expenses, approvals) registers its
// fields and uses parseGroup / evaluate.

export type FieldType = 'text' | 'number' | 'money' | 'date' | 'choice';
export type Operator = 'is' | 'is_not' | 'one_of' | 'gt' | 'lt' | 'between' | 'contains' | 'empty';
export type Scalar = string | number;
export type Value = Scalar | null | Scalar[];

export interface FieldDef {
  /** Fixed API name (labels can change without breaking rules, P19). */
  key: string;
  label: string;
  type: FieldType;
  /** Choice fields: the allowed values. Omitted for live-data choices (ids), which take any id-like value. */
  options?: { value: string; label: string }[];
}

export interface Condition {
  id: string;
  field: string;
  operator: Operator;
  value: Value;
}
export interface Group {
  id: string;
  join: 'and' | 'or';
  items: (Condition | Group)[];
}

/** One row of the trace (US-G-051): which condition passed or failed, and the value it saw. */
export interface TraceRow {
  id: string;
  field: string;
  label: string;
  operator: Operator;
  expected: Value;
  actual: Value;
  pass: boolean;
}

/** A record as the module hands it over: own keys only, scalar or list values. */
export type RecordValues = Readonly<Record<string, Value | undefined>>;

/** A rule the author must fix; the message is plain English for the builder. */
export class RuleError extends Error {}

export const OPERATORS: Record<FieldType, Operator[]> = {
  text: ['is', 'is_not', 'contains', 'empty'],
  number: ['is', 'is_not', 'gt', 'lt', 'between', 'empty'],
  money: ['is', 'is_not', 'gt', 'lt', 'between', 'empty'],
  date: ['is', 'is_not', 'gt', 'lt', 'between', 'empty'],
  choice: ['is', 'is_not', 'one_of', 'empty'],
};

export const LIMITS = { conditions: 40, nestedGroups: 10, text: 200, list: 50 } as const;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
export const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}(\.[a-z][a-z0-9_]{0,39}){0,3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

function onlyKeys(x: Record<string, unknown>, allowed: string[], what: string) {
  for (const k of Object.keys(x)) if (!allowed.includes(k)) throw new RuleError(`${what} has an unknown part "${k.slice(0, 20)}".`);
}

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function scalarFor(f: FieldDef, v: unknown): Scalar {
  if (f.type === 'number' || f.type === 'money') {
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e12) throw new RuleError(`Enter a number for "${f.label}".`);
    return v;
  }
  if (typeof v !== 'string') throw new RuleError(`Enter a value for "${f.label}".`);
  const s = v.trim();
  if (!s || s.length > LIMITS.text) throw new RuleError(`Enter a value for "${f.label}" (up to ${LIMITS.text} characters).`);
  if (f.type === 'date' && !validDate(s)) throw new RuleError(`Choose a date for "${f.label}".`);
  if (f.type === 'choice') {
    if (f.options ? !f.options.some((o) => o.value === s) : !/^[A-Za-z0-9_.:-]{1,80}$/.test(s)) throw new RuleError(`Choose one of the values of "${f.label}".`);
  }
  return s;
}

function parseCondition(x: Record<string, unknown>, fields: ReadonlyMap<string, FieldDef>): Condition {
  onlyKeys(x, ['id', 'field', 'operator', 'value'], 'A condition');
  if (typeof x.id !== 'string' || !ID.test(x.id)) throw new RuleError('A condition has a bad id.');
  const f = typeof x.field === 'string' && FIELD_KEY.test(x.field) ? fields.get(x.field) : undefined;
  if (!f) throw new RuleError('Choose a field for every condition.');
  const op = x.operator as Operator;
  if (typeof op !== 'string' || !OPERATORS[f.type].includes(op)) throw new RuleError(`Choose how to compare "${f.label}".`);
  let value: Value;
  if (op === 'empty') value = null;
  else if (op === 'one_of') {
    if (!Array.isArray(x.value) || !x.value.length || x.value.length > LIMITS.list) throw new RuleError(`Choose up to ${LIMITS.list} values for "${f.label}".`);
    value = [...new Set(x.value.map((v) => scalarFor(f, v)))];
  } else if (op === 'between') {
    if (!Array.isArray(x.value) || x.value.length !== 2) throw new RuleError(`Enter both values for "${f.label}".`);
    const [a, b] = [scalarFor(f, x.value[0]), scalarFor(f, x.value[1])];
    if (a >= b) throw new RuleError(`For "${f.label}", enter a first value smaller than the second.`);
    value = [a, b];
  } else value = scalarFor(f, x.value);
  return { id: x.id, field: f.key, operator: op, value };
}

/**
 * Checks and normalises a condition tree from outside (an API body, a stored version). Throws RuleError with a plain
 * message. Shape: one top group that may hold conditions and nested groups; nested groups hold conditions only.
 */
export function parseGroup(input: unknown, fieldList: readonly FieldDef[]): Group {
  const fields = new Map(fieldList.map((f) => [f.key, f]));
  let count = 0;
  let groups = 0;
  const walk = (x: unknown, top: boolean): Group => {
    if (!isObj(x)) throw new RuleError('The conditions are not in the expected shape.');
    onlyKeys(x, ['id', 'join', 'items'], 'A group');
    if (typeof x.id !== 'string' || !ID.test(x.id)) throw new RuleError('A group has a bad id.');
    if (x.join !== 'and' && x.join !== 'or') throw new RuleError('Choose "all" or "any" for every group.');
    if (!Array.isArray(x.items)) throw new RuleError('The conditions are not in the expected shape.');
    if (!top && !x.items.length) throw new RuleError('Add a condition to each group or remove the group.');
    const items = x.items.map((it): Condition | Group => {
      if (isObj(it) && own(it, 'items')) {
        if (!top) throw new RuleError('Groups can be one level deep.');
        if (++groups > LIMITS.nestedGroups) throw new RuleError(`Use up to ${LIMITS.nestedGroups} groups.`);
        return walk(it, false);
      }
      if (!isObj(it)) throw new RuleError('The conditions are not in the expected shape.');
      if (++count > LIMITS.conditions) throw new RuleError(`Use up to ${LIMITS.conditions} conditions.`);
      return parseCondition(it, fields);
    });
    return { id: x.id, join: x.join, items };
  };
  return walk(input, true);
}

/** Field keys a stored tree uses (P19 YX-RULE-02: a field in use cannot be removed). */
export function fieldsUsed(g: Group): string[] {
  return [...new Set(g.items.flatMap((it) => ('items' in it ? fieldsUsed(it) : [it.field])))];
}

const blank = (v: Value | undefined) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const norm = (v: Scalar) => (typeof v === 'string' ? v.toLocaleLowerCase('en') : v);
const same = (a: Scalar, b: Scalar) => norm(a) === norm(b);

/** One condition against one value. Lists (tags, multi-choice answers) match when any item matches. */
export function test(op: Operator, expected: Value, actual: Value | undefined): boolean {
  if (op === 'empty') return blank(actual);
  if (blank(actual)) return op === 'is_not';
  const list = (Array.isArray(actual) ? actual : [actual]) as Scalar[];
  switch (op) {
    case 'is':
      return list.some((a) => same(a, expected as Scalar));
    case 'is_not':
      return !list.some((a) => same(a, expected as Scalar));
    case 'one_of':
      return list.some((a) => (expected as Scalar[]).some((e) => same(a, e)));
    case 'contains':
      return list.some((a) => typeof a === 'string' && a.toLocaleLowerCase('en').includes(String(expected).toLocaleLowerCase('en')));
    case 'gt':
      return list.some((a) => typeof a === typeof expected && a > (expected as Scalar));
    case 'lt':
      return list.some((a) => typeof a === typeof expected && a < (expected as Scalar));
    case 'between': {
      const [lo, hi] = expected as [Scalar, Scalar];
      return list.some((a) => typeof a === typeof lo && a >= lo && a <= hi);
    }
    default:
      return false;
  }
}

const shown = (v: Value | undefined): Value => (v === undefined ? null : Array.isArray(v) ? v.slice(0, 10).map((x) => (typeof x === 'string' ? x.slice(0, 80) : x)) : typeof v === 'string' ? v.slice(0, 80) : v);

/**
 * Evaluates a parsed tree. An empty top group passes (the rule applies every time). With hideActual the trace leaves
 * out the values it saw (sensitive and private records keep their words out of the trace).
 */
export function evaluate(g: Group, record: RecordValues, fieldList: readonly FieldDef[], o: { hideActual?: boolean } = {}): { pass: boolean; trace: TraceRow[] } {
  const labels = new Map(fieldList.map((f) => [f.key, f.label]));
  const trace: TraceRow[] = [];
  const walk = (grp: Group): boolean => {
    if (!grp.items.length) return true;
    // Every row is checked (no short cut), so the trace shows each one (US-G-051).
    const results = grp.items.map((it) => {
      if ('items' in it) return walk(it);
      const actual = own(record, it.field) ? record[it.field] : null;
      const pass = test(it.operator, it.value, actual);
      trace.push({ id: it.id, field: it.field, label: labels.get(it.field) ?? it.field, operator: it.operator, expected: it.value, actual: o.hideActual ? null : shown(actual), pass });
      return pass;
    });
    return grp.join === 'and' ? results.every(Boolean) : results.some(Boolean);
  };
  return { pass: walk(g), trace };
}

/** An empty top group: the rule applies every time. */
export const ALWAYS: Group = { id: 'all', join: 'and', items: [] };
