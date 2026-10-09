import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { PAY_VARIABLES, checkFormula, dependencyOrder, evaluate, type Node } from './expressions';

// PAY-2.06: the pay formula language. Allowed words only, typed, limited; Decimal maths; hostile input refused (§16.3).

const names = new Set<string>([...PAY_VARIABLES, 'basic', 'hra', 'special']);
const D = (x: string | number) => new Prisma.Decimal(x);
const run = (text: string, vars: Record<string, string> = {}) => evaluate(checkFormula(text, names).ast, { vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, D(v)])) });

describe('pay formulas (§7.2)', () => {
  it('works out money with Decimal, functions and conditions', () => {
    expect((run('round(min(basic * 0.12, 1800))', { basic: '20000' }) as Prisma.Decimal).toFixed(2)).toBe('1800.00');
    expect((run('monthly_ctc * 0.4', { monthly_ctc: '60500' }) as Prisma.Decimal).toFixed(2)).toBe('24200.00');
    expect((run('if(basic > 15000 and not (age >= 58), 1, 0)', { basic: '20000', age: '30' }) as Prisma.Decimal).toFixed(0)).toBe('1');
    expect((run('0.1 + 0.2', {}) as Prisma.Decimal).toString()).toBe('0.3');
    expect((run('round(basic, 10)', { basic: '1234.5' }) as Prisma.Decimal).toFixed(0)).toBe('1230');
  });

  it('says in plain words which word is not allowed', () => {
    expect(() => checkFormula('salary * 2', names)).toThrow(/"salary" is not allowed/);
    expect(() => checkFormula('basic.constructor', names)).toThrow(/A dot or brackets is not allowed/);
    expect(() => checkFormula('basic["x"]', names)).toThrow(/not allowed/);
    expect(() => checkFormula("'text'", names)).toThrow(/only numbers/);
    expect(() => checkFormula('this', names)).toThrow(/not allowed/);
    expect(() => checkFormula('eval(basic)', names)).toThrow(/"eval" is not allowed/);
    expect(() => checkFormula('basic > 1 ? 1 : 0', names)).toThrow(/if\(condition/);
    expect(() => checkFormula('basic % 2', names)).toThrow(/"%" is not allowed/);
    expect(() => checkFormula('__proto__', names)).toThrow(/not allowed/);
    expect(() => checkFormula('basic and 1', names)).toThrow(/yes-or-no/);
    expect(() => checkFormula('pf_employee(basic)', names)).toThrow(/takes nothing/);
    expect(() => checkFormula('x'.repeat(501), names)).toThrow(/500 characters/);
    expect(() => checkFormula('abs('.repeat(25) + 'basic' + ')'.repeat(25), names)).toThrow(/too deeply/);
  });

  it('records what a formula reads and which statutory amounts it uses', () => {
    const c = checkFormula('basic + hra + pf_employer()', names);
    expect(c.uses.sort()).toEqual(['basic', 'hra']);
    expect(c.statutory).toEqual(['pf_employer']);
    expect(c.type).toBe('number');
  });

  it('names the components of a loop and orders the rest', () => {
    expect(dependencyOrder([{ code: 'special', uses: ['basic', 'hra'] }, { code: 'hra', uses: ['basic'] }, { code: 'basic', uses: ['monthly_ctc'] }])).toEqual(['basic', 'hra', 'special']);
    expect(() => dependencyOrder([{ code: 'basic', uses: ['hra'] }, { code: 'hra', uses: ['special'] }, { code: 'special', uses: ['basic'] }])).toThrow(/basic → hra → special → basic/);
  });

  it('property: a checked tree never throws on numbers (except a named division by zero), and hostile text is refused', () => {
    const leaf = fc.oneof(fc.integer({ min: -1000, max: 1000 }).map((n) => `${Math.abs(n)}`), fc.constantFrom('basic', 'hra', 'ctc'));
    const expr: fc.Arbitrary<string> = fc.letrec((tie) => ({
      e: fc.oneof({ depthSize: 'small' }, leaf, fc.tuple(tie('e'), fc.constantFrom('+', '-', '*', '/'), tie('e')).map(([a, o, b]) => `(${a} ${o} ${b})`), fc.tuple(tie('e'), tie('e')).map(([a, b]) => `max(${a}, ${b})`)),
    })).e as fc.Arbitrary<string>;
    fc.assert(
      fc.property(expr, (text) => {
        let ast: Node;
        try {
          ast = checkFormula(text, names).ast;
        } catch {
          return true; // too long / too deep: refused, fine
        }
        try {
          evaluate(ast, { vars: { basic: D(1), hra: D(2), ctc: D(3) } });
          return true;
        } catch (e) {
          return /divides by zero/.test((e as Error).message);
        }
      }),
      { numRuns: 300 },
    );
    fc.assert(fc.property(fc.constantFrom('constructor', 'process.exit()', 'require("fs")', 'globalThis', '[1,2]', '`x`', 'a = 1', 'new Date()'), (bad) => {
      try {
        checkFormula(bad, names);
        return false;
      } catch {
        return true;
      }
    }));
  });
});
