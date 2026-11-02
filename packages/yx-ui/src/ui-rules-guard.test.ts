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
// Widened 2 Nov 2026 to Pay, People and Ops (designs included: the live pages render them).
const AREAS = ['time', 'desk', 'pay', 'people', 'ops'];

/** Allowed, with the reason. Matched against "file: text of the offending tag". */
const ALLOWED: Record<string, string> = {
  'time/leave-admin.tsx: <InlineAlert tone="success" title={postedTitle} actions={postedActions}>': 'runs in the background, so it stays until the balances update (founder approved)',
  'desk/esm2.tsx: <InlineAlert tone="success" title="Done">': 'the one-time approval link page: the result is all the page shows, so it stays',
  "people/changes.tsx: <InlineAlert tone={issues.length ? 'warning' : 'success'} title={issues.length ? `${ready.length} of ${checked":'the import check result for this step: it stays while HR decides whether to import',
  "people/import.tsx: <InlineAlert tone={bad.length ? 'warning' : 'success'} title={bad.length ? `${ready.length} of ${rows.length} ":'the import check result for this step: it stays while HR decides whether to import',
  'pay/comp-setup.tsx: <InlineAlert tone="success" title="Payroll is on for Kaveri Foods Pvt Ltd (Karnataka)" actions={<StoryButton s': 'the end of set-up: the page now is the result, with the next step (Open runs), so it stays',
  'pay/comp-setup.tsx: <InlineAlert tone="success" title="Set-up saved" actions={ <> <StoryButton size="sm" to={PAY_HOME}> Open payro': 'the end of set-up: the page now is the result, with the next steps, so it stays',
  "pay/employee-pay.tsx: <InlineAlert tone={F12B_STATE[sub.status].tone === 'danger' ? 'danger' : sub.status === 'approved' ? 'success'": 'the Form 12B status from the server (accepted, sent back, waiting), not a done message: it stays while it is true',
  'pay/offcycle.tsx: <InlineAlert tone="success" title={`Journal posted · ${JOURNAL_REF}`} actions={ <Button size="sm" onClick={() ': 'holds Reverse posting: the action must stay reachable after the journal is posted',
  'ops/cases.tsx: <InlineAlert tone="success" title="Your report is filed">': 'the filing-result page of an anonymous report: the result is all the page shows, so it stays',
  'ops/cases.tsx: <InlineAlert tone="success" title="Grievance GRV-0146 is filed">': 'the filing-result page of a grievance: it carries the reference and where to follow it, so it stays',
  'ops/posh.tsx: <InlineAlert tone="success" title="Your complaint is with the Internal Committee">': 'the filing-result page of a POSH complaint: it carries the reference and who can see it, so it stays',
};
/** Owned by another builder (Me, Approvals, Settings, portals) at the time; move them over there. A stale line fails. */
const OTHER_BUILDER: string[] = [];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(p) ? [p] : [];
  });
const rel = (f: string) => relative(SCREENS, f).replace(/\\/g, '/');
// Performance (PRF-01 … 06, 3 Nov 2026): the live parts of the growth designs. The older growth design prototypes are
// not covered yet (widen as each Performance screen goes live).
const FILES = ['growth/perf-goals-live.tsx', 'growth/perf-reviews-live.tsx'];
const SOURCES = [...AREAS.flatMap((a) => files(join(SCREENS, a))), ...FILES.map((f) => join(SCREENS, f))];

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

describe('UI rules guard (Time, Helpdesk, Pay, People, Ops)', () => {
  it('(a) no success-tone inline alert: say done with a toast', () => {
    expect(tagsWith(['InlineAlert'], 'tone', (v) => v.includes('success'))).toEqual([]);
  });

  it('(b) no disabled Button or IconButton: pressed too early it says why; busy uses `loading`', () => {
    expect(tagsWith(['Button', 'IconButton'], 'disabled', () => true)).toEqual([]);
  });

  it('the allow lists are not stale', () => {
    const all = SOURCES.map(rel);
    for (const o of OTHER_BUILDER) expect(all, o).toContain(o);
    for (const k of Object.keys(ALLOWED)) expect(readFileSync(join(SCREENS, k.split(': ')[0]!), 'utf8').replace(/\s+/g, ' ')).toContain(k.slice(k.indexOf(': ') + 2));
  });
});

// The raw-table count for People and the T9 portal moved into kit-guard.test.ts (every raw element, every area).
