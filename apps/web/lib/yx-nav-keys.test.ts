import { readFileSync } from 'fs';
import { join } from 'path';
import { YX_KEYS } from './yx-org';

// The menu only knows the keys useYxPermissions asks the server for (YX_KEYS); a key checked in yx-nav.ts but missing
// there is always false, so its menu item never shows (Recruiting costs, 10 Nov 2026).
describe('yx-nav keys', () => {
  it('every key the menu checks is one the menu asks the server for', () => {
    const src = readFileSync(join(__dirname, 'yx-nav.ts'), 'utf8');
    const used = new Set<string>();
    for (const call of src.match(/\b(?:has|any)\(([^)]*)\)/g) ?? []) for (const k of call.match(/'([a-z_.:]+)'/g) ?? []) used.add(k.slice(1, -1));
    const asked = new Set<string>(YX_KEYS);
    expect([...used].filter((k) => !asked.has(k))).toEqual([]);
  });
});
