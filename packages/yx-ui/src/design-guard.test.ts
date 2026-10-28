import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Founder 28 Oct 2026: live must never drift from the design. (a) every component a YukthiX page renders from
// @yukthix/ui has a design story; (b) no "LiveX" screen duplicates a designed X outside the designed X's own `live`
// path; (c) report the designed People screens no live page uses.

const UI = join(__dirname, '..');
const WEB = join(UI, '../../apps/web/app/yx');
const WEB_LIB = join(UI, '../../apps/web/lib');
const SCREENS = join(UI, 'src/screens');

const files = (dir: string, ok: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : files(p, ok)) : ok(p) ? [p] : [];
  });
const parse = (f: string) => ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (n: ts.Node, fn: (n: ts.Node) => void) => {
  fn(n);
  n.forEachChild((c) => walk(c, fn));
};
/** The JSX tag names a file renders (<Name …>). */
function rendered(src: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  walk(src, (n) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName)) out.add(n.tagName.text);
  });
  return out;
}
const rel = (f: string) => relative(join(UI, '../..'), f).replace(/\\/g, '/');

const STORIES = files(join(UI, 'src'), (f) => f.endsWith('.stories.tsx'));
const SOURCES = files(SCREENS, (f) => f.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(f));
/** Each component in the package (a function, or a const arrow) and the tags it renders. */
const RENDERS = new Map<string, Set<string>>();
for (const f of files(join(UI, 'src'), (p) => p.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(p)))
  walk(parse(f), (n) => {
    const name = ts.isFunctionDeclaration(n) && n.name ? n.name.text : ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) ? n.name.text : null;
    if (name && /^[A-Z]/.test(name)) RENDERS.set(name, new Set([...(RENDERS.get(name) ?? []), ...rendered(n as ts.SourceFile)]));
  });
/** Designed: rendered by a story, or inside something a story renders (a primitive inside a designed screen). */
const IN_STORIES = new Set(STORIES.flatMap((f) => [...rendered(parse(f))]));
for (const todo = [...IN_STORIES]; todo.length; )
  for (const c of RENDERS.get(todo.pop()!) ?? [])
    if (!IN_STORIES.has(c)) {
      IN_STORIES.add(c);
      todo.push(c);
    }

// Known gaps when the guard came in (28 Oct 2026): live pages that render a component no story shows. Each needs a
// design story (or the designed screen instead); remove the line when it has one. A stale line fails the test too.
const KNOWN_UNDESIGNED: Record<string, string[]> = {
  'Me: live screens with no design yet': [
  ],
  'Other live screens with no design yet (approvals, performance, settings, portals)': [
    'ApprovalsScreen @ (app)/approvals/page.tsx',
    'ChannelLinksCard @ (app)/approvals/page.tsx',
    'IdentityProvidersScreen @ (app)/settings/identity-providers/page.tsx',
    'ActionLinkScreen @ act/[token]/page.tsx',
  ],
};

describe('design guard', () => {
  it('(a) every @yukthix/ui component a YukthiX page renders has a design story', () => {
    const missing: string[] = [];
    for (const f of [WEB, WEB_LIB].flatMap((d) => files(d, (p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx')))) {
      const src = parse(f);
      const fromUi = new Set<string>();
      for (const s of src.statements)
        if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier) && s.moduleSpecifier.text.startsWith('@yukthix/ui') && !s.importClause?.isTypeOnly) {
          const named = s.importClause?.namedBindings;
          if (named && ts.isNamedImports(named)) for (const e of named.elements) if (!e.isTypeOnly) fromUi.add(e.name.text);
        }
      for (const name of rendered(src)) if (fromUi.has(name) && !IN_STORIES.has(name)) missing.push(`${name} @ ${rel(f).replace('apps/web/app/yx/', '').replace('apps/web/', '')}`);
    }
    const known = new Set(Object.values(KNOWN_UNDESIGNED).flat());
    expect(missing.filter((m) => !known.has(m)), 'A live page renders a screen or control no story shows (component @ page). Add a story that renders it, or render the designed screen instead.').toEqual([]);
    expect([...known].filter((k) => !missing.includes(k)), 'These now have a design (or are gone): remove them from KNOWN_UNDESIGNED.').toEqual([]);
  });

  // Live twins that are not reached through their designed export, kept on purpose (one line each).
  const LIVE_ALLOWED: Record<string, string> = {};

  it('(b) a "LiveX" component is only the designed X\'s own live path, never a second copy of X', () => {
    const found: string[] = [];
    for (const f of SOURCES) {
      const src = parse(f);
      const fns = new Map<string, ts.Node>();
      walk(src, (n) => {
        if (ts.isFunctionDeclaration(n) && n.name) fns.set(n.name.text, n);
      });
      for (const [name] of fns) {
        const designed = name.slice(4);
        if (!/^Live[A-Z]/.test(name) || !fns.has(designed) || LIVE_ALLOWED[name]) continue;
        // Allowed: the designed X itself renders <LiveX> (its `live` path) and nothing else in the file does.
        const users = [...fns].filter(([other, node]) => other !== name && rendered(node as unknown as ts.SourceFile).has(name)).map(([other]) => other);
        if (users.length !== 1 || users[0] !== designed) found.push(`${rel(f)}: ${name} copies the designed ${designed} (rendered from ${users.join(', ') || 'nowhere'}); render ${designed} with \`live\` instead`);
      }
    }
    expect(found, 'A Live* component duplicates a designed screen.').toEqual([]);
  });

  it('(c) reports the designed People screens no live page uses (report only)', () => {
    const web = [WEB, WEB_LIB].flatMap((d) => files(d, (p) => p.endsWith('.tsx'))).map((f) => readFileSync(f, 'utf8')).join('\n');
    const people = SOURCES.filter((f) => f.includes(`${join('screens', 'people')}`));
    const inScreens = new Set(people.flatMap((f) => [...rendered(parse(f))]));
    const unused: string[] = [];
    for (const f of people)
      for (const s of parse(f).statements)
        if (ts.isFunctionDeclaration(s) && s.name && s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
          const name = s.name.text;
          if (IN_STORIES.has(name) && !inScreens.has(name) && !new RegExp(`\\b${name}\\b`).test(web)) unused.push(`${rel(f)}: ${name}`);
        }
    if (unused.length) console.info(`Designed People screens no live page uses (${unused.length}):\n  ${unused.join('\n  ')}`);
    expect(Array.isArray(unused)).toBe(true);
  });
});
