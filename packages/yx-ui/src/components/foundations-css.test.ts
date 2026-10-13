import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./foundations.css', import.meta.url)), 'utf8');

describe('foundations.css', () => {
  it('the paragraph margin reset stays at zero specificity, so screen classes can space a <Text as="p">', () => {
    expect(css).toContain(':where(p.yx-text) { margin: 0; }');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/(^|[\s,}])p\.yx-text\b/); // a bare p.yx-text beats .yx-acc__note and drops its margin
  });
});
