import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// ponytail: a repo-wide grep-as-a-test, not a real lint rule. Upgrade to an eslint
// rule if this model list churns often enough to be a maintenance burden.
const RLS_MODELS = ['user', 'auditLog', 'question', 'exam', 'candidate', 'tag', 'aiJob', 'aiCreditUsage'];
const RAW_ACCESS = new RegExp(`this\\.prisma\\.(${RLS_MODELS.join('|')})\\.`);
const ROOTS = ['apps/api/src', 'packages/shared/src'].map((p) => join(__dirname, '..', '..', '..', p));

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(full) ? [full] : [];
  });
}

it('never reads an RLS-protected model via the raw Prisma client', () => {
  const offenders = ROOTS.flatMap(tsFiles).filter((file) => RAW_ACCESS.test(readFileSync(file, 'utf8')));

  // If this fails: these models are RLS-protected, and a raw `this.prisma.<model>` call
  // doesn't error under RLS -- it silently matches zero rows, which is exactly what made
  // the auth.token_reuse_detected misattribution bug invisible. Route the offending file
  // through `this.tenantPrisma.forTenant(...)` instead.
  expect(offenders).toEqual([]);
});
