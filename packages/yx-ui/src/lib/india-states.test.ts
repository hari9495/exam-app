import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { IN_STATES, IN_STATE_OPTIONS } from './india-states';

// Every state code the kit uses (screens, samples, stories, tests) is a current ISO 3166-2:IN code, the ones the API and
// its rule packs use. IN-OR / IN-TG / IN-CT / IN-UT (pre-2020) once made a joiner's state match no rule.
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|json)$/.test(f) ? [p] : [];
  });

describe('India state codes', () => {
  it('every IN-xx code in the kit is a listed state', () => {
    const bad = files(join(__dirname, '..')).flatMap((p) => [...readFileSync(p, 'utf8').matchAll(/['"`](IN-[A-Z]{2})['"`]/g)].filter((m) => !(m[1] in IN_STATES)).map((m) => `${p.split(/[\/]src[\/]/)[1]}: ${m[1]}`));
    expect(bad).toEqual([]);
  });
  it('36 states and union territories, options sorted by name', () => {
    expect(Object.keys(IN_STATES)).toHaveLength(36);
    expect(IN_STATE_OPTIONS.map((o) => o.label)).toEqual([...IN_STATE_OPTIONS.map((o) => o.label)].sort((a, b) => a.localeCompare(b)));
    expect(IN_STATES['IN-OD']).toBe('Odisha');
  });
});
