import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import KNOWN from './design-live-guard.known.json';

// Founder 28 Oct 2026: "is really all screens matching?" A story of the live screen is not a design. Every screen a
// design story shows must be the screen a live page renders, in every area: (d) no live page renders a screen whose
// only stories are "Live" copies; (e) every designed screen is reached from a live page. Today's gaps are listed in
// design-live-guard.known.json; the lists may only shrink. YX_GUARD_WRITE=1 rewrites the file (only to shrink it).

const UI = join(__dirname, '..');
// app/staff: the YukthiX staff console (console C-1 makes YX-01 to YX-03 live there; founder answer 1059).
// app/(candidate): the candidate's test pages (AS-4a makes PRC-26 and PRC-27 live there).
// app/campus: the college coordinator's read-only view by emailed link (AS-3 part 2 makes PRC-29's coordinator live).
const WEB = [join(UI, '../../apps/web/app/yx'), join(UI, '../../apps/web/app/staff'), join(UI, '../../apps/web/app/(candidate)'), join(UI, '../../apps/web/app/campus'), join(UI, '../../apps/web/lib'), join(UI, '../../apps/web/components/auth')]; // components/auth: the step-up dialog is mounted once in the root layout
const SCREENS = join(UI, 'src/screens');

const files = (dir: string, ok: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' || n === '.next' ? [] : files(p, ok)) : ok(p) ? [p] : [];
  });
const parse = (f: string) => ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (n: ts.Node, fn: (n: ts.Node) => void) => {
  fn(n);
  n.forEachChild((c) => walk(c, fn));
};
/** Capitalised names a node renders as JSX or passes along (component={X}, render: X). */
function used(node: ts.Node): Set<string> {
  const out = new Set<string>();
  walk(node, (n) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName)) out.add(n.tagName.text);
    else if (ts.isIdentifier(n) && /^[A-Z]\w*$/.test(n.text)) out.add(n.text);
  });
  return out;
}
const rel = (f: string) => relative(join(UI, '../..'), f).replace(/\\/g, '/');
const area = (f: string) => rel(f).split('/')[4];

/** Every component of the package (function or const arrow) with what it uses, and where screens are defined. */
const USES = new Map<string, Set<string>>();
const SCREEN_AREA = new Map<string, string>();
// A live/ copy may share its name with a designed screen; which one a page gets is decided by the package export it
// imports, so a name match is no proof. Map "<module>|<Name>" to the file the package index re-exports it from.
const IN_LIVE = new Set<string>();
const OUTSIDE_LIVE = new Set<string>();
const SOURCE = new Map<string, string>();
for (const [sub, idx] of Object.entries(JSON.parse(readFileSync(join(UI, 'package.json'), 'utf8')).exports as Record<string, string>))
  if (idx.endsWith('.ts'))
    for (const st of parse(join(UI, idx)).statements)
      if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) && st.exportClause && ts.isNamedExports(st.exportClause))
        for (const e of st.exportClause.elements) SOURCE.set(`@yukthix/ui${sub.slice(1)}|${(e.propertyName ?? e.name).text}`, rel(join(UI, idx, '..', st.moduleSpecifier.text)));
for (const f of files(join(UI, 'src'), (p) => p.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(p)))
  walk(parse(f), (n) => {
    const name = ts.isFunctionDeclaration(n) && n.name ? n.name.text : ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.name.text : null;
    if (!name || !/^[A-Z]/.test(name)) return;
    USES.set(name, new Set([...(USES.get(name) ?? []), ...used(n)]));
    if (f.startsWith(SCREENS)) SCREEN_AREA.set(name, area(f));
    if (f.startsWith(SCREENS)) (rel(f).includes('/live/') ? IN_LIVE : OUTSIDE_LIVE).add(name);
  });

/** Reached from a live page: rendered by apps/web, or inside something that is. */
const LIVE = new Set<string>();
for (const todo = WEB.flatMap((d) => files(d, (p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx'))).flatMap((f) => [...used(parse(f))]); todo.length; ) {
  const c = todo.pop()!;
  if (LIVE.has(c) || !USES.has(c)) continue;
  LIVE.add(c);
  todo.push(...USES.get(c)!);
}

/** The files the web's own imports resolve to, per name: a live/ file means the page renders the copy. */
const WEB_GETS = new Map<string, Set<string>>();
for (const f of WEB.flatMap((d) => files(d, (p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p))))
  for (const st of parse(f).statements)
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings))
      for (const e of st.importClause.namedBindings.elements) {
        const src = SOURCE.get(`${st.moduleSpecifier.text}|${(e.propertyName ?? e.name).text}`);
        if (src) WEB_GETS.set((e.propertyName ?? e.name).text, new Set([...(WEB_GETS.get((e.propertyName ?? e.name).text) ?? []), src]));
      }
const twin = (n: string) => IN_LIVE.has(n) && OUTSIDE_LIVE.has(n);
const getsCopy = (n: string) => twin(n) && [...(WEB_GETS.get(n) ?? [])].some((f) => f.includes('/live/'));
const getsDesign = (n: string) => !twin(n) || [...(WEB_GETS.get(n) ?? [])].some((f) => !f.includes('/live/'));

/** The screens each design story shows ("Live" titled stories are pictures of the live app, not designs). */
const DESIGNED = new Map<string, string>(); // screen -> story file
const LIVE_COPY = new Set<string>();
for (const f of files(SCREENS, (p) => p.endsWith('.stories.tsx'))) {
  const src = parse(f);
  const title = /title:\s*['"`]([^'"`]+)/.exec(src.text)?.[1] ?? '';
  // A copy's title has a segment that starts with "Live" ("Hiring/Live · ..."); "PRC-13 · Live console" is a design.
  const copy = /\/Live\b/.test(title);
  for (const name of used(src))
    if (!SCREEN_AREA.has(name)) continue;
    else if (copy) LIVE_COPY.add(name);
    else DESIGNED.set(name, rel(f));
}
const isDesigned = (n: string) => DESIGNED.has(n);
/** Story helpers that only show a live screen with sample data (one line each, why). */
const SAMPLE_WRAPPERS: Record<string, string> = {
  PreboardingActionSheet: 'PPL-15: the live journey record with its pre-boarding drawer open, filled with sample people',
  PrefillScreen: 'TIM-43: the timesheet with the pre-fill drawer open, sample data; /yx/time/timesheet renders TimesheetScreen whose PrefillDrawer takes the live tools and suggestions',
};
const reached = (n: string) => (LIVE.has(n) && getsDesign(n)) || n in SAMPLE_WRAPPERS;
/** Only screen-level parts: a story's own top components, not the primitives inside them. */
const top = (n: string) => ![...DESIGNED.keys()].some((o) => o !== n && USES.get(o)?.has(n));

const gaps = {
  liveCopies: [...LIVE].filter((n) => SCREEN_AREA.has(n) && (getsCopy(n) || (!isDesigned(n) && LIVE_COPY.has(n))) && top(n)).map((n) => `${SCREEN_AREA.get(n)}: ${n}`).sort(),
  notLive: [...DESIGNED.keys()].filter((n) => top(n) && !reached(n)).map((n) => `${SCREEN_AREA.get(n)}: ${n}`).sort(),
};

describe('design-live guard', () => {
  if (process.env.YX_GUARD_WRITE) writeFileSync(join(__dirname, 'design-live-guard.known.json'), `${JSON.stringify(gaps, null, 2)}\n`);

  it('(d) no live page renders a screen that only a "Live" copy story shows', () => {
    expect(gaps.liveCopies.filter((g) => !(KNOWN.liveCopies as string[]).includes(g)), 'Render the designed screen (with `live`) instead of a live-only copy.').toEqual([]);
    expect(KNOWN.liveCopies.filter((g) => !gaps.liveCopies.includes(g)), 'Fixed: remove these from design-live-guard.known.json').toEqual([]);
  });

  it('(e) every designed screen is the one a live page renders', () => {
    expect(gaps.notLive.filter((g) => !KNOWN.notLive.includes(g)), 'A designed screen no live page renders.').toEqual([]);
    expect(KNOWN.notLive.filter((g) => !gaps.notLive.includes(g)), 'Now live: remove these from design-live-guard.known.json').toEqual([]);
  });
});
