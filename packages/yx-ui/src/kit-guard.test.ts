import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Rule 18 (founder 30 Oct 2026): screens are built only from the design-system kit. No raw <button>, <input>, <select>,
// <textarea> or <table> in a screen: use Button/IconButton, TextField/NumberField/Select/Checkbox/FileInput, PlainTable
// or DataTable, FilterToggle. A need the kit doesn't cover goes into the kit first. Older screens still hold some, so
// each area has a count that only goes down: when you replace one, lower its number here (the test asks you to).

const SCREENS = join(__dirname, 'screens');
const RAW = ['button', 'input', 'select', 'textarea', 'table'];

/** Allowed for good, with the reason. Matched as "file: start of the tag" (whitespace collapsed); not counted. */
const ALLOWED: Record<string, string> = {
  'time/field.tsx: <button key={i} type="button" aria-label={k === \'del\' ? \'Delete\' : k}': 'the field-app number keypad: big square keys in a grid, no kit part fits',
  'time/kiosk-live.tsx: <button key={i} type="button" aria-label={k === \'del\' ? \'Delete\' : k}': 'the kiosk number keypad: big square keys in a grid, no kit part fits',
  'pay/pay-kit.tsx: <button type="button" className="yx-pay-why__row"': 'a clickable explanation row (the whole line opens its working), not a button look',
  'pay/comp-setup.tsx: <button type="button" className="yx-pay-why__row"': 'a clickable explanation row (picks the line to explain), not a button look',
  'pay/comp-setup-live.tsx: <button type="button" className="yx-pay-why__row"': 'a clickable explanation row (picks the line to explain), not a button look',
  'ops/contract.tsx: <button type="button" className="yx-ops-cellbtn"': 'the vendor compliance status cell: the status badge in the grid opens its verification',
  'auth/sign-in.tsx: <button type="button" onClick={props.onRetryOptions}>': 'inside the kit Link (asChild): a link-styled "Try again" that runs an action instead of going to a page',
};

/** Allowed by pattern, with the reason (same shape in many screens). */
const ALLOWED_RULES: { why: string; test: (tag: string) => boolean }[] = [
  {
    why: 'a hidden file input behind a kit Button: the Button opens the file picker, the input only receives the file',
    test: (t) => /^\S+: <input\b[^>]* type="file"[^>]* hidden[\s>/]/.test(t),
  },
];

/** Raw elements still left per area, outside ALLOWED. Only goes down. */
const LEFT: Record<string, number> = {
  desk: 22,
  expenses: 0,
  growth: 11,
  hiring: 7,
  history: 0,
  notifications: 1,
  ops: 0,
  pay: 2,
  people: 3,
  'platform-a': 9,
  'platform-b': 1,
  portals: 17,
  proctoring: 20,
  settings: 6,
  time: 16,
};

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') && !/\.(stories|test)\.tsx$/.test(p) ? [p] : [];
  });
const rel = (f: string) => relative(SCREENS, f).replace(/\\/g, '/');

/** Every raw tag in the screens, as "file: <tag …" (whitespace collapsed). */
function rawTags(): string[] {
  const out: string[] = [];
  for (const f of files(SCREENS)) {
    const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && RAW.includes(n.tagName.getText(src))) {
        out.push(`${rel(f)}: ${n.getText(src).replace(/\s+/g, ' ')}`);
      }
      n.forEachChild(visit);
    };
    visit(src);
  }
  return out;
}

describe('kit guard (rule 18): screens use the kit, not raw elements', () => {
  const tags = rawTags();
  const allowed = (t: string) => Object.keys(ALLOWED).some((k) => t.startsWith(k)) || ALLOWED_RULES.some((r) => r.test(t));

  it('each area has no more raw <button>/<input>/<select>/<textarea>/<table> than its count, and the count is current', () => {
    const now: Record<string, number> = {};
    for (const t of tags.filter((x) => !allowed(x))) {
      const area = t.split('/')[0]!;
      now[area] = (now[area] ?? 0) + 1;
    }
    for (const area of new Set([...Object.keys(now), ...Object.keys(LEFT)])) {
      const n = now[area] ?? 0;
      const max = LEFT[area] ?? 0;
      expect(n, `${area}: ${n} raw elements; use the kit (or add the need to the kit first)`).toBeLessThanOrEqual(max);
      expect(n, `${area}: down to ${n}, lower LEFT['${area}'] in kit-guard.test.ts`).toBe(max);
    }
  });

  it('every allowed exception still exists and has a reason', () => {
    for (const [k, why] of Object.entries(ALLOWED)) {
      expect(tags.some((t) => t.startsWith(k)), k).toBe(true);
      expect(why.length).toBeGreaterThan(10);
    }
    for (const r of ALLOWED_RULES) expect(tags.some(r.test), r.why).toBe(true);
  });

  it('the on/off filter chip is the kit FilterToggle, never a copy', () => {
    for (const f of files(SCREENS)) expect(readFileSync(f, 'utf8'), rel(f)).not.toContain('chip--toggle');
  });

  it('the rehire impact, Privacy and postpone tables stay on PlainTable', () => {
    expect(readFileSync(join(SCREENS, 'people', 'onboarding.tsx'), 'utf8').match(/<PlainTable/g)?.length).toBeGreaterThanOrEqual(3);
    expect(readFileSync(join(SCREENS, 'people', 'selfservice.tsx'), 'utf8').match(/<PlainTable/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
