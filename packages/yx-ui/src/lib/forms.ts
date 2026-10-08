// P18 forms on the P19 rule language, browser side (display only). The server (apps/api/src/rules-engine) is the
// judge: it re-checks every answer, drops hidden ones and computes formulas again. This copy shows the same thing live
// while the person fills the form. Keep the semantics in step by hand with rules-engine/conditions.ts and forms.ts.
import type { RuleField, RuleGroup, RuleCondition, Scalar as UiScalar } from './rules';

export type FormFieldType = 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url' | 'date' | 'choice' | 'multi_choice' | 'checkbox' | 'person' | 'location' | 'cost_centre' | 'formula' | 'separator';
export type FormLang = 'en' | 'hi' | 'ta' | 'te';
export type OptionColour = 'grey' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

export interface FormOption {
  value: string;
  label: string;
  labels?: Partial<Record<Exclude<FormLang, 'en'>, string>>;
  colour?: OptionColour;
}
export type Operand = { field: string } | { value: number | string } | Formula;
export interface Formula {
  op: 'add' | 'sub' | 'mul' | 'div' | 'round' | 'days_between' | 'concat';
  args: Operand[];
  digits?: number;
}
export interface FormFieldDef {
  key: string;
  type: FormFieldType;
  label: string;
  labels?: Partial<Record<Exclude<FormLang, 'en'>, string>>;
  help?: string;
  required?: boolean;
  sensitive?: boolean;
  min?: number;
  max?: number;
  options?: FormOption[];
  dependsOn?: string;
  optionsBy?: Record<string, string[]>;
  formula?: Formula;
  width?: 'full' | 'half';
}
export interface FormSectionDef {
  id: string;
  title?: string;
  titles?: Partial<Record<Exclude<FormLang, 'en'>, string>>;
  columns: 1 | 2;
  fields: FormFieldDef[];
  questionnaireId?: string;
}
export type ServerScalar = string | number;
export interface ServerCondition {
  id: string;
  field: string;
  operator: 'is' | 'is_not' | 'one_of' | 'gt' | 'lt' | 'between' | 'contains' | 'empty';
  value: ServerScalar | null | ServerScalar[];
}
export interface ServerGroup {
  id: string;
  join: 'and' | 'or';
  items: (ServerCondition | ServerGroup)[];
}
export interface FormEffect {
  action: 'show' | 'hide' | 'require' | 'lock' | 'set' | 'limit';
  field: string;
  value?: string | number;
  options?: string[];
}
export interface FormRuleDef {
  id: string;
  when: ServerGroup;
  then: FormEffect[];
}
export interface FormDef {
  sections: FormSectionDef[];
  rules: FormRuleDef[];
}
export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;
export interface FieldState {
  visible: boolean;
  required: boolean;
  locked: boolean;
  options?: string[];
}

export const EMPTY_FORM: FormDef = { sections: [], rules: [] };
export const COLOUR_TONE: Record<OptionColour, 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'ai'> = { grey: 'neutral', blue: 'info', green: 'success', amber: 'warning', red: 'danger', purple: 'ai' };

/** The label in the reader's language, English when there is no translation (US-G-224). */
export function inLang(x: { label?: string; title?: string; labels?: Partial<Record<string, string>>; titles?: Partial<Record<string, string>> }, lang: FormLang): string {
  const base = x.label ?? x.title ?? '';
  if (lang === 'en') return base;
  return x.labels?.[lang] ?? x.titles?.[lang] ?? base;
}

const isGroup = (x: ServerCondition | ServerGroup): x is ServerGroup => 'items' in x;
const blank = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const norm = (v: ServerScalar) => (typeof v === 'string' ? v.toLocaleLowerCase('en') : v);

/** One condition against one value (same meaning as the server's test()). */
export function testCondition(op: ServerCondition['operator'], expected: ServerCondition['value'], actual: unknown): boolean {
  if (op === 'empty') return blank(actual);
  if (blank(actual)) return op === 'is_not';
  const list = (Array.isArray(actual) ? actual : [actual]) as ServerScalar[];
  switch (op) {
    case 'is':
      return list.some((a) => norm(a) === norm(expected as ServerScalar));
    case 'is_not':
      return !list.some((a) => norm(a) === norm(expected as ServerScalar));
    case 'one_of':
      return list.some((a) => (expected as ServerScalar[]).some((e) => norm(a) === norm(e)));
    case 'contains':
      return list.some((a) => typeof a === 'string' && a.toLocaleLowerCase('en').includes(String(expected).toLocaleLowerCase('en')));
    case 'gt':
      return list.some((a) => typeof a === typeof expected && a > (expected as ServerScalar));
    case 'lt':
      return list.some((a) => typeof a === typeof expected && a < (expected as ServerScalar));
    case 'between': {
      const [lo, hi] = expected as [ServerScalar, ServerScalar];
      return list.some((a) => typeof a === typeof lo && a >= lo && a <= hi);
    }
    default:
      return false;
  }
}

export function evalGroup(g: ServerGroup, rec: Record<string, unknown>): boolean {
  if (!g.items.length) return true;
  const r = g.items.map((it) => (isGroup(it) ? evalGroup(it, rec) : testCondition(it.operator, it.value, Object.prototype.hasOwnProperty.call(rec, it.field) ? rec[it.field] : null)));
  return g.join === 'and' ? r.every(Boolean) : r.some(Boolean);
}

export function computeFormula(f: Formula, values: Answers): number | string | null {
  const get = (a: Operand): unknown => ('op' in a ? computeFormula(a, values) : 'field' in a ? values[a.field] : a.value);
  const parts = f.args.map(get);
  if (f.op === 'concat') return parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('');
  if (f.op === 'days_between') {
    const [a, b] = parts.map((p) => (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p) ? Date.parse(`${p}T00:00:00Z`) : NaN));
    return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86_400_000);
  }
  const n = parts.map((p) => (typeof p === 'number' && Number.isFinite(p) ? p : null));
  if (n.some((x) => x === null)) return null;
  const xs = n as number[];
  let r: number;
  if (f.op === 'add') r = xs.reduce((s, x) => s + x, 0);
  else if (f.op === 'sub') r = xs.slice(1).reduce((s, x) => s - x, xs[0]);
  else if (f.op === 'mul') r = xs.reduce((s, x) => s * x, 1);
  else if (f.op === 'div') {
    if (xs.slice(1).some((x) => x === 0)) return null;
    r = xs.slice(1).reduce((s, x) => s / x, xs[0]);
  } else r = xs[0];
  const p = 10 ** (f.digits ?? (f.op === 'round' ? 0 : 2));
  return Number.isFinite(r) ? Math.round(r * p) / p : null;
}

/** Which fields apply now, with which options (two passes so "set" values can feed rules). */
export function resolveForm(def: FormDef, answers: Answers, requester: Record<string, unknown> = {}): { state: Record<string, FieldState>; values: Answers } {
  const fields = def.sections.flatMap((s) => s.fields);
  const values: Answers = { ...answers };
  let state: Record<string, FieldState> = {};
  const showRuled = new Set(def.rules.flatMap((r) => r.then.filter((e) => e.action === 'show').map((e) => e.field)));
  for (let pass = 0; pass < 2; pass++) {
    const rec: Record<string, unknown> = { ...requester };
    for (const f of fields) if (values[f.key] !== undefined) rec[f.key] = typeof values[f.key] === 'boolean' ? (values[f.key] ? 'yes' : 'no') : values[f.key];
    const hits = def.rules.filter((r) => evalGroup(r.when, rec)).flatMap((r) => r.then);
    state = {};
    for (const f of fields) {
      const mine = hits.filter((e) => e.field === f.key);
      const visible = (!showRuled.has(f.key) || mine.some((e) => e.action === 'show')) && !mine.some((e) => e.action === 'hide');
      let options = f.options?.map((o) => o.value);
      if (f.dependsOn) {
        const parent = values[f.dependsOn];
        options = typeof parent === 'string' ? (f.optionsBy?.[parent] ?? []) : [];
      }
      for (const e of mine) if (e.action === 'limit' && options && e.options) options = options.filter((v) => e.options!.includes(v));
      const locked = mine.some((e) => e.action === 'lock');
      const set = mine.find((e) => e.action === 'set');
      if (set && (locked || blank(values[f.key]))) values[f.key] = set.value ?? null;
      state[f.key] = { visible: visible && f.type !== 'separator', required: visible && (Boolean(f.required) || mine.some((e) => e.action === 'require')), locked, ...(options ? { options } : {}) };
    }
  }
  for (const f of fields) {
    if (f.type === 'formula' && f.formula && state[f.key].visible) values[f.key] = computeFormula(f.formula, values) as AnswerValue;
  }
  return { state, values };
}

/** Answers the server would keep: only fields that apply, no formulas (it computes them), no empty values. */
export function answersToSend(def: FormDef, answers: Answers, requester: Record<string, unknown> = {}): Answers {
  const { state, values } = resolveForm(def, answers, requester);
  const out: Answers = {};
  for (const f of def.sections.flatMap((s) => s.fields)) {
    if (!state[f.key]?.visible || f.type === 'formula' || f.type === 'separator' || blank(values[f.key])) continue;
    out[f.key] = values[f.key];
  }
  return out;
}

/** Problems the person can fix before sending (the server checks again and says the same words). */
export function formProblems(def: FormDef, answers: Answers, requester: Record<string, unknown> = {}): Record<string, string> {
  const { state, values } = resolveForm(def, answers, requester);
  const out: Record<string, string> = {};
  for (const f of def.sections.flatMap((s) => s.fields)) {
    const s = state[f.key];
    if (!s?.visible) continue;
    const v = values[f.key];
    if (s.required && (f.type === 'checkbox' ? v !== true : blank(v))) out[f.key] = f.type === 'checkbox' ? 'Tick this box to go on.' : 'Answer this question.';
    else if (f.type === 'number' && typeof v === 'number' && ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) out[f.key] = `Enter a number from ${f.min ?? '…'} to ${f.max ?? '…'}.`;
    else if (f.type === 'email' && typeof v === 'string' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) out[f.key] = 'Enter an email address like name@company.com.';
    else if (f.type === 'url' && typeof v === 'string' && v && !/^https?:\/\//i.test(v)) out[f.key] = 'Enter a web address starting with https://.';
  }
  return out;
}

// ------------------------------------------------------------------ ConditionBuilder ↔ stored rules

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toScalar = (v: UiScalar): ServerScalar | null => (v instanceof Date ? isoDay(v) : v === '' ? null : v);

/** The builder's rows as the stored rule (dates as YYYY-MM-DD in the person's own calendar). */
export function toServerGroup(g: RuleGroup): ServerGroup {
  return {
    id: g.id,
    join: g.join,
    items: g.items.map((it) => {
      if ('items' in it) return toServerGroup(it);
      const c = it as RuleCondition;
      const v = c.value;
      return { id: c.id, field: c.field ?? '', operator: (c.operator ?? 'is') as ServerCondition['operator'], value: Array.isArray(v) ? (v as UiScalar[]).map((x) => toScalar(x) as ServerScalar) : v === null ? null : toScalar(v as UiScalar) };
    }),
  };
}

/** A stored rule back into the builder (dates become Date objects for the date picker). */
export function fromServerGroup(g: ServerGroup | null | undefined, fields: RuleField[]): RuleGroup {
  if (!g) return { id: 'g0', join: 'and', items: [] };
  const date = (k: string) => fields.find((f) => f.key === k)?.type === 'date';
  const back = (k: string, v: ServerScalar | null): UiScalar => (v !== null && date(k) && typeof v === 'string' ? new Date(`${v}T00:00:00`) : v);
  return {
    id: g.id,
    join: g.join,
    items: g.items.map((it) =>
      'items' in it
        ? fromServerGroup(it, fields)
        : ({ id: it.id, field: it.field, operator: it.operator, value: Array.isArray(it.value) ? (it.value.map((x) => back(it.field, x)) as string[]) : back(it.field, it.value) } as RuleCondition),
    ),
  };
}
