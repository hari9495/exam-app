import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// PAY-1.12 (US-E-347, P21 YX-GLB-16, M03-BUILD-DESIGN §16.1 "No country constants"): every legal figure (rates, slabs,
// ceilings, caps, due days) comes from a P07 rule set with its source, version and verify flag, never from code. This
// scan fails CI when payroll, statutory or time code carries one. A line is flagged when it
//   (a) holds a figure Indian payroll law is known for (wage ceilings, contribution rates, tax slabs), or
//   (b) names a statute or levy and a figure on the same line.
// A real need for an exception goes in ALLOWED with the reason (file:line text must match).

const ROOT = join(__dirname);
const DIRS = ['payroll', 'statutory', 'time'];

/** Figures that are law somewhere in India: PF / ESI ceilings, EPS / PF / ESI rates, PT caps, tax slabs and rebates. */
const KNOWN = /(?<![\w.])(15000|15_000|21000|21_000|25000|25_000|1800|1_800|1250|1_250|2500|2_500|250000|250_000|300000|300_000|400000|400_000|500000|500_000|700000|700_000|1200000|1_200_000|1275000|1_275_000|50000|50_000|75000|75_000|0\.12|0\.0325|0\.0075|0\.0833|0\.0367|8\.33|3\.67|3\.25|0\.75|0\.04)(?![\w.])/;
/** Statutes and levies by name (word boundaries; case-insensitive). */
const STATUTE = /\b(pf|epf|eps|edli|esi|esic|uan|professional[\s_-]?tax|ptax|lwf|labour[\s_-]?welfare|tds|tcs|cess|surcharge|rebate|gratuity|bonus|minimum[\s_-]?wage|wage[\s_-]?ceiling|basic[\s_-]?ceiling|slab|ceiling)\b/i;
/** A number that could be a legal figure: 3+ digits, or a decimal (a rate). Times and sizes have their own names. */
const FIGURE = /(?<![\w.$'"`-])(\d{3,}(_\d{3})*|\d+\.\d+)(?![\w.'"`])/;

const ALLOWED: { file: string; text: string; why: string }[] = [];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [p] : [];
  });
}

/** Comments and string literals are prose (labels, messages, sources), not code: blanked before the scan. */
function codeOnly(line: string): string {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
    .replace(/^\s*\*.*$/, '')
    .replace(/\/\*.*?\*\//g, '');
}

export function scan(text: string): number[] {
  return text.split(/\r?\n/).flatMap((raw, i) => {
    const line = codeOnly(raw);
    return KNOWN.test(line) || (STATUTE.test(line) && FIGURE.test(line)) ? [i + 1] : [];
  });
}

describe('no country constants in code (PAY-1.12, YX-GLB-16)', () => {
  it('payroll, statutory and time code carry no legal figures', () => {
    const found: string[] = [];
    for (const dir of DIRS) {
      let list: string[] = [];
      try {
        list = files(join(ROOT, dir));
      } catch {
        continue; // statutory/ arrives in batch 5b
      }
      for (const f of list) {
        const lines = readFileSync(f, 'utf8').split(/\r?\n/);
        for (const n of scan(lines.join('\n'))) {
          const rel = relative(ROOT, f).replace(/\\/g, '/');
          if (ALLOWED.some((a) => a.file === rel && lines[n - 1].includes(a.text))) continue;
          found.push(`${rel}:${n}: ${lines[n - 1].trim().slice(0, 120)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('catches a hard-coded ceiling, rate or a statute next to a figure, and leaves prose alone', () => {
    expect(scan('const PF_WAGE_LIMIT = 15000;')).toEqual([1]);
    expect(scan('const rate = new Decimal(0.12);')).toEqual([1]);
    expect(scan('if (esi) wage = Math.min(wage, 176);')).toEqual([1]);
    expect(scan('const esiCap = 176_00;')).toEqual([]);
    expect(scan('const ptMax = slab.max ?? 208;')).toEqual([1]);
    expect(scan("throw new Error('PF is 12% up to 15000');")).toEqual([]);
    expect(scan('// the ESI ceiling is 21000 (P07 IN.ESI)')).toEqual([]);
    expect(scan('const timeoutMs = 60_000;')).toEqual([]);
  });
});
