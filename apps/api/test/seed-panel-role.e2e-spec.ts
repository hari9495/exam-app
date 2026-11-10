import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Founder answer 511: a fresh database, built by every migration and then seeded with prisma/seed.ts, gives the default
// employee role (panel) only org:view and payroll.equity.own: no interviewer key. The database is created and dropped
// here through the local Postgres container's superuser (the app's own roles cannot create databases).

jest.setTimeout(600_000);

const CONTAINER = process.env.SEED_CHECK_PG_CONTAINER ?? 'exam-app-pg-postgres-1';
const psql = (sql: string) => execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8' });

describe('Fresh database + seed: the panel role (answer 511)', () => {
  const name = `examapp_seedcheck_${randomUUID().slice(0, 8)}`;
  const base = process.env.MIGRATION_DATABASE_URL!;
  const url = base.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  const apiDir = path.join(__dirname, '..');

  beforeAll(() => {
    psql(`CREATE DATABASE ${name} OWNER examapp_owner`);
    // The extensions the migrations ask for need a superuser (the real databases have them from the platform set-up).
    for (const ext of ['citext', 'btree_gist']) execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', name, '-v', 'ON_ERROR_STOP=1', '-tAc', `CREATE EXTENSION IF NOT EXISTS ${ext}`], { encoding: 'utf8' });
    const env = { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url };
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env, stdio: 'pipe', shell: true });
    execFileSync('npx', ['ts-node', 'prisma/seed.ts'], { cwd: apiDir, env, stdio: 'pipe', shell: true });
  });

  afterAll(() => {
    try {
      psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}'`);
      psql(`DROP DATABASE IF EXISTS ${name}`);
    } catch (e) {
      console.warn('drop', (e as Error).message);
    }
  });

  it('the panel role holds only org:view and payroll.equity.own; recruiters and hiring managers keep theirs', async () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
      const keys = (role: string) =>
        db.$transaction(async (t) => {
          await t.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
          return (await t.$queryRaw<{ key: string }[]>`SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role = ${role} ORDER BY p.key`).map((r) => r.key);
        });
      expect(await keys('panel')).toEqual(['org:view', 'payroll.equity.own']);
      expect(await keys('recruiter')).toEqual(expect.arrayContaining(['interview:view_assigned', 'results:view', 'pipeline:manage']));
      expect(await keys('hiring_manager')).toEqual(expect.arrayContaining(['interview:view_assigned', 'results:view']));
    } finally {
      await db.$disconnect();
    }
  });
});
