// P19 rule model: "When / If / Then". Pure helpers only (operators by type, summary, validation).
import { formatDate, formatINR } from './format';

export type RuleFieldType = 'text' | 'number' | 'money' | 'date' | 'choice';

export interface RuleOption {
  value: string;
  label: string;
}

export interface RuleField {
  /** Fixed API name; labels can change without breaking rules (P19). */
  key: string;
  label: string;
  type: RuleFieldType;
  /** For choice fields. */
  options?: RuleOption[];
}

export interface RuleTrigger extends RuleOption {
  /** How the trigger reads inside a sentence: "a leave request is submitted". Defaults to the label in lower case. */
  phrase?: string;
}

export interface RuleSchema {
  triggers: RuleTrigger[];
  fields: RuleField[];
  /** People and roles for Notify and Require approval. */
  recipients: RuleOption[];
}

export type RuleOperator = 'is' | 'is_not' | 'one_of' | 'gt' | 'lt' | 'between' | 'contains' | 'empty';

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  is: 'is',
  is_not: 'is not',
  one_of: 'is one of',
  gt: 'is greater than',
  lt: 'is less than',
  between: 'is between',
  contains: 'contains',
  empty: 'is empty',
};

const OPERATORS: Record<RuleFieldType, RuleOperator[]> = {
  text: ['is', 'is_not', 'contains', 'empty'],
  number: ['is', 'is_not', 'gt', 'lt', 'between', 'empty'],
  money: ['is', 'is_not', 'gt', 'lt', 'between', 'empty'],
  date: ['is', 'is_not', 'gt', 'lt', 'between', 'empty'],
  choice: ['is', 'is_not', 'one_of', 'empty'],
};

/** Operators offered for a field type (P19 "operators by type"). */
export function operatorsFor(type: RuleFieldType): RuleOperator[] {
  return OPERATORS[type];
}

/** Dates read better as "is after" / "is before". */
export function operatorLabel(op: RuleOperator, type?: RuleFieldType): string {
  if (type === 'date' && op === 'gt') return 'is after';
  if (type === 'date' && op === 'lt') return 'is before';
  return OPERATOR_LABELS[op];
}

export type Scalar = string | number | Date | null;
export type ConditionValue = Scalar | string[] | [Scalar, Scalar];

export interface RuleCondition {
  id: string;
  field: string | null;
  operator: RuleOperator | null;
  value: ConditionValue;
}

export interface RuleGroup {
  id: string;
  join: 'and' | 'or';
  /** Top-level groups may hold one level of nested groups; nested groups hold conditions only. */
  items: Array<RuleCondition | RuleGroup>;
}

export type RuleActionType = 'notify' | 'approval' | 'set_field' | 'block';

export const ACTION_LABELS: Record<RuleActionType, string> = {
  notify: 'Notify person',
  approval: 'Require approval from',
  set_field: 'Set field',
  block: 'Block with message',
};

export interface RuleAction {
  id: string;
  type: RuleActionType | null;
  /** Recipient for notify / approval. */
  target?: string | null;
  /** Field key for set_field. */
  field?: string | null;
  /** Value for set_field, message for block. */
  text?: string;
}

export interface Rule {
  trigger: string | null;
  conditions: RuleGroup;
  actions: RuleAction[];
}

export const isGroup = (x: RuleCondition | RuleGroup): x is RuleGroup => 'items' in x;

let seq = 0;
/** Ids for new rows. A counter, not random, so output is deterministic. */
export const ruleId = (prefix: string) => `${prefix}${++seq}`;

export const emptyCondition = (): RuleCondition => ({ id: ruleId('c'), field: null, operator: null, value: null });
export const emptyGroup = (): RuleGroup => ({ id: ruleId('g'), join: 'and', items: [emptyCondition()] });
export const emptyAction = (): RuleAction => ({ id: ruleId('a'), type: null, target: null, field: null, text: '' });

/* ------------------------------------------------------------------ summary */

const blank = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function scalarText(v: Scalar, field: RuleField): string {
  if (v == null || v === '') return '';
  if (v instanceof Date) return formatDate(v);
  if (field.type === 'money' && typeof v === 'number') return formatINR(v);
  if (field.type === 'choice') return field.options?.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

function conditionComplete(c: RuleCondition, field: RuleField | undefined): boolean {
  if (!field || !c.operator) return false;
  if (c.operator === 'empty') return true;
  if (c.operator === 'between') return Array.isArray(c.value) && c.value.length === 2 && !blank(c.value[0]) && !blank(c.value[1]);
  return !blank(c.value);
}

function conditionText(c: RuleCondition, fields: RuleField[]): string | null {
  const field = fields.find((f) => f.key === c.field);
  if (!field || !conditionComplete(c, field)) return null;
  const op = c.operator as RuleOperator;
  const head = `${field.label} ${operatorLabel(op, field.type)}`;
  if (op === 'empty') return head;
  if (op === 'between') {
    const [a, b] = c.value as [Scalar, Scalar];
    return `${head} ${scalarText(a, field)} and ${scalarText(b, field)}`;
  }
  if (op === 'one_of') {
    const labels = (c.value as string[]).map((v) => scalarText(v, field));
    return `${head} ${labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}` : labels[0]}`;
  }
  return `${head} ${scalarText(c.value as Scalar, field)}`;
}

/** "Leave type is Casual leave and Days is greater than 3"; nested groups in brackets. Incomplete rows are left out. */
export function summariseConditions(group: RuleGroup, fields: RuleField[], nested = false): string {
  const parts = group.items
    .map((it) => (isGroup(it) ? summariseConditions(it, fields, true) : conditionText(it, fields)))
    .filter((p): p is string => Boolean(p));
  const joined = parts.join(group.join === 'and' ? ' and ' : ' or ');
  return nested && parts.length > 1 ? `(${joined})` : joined;
}

function actionText(a: RuleAction, schema: RuleSchema): string | null {
  const who = schema.recipients.find((r) => r.value === a.target)?.label;
  switch (a.type) {
    case 'notify':
      return who ? `notify ${who}` : null;
    case 'approval':
      return who ? `require approval from ${who}` : null;
    case 'set_field': {
      const f = schema.fields.find((x) => x.key === a.field);
      return f && a.text ? `set ${f.label} to ${a.text}` : null;
    }
    case 'block':
      return a.text ? `block it with the message "${a.text}"` : null;
    default:
      return null;
  }
}

const listJoin = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Plain-English summary (P19 §7):
 * "When a leave request is submitted, if Leave type is Casual leave and Days is greater than 3, then require approval from HR Business Partner."
 */
export function summariseRule(rule: Rule, schema: RuleSchema): string {
  const trig = schema.triggers.find((t) => t.value === rule.trigger);
  const when = trig ? `When ${trig.phrase ?? lowerFirst(trig.label)}` : 'When (choose a trigger)';
  const cond = summariseConditions(rule.conditions, schema.fields);
  const acts = rule.actions.map((a) => actionText(a, schema)).filter((x): x is string => Boolean(x));
  const then = acts.length ? listJoin(acts) : 'do nothing yet';
  return `${when}${cond ? `, if ${cond}` : ''}, then ${then}.`;
}

/* ------------------------------------------------------------------ validation */

/**
 * Errors keyed by `trigger`, `actions`, `<rowId>.<part>` (part = field | operator | value | target | text | type)
 * or `<groupId>` for an empty group. Messages say what to do (§34).
 */
export type RuleErrors = Record<string, string>;

function validateGroup(g: RuleGroup, fields: RuleField[], out: RuleErrors, top: boolean) {
  if (!top && g.items.length === 0) out[g.id] = 'Add a condition to this group or remove the group';
  for (const it of g.items) {
    if (isGroup(it)) {
      validateGroup(it, fields, out, false);
      continue;
    }
    const field = fields.find((f) => f.key === it.field);
    if (!field) out[`${it.id}.field`] = 'Choose a field';
    else if (!it.operator) out[`${it.id}.operator`] = 'Choose how to compare';
    else if (it.operator === 'between') {
      const [a, b] = Array.isArray(it.value) && it.value.length === 2 ? (it.value as [Scalar, Scalar]) : [null, null];
      if (blank(a) || blank(b)) out[`${it.id}.value`] = 'Enter both values';
      else if (Number(a instanceof Date ? a.getTime() : a) >= Number(b instanceof Date ? b.getTime() : b))
        out[`${it.id}.value`] = 'Enter a first value smaller than the second';
    } else if (it.operator !== 'empty' && blank(it.value))
      out[`${it.id}.value`] = field.type === 'choice' ? 'Choose a value' : field.type === 'date' ? 'Choose a date' : 'Enter a value';
  }
}

export function validateConditions(group: RuleGroup, fields: RuleField[]): RuleErrors {
  const out: RuleErrors = {};
  validateGroup(group, fields, out, true);
  return out;
}

export function validateRule(rule: Rule, schema: RuleSchema): RuleErrors {
  const out: RuleErrors = {};
  if (!schema.triggers.some((t) => t.value === rule.trigger)) out.trigger = 'Choose when this rule runs';
  Object.assign(out, validateConditions(rule.conditions, schema.fields));
  if (rule.actions.length === 0) out.actions = 'Add at least one action';
  for (const a of rule.actions) {
    if (!a.type) out[`${a.id}.type`] = 'Choose an action';
    else if (a.type === 'notify' && !a.target) out[`${a.id}.target`] = 'Choose who to notify';
    else if (a.type === 'approval' && !a.target) out[`${a.id}.target`] = 'Choose who approves';
    else if (a.type === 'set_field' && !a.field) out[`${a.id}.field`] = 'Choose a field to set';
    else if (a.type === 'set_field' && !a.text?.trim()) out[`${a.id}.text`] = 'Enter the new value';
    else if (a.type === 'block' && !a.text?.trim()) out[`${a.id}.text`] = 'Enter the message people will see';
  }
  return out;
}

/** Number of complete conditions, used by builders to warn about empty branches. */
export function countConditions(group: RuleGroup, fields: RuleField[]): number {
  return group.items.reduce(
    (n, it) => n + (isGroup(it) ? countConditions(it, fields) : conditionComplete(it, fields.find((f) => f.key === it.field)) ? 1 : 0),
    0,
  );
}
