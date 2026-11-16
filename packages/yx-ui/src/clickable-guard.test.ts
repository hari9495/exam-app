import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import KNOWN from './clickable-guard.known.json';

// Founder rule 5 (BUILD-STANDARD): clickable must look clickable. A kit class people press (it sets `cursor: pointer`
// or has a :hover rule) shows it at rest: a border, a fill, a shadow or an underline. Accepted patterns are named in
// ACCEPTED with the founder's reason; today's other gaps are in clickable-guard.known.json, which may only shrink.

const SRC = __dirname;
const cssFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });

type Rule = { file: string; selector: string; decl: Record<string, string> };
const rules: Rule[] = cssFiles(SRC).flatMap((f) => {
  const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const file = relative(SRC, f).replace(/\\/g, '/');
  return [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].flatMap(([, sels, body]) => {
    const decl = Object.fromEntries(body.split(';').filter((d) => d.includes(':')).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));
    return sels.split(',').map((selector) => ({ file, selector: selector.trim(), decl }));
  });
});

const NONE = /^(none|0|0px|transparent|initial|unset)\b/;
const LOOK = ['border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-width', 'background', 'background-color', 'box-shadow', 'outline'];
/** A rule that shows something at rest (not on hover or focus). */
export const looksClickable = (decl: Record<string, string>) =>
  Object.entries(decl).some(([k, v]) => (LOOK.includes(k) && !NONE.test(v)) || (/^text-decoration(-line)?$/.test(k) && v.includes('underline')));

/** "file class" of every kit class people press. */
const pressable = [...new Set(rules.flatMap((r) => {
  const m = /^(\.yx-[\w-]+)/.exec(r.selector);
  return m && (r.decl.cursor === 'pointer' || r.selector.endsWith(':hover')) ? [`${r.file} ${m[1]}`] : [];
}))].sort();
const bare = pressable.filter((k) => {
  const [file, cls] = k.split(' ');
  return !rules.some((r) => r.file === file && r.selector === cls && looksClickable(r.decl));
});

/** Accepted patterns, with the founder's reason. */
const ACCEPTED: Record<string, string> = {
  // Founder answer 1994 (16 Nov 2026): the left menu is the accepted pattern.
  'components/shell.css .yx-rail__item': 'left menu (area rail): the icon and label say it is a menu; hover and the current page show a fill',
  'components/shell.css .yx-panel__link': 'left menu (area links): a list of page names in the side menu; hover and the current page show a fill',
  'components/shell.css .yx-panel__group-label': 'left menu (group heading that folds): part of the same side menu pattern',
};

describe('clickable must look clickable (kit CSS)', () => {
  it('every pressable kit class has a border, fill, shadow or underline at rest, unless accepted or already known', () => {
    const known = new Set(KNOWN as string[]);
    expect(bare.filter((k) => !(k in ACCEPTED) && !known.has(k))).toEqual([]);
  });

  it('the known list only shrinks: each entry is still a gap (remove the ones you fixed)', () => {
    expect((KNOWN as string[]).filter((k) => !bare.includes(k))).toEqual([]);
  });

  it('each accepted pattern still exists, has a reason and still needs the exception', () => {
    for (const [k, why] of Object.entries(ACCEPTED)) {
      expect([k, bare.includes(k)]).toEqual([k, true]);
      expect(why.length).toBeGreaterThan(20);
    }
  });

  it('negative: a pressable rule with only a transparent background, no border and no underline does not look clickable', () => {
    expect(looksClickable({ background: 'transparent', border: '0', 'text-decoration': 'none', cursor: 'pointer' })).toBe(false);
    expect(looksClickable({ border: '1px solid var(--yx-color-border-input)' })).toBe(true);
    expect(looksClickable({ 'text-decoration': 'underline' })).toBe(true);
  });
});
