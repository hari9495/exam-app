import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'forms.css'), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('select.css', () => {
  it('a Select is never wider than a form, so page-wide pickers do not stretch across the screen', () => {
    const select = readFileSync(join(__dirname, 'select.css'), 'utf8').match(/^\.yx-select \{([^}]*)\}/m)?.[1] ?? '';
    expect(select).toContain('max-width: var(--yx-form-max);');
  });
});

describe('data.css', () => {
  it('in a table row that opens something, the person reads as a link before any hover', () => {
    const data = readFileSync(join(__dirname, 'data.css'), 'utf8');
    expect(data).toMatch(/^\.yx-table tbody tr\[data-clickable\] \.yx-person__name \{[^}]*color: var\(--yx-color-link\);[^}]*text-decoration: underline;/m);
  });

  // Lead walk-through 29 Oct 2026 (TIM-30 at 1278 x 635): each full-width Select took its own line, so three filters
  // stacked and pushed the table down to 3 rows. Filters share one row; Columns / density stay on it at the right.
  it('table toolbar filters sit in one row: content-sized selects, a left box that wraps, controls at the top right', () => {
    const data = readFileSync(join(__dirname, 'data.css'), 'utf8');
    const rule = (sel: string) => data.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
    expect(rule('.yx-table__toolbar .yx-select')).toContain('width: auto;');
    expect(rule('.yx-table__toolbar-left')).toContain('flex: 1 1 0;');
    expect(rule('.yx-table__toolbar-left')).not.toContain('min-width: 0');
    expect(rule('.yx-table__controls')).toContain('align-self: flex-start;');
  });
});

describe('forms.css', () => {
  it('every Segment option looks like a button before a choice: a control border, not transparent', () => {
    const option = rule('.yx-segment > button');
    expect(option).toContain('solid var(--yx-color-border-input)');
    expect(option).not.toMatch(/background: transparent|solid transparent/);
  });
});
