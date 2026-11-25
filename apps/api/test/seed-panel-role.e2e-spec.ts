import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Founder answer 511: a fresh database, built by every migration and then seeded with prisma/seed.ts, gives the default
// employee role (panel) only org:view and payroll.equity.own: no interviewer key. The database is created and dropped
// here through the local Postgres container's superuser (the app's own roles cannot create databases).

jest.setTimeout(600_000);

// A superuser is needed to create and drop the database and its extensions. CI gives one as PG_SUPERUSER_URL (its
// Postgres is a service container, not the local one); a laptop uses the local container's superuser through docker.
const CONTAINER = process.env.SEED_CHECK_PG_CONTAINER ?? 'exam-app-pg-postgres-1';
const SUPERUSER_URL = process.env.PG_SUPERUSER_URL;
async function psql(sql: string, db?: string): Promise<void> {
  if (!SUPERUSER_URL) {
    execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', ...(db ? ['-d', db] : []), '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8' });
    return;
  }
  const admin = new PrismaClient({ datasources: { db: { url: db ? SUPERUSER_URL.replace(/\/[^/?]+(\?|$)/, `/${db}$1`) : SUPERUSER_URL } } });
  try {
    await admin.$executeRawUnsafe(sql);
  } finally {
    await admin.$disconnect();
  }
}

describe('Fresh database + seed: the panel role (answer 511)', () => {
  const name = `examapp_seedcheck_${randomUUID().slice(0, 8)}`;
  const base = process.env.MIGRATION_DATABASE_URL!;
  const url = base.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  const apiDir = path.join(__dirname, '..');

  beforeAll(async () => {
    await psql(`CREATE DATABASE ${name} OWNER examapp_owner`);
    // The extensions the migrations ask for need a superuser (the real databases have them from the platform set-up).
    for (const ext of ['citext', 'btree_gist']) await psql(`CREATE EXTENSION IF NOT EXISTS ${ext}`, name);
    const env = { ...process.env, DATABASE_URL: url, MIGRATION_DATABASE_URL: url };
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env, stdio: 'pipe', shell: true });
    execFileSync('npx', ['ts-node', 'prisma/seed.ts'], { cwd: apiDir, env, stdio: 'pipe', shell: true });
  });

  afterAll(async () => {
    try {
      await psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}'`);
      await psql(`DROP DATABASE IF EXISTS ${name}`);
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
