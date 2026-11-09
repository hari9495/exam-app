import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

// Question 125 (4 Nov 2026): a virus scan started inside the database transaction that stores the file may not see the
// file row (it is not committed yet); the file then stays "being checked" until the hourly sweep. Every upload starts the
// scan after the commit. This guard fails when a FilesService scan (`files.scan(` / `sharedFiles.scan(`) is called
// lexically inside a transaction callback (`this.tx(…)`, `forTenant(…)`, `inCompany(…)`, `$transaction(…)`,
// `deskSystem(…)`) or inside any function that takes the transaction as a parameter named `tx`.

const TX_CALLS = new Set(['tx', 'forTenant', 'inCompany', '$transaction', 'deskSystem']);

const calleeName = (call: ts.CallExpression): string | null => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
};
const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n);

/** Lines (1-based) where a files scan runs inside a transaction. */
export function scansInsideTx(source: string, fileName = 'x.ts'): number[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: number[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['scan', 'scanResume'].includes(n.expression.name.text)) {
      const target = n.expression.expression;
      const files = ts.isPropertyAccessExpression(target) ? target.name.text : ts.isIdentifier(target) ? target.text : '';
      // scanResume: the public careers apply (T9-09) scans the stored résumé after the commit too.
      if (files === 'files' || files === 'sharedFiles' || n.expression.name.text === 'scanResume') {
        for (let a: ts.Node | undefined = n.parent; a; a = a.parent) {
          if (!isFn(a)) continue;
          const takesTx = a.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === 'tx');
          const insideTxCall = ts.isCallExpression(a.parent) && a.parent.arguments.includes(a as ts.Expression) && TX_CALLS.has(calleeName(a.parent) ?? '');
          if (takesTx || insideTxCall) {
            out.push(sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
            break;
          }
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

const SRC = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
  });

describe('virus scan after the commit (question 125)', () => {
  it('flags a scan inside a transaction callback or a function taking tx; allows one after the commit', () => {
    expect(scansInsideTx(`class S { a() { return this.tx(ctx, async (tx, c) => { const f = 1; void this.files.scan(o, f.id); return f; }); } }`)).toEqual([1]);
    expect(scansInsideTx(`function attach(tx: Tx) {\n  void this.files.scan(o, id);\n}`)).toEqual([2]);
    expect(scansInsideTx(`const r = await this.tenantPrisma.forTenant(c, async (tx) => { if (x) { void this.sharedFiles.scan(o, id); } });`)).toEqual([1]);
    expect(scansInsideTx(`const out = await this.tx(ctx, async (tx) => ({ id: 1 }));\nvoid this.files.scan(o, out.id);`)).toEqual([]);
    expect(scansInsideTx(`return this.tx(ctx, async (tx) => ({ id: 1 })).then((r) => { void this.files.scan(o, r.id); return r; });`)).toEqual([]);
    expect(scansInsideTx(`await this.tenantPrisma.forTenant(c, async (tx) => { void this.scanResume(o, id, p, buf); });`)).toEqual([1]);
    expect(scansInsideTx(`const r = await this.tenantPrisma.forTenant(c, async (tx) => 1);
void this.scanResume(o, id, p, buf);`)).toEqual([]);
    // Other things called scan (Redis, the scanner itself) are not this rule.
    expect(scansInsideTx(`await this.tx(ctx, async (tx) => { await this.redis.scan(0); await this.scanner.scan(buf); });`)).toEqual([]);
  });

  it('no upload in the API scans inside its transaction', () => {
    const bad = files(SRC).flatMap((f) => scansInsideTx(readFileSync(f, 'utf8'), f).map((line) => `${relative(SRC, f).replace(/\\/g, '/')}:${line}`));
    expect(bad).toEqual([]);
  });
});
