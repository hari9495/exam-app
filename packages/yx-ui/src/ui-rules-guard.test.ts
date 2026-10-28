import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Founder rules, 28 Oct 2026, for the live Time, Pay and Helpdesk screens:
// (a) success after an action is a toast (5 s), never a green inline alert;
// (b) no greyed-out button: a Button/IconButton never gets `disabled`. Pressed too early it says what is missing;
//     while its own request runs it shows `loading` (the house busy pattern, which blocks a second press).
// Scope: the screens the web app ships for these areas. Other areas (and the older design prototypes) still have
// success alerts in ~90 files; widen AREAS as each area is moved over.

const SCREENS = join(__dirname, 'screens');
// Time: every designed Time file (the live pages render them); its old live copies are gone.
const AREAS = ['time', 'pay/live', 'desk'];

/** Allowed, with the reason. Matched against "file: text of the offending tag". */
const ALLOWED: Record<string, string> = {
  'time/leave-admin.tsx: <InlineAlert tone="success" title={postedTitle} actions={postedActions}>': 'runs in the background, so it stays until the balances update (founder approved)',
};
/** Owned by another builder (Me, Approvals, Settings, portals) at the time; move them over there. A stale line fails. */
const OTHER_BUILDER = ['desk/approvals.tsx', 'desk/portal.tsx'];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(p) ? [p] : [];
  });
const rel = (f: string) => relative(SCREENS, f).replace(/\\/g, '/');
const SOURCES = AREAS.flatMap((a) => files(join(SCREENS, a)));

/** Every JSX tag `name` with an attribute `attr`, as "file: <tag …" (whitespace collapsed, first 110 characters). */
function tagsWith(names: string[], attr: string, test: (value: string) => boolean): string[] {
  const out: string[] = [];
  for (const f of SOURCES) {
    const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && names.includes(n.tagName.getText(src))) {
        const a = n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(src) === attr);
        if (a && test(a.getText(src))) out.push(`${rel(f)}: ${n.getText(src).replace(/\s+/g, ' ').slice(0, 110)}`);
      }
      n.forEachChild(visit);
    };
    visit(src);
  }
  return out.filter((x) => !(x in ALLOWED) && !OTHER_BUILDER.some((o) => x.startsWith(`${o}:`)));
}

describe('UI rules guard (Time, Pay, Helpdesk)', () => {
  it('(a) no success-tone inline alert: say done with a toast', () => {
    expect(tagsWith(['InlineAlert'], 'tone', (v) => v.includes('success'))).toEqual([]);
  });

  it('(b) no disabled Button or IconButton: pressed too early it says why; busy uses `loading`', () => {
    expect(tagsWith(['Button', 'IconButton'], 'disabled', () => true)).toEqual([]);
  });

  it('the allow lists are not stale', () => {
    const all = SOURCES.map(rel);
    for (const o of OTHER_BUILDER) expect(all, o).toContain(o);
    for (const k of Object.keys(ALLOWED)) expect(readFileSync(join(SCREENS, k.split(': ')[0]!), 'utf8')).toContain(k.split(': ')[1]);
  });
});
