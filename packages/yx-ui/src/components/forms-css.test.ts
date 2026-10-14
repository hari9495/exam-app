import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'forms.css'), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

describe('forms.css', () => {
  it('every Segment option looks like a button before a choice: a control border, not transparent', () => {
    const option = rule('.yx-segment > button');
    expect(option).toContain('solid var(--yx-color-border-input)');
    expect(option).not.toMatch(/background: transparent|solid transparent/);
  });
});
