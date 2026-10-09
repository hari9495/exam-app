import { isValidPhoneNumber } from 'libphonenumber-js';
import { FIELD_KEY, FieldDef, Group, RecordValues, RuleError, Value, evaluate, parseGroup } from './conditions';

// P18 forms on the P19 rule language (shared platform engine; the Service Desk uses it first for catalogue items,
// order guides and the question library, SD-2.01). A form is data: sections of typed fields, and form rules
// "when <conditions> then show / hide / require / lock / set / limit". The server is the judge: it works out which
// fields apply, drops answers to hidden fields, checks every answer by type and computes formula fields. The browser
// shows the same thing live (yx-ui lib/forms.ts, display only).

export const FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date', 'choice', 'multi_choice', 'checkbox', 'person', 'location', 'cost_centre', 'formula', 'separator'] as const;
export type FormFieldType = (typeof FIELD_TYPES)[number];
/** Live-data pickers (SD-2.02): the value is an id the module checks against its own records. */
export const PICKERS: FormFieldType[] = ['person', 'location', 'cost_centre'];
export const LANGS = ['hi', 'ta', 'te'] as const;
export const COLOURS = ['grey', 'blue', 'green', 'amber', 'red', 'purple'] as const;
type Lang = (typeof LANGS)[number];

export interface FormOption {
  value: string;
  label: string;
  labels?: Partial<Record<Lang, string>>;
  /** Shown with its text label, never colour alone (US-G-224). */
  colour?: (typeof COLOURS)[number];
}

export type Operand = { field: string } | { value: number | string } | Formula;
export interface Formula {
  op: 'add' | 'sub' | 'mul' | 'div' | 'round' | 'days_between' | 'concat';
  args: Operand[];
  digits?: number;
}

export interface FormField {
  key: string;
  type: FormFieldType;
  label: string;
  labels?: Partial<Record<Lang, string>>;
  help?: string;
  required?: boolean;
  /** Not shown to approvers and kept out of the request summary. */
  sensitive?: boolean;
  /** Number range, or text length. */
  min?: number;
  max?: number;
  options?: FormOption[];
  /** Dependent list: the options offered depend on the answer to an earlier choice field. */
  dependsOn?: string;
  optionsBy?: Record<string, string[]>;
  formula?: Formula;
  width?: 'full' | 'half';
}

export interface FormSection {
  id: string;
  title?: string;
  titles?: Partial<Record<Lang, string>>;
  columns: 1 | 2;
  fields: FormField[];
  /** A question-library set, copied in when the item version is published. */
  questionnaireId?: string;
}

export interface FormEffect {
  action: 'show' | 'hide' | 'require' | 'lock' | 'set' | 'limit';
  field: string;
  value?: string | number;
  options?: string[];
}
export interface FormRule {
  id: string;
  when: Group;
  then: FormEffect[];
}
export interface FormDef {
  sections: FormSection[];
  rules: FormRule[];
}

/** What the requester's profile adds to form rules and catalogue audiences (ids from P01). */
export const REQUESTER_FIELDS: FieldDef[] = [
  { key: 'requester.department', label: 'Requester department', type: 'choice' },
  { key: 'requester.location', label: 'Requester location', type: 'choice' },
  { key: 'requester.cost_centre', label: 'Requester cost centre', type: 'choice' },
  { key: 'requester.legal_entity', label: 'Requester company (legal entity)', type: 'choice' },
];

export const EMPTY_FORM: FormDef = { sections: [], rules: [] };
export const FORM_LIMITS = { sections: 12, fields: 60, options: 100, rules: 40, effects: 10 } as const;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const VALUE = /^[A-Za-z0-9 _.,&()/+'-]{1,60}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function text(x: unknown, what: string, max: number, optional = false): string | undefined {
  if (x === undefined || x === null || x === '') {
    if (optional) return undefined;
    throw new RuleError(`${what} is missing.`);
  }
  if (typeof x !== 'string' || !x.trim() || x.length > max) throw new RuleError(`${what} must be text of up to ${max} characters.`);
  return x.trim();
}

function langs(x: unknown, what: string): Partial<Record<Lang, string>> | undefined {
  if (x === undefined) return undefined;
  if (!isObj(x)) throw new RuleError(`${what}: translations are not in the expected shape.`);
  const out: Partial<Record<Lang, string>> = {};
  for (const [k, v] of Object.entries(x)) {
    if (!(LANGS as readonly string[]).includes(k)) throw new RuleError(`${what}: translations are for Hindi (hi), Tamil (ta) and Telugu (te).`);
    const t = text(v, `${what} (${k})`, 120, true);
    if (t) out[k as Lang] = t;
  }
  return out;
}

function onlyKeys(x: Record<string, unknown>, allowed: string[], what: string) {
  for (const k of Object.keys(x)) if (!allowed.includes(k)) throw new RuleError(`${what} has an unknown part "${k.slice(0, 20)}".`);
}

function parseFormula(x: unknown, keys: ReadonlyMap<string, FormField>, depth = 0): Formula {
  if (!isObj(x) || depth > 3) throw new RuleError('A formula is not in the expected shape (up to 3 levels).');
  onlyKeys(x, ['op', 'args', 'digits'], 'A formula');
  const ops: Formula['op'][] = ['add', 'sub', 'mul', 'div', 'round', 'days_between', 'concat'];
  if (!ops.includes(x.op as Formula['op'])) throw new RuleError('Choose what the formula does.');
  if (!Array.isArray(x.args) || !x.args.length || x.args.length > 10) throw new RuleError('A formula takes 1 to 10 parts.');
  const args = x.args.map((a): Operand => {
    if (!isObj(a)) throw new RuleError('A formula part is not in the expected shape.');
    if (own(a, 'op')) return parseFormula(a, keys, depth + 1);
    if (own(a, 'field')) {
      onlyKeys(a, ['field'], 'A formula part');
      const f = typeof a.field === 'string' ? keys.get(a.field) : undefined;
      if (!f || f.type === 'formula' || f.type === 'separator') throw new RuleError('A formula uses a field that is not on this form.');
      return { field: f.key };
    }
    onlyKeys(a, ['value'], 'A formula part');
    if (typeof a.value === 'number' && Number.isFinite(a.value)) return { value: a.value };
    if (typeof a.value === 'string' && a.value.length <= 100) return { value: a.value };
    throw new RuleError('A formula part needs a number or a short text.');
  });
  if (x.op === 'days_between' && args.length !== 2) throw new RuleError('"Days between" takes two dates.');
  if (x.op === 'round' && args.length !== 1) throw new RuleError('"Round" takes one number.');
  const digits = x.digits === undefined ? undefined : Number(x.digits);
  if (digits !== undefined && (!Number.isInteger(digits) || digits < 0 || digits > 4)) throw new RuleError('Round to 0 to 4 decimal places.');
  return { op: x.op as Formula['op'], args, ...(digits !== undefined ? { digits } : {}) };
}

/** The P19 field schema of a form: its answers plus the requester's profile. */
export function formSchema(def: Pick<FormDef, 'sections'>): FieldDef[] {
  const out: FieldDef[] = [];
  for (const f of def.sections.flatMap((s) => s.fields)) {
    if (f.type === 'separator') continue;
    if (f.type === 'number' || (f.type === 'formula' && f.formula?.op !== 'concat')) out.push({ key: f.key, label: f.label, type: 'number' });
    else if (f.type === 'date') out.push({ key: f.key, label: f.label, type: 'date' });
    else if (f.type === 'checkbox') out.push({ key: f.key, label: f.label, type: 'choice', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] });
    else if (f.type === 'choice' || f.type === 'multi_choice') out.push({ key: f.key, label: f.label, type: 'choice', options: f.options?.map((o) => ({ value: o.value, label: o.label })) });
    else if ((PICKERS as string[]).includes(f.type)) out.push({ key: f.key, label: f.label, type: 'choice' });
    else out.push({ key: f.key, label: f.label, type: 'text' });
  }
  return [...out, ...REQUESTER_FIELDS];
}

/** Checks a form definition from outside (an admin's save). Throws RuleError with a plain message. */
export function parseForm(input: unknown, o: { allowQuestionnaires?: boolean } = {}): FormDef {
  if (input === undefined || input === null) return EMPTY_FORM;
  if (!isObj(input)) throw new RuleError('The form is not in the expected shape.');
  onlyKeys(input, ['sections', 'rules'], 'The form');
  const rawSections = input.sections ?? [];
  if (!Array.isArray(rawSections) || rawSections.length > FORM_LIMITS.sections) throw new RuleError(`A form has up to ${FORM_LIMITS.sections} sections.`);
  const keys = new Map<string, FormField>();
  const sections: FormSection[] = rawSections.map((s) => {
    if (!isObj(s)) throw new RuleError('A section is not in the expected shape.');
    onlyKeys(s, ['id', 'title', 'titles', 'columns', 'fields', 'questionnaireId'], 'A section');
    if (typeof s.id !== 'string' || !ID.test(s.id)) throw new RuleError('A section has a bad id.');
    const columns = s.columns === 2 ? 2 : 1;
    if (s.questionnaireId !== undefined) {
      if (!o.allowQuestionnaires || typeof s.questionnaireId !== 'string' || !UUID.test(s.questionnaireId)) throw new RuleError('Choose a question set from the library.');
      return { id: s.id, title: text(s.title, 'A section title', 120, true), columns, fields: [], questionnaireId: s.questionnaireId };
    }
    if (!Array.isArray(s.fields)) throw new RuleError('A section has no fields list.');
    const fields = s.fields.map((f) => parseField(f, keys));
    return { id: s.id, title: text(s.title, 'A section title', 120, true), titles: langs(s.titles, 'A section title'), columns, fields };
  });
  if (keys.size > FORM_LIMITS.fields) throw new RuleError(`A form has up to ${FORM_LIMITS.fields} fields.`);
  // Formulas and dependent lists may point only at fields that exist (checked once every key is known).
  const refs = (x: Formula): string[] => x.args.flatMap((a) => ('op' in a ? refs(a) : 'field' in a ? [a.field] : []));
  for (const f of keys.values()) if (f.type === 'formula') f.formula = parseFormula(f.formula, keys);
  for (const f of keys.values()) {
    // P19: a formula that reads a sensitive answer is sensitive too (it would give the answer away).
    if (f.type === 'formula' && refs(f.formula!).some((k) => keys.get(k)?.sensitive)) f.sensitive = true;
    if (f.dependsOn !== undefined) {
      const parent = keys.get(f.dependsOn);
      if (!parent || parent.type !== 'choice' || parent === f) throw new RuleError(`"${f.label}" can depend only on a pick-list field.`);
      const by = f.optionsBy ?? {};
      for (const [pv, list] of Object.entries(by)) {
        if (!parent.options?.some((x) => x.value === pv)) throw new RuleError(`"${f.label}": "${pv}" is not a value of "${parent.label}".`);
        if (!Array.isArray(list) || list.some((v) => !f.options?.some((x) => x.value === v))) throw new RuleError(`"${f.label}": list only its own values under each choice.`);
      }
    }
  }
  const schema = formSchema({ sections });
  const rawRules = input.rules ?? [];
  if (!Array.isArray(rawRules) || rawRules.length > FORM_LIMITS.rules) throw new RuleError(`A form has up to ${FORM_LIMITS.rules} rules.`);
  const rules = rawRules.map((r): FormRule => {
    if (!isObj(r)) throw new RuleError('A form rule is not in the expected shape.');
    onlyKeys(r, ['id', 'when', 'then'], 'A form rule');
    if (typeof r.id !== 'string' || !ID.test(r.id)) throw new RuleError('A form rule has a bad id.');
    const when = parseGroup(r.when, schema);
    if (!Array.isArray(r.then) || !r.then.length || r.then.length > FORM_LIMITS.effects) throw new RuleError(`A form rule does 1 to ${FORM_LIMITS.effects} things.`);
    const then = r.then.map((e): FormEffect => {
      if (!isObj(e)) throw new RuleError('A form rule step is not in the expected shape.');
      onlyKeys(e, ['action', 'field', 'value', 'options'], 'A form rule step');
      const f = typeof e.field === 'string' ? keys.get(e.field) : undefined;
      if (!f) throw new RuleError('A form rule names a field that is not on this form.');
      const action = e.action as FormEffect['action'];
      if (!['show', 'hide', 'require', 'lock', 'set', 'limit'].includes(action)) throw new RuleError('Choose what the form rule does.');
      if (action === 'set') {
        if (!(typeof e.value === 'string' && e.value.length <= 200) && !(typeof e.value === 'number' && Number.isFinite(e.value))) throw new RuleError(`Enter the value to put in "${f.label}".`);
        return { action, field: f.key, value: e.value };
      }
      if (action === 'limit') {
        if (!Array.isArray(e.options) || !e.options.length || e.options.some((v) => !f.options?.some((x) => x.value === v))) throw new RuleError(`Choose which values of "${f.label}" to offer.`);
        return { action, field: f.key, options: e.options as string[] };
      }
      return { action, field: f.key };
    });
    return { id: r.id, when, then };
  });
  return { sections, rules };
}

function parseField(x: unknown, keys: Map<string, FormField>): FormField {
  if (!isObj(x)) throw new RuleError('A field is not in the expected shape.');
  onlyKeys(x, ['key', 'type', 'label', 'labels', 'help', 'required', 'sensitive', 'min', 'max', 'options', 'dependsOn', 'optionsBy', 'formula', 'width'], 'A field');
  if (typeof x.key !== 'string' || !FIELD_KEY.test(x.key) || x.key.includes('.')) throw new RuleError('A field key is lower case letters, digits and _ (up to 40).');
  if (keys.has(x.key)) throw new RuleError(`Two fields use the key "${x.key}".`);
  if (!(FIELD_TYPES as readonly string[]).includes(x.type as string)) throw new RuleError(`Choose a type for "${x.key}".`);
  const type = x.type as FormFieldType;
  const f: FormField = { key: x.key, type, label: text(x.label, `The label of "${x.key}"`, 120)! };
  const labels = langs(x.labels, `The label of "${x.key}"`);
  if (labels) f.labels = labels;
  const help = text(x.help, `The help of "${x.key}"`, 300, true);
  if (help) f.help = help;
  if (x.required === true && type !== 'formula' && type !== 'separator') f.required = true;
  if (x.sensitive === true) f.sensitive = true;
  for (const k of ['min', 'max'] as const) {
    if (x[k] === undefined) continue;
    if (typeof x[k] !== 'number' || !Number.isFinite(x[k] as number)) throw new RuleError(`"${f.label}": ${k} must be a number.`);
    f[k] = x[k] as number;
  }
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) throw new RuleError(`"${f.label}": the smallest value is above the largest.`);
  if (type === 'choice' || type === 'multi_choice') {
    if (!Array.isArray(x.options) || !x.options.length || x.options.length > FORM_LIMITS.options) throw new RuleError(`"${f.label}" needs 1 to ${FORM_LIMITS.options} choices.`);
    const seen = new Set<string>();
    f.options = x.options.map((op) => {
      if (!isObj(op)) throw new RuleError(`"${f.label}": a choice is not in the expected shape.`);
      onlyKeys(op, ['value', 'label', 'labels', 'colour'], 'A choice');
      if (typeof op.value !== 'string' || !VALUE.test(op.value) || seen.has(op.value)) throw new RuleError(`"${f.label}": each choice needs its own short value.`);
      seen.add(op.value);
      if (op.colour !== undefined && !(COLOURS as readonly string[]).includes(op.colour as string)) throw new RuleError(`"${f.label}": choose a colour from the list.`);
      const o: FormOption = { value: op.value, label: text(op.label, `"${f.label}": a choice label`, 120)! };
      const ls = langs(op.labels, `"${f.label}": a choice label`);
      if (ls) o.labels = ls;
      if (op.colour) o.colour = op.colour as FormOption['colour'];
      return o;
    });
  }
  if (x.dependsOn !== undefined) {
    if (type !== 'choice' || typeof x.dependsOn !== 'string') throw new RuleError(`Only a pick-list can depend on another field ("${f.label}").`);
    f.dependsOn = x.dependsOn;
    if (!isObj(x.optionsBy)) throw new RuleError(`"${f.label}": list the values offered under each choice.`);
    f.optionsBy = Object.fromEntries(Object.entries(x.optionsBy).slice(0, FORM_LIMITS.options)) as Record<string, string[]>;
  }
  if (type === 'formula') f.formula = x.formula as Formula; // checked once every key is known
  if (x.width === 'half') f.width = 'half';
  keys.set(f.key, f);
  return f;
}

/** Copies question-library sets into the form (at publish, so orders pin what they answered). */
export function expandQuestionnaires(def: FormDef, library: ReadonlyMap<string, { fields: FormField[]; rules: FormRule[] }>): FormDef {
  const sections = def.sections.map((s) => {
    if (!s.questionnaireId) return s;
    const q = library.get(s.questionnaireId);
    if (!q) throw new RuleError('A question set used by this form is not in the library any more.');
    return { id: s.id, title: s.title, titles: s.titles, columns: s.columns, fields: q.fields };
  });
  const rules = [...def.rules, ...def.sections.flatMap((s) => (s.questionnaireId ? library.get(s.questionnaireId)!.rules : []))];
  // Run the full check again: keys must still be unique across the copied sets.
  return parseForm({ sections, rules } as unknown);
}

// ------------------------------------------------------------------------------------------ answering

export type Answers = Record<string, Value | boolean>;
export interface FieldState {
  visible: boolean;
  required: boolean;
  locked: boolean;
  /** Choice values on offer now (dependent lists, "limit" rules). */
  options?: string[];
}

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** The record P19 rules read: answers (checkbox as yes / no) plus the requester's profile. */
function ruleRecord(def: FormDef, values: Answers, requester: RecordValues): Record<string, Value> {
  const rec: Record<string, Value> = {};
  for (const f of def.sections.flatMap((s) => s.fields)) {
    if (!own(values, f.key)) continue;
    const v = values[f.key];
    rec[f.key] = typeof v === 'boolean' ? (v ? 'yes' : 'no') : (v as Value);
  }
  for (const k of Object.keys(requester)) if (k.startsWith('requester.')) rec[k] = requester[k] ?? null;
  return rec;
}

/** Which fields apply, with which options, given the answers so far (two passes so "set" values can feed rules). */
export function resolveForm(def: FormDef, answers: Answers, requester: RecordValues = {}): { state: Record<string, FieldState>; values: Answers } {
  const schema = formSchema(def);
  const fields = def.sections.flatMap((s) => s.fields);
  const values: Answers = {};
  for (const f of fields) if (own(answers, f.key)) values[f.key] = answers[f.key];
  let state: Record<string, FieldState> = {};
  for (let pass = 0; pass < 2; pass++) {
    const rec = ruleRecord(def, values, requester);
    const hits = def.rules.filter((r) => evaluate(r.when, rec, schema).pass).flatMap((r) => r.then);
    const showRuled = new Set(def.rules.flatMap((r) => r.then.filter((e) => e.action === 'show').map((e) => e.field)));
    state = {};
    for (const f of fields) {
      const mine = hits.filter((e) => e.field === f.key);
      const visible = (!showRuled.has(f.key) || mine.some((e) => e.action === 'show')) && !mine.some((e) => e.action === 'hide');
      let options = f.options?.map((o) => o.value);
      if (f.dependsOn) {
        const parent = values[f.dependsOn];
        options = typeof parent === 'string' ? (f.optionsBy?.[parent] ?? []) : [];
      }
      for (const e of mine) if (e.action === 'limit' && options) options = options.filter((v) => e.options!.includes(v));
      const locked = mine.some((e) => e.action === 'lock');
      const set = mine.find((e) => e.action === 'set');
      if (set && (locked || blank(values[f.key]))) values[f.key] = set.value as Value;
      state[f.key] = { visible: visible && f.type !== 'separator', required: visible && (Boolean(f.required) || mine.some((e) => e.action === 'require')), locked, ...(options ? { options } : {}) };
    }
  }
  for (const f of fields) {
    if (!state[f.key].visible) delete values[f.key];
    if (f.type === 'formula' && state[f.key].visible) values[f.key] = computeFormula(f.formula!, values);
  }
  return { state, values };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Formula fields (US-G-224): read-only, worked out from other answers. Missing parts give no value (never an error). */
export function computeFormula(f: Formula, values: Answers): number | string | null {
  const get = (a: Operand): unknown => ('op' in a ? computeFormula(a, values) : 'field' in a ? values[a.field] : a.value);
  const parts = f.args.map(get);
  if (f.op === 'concat') return parts.map((p) => (p === null || p === undefined ? '' : String(p))).join('').slice(0, 500);
  if (f.op === 'days_between') {
    const [a, b] = parts.map((p) => (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p) ? Date.parse(`${p}T00:00:00Z`) : NaN));
    return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86_400_000);
  }
  const ns = parts.map(num);
  if (ns.some((n) => n === null)) return null;
  const n = ns as number[];
  let r: number;
  if (f.op === 'add') r = n.reduce((s, x) => s + x, 0);
  else if (f.op === 'sub') r = n.slice(1).reduce((s, x) => s - x, n[0]);
  else if (f.op === 'mul') r = n.reduce((s, x) => s * x, 1);
  else if (f.op === 'div') {
    if (n.slice(1).some((x) => x === 0)) return null;
    r = n.slice(1).reduce((s, x) => s / x, n[0]);
  } else r = n[0];
  const p = 10 ** (f.digits ?? (f.op === 'round' ? 0 : 2));
  return Number.isFinite(r) ? Math.round(r * p) / p : null;
}

/** Ids the module must check against live data (people, locations, cost centres). */
export function pickedIds(def: FormDef, values: Answers): Record<'person' | 'location' | 'cost_centre', string[]> {
  const out = { person: [] as string[], location: [] as string[], cost_centre: [] as string[] };
  for (const f of def.sections.flatMap((s) => s.fields)) if ((PICKERS as string[]).includes(f.type) && typeof values[f.key] === 'string') out[f.type as keyof typeof out].push(values[f.key] as string);
  return out;
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/**
 * Checks answers against the form (SD-2.01, US-G-063): only fields that apply are kept, each by its type; required ones
 * must be answered; locked ones keep the rule's value. Returns the clean values (with formulas) and any errors by key.
 */
export function checkAnswers(def: FormDef, answers: unknown, requester: RecordValues = {}): { values: Answers; errors: Record<string, string> } {
  if (answers !== undefined && answers !== null && !isObj(answers)) return { values: {}, errors: { _form: 'The answers are not in the expected shape.' } };
  const raw = (answers ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const fields = def.sections.flatMap((s) => s.fields);
  const known = new Set(fields.map((f) => f.key));
  for (const k of Object.keys(raw)) if (!known.has(k)) errors[k.slice(0, 40)] = 'This question is not on the form.';
  // Values by type first (so rules read clean values), then rules decide what applies.
  const typed: Answers = {};
  for (const f of fields) {
    if (!own(raw, f.key) || f.type === 'formula' || f.type === 'separator') continue;
    const v = raw[f.key];
    if (blank(v)) continue;
    const bad = (m: string) => (errors[f.key] = m);
    switch (f.type) {
      case 'text':
      case 'textarea': {
        const max = Math.min(f.max ?? (f.type === 'text' ? 300 : 4000), f.type === 'text' ? 300 : 4000);
        if (typeof v !== 'string' || v.trim().length > max || v.trim().length < (f.min ?? 0)) bad(`Write ${f.min ? `${f.min} to ` : 'up to '}${max} characters.`);
        else typed[f.key] = v.trim();
        break;
      }
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) bad('Enter a number.');
        else if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) bad(`Enter a number from ${f.min ?? '…'} to ${f.max ?? '…'}.`);
        else typed[f.key] = v;
        break;
      case 'email':
        if (typeof v !== 'string' || v.length > 254 || !EMAIL.test(v.trim())) bad('Enter an email address like name@company.com.');
        else typed[f.key] = v.trim().toLowerCase();
        break;
      case 'phone':
        if (typeof v !== 'string' || v.length > 20 || !isValidPhoneNumber(v.trim(), 'IN')) bad('Enter a phone number like +91 98450 12345.');
        else typed[f.key] = v.trim();
        break;
      case 'url': {
        let u: URL | null = null;
        try {
          u = typeof v === 'string' && v.length <= 500 ? new URL(v.trim()) : null;
        } catch {
          u = null;
        }
        if (!u || !['http:', 'https:'].includes(u.protocol)) bad('Enter a web address starting with https://.');
        else typed[f.key] = u.toString();
        break;
      }
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) bad('Choose a date.');
        else typed[f.key] = v;
        break;
      case 'checkbox':
        if (typeof v !== 'boolean') bad('Tick or untick the box.');
        else typed[f.key] = v;
        break;
      case 'choice':
        if (typeof v !== 'string' || !f.options?.some((o) => o.value === v)) bad('Choose one of the options.');
        else typed[f.key] = v;
        break;
      case 'multi_choice':
        if (!Array.isArray(v) || v.length > 50 || v.some((x) => typeof x !== 'string' || !f.options?.some((o) => o.value === x))) bad('Choose from the options.');
        else typed[f.key] = [...new Set(v as string[])];
        break;
      default:
        // Live-data pickers: an id here; the module checks it is one of its own records.
        if (typeof v !== 'string' || !UUID.test(v)) bad('Choose from the list.');
        else typed[f.key] = v.toLowerCase();
    }
  }
  const { state, values } = resolveForm(def, typed, requester);
  for (const f of fields) {
    const s = state[f.key];
    if (!s.visible) {
      delete errors[f.key];
      continue;
    }
    if (s.options && typeof values[f.key] === 'string' && !s.options.includes(values[f.key] as string)) errors[f.key] = 'Choose one of the options offered.';
    if (s.options && Array.isArray(values[f.key]) && (values[f.key] as string[]).some((x) => !s.options!.includes(x))) errors[f.key] = 'Choose from the options offered.';
    if (s.required && blank(values[f.key]) && !errors[f.key] && f.type !== 'checkbox') errors[f.key] = 'Answer this question.';
    if (s.required && f.type === 'checkbox' && values[f.key] !== true && !errors[f.key]) errors[f.key] = 'Tick this box to go on.';
  }
  return { values, errors };
}

/** What approvers and fulfilment teams see: labels and answers, never fields marked sensitive (P03: only what they need). */
export function summarise(def: FormDef, values: Answers, names: ReadonlyMap<string, string> = new Map()): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const f of def.sections.flatMap((s) => s.fields)) {
    if (f.sensitive || f.type === 'separator' || blank(values[f.key])) continue;
    const v = values[f.key];
    const label = (x: unknown) => f.options?.find((o) => o.value === x)?.label ?? names.get(String(x)) ?? String(x);
    out.push({ label: f.label, value: Array.isArray(v) ? v.map(label).join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : label(v) });
  }
  return out;
}
