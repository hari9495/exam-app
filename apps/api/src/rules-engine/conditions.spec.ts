import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { FieldDef, Group, RuleError, evaluate, fieldsUsed, parseGroup, test as check } from './conditions';
import { checkAnswers, computeFormula, parseForm, resolveForm, summarise } from './forms';

const FIELDS: FieldDef[] = [
  { key: 'priority', label: 'Priority', type: 'number' },
  { key: 'subject', label: 'Subject', type: 'text' },
  { key: 'due', label: 'Due', type: 'date' },
  { key: 'category', label: 'Category', type: 'choice', options: [{ value: 'payroll', label: 'Payroll' }, { value: 'laptop', label: 'Laptop' }] },
  { key: 'requester.department', label: 'Department', type: 'choice' },
  { key: 'tags', label: 'Tags', type: 'text' },
];
const g = (items: unknown[], join = 'and') => ({ id: 'g0', join, items });
const c = (field: string, operator: string, value: unknown, id = `c${Math.random().toString(36).slice(2, 8)}`) => ({ id, field, operator, value });

describe('P19 conditions: parse (save-time checks)', () => {
  it('accepts the builder shape and normalises values', () => {
    const p = parseGroup(g([c('priority', 'lt', 3), { id: 'g1', join: 'or', items: [c('category', 'is', 'payroll'), c('subject', 'contains', ' salary ')] }]), FIELDS);
    expect(p.items).toHaveLength(2);
    expect(fieldsUsed(p).sort()).toEqual(['category', 'priority', 'subject']);
    expect(((p.items[1] as Group).items[1] as { value: string }).value).toBe('salary');
  });

  it.each([
    ['an unknown field', g([c('salary', 'is', 1)])],
    ['an operator the type does not have', g([c('subject', 'gt', 'a')])],
    ['a value of the wrong type', g([c('priority', 'is', '1')])],
    ['a choice that is not in the list', g([c('category', 'is', 'hacker')])],
    ['a bad date', g([c('due', 'is', '2026-02-30')])],
    ['a backwards range', g([c('priority', 'between', [5, 1])])],
    ['groups more than one level deep', g([{ id: 'g1', join: 'and', items: [{ id: 'g2', join: 'and', items: [c('priority', 'is', 1)] }] }])],
    ['an empty nested group', g([{ id: 'g1', join: 'and', items: [] }])],
    ['a bad join', g([c('priority', 'is', 1)], 'xor')],
    ['extra keys', { ...g([c('priority', 'is', 1)]), run: 'process.exit()' }],
    ['a prototype key as a field', g([c('__proto__', 'is', 1)])],
    ['a constructor path', g([c('constructor.prototype', 'is', 1)])],
    ['a function as a value', g([c('subject', 'is', () => 1)])],
    ['too many conditions', g(Array.from({ length: 41 }, (_, i) => c('priority', 'is', i, `c${i}`)))],
    ['not an object', 'priority > 3'],
    ['an array', [c('priority', 'is', 1)]],
  ])('refuses %s with a plain message', (_why, input) => {
    expect(() => parseGroup(input, FIELDS)).toThrow(RuleError);
  });

  it('live-data choices (ids) take id-like values only', () => {
    expect(() => parseGroup(g([c('requester.department', 'is', '3f1c9a5e-0000-4000-8000-000000000001')]), FIELDS)).not.toThrow();
    expect(() => parseGroup(g([c('requester.department', 'is', "x' OR 1=1 --")]), FIELDS)).toThrow(RuleError);
  });
});

describe('P19 conditions: evaluate', () => {
  const run = (items: unknown[], record: Record<string, unknown>, join = 'and') => evaluate(parseGroup(g(items, join), FIELDS), record as never, FIELDS);

  it('AND / OR with a trace row for every condition (no short cut)', () => {
    const r = run([c('priority', 'lt', 3, 'a'), c('category', 'is', 'payroll', 'b')], { priority: 4, category: 'payroll' });
    expect(r.pass).toBe(false);
    expect(r.trace.map((t) => [t.id, t.pass, t.actual])).toEqual([['a', false, 4], ['b', true, 'payroll']]);
    expect(run([c('priority', 'lt', 3), c('category', 'is', 'payroll')], { priority: 4, category: 'payroll' }, 'or').pass).toBe(true);
  });

  it('an empty rule applies every time', () => {
    expect(run([], {}).pass).toBe(true);
  });

  it('text compares without case; lists match any item; missing values', () => {
    expect(run([c('subject', 'is', 'VPN down')], { subject: 'vpn DOWN' }).pass).toBe(true);
    expect(run([c('tags', 'contains', 'vip')], { tags: ['ops', 'VIP-customer'] }).pass).toBe(true);
    expect(run([c('subject', 'is_not', 'x')], {}).pass).toBe(true);
    expect(run([c('subject', 'is', 'x')], {}).pass).toBe(false);
    expect(run([c('subject', 'empty', null)], { subject: '' }).pass).toBe(true);
    expect(run([c('priority', 'gt', 1)], { priority: null }).pass).toBe(false);
  });

  it('dates and numbers by range, never across types', () => {
    expect(run([c('due', 'between', ['2026-10-01', '2026-10-31'])], { due: '2026-10-08' }).pass).toBe(true);
    expect(run([c('due', 'gt', '2026-10-01')], { due: '2026-09-30' }).pass).toBe(false);
    expect(check('gt', 3, '10')).toBe(false);
  });

  it('reads own keys only (an inherited property is never a value)', () => {
    const record = Object.create({ subject: 'inherited' }) as Record<string, unknown>;
    expect(run([c('subject', 'is', 'inherited')], record).pass).toBe(false);
  });

  it('hides the values it saw on sensitive records', () => {
    const r = evaluate(parseGroup(g([c('subject', 'contains', 'salary')]), FIELDS), { subject: 'my salary is late' }, FIELDS, { hideActual: true });
    expect(r.trace[0]).toMatchObject({ pass: true, actual: null });
  });
});

describe('P19 conditions: fuzz (no input runs code, every result is a boolean or a RuleError)', () => {
  // A small seeded generator, so a failure is repeatable.
  let seed = 20261008;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const nasty = ['__proto__', 'constructor', 'prototype', 'toString', '${process.exit()}', 'require("fs")', '); DROP TABLE x; --', '\u0000', 'a'.repeat(500), '', ' ', 'NaN', '1e400'];
  const values: unknown[] = [...nasty, 0, -1, 3, 1e13, NaN, Infinity, null, undefined, true, {}, [], [1, 2], ['payroll'], { toString: () => 'x' }, '2026-10-08', ['2026-10-01', '2026-10-31']];
  const randCondition = (): unknown => ({ id: pick(['c1', 'c2', '__proto__', 'x y']), field: pick([...FIELDS.map((f) => f.key), ...nasty]), operator: pick(['is', 'is_not', 'one_of', 'gt', 'lt', 'between', 'contains', 'empty', 'eval', '']), value: pick(values) });
  const randGroup = (depth: number): unknown => ({ id: pick(['g1', 'g2']), join: pick(['and', 'or', 'xor']), items: Array.from({ length: Math.floor(rnd() * 5) }, () => (depth < 3 && rnd() < 0.3 ? randGroup(depth + 1) : randCondition())) });

  it('5,000 random trees: parse either refuses plainly or gives a tree that evaluates to a boolean', () => {
    let accepted = 0;
    const before = Object.getOwnPropertyNames(Object.prototype).length;
    for (let i = 0; i < 5000; i++) {
      const input = randGroup(0);
      let tree: Group;
      try {
        tree = parseGroup(input, FIELDS);
      } catch (e) {
        expect(e).toBeInstanceOf(RuleError);
        continue;
      }
      accepted++;
      const record = Object.fromEntries(FIELDS.map((f) => [f.key, pick(values)]));
      const r = evaluate(tree, record as never, FIELDS);
      expect(typeof r.pass).toBe('boolean');
    }
    expect(accepted).toBeGreaterThan(50);
    // Nothing was added to Object.prototype along the way.
    expect(Object.getOwnPropertyNames(Object.prototype).length).toBe(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('the engine source has no way to run code (no eval, Function, vm or dynamic import)', () => {
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.spec.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(|require\(['"]vm['"]\)|from ['"]vm['"]|import\s*\(/);
    }
  });
});

describe('P18 forms on P19 (SD-2.01)', () => {
  const FORM = {
    sections: [
      {
        id: 's1',
        title: 'Your laptop',
        columns: 2,
        fields: [
          { key: 'model', type: 'choice', label: 'Model', required: true, options: [{ value: 'std', label: 'Standard 14"', colour: 'blue' }, { value: 'pro', label: 'Developer 16"', colour: 'purple', labels: { hi: 'डेवलपर 16"' } }] },
          { key: 'reason', type: 'textarea', label: 'Why do you need the developer model?' },
          { key: 'os', type: 'choice', label: 'System', dependsOn: 'model', options: [{ value: 'win', label: 'Windows' }, { value: 'mac', label: 'macOS' }, { value: 'linux', label: 'Linux' }], optionsBy: { std: ['win'], pro: ['win', 'mac', 'linux'] } },
          { key: 'cc', type: 'cost_centre', label: 'Cost centre', required: true },
          { key: 'qty', type: 'number', label: 'How many', min: 1, max: 3 },
          { key: 'price', type: 'number', label: 'Price each', sensitive: true },
          { key: 'total', type: 'formula', label: 'Total', formula: { op: 'mul', args: [{ field: 'qty' }, { field: 'price' }] } },
          { key: 'line', type: 'separator', label: 'Delivery' },
          { key: 'email', type: 'email', label: 'Send updates to' },
          { key: 'phone', type: 'phone', label: 'Phone' },
          { key: 'agree', type: 'checkbox', label: 'I will return my old laptop', required: true },
        ],
      },
    ],
    rules: [
      { id: 'r1', when: { id: 'w1', join: 'and', items: [{ id: 'c1', field: 'model', operator: 'is', value: 'pro' }] }, then: [{ action: 'show', field: 'reason' }, { action: 'require', field: 'reason' }] },
      { id: 'r2', when: { id: 'w2', join: 'and', items: [{ id: 'c2', field: 'requester.department', operator: 'is', value: 'dept-eng' }] }, then: [{ action: 'set', field: 'qty', value: 1 }, { action: 'lock', field: 'qty' }] },
    ],
  };
  const CC = '3f1c9a5e-0000-4000-8000-000000000001';

  it('shows, requires, filters dependent lists and computes formulas', () => {
    const def = parseForm(FORM);
    const std = resolveForm(def, { model: 'std' });
    expect(std.state.reason.visible).toBe(false);
    expect(std.state.os.options).toEqual(['win']);
    const pro = resolveForm(def, { model: 'pro', qty: 2, price: 1000 });
    expect(pro.state.reason).toMatchObject({ visible: true, required: true });
    expect(pro.values.total).toBe(2000);
    expect(pro.state.line.visible).toBe(false);
  });

  it('checks answers by type; hidden answers are dropped; locked values win', () => {
    const def = parseForm(FORM);
    const bad = checkAnswers(def, { model: 'pro', os: 'mac', cc: 'not-an-id', qty: 9, email: 'x@', phone: '12', agree: false, junk: 1 });
    expect(Object.keys(bad.errors).sort()).toEqual(['agree', 'cc', 'email', 'junk', 'phone', 'qty', 'reason']);
    const ok = checkAnswers(def, { model: 'std', reason: 'hidden words', os: 'win', cc: CC, qty: 3, price: 50, email: 'Divya@Kaveri.test', phone: '+91 98450 12345', agree: true }, { 'requester.department': 'dept-eng' });
    expect(ok.errors).toEqual({});
    expect(ok.values.reason).toBeUndefined();
    expect(ok.values.qty).toBe(1);
    expect(ok.values.total).toBe(50);
    expect(ok.values.email).toBe('divya@kaveri.test');
    expect(checkAnswers(def, { model: 'std', os: 'mac', cc: CC, agree: true }).errors.os).toBeDefined();
  });

  it('approvers see labels, never sensitive answers', () => {
    const def = parseForm(FORM);
    const { values } = checkAnswers(def, { model: 'pro', reason: 'Builds', os: 'linux', cc: CC, qty: 1, price: 99999, agree: true });
    const s = summarise(def, values, new Map([[CC, 'Engineering Bengaluru']]));
    expect(s).toContainEqual({ label: 'Model', value: 'Developer 16"' });
    expect(s).toContainEqual({ label: 'Cost centre', value: 'Engineering Bengaluru' });
    expect(JSON.stringify(s)).not.toContain('99999');
  });

  it.each([
    ['duplicate keys', { sections: [{ id: 's', columns: 1, fields: [{ key: 'a', type: 'text', label: 'A' }, { key: 'a', type: 'text', label: 'B' }] }] }],
    ['a rule on a missing field', { sections: [{ id: 's', columns: 1, fields: [{ key: 'a', type: 'text', label: 'A' }] }], rules: [{ id: 'r', when: { id: 'w', join: 'and', items: [] }, then: [{ action: 'hide', field: 'b' }] }] }],
    ['a formula on a missing field', { sections: [{ id: 's', columns: 1, fields: [{ key: 'f', type: 'formula', label: 'F', formula: { op: 'add', args: [{ field: 'zz' }] } }] }] }],
    ['a script in a formula', { sections: [{ id: 's', columns: 1, fields: [{ key: 'f', type: 'formula', label: 'F', formula: 'process.exit()' }] }] }],
    ['an unknown colour', { sections: [{ id: 's', columns: 1, fields: [{ key: 'a', type: 'choice', label: 'A', options: [{ value: 'x', label: 'X', colour: 'url(javascript:1)' }] }] }] }],
    ['an unknown language', { sections: [{ id: 's', columns: 1, fields: [{ key: 'a', type: 'text', label: 'A', labels: { xx: 'B' } }] }] }],
  ])('refuses %s', (_w, input) => {
    expect(() => parseForm(input)).toThrow(RuleError);
  });

  it('formulas never throw: division by zero and missing parts give no value', () => {
    expect(computeFormula({ op: 'div', args: [{ value: 1 }, { value: 0 }] }, {})).toBeNull();
    expect(computeFormula({ op: 'add', args: [{ field: 'x' }, { value: 1 }] }, {})).toBeNull();
    expect(computeFormula({ op: 'days_between', args: [{ value: '2026-10-01' }, { value: '2026-10-08' }] }, {})).toBe(7);
    expect(computeFormula({ op: 'concat', args: [{ value: 'KF-' }, { field: 'n' }] }, { n: 7 })).toBe('KF-7');
  });
});
