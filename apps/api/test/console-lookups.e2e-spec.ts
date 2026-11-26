import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

// Retire /v2 (answers 2421 and 2431): system logs and a user search across companies, in the staff console only.
describe('Console: system logs and user search', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  const events: string[] = [];
  let planId = '';
  const api = (who: string, path: string) => request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'staffNoKey') await markSteppedUp(tenantPrisma, token[who]!);
    }
    planId = (await prisma.plan.create({ data: { name: `clk-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `clk-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `CLK ${k} ${run}`, slug, planId } })).id;
      const email = `admin-${k.toLowerCase()}-${run}@clk.test`;
      users[`admin${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `Meera ${k} ${run}`, passwordHash, role: 'org_admin' } }))).id;
      token[`admin${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      events.push((await tenantPrisma.forTenant(SUPER, (tx) => tx.systemEvent.create({ data: { organizationId: org[k], service: 'api', severity: k === 'A' ? 'error' : 'warn', message: `Broke in ${k} ${run}`, contextJson: JSON.stringify({ run }) } }))).id);
    }
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.systemEvent.deleteMany({ where: { id: { in: events } } });
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A, org.B] } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a company admin, no sign-in, staff without the security key or the key itself are refused; the company list is gone', async () => {
    for (const path of ['/platform/system-logs', `/platform/users?q=${run}`]) {
      await api('adminA', path).expect(403);
      await request(server()).get(`/api/v1${path}`).expect(401);
      expect((await api('staffNoKey', path).expect(403)).body.code).toBe('MFA_REQUIRED');
    }
    await giveStaffRoles(users.staff!, await rolesWithout('platform.systemlogs.view'));
    try {
      await api('staff', '/platform/system-logs').expect(403);
    } finally {
      await giveStaffRoles(users.staff!);
    }
    await giveStaffRoles(users.staff!, await rolesWithout('platform.users.search'));
    try {
      await api('staff', `/platform/users?q=${run}`).expect(403);
    } finally {
      await giveStaffRoles(users.staff!);
    }
    // Answer 2421: companies no longer read system logs.
    await api('adminA', '/system-events').expect(404);
  });

  it('system logs: every company, newest first, filtered, with the company name; the read is audited', async () => {
    const all = (await api('staff', '/platform/system-logs').expect(200)).body as { data: { id: string; company: string | null; severity: string }[] };
    const mine = all.data.filter((e) => events.includes(e.id));
    expect(mine.map((e) => e.company)).toEqual([`CLK B ${run}`, `CLK A ${run}`]);
    const errorsA = (await api('staff', `/platform/system-logs?severity=error&organizationId=${org.A}`).expect(200)).body.data as { id: string }[];
    expect(errorsA.map((e) => e.id)).toEqual([events[0]]);
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staff!, action: 'platform.cross_tenant_read' } }));
    expect(rows.some((r) => (r.metadataJson ?? '').includes('system_logs.list'))).toBe(true);
  });

  it('user search: by email or name across companies, never staff; the text searched is audited', async () => {
    const found = (await api('staff', `/platform/users?q=${run}`).expect(200)).body as { data: { email: string; company: string | null }[] };
    expect(found.data.map((u) => [u.email, u.company]).sort()).toEqual([
      [`admin-a-${run}@clk.test`, `CLK A ${run}`],
      [`admin-b-${run}@clk.test`, `CLK B ${run}`],
    ]);
    expect(JSON.stringify(found)).not.toContain('@platform.test');
    expect(JSON.stringify(found)).not.toContain('passwordHash');
    const byName = (await api('staff', `/platform/users?q=${encodeURIComponent(`meera a ${run}`)}`).expect(200)).body.data as { email: string }[];
    expect(byName.map((u) => u.email)).toEqual([`admin-a-${run}@clk.test`]);
    const searched = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staff!, action: 'platform.users.searched' } }));
    expect(searched.map((r) => JSON.parse(r.metadataJson ?? '{}').q)).toContain(run);
  });

  it('bad input is refused with 400: too short a search, a wildcard, a bad filter', async () => {
    await api('staff', '/platform/users?q=ab').expect(400);
    await api('staff', '/platform/users').expect(400);
    await api('staff', '/platform/users?q=%25%25%25').expect(400);
    await api('staff', '/platform/system-logs?severity=fatal').expect(400);
    await api('staff', '/platform/system-logs?organizationId=nope').expect(400);
  });
});
