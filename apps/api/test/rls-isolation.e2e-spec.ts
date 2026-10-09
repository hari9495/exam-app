import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaModule, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { randomUUID } from 'crypto';

// Proves tenant isolation is enforced by PostgreSQL itself, connected exactly as the app is
// (DATABASE_URL = the NOSUPERUSER NOBYPASSRLS role that owns nothing) -- not by app-level
// `where` clauses. Every check here goes through raw SQL or an unfiltered delegate on purpose.
describe('PostgreSQL row-level security (app role)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgA: string;
  let orgB: string;
  let userB: string;
  const asA = () => ({ organizationId: orgA, isSuperAdmin: false });
  const SUPER = { organizationId: null, isSuperAdmin: true };

  // Postgres: 'new row violates row-level security policy for table "users"' (SQLSTATE 42501).
  const RLS_VIOLATION = /row-level security policy/;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: 'rls-plan', candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    orgA = (await prisma.organization.create({ data: { name: 'RLS A', slug: `rls-a-${randomUUID()}`, planId } })).id;
    orgB = (await prisma.organization.create({ data: { name: 'RLS B', slug: `rls-b-${randomUUID()}`, planId } })).id;
    await tenantPrisma.forTenant(asA(), (tx) =>
      tx.user.create({ data: { organizationId: orgA, email: `a-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
    );
    userB = (
      await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId: orgB, email: `b-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
      )
    ).id;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await tx.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('connects as a NOSUPERUSER NOBYPASSRLS role that owns no table', async () => {
    const [role] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; owned: bigint }[]>`
      SELECT r.rolsuper, r.rolbypassrls,
             (SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid AND c.relkind IN ('r', 'p')) AS owned
      FROM pg_roles r WHERE r.rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, owned: BigInt(0) });
  });

  it('every table with organization_id has RLS enabled AND forced, with a policy', async () => {
    const unprotected = await prisma.$queryRaw<{ table: string }[]>`
      SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p')
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity
                 AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))`;
    expect(unprotected).toEqual([]);
  });

  it('(a) no context => zero rows, even though rows exist', async () => {
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM users WHERE organization_id IN (${orgA}::uuid, ${orgB}::uuid)`;
    expect(n).toBe(BigInt(0));
    expect(await prisma.user.count({ where: { organizationId: { in: [orgA, orgB] } } })).toBe(0);
    const superCount = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.count({ where: { organizationId: { in: [orgA, orgB] } } }));
    expect(superCount).toBe(2);
  });

  it('(a) no context => writes are rejected', async () => {
    await expect(
      prisma.user.create({ data: { organizationId: orgA, email: `x-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it("(b) org A cannot read org B's rows", async () => {
    const seen = await tenantPrisma.forTenant(asA(), (tx) =>
      tx.$queryRaw<{ organization_id: string }[]>`SELECT organization_id::text FROM users WHERE organization_id IN (${orgA}::uuid, ${orgB}::uuid)`,
    );
    expect(seen.length).toBe(1);
    expect(seen.every((r) => r.organization_id === orgA)).toBe(true);
  });

  it("(b) org A cannot update or delete org B's rows (they are invisible)", async () => {
    const result = await tenantPrisma.forTenant(asA(), async (tx) => ({
      updated: await tx.$executeRaw`UPDATE users SET name = 'pwned' WHERE id = ${userB}::uuid`,
      deleted: await tx.$executeRaw`DELETE FROM users WHERE id = ${userB}::uuid`,
    }));
    expect(result).toEqual({ updated: 0, deleted: 0 });
    const b = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUnique({ where: { id: userB } }));
    expect(b?.name).not.toBe('pwned');
  });

  it("(b) WITH CHECK rejects INSERT with another org's id", async () => {
    await expect(
      tenantPrisma.forTenant(asA(), (tx) =>
        tx.user.create({ data: { organizationId: orgB, email: `c-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it("(b) WITH CHECK rejects UPDATE moving an own row into another org", async () => {
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.$executeRaw`UPDATE users SET organization_id = ${orgB}::uuid WHERE organization_id = ${orgA}::uuid`),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it('(c) context does not leak to the next transaction on the same pooled connection', async () => {
    // A one-connection pool forces both units of work onto the same physical connection.
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('connection_limit', '1');
    const single = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      const scoped = new TenantPrismaService(single as unknown as PrismaService);
      const first = await scoped.forTenant(asA(), async (tx) => {
        const [row] = await tx.$queryRaw<{ pid: number; org: string; n: bigint }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org,
                 (SELECT count(*) FROM users WHERE organization_id = ${orgA}::uuid) AS n`;
        return row;
      });
      expect(first.org).toBe(orgA);
      expect(first.n).toBe(BigInt(1));

      // Next transaction, same connection, no context set.
      const next = await single.$transaction((tx) =>
        tx.$queryRaw<{ pid: number; org: string | null; admin: string | null; n: bigint }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org,
                 current_setting('app.is_super_admin', true) AS admin,
                 (SELECT count(*) FROM users WHERE organization_id = ${orgA}::uuid) AS n`,
      );
      expect(next[0].pid).toBe(first.pid);
      expect(next[0].org || null).toBeNull();
      expect(next[0].admin === 'on').toBe(false);
      expect(next[0].n).toBe(BigInt(0));

      // A rolled-back unit of work must not leak either.
      await expect(
        scoped.forTenant(SUPER, async () => {
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      const [afterRollback] = await single.$queryRaw<{ admin: string | null }[]>(
        Prisma.sql`SELECT current_setting('app.is_super_admin', true) AS admin`,
      );
      expect(afterRollback.admin === 'on').toBe(false);
    } finally {
      await single.$disconnect();
    }
  });
});
