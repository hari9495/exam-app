import jsep from 'jsep';
import { Prisma } from '@prisma/client';
import { RuleError } from './conditions';

// The P19 expression language for pay formulas (M03-BUILD-DESIGN §7.2, PAY-2.06): text such as
// `round(min(basic * 0.12, 1800))` is parsed by jsep (a parser only; it never runs anything), checked against an
// allow-list into a typed tree, stored as JSON, and evaluated with Decimal by walking that tree. No eval, no Function,
// no property lookups, no strings. The error says which word is not allowed, in plain words.
// (The desk's form formulas stay on their own small JSON shape in forms.ts: they work on text and dates, which this
// language refuses on purpose.)

jsep.addBinaryOp('and', 2);
jsep.addBinaryOp('or', 1);
jsep.addUnaryOp('not');
// Only what the language allows; the rest of jsep's operators are refused by the checker below.
const BINARY = new Set(['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!=', 'and', 'or']);

export type Ty = 'number' | 'boolean';
export type Node =
  | { k: 'num'; v: string }
  | { k: 'var'; name: string }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'not'; a: Node }
  | { k: 'neg'; a: Node }
  | { k: 'call'; fn: string; args: Node[] };

/** Functions and their arity; statutory ones are read-only results of the pack (§8.2). */
const FUNCTIONS: Record<string, { min: number; max: number }> = {
  if: { min: 3, max: 3 },
  min: { min: 2, max: 10 },
  max: { min: 2, max: 10 },
  round: { min: 1, max: 2 },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  prorate: { min: 1, max: 1 },
};
export const STATUTORY_FUNCTIONS = ['pf_employee', 'pf_employer', 'esi_employee', 'esi_employer', 'pt', 'lwf_employee', 'lwf_employer', 'gratuity_provision', 'bonus_provision', 'code_wage'] as const;
export type StatutoryFn = (typeof STATUTORY_FUNCTIONS)[number];
/** Variables every pay formula may read (beside the template's component codes). */
export const PAY_VARIABLES = ['ctc', 'monthly_ctc', 'payable_days', 'period_days', 'lop_days', 'worked_days', 'ot_hours_normal', 'ot_hours_weekoff', 'ot_hours_holiday', 'rate', 'age', 'service_years'] as const;

const LIMITS = { chars: 500, nodes: 200, depth: 20 };

export interface Checked {
  ast: Node;
  type: Ty;
  /** Component codes and variables it reads. */
  uses: string[];
  /** Statutory functions it calls. */
  statutory: StatutoryFn[];
}

/** Parses and checks one formula; `names` are the variables allowed (component codes and pay variables). */
export function checkFormula(text: string, names: ReadonlySet<string>): Checked {
  if (typeof text !== 'string' || !text.trim()) throw new RuleError('Write a formula.');
  if (text.length > LIMITS.chars) throw new RuleError(`A formula is at most ${LIMITS.chars} characters.`);
  let tree: jsep.Expression;
  try {
    tree = jsep(text);
  } catch (e) {
    throw new RuleError(`The formula cannot be read: ${(e as Error).message.replace(/ at character \d+/, '')}.`);
  }
  let nodes = 0;
  const uses = new Set<string>();
  const statutory = new Set<StatutoryFn>();
  const walk = (x: jsep.Expression, depth: number): Node => {
    if (++nodes > LIMITS.nodes) throw new RuleError(`A formula has at most ${LIMITS.nodes} parts.`);
    if (depth > LIMITS.depth) throw new RuleError('The formula is nested too deeply.');
    switch (x.type) {
      case 'Literal': {
        if (typeof x.value !== 'number' || !Number.isFinite(x.value)) throw new RuleError(`"${String(x.raw)}" is not allowed: only numbers can be written in a formula.`);
        return { k: 'num', v: String(x.raw ?? x.value) };
      }
      case 'Identifier': {
        const name = String(x.name);
        if (!names.has(name)) throw new RuleError(`"${name}" is not allowed: use a component code of this template or one of ${PAY_VARIABLES.join(', ')}.`);
        uses.add(name);
        return { k: 'var', name };
      }
      case 'BinaryExpression': {
        const op = String(x.operator);
        if (!BINARY.has(op)) throw new RuleError(`"${op}" is not allowed in a formula.`);
        return { k: 'bin', op, a: walk(x.left as jsep.Expression, depth + 1), b: walk(x.right as jsep.Expression, depth + 1) };
      }
      case 'UnaryExpression': {
        if (x.operator === 'not') return { k: 'not', a: walk(x.argument as jsep.Expression, depth + 1) };
        if (x.operator === '-') return { k: 'neg', a: walk(x.argument as jsep.Expression, depth + 1) };
        throw new RuleError(`"${String(x.operator)}" is not allowed in a formula.`);
      }
      case 'CallExpression': {
        const callee = x.callee as jsep.Expression;
        if (callee.type !== 'Identifier') throw new RuleError('Only the listed functions can be called.');
        const fn = String(callee.name);
        const args = (x.arguments as jsep.Expression[]) ?? [];
        if ((STATUTORY_FUNCTIONS as readonly string[]).includes(fn)) {
          if (args.length) throw new RuleError(`${fn}() takes nothing: its amount comes from the statutory rules.`);
          statutory.add(fn as StatutoryFn);
          return { k: 'call', fn, args: [] };
        }
        const spec = FUNCTIONS[fn];
        if (!spec) throw new RuleError(`"${fn}" is not allowed: use ${[...Object.keys(FUNCTIONS), ...STATUTORY_FUNCTIONS].join(', ')}.`);
        if (args.length < spec.min || args.length > spec.max) throw new RuleError(`${fn}() takes ${spec.min === spec.max ? spec.min : `${spec.min} to ${spec.max}`} parts.`);
        return { k: 'call', fn, args: args.map((a) => walk(a, depth + 1)) };
      }
      case 'ConditionalExpression':
        throw new RuleError('Use if(condition, then, else) instead of "? :".');
      default:
        throw new RuleError(`${x.type === 'MemberExpression' ? 'A dot or brackets' : x.type === 'ThisExpression' ? '"this"' : 'This kind of expression'} is not allowed in a formula.`);
    }
  };
  const ast = walk(tree, 0);
  const type = typeOf(ast);
  return { ast, type, uses: [...uses], statutory: [...statutory] };
}

/** Types: arithmetic on numbers, and / or / not on yes-no, comparisons give yes-no, if() picks between equals. */
export function typeOf(n: Node): Ty {
  switch (n.k) {
    case 'num':
    case 'var':
      return 'number';
    case 'neg':
      if (typeOf(n.a) !== 'number') throw new RuleError('Only a number can be made negative.');
      return 'number';
    case 'not':
      if (typeOf(n.a) !== 'boolean') throw new RuleError('"not" needs a yes-or-no part.');
      return 'boolean';
    case 'bin': {
      const [a, b] = [typeOf(n.a), typeOf(n.b)];
      if (n.op === 'and' || n.op === 'or') {
        if (a !== 'boolean' || b !== 'boolean') throw new RuleError(`"${n.op}" joins two yes-or-no parts.`);
        return 'boolean';
      }
      if (a !== 'number' || b !== 'number') throw new RuleError(`"${n.op}" works on numbers.`);
      return ['<', '<=', '>', '>=', '==', '!='].includes(n.op) ? 'boolean' : 'number';
    }
    case 'call': {
      if (n.fn === 'if') {
        if (typeOf(n.args[0]) !== 'boolean') throw new RuleError('The first part of if() is a yes-or-no question.');
        const [t, e] = [typeOf(n.args[1]), typeOf(n.args[2])];
        if (t !== e) throw new RuleError('Both answers of if() must be numbers (or both yes-or-no).');
        return t;
      }
      for (const a of n.args) if (typeOf(a) !== 'number') throw new RuleError(`${n.fn}() works on numbers.`);
      return 'number';
    }
  }
}

export interface EvalContext {
  vars: Record<string, Prisma.Decimal>;
  /** prorate(x): x × payable days ÷ period days on the group's day basis. */
  prorate?: (x: Prisma.Decimal) => Prisma.Decimal;
  statutory?: (fn: StatutoryFn) => Prisma.Decimal;
}

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const truth = (x: Prisma.Decimal | boolean) => (typeof x === 'boolean' ? x : !x.isZero());

/** Evaluates a checked tree with Decimal. Never throws on a checked tree except for a division by zero (named). */
export function evaluate(n: Node, ctx: EvalContext): Prisma.Decimal | boolean {
  switch (n.k) {
    case 'num':
      return D(n.v);
    case 'var': {
      const v = ctx.vars[n.name];
      if (v === undefined) throw new RuleError(`"${n.name}" has no value yet.`);
      return v;
    }
    case 'neg':
      return (evaluate(n.a, ctx) as Prisma.Decimal).neg();
    case 'not':
      return !truth(evaluate(n.a, ctx));
    case 'bin': {
      if (n.op === 'and') return truth(evaluate(n.a, ctx)) && truth(evaluate(n.b, ctx));
      if (n.op === 'or') return truth(evaluate(n.a, ctx)) || truth(evaluate(n.b, ctx));
      const a = evaluate(n.a, ctx) as Prisma.Decimal;
      const b = evaluate(n.b, ctx) as Prisma.Decimal;
      switch (n.op) {
        case '+':
          return a.add(b);
        case '-':
          return a.sub(b);
        case '*':
          return a.mul(b);
        case '/':
          if (b.isZero()) throw new RuleError('The formula divides by zero.');
          return a.div(b);
        case '<':
          return a.lt(b);
        case '<=':
          return a.lte(b);
        case '>':
          return a.gt(b);
        case '>=':
          return a.gte(b);
        case '==':
          return a.eq(b);
        default:
          return !a.eq(b);
      }
    }
    case 'call': {
      if (n.fn === 'if') return truth(evaluate(n.args[0], ctx)) ? evaluate(n.args[1], ctx) : evaluate(n.args[2], ctx);
      if ((STATUTORY_FUNCTIONS as readonly string[]).includes(n.fn)) {
        if (!ctx.statutory) throw new RuleError(`${n.fn}() is worked out by the payroll run.`);
        return ctx.statutory(n.fn as StatutoryFn);
      }
      const args = n.args.map((a) => evaluate(a, ctx) as Prisma.Decimal);
      switch (n.fn) {
        case 'min':
          return Prisma.Decimal.min(...args);
        case 'max':
          return Prisma.Decimal.max(...args);
        case 'round': {
          const step = args[1] ?? D(1);
          if (step.lte(0)) throw new RuleError('round() steps by more than zero.');
          return args[0].div(step).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(step);
        }
        case 'floor':
          return args[0].floor();
        case 'ceil':
          return args[0].ceil();
        case 'abs':
          return args[0].abs();
        default:
          return ctx.prorate ? ctx.prorate(args[0]) : args[0];
      }
    }
  }
}

/** Order lines so each comes after what it reads; a loop is refused, naming its members (§7.3). */
export function dependencyOrder(lines: { code: string; uses: readonly string[] }[]): string[] {
  const codes = new Set(lines.map((l) => l.code));
  const deps = new Map(lines.map((l) => [l.code, l.uses.filter((u) => codes.has(u) && u !== l.code)]));
  for (const l of lines) if (l.uses.includes(l.code)) throw new RuleError(`${l.code} uses itself.`);
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (c: string, path: string[]) => {
    if (state.get(c) === 'done') return;
    if (state.get(c) === 'visiting') {
      const loop = [...path.slice(path.indexOf(c)), c];
      throw new RuleError(`These components depend on each other in a loop: ${loop.join(' → ')}.`);
    }
    state.set(c, 'visiting');
    for (const d of deps.get(c) ?? []) visit(d, [...path, c]);
    state.set(c, 'done');
    order.push(c);
  };
  for (const l of lines) visit(l.code, []);
  return order;
}
