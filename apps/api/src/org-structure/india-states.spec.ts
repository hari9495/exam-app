import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { IN_STATES } from './org-validation';

// One list of India's states (ISO 3166-2:IN, 2020 codes). The kit keeps the same list for its screens
// (packages/yx-ui/src/lib/india-states.ts): the two must agree, and every state code the API, its seeds, its migrations
// and its rule packs use must be one of them (IN-OR / IN-TG / IN-CT / IN-UT once matched no rule).
const root = join(__dirname, '..', '..');
const files = (dir: string, ext: RegExp): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : files(p, ext)) : ext.test(f) ? [p] : [];
  });
const codes = (text: string) => [...text.matchAll(/['"`](IN-[A-Z]{2})['"`]/g)].map((m) => m[1]);

describe('India state codes (one list)', () => {
  it('the kit list is the same as the API list, names too', () => {
    const kit = readFileSync(join(root, '..', '..', 'packages', 'yx-ui', 'src', 'lib', 'india-states.ts'), 'utf8');
    const pairs = Object.fromEntries([...kit.matchAll(/'(IN-[A-Z]{2})': '([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(pairs).toEqual({ ...IN_STATES });
  });

  it('every rule pack jurisdiction for India is a listed state', () => {
    const packs = files(join(root, 'src', 'statutory', 'packs'), /\.json$/);
    const bad = packs.flatMap((p) => ((JSON.parse(readFileSync(p, 'utf8')) as { ruleSets?: { jurisdiction: string }[] }).ruleSets ?? []).map((r) => r.jurisdiction).filter((j) => j.startsWith('IN-') && !(j in IN_STATES)));
    expect(bad).toEqual([]);
  });

  it('every IN-xx code in the API source, seeds, scripts and migrations is a listed state (tests use made-up codes on purpose)', () => {
    const all = [...files(join(root, 'src'), /(?<!\.spec)\.ts$/), ...files(join(root, 'prisma'), /\.(ts|sql)$/), ...files(join(root, 'scripts'), /\.ts$/)];
    const bad = all.flatMap((p) => codes(readFileSync(p, 'utf8')).filter((c) => !(c in IN_STATES)).map((c) => `${p.slice(root.length)}: ${c}`));
    expect(bad).toEqual([]);
  });
});
