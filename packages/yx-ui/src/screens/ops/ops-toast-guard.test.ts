import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Founder answer 802 (Contract labour walk): done messages in the ops areas are success toasts. Every toast in
// screens/ops names its tone, and a message shown after an action succeeds (inside .then) uses done(), never the
// neutral say(). The lists below may only shrink.
const DIR = __dirname;
const files = readdirSync(DIR).filter((f) => f.endsWith('.tsx') && !f.includes('.test.') && !f.includes('.stories.'));

/** The text of each `toast({ ... })` call (to its closing brace). */
function toastCalls(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf('toast({'); i >= 0; i = src.indexOf('toast({', i + 1)) {
    let depth = 0;
    for (let j = i + 6; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) {
        out.push(src.slice(i, j + 1));
        break;
      }
    }
  }
  return out;
}

describe('ops toasts (answer 802)', () => {
  it('every toast in screens/ops names its tone', () => {
    const missing = files.flatMap((f) => toastCalls(readFileSync(join(DIR, f), 'utf8')).filter((c) => !/\btone:/.test(c)).map((c) => `${f}: ${c.slice(0, 80)}`));
    expect(missing).toEqual([]);
  });

  it('a message after a successful action is done(), not say()', () => {
    const bad = files.flatMap((f) =>
      readFileSync(join(DIR, f), 'utf8')
        .split('\n')
        .map((l, n) => [l, n + 1] as const)
        .filter(([l]) => /\.then\(\s*\(\)\s*=>\s*\(?\s*say\(/.test(l))
        .map(([l, n]) => `${f}:${n}: ${l.trim().slice(0, 80)}`),
    );
    expect(bad).toEqual([]);
  });

  it('the guard finds what it looks for', () => {
    expect(toastCalls("toast({ title: 'x' }); toast({ tone: 'success', title: 'y' })").filter((c) => !/\btone:/.test(c))).toHaveLength(1);
    expect(/\.then\(\s*\(\)\s*=>\s*\(?\s*say\(/.test("p.then(() => say('Saved'))")).toBe(true);
  });
});
