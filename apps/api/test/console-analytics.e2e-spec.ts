import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';
import { AREAS, AnalyticsService } from '../src/platform/analytics.service';

// Console C-8, YX-09, against the real database (forced RLS, app role): which features companies use, counts only, by
// feature and by company; never a name or HR content; no group of fewer than the minimum (never under 5) companies.
describe('Console C-8 YX-09: product analytics', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SECRET = `Secret salary 98765 ${run}`;
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  let planId = '';
  let minBefore: string | null = null;
  const api = (who: string, path: string) => request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  type Body = { minCompanies: number; byFeature: { area: string; companies: number | null; actions: number | null }[]; bySize: { bands: { companies: number | null }[]; adoption: { pct: (number | null)[] }[] }; byCompany: { id: string; company: string; areas: Record<string, number> }[] };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    minBefore = (await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findUnique({ where: { key: 'analytics.min_companies' } })))?.value ?? null;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'staffNoKey') await markSteppedUp(tenantPrisma, token[who]!);
    }
    planId = (await prisma.plan.create({ data: { name: `c8a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `c8a-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `C8A ${k} ${run}`, slug, planId } })).id;
      const email = `admin-${k.toLowerCase()}-${run}@c8a.test`;
      users[`admin${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `Priya ${k} ${run}`, passwordHash, role: 'org_admin' } }))).id;
      token[`admin${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Company A: two leave actions and one payroll action (with HR content in the metadata), and a sign-in.
    await inOrg(org.A, async (tx) => {
      for (const action of ['leave.applied', 'leave.approved', 'payroll.run_locked', 'login.success']) {
        await tx.auditLog.create({ data: { organizationId: org.A, actorUserId: users.adminA!, actorName: `Priya A ${run}`, action, entityType: 'test', metadataJson: JSON.stringify({ note: SECRET }) } });
      }
    });
    // Console 1216: the page reads the nightly summary.
    await app.get(AnalyticsService).summariseNightly();
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        if (minBefore === null) await tx.platformSetting.deleteMany({ where: { key: 'analytics.min_companies' } });
        else await tx.platformSetting.update({ where: { key: 'analytics.min_companies' }, data: { value: minBefore } });
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a company admin, no sign-in, staff without the security key or the analytics key are refused', async () => {
    await api('adminA', '/platform/analytics').expect(403);
    await request(server()).get('/api/v1/platform/analytics').expect(401);
    expect((await api('staffNoKey', '/platform/analytics').expect(403)).body.code).toBe('MFA_REQUIRED');
    await giveStaffRoles(users.staff!, await rolesWithout('platform.analytics.view'));
    try {
      await api('staff', '/platform/analytics').expect(403);
    } finally {
      await giveStaffRoles(users.staff!);
    }
  });

  it('by company: counts per feature only; sign-ins are not a feature; a company that did nothing is not listed', async () => {
    const body = (await api('staff', '/platform/analytics').expect(200)).body as Body;
    const a = body.byCompany.find((c) => c.id === org.A)!;
    expect(a.areas).toEqual({ time: 2, payroll: 1 });
    expect(Object.keys(a).sort()).toEqual(['areas', 'band', 'company', 'id', 'lastActive']);
    expect(body.byCompany.find((c) => c.id === org.B)).toBeUndefined();
  });

  it('never personal data or HR content: no names, emails or metadata in the answer', async () => {
    const text = JSON.stringify((await api('staff', '/platform/analytics').expect(200)).body);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(`Priya A ${run}`);
    expect(text).not.toContain('@c8a.test');
  });

  it('no group under the minimum: every feature and size-band count is hidden or at least the minimum', async () => {
    for (const min of [5, 50]) {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.upsert({ where: { key: 'analytics.min_companies' }, create: { key: 'analytics.min_companies', value: String(min) }, update: { value: String(min) } }));
      const body = (await api('staff', '/platform/analytics').expect(200)).body as Body;
      expect(body.minCompanies).toBe(min);
      for (const f of body.byFeature) expect(f.companies === null || f.companies >= min).toBe(true);
      for (const b of body.bySize.bands) expect(b.companies === null || b.companies >= min).toBe(true);
    }
    // The setting itself never goes under 5.
    await api('staff', '/platform/settings').expect(200);
    const put = await request(server()).put('/api/v1/platform/settings/analytics.min_companies').set('Authorization', `Bearer ${token.staff}`).send({ value: '4', reason: 'Trying a smaller group' });
    expect(put.status).toBe(400);
  });

  it('the read is audited with its purpose', async () => {
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staff!, action: 'platform.cross_tenant_read' } }));
    expect(rows.some((r) => (r.metadataJson ?? '').includes('analytics.feature_use'))).toBe(true);
  });

  describe('the nightly summary (1216)', () => {
    const IST = 330 * 60_000;
    const istDay = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
    const minus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
    /** The old answer: a scan of audit_logs over the same India days. */
    const scan = (days: number) =>
      tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ organizationId: string; family: string; actions: number; last: Date }[]>`
        SELECT organization_id AS "organizationId", split_part(action, '.', 1) AS family, count(*)::int AS actions, max(created_at) AS last
        FROM audit_logs a WHERE organization_id IS NOT NULL AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = a.organization_id)
          AND created_at >= (${minus(istDay(new Date()), days - 1)}::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          AND split_part(action, '.', 1) = ANY(${AREAS.flatMap((a) => a.families)}::text[])
        GROUP BY 1, 2`);
    const summary = (days: number) => tenantPrisma.forTenant(SUPER, (tx) => AnalyticsService.usage(tx, days));
    const key = (r: { organizationId: string; family: string; actions: number; last: Date }) => `${r.organizationId}|${r.family}|${r.actions}|${new Date(r.last).toISOString()}`;

    it('gives the same answer as the scan, across India day edges and the window, and a rerun never double-counts', async () => {
      // Company B: one action at 00:05 IST two days ago (18:35 UTC the day before), one 40 days ago (outside 30 days).
      const twoDaysAgo = minus(istDay(new Date()), 2);
      const edge = new Date(Date.parse(`${twoDaysAgo}T00:05:00Z`) - IST);
      await inOrg(org.B, async (tx) => {
        await tx.auditLog.create({ data: { organizationId: org.B, action: 'expense.claim_submitted', entityType: 'test', createdAt: edge } });
        await tx.auditLog.create({ data: { organizationId: org.B, action: 'expense.claim_submitted', entityType: 'test', createdAt: new Date(Date.now() - 40 * 86_400_000) } });
      });
      // The first run only fills from the last summarised day; refill the whole window as a fresh table would.
      await tenantPrisma.forTenant(SUPER, (tx) => tx.productUsageDaily.deleteMany({}));
      await app.get(AnalyticsService).summariseNightly();
      for (const days of [1, 3, 30]) expect((await summary(days)).map(key).sort()).toEqual((await scan(days)).map(key).sort());
      const b = (await summary(30)).filter((r) => r.organizationId === org.B);
      expect(b).toEqual([expect.objectContaining({ family: 'expense', actions: 1 })]);
      expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.productUsageDaily.findFirstOrThrow({ where: { organizationId: org.B } }))).day.toISOString().slice(0, 10)).toBe(twoDaysAgo);
      // Run again, twice: the same rows and counts.
      const before = (await summary(30)).map(key).sort();
      await app.get(AnalyticsService).summariseNightly();
      await app.get(AnalyticsService).summariseNightly();
      expect((await summary(30)).map(key).sort()).toEqual(before);
      // The page's answer for company A is unchanged.
      expect(((await api('staff', '/platform/analytics').expect(200)).body as Body).byCompany.find((c) => c.id === org.A)!.areas).toEqual({ time: 2, payroll: 1 });
    });

    it('platform only: a company never sees the summary', async () => {
      expect(await inOrg(org.A, (tx) => tx.productUsageDaily.count())).toBe(0);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.productUsageDaily.count({ where: { organizationId: org.A } }))).toBeGreaterThan(0);
      const rows = await prisma.$queryRaw<{ forced: boolean; policy: boolean }[]>`
        SELECT c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'platform_only') AS policy
        FROM pg_class c WHERE c.relname = 'product_usage_daily'`;
      expect(rows).toEqual([{ forced: true, policy: true }]);
    });
  });
});
