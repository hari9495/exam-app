import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { todayIst } from '../src/org-structure/org-validation';

// Settings S-4 (founder answers 1323, 1324), against the real database. The exit, rehire, retirement and audit settings
// that had no screen are listed with their starter values; each saves through PUT /org/settings and is audited; a
// dated one (notice periods) applies from the day given; the audit log length needs the access key too and never goes
// under the legal 8 years; someone without HR's settings key is refused.
describe('Settings S-4: People settings (1323, 1324)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orgId = '';
  let planId = '';
  const api = (who: string, method: 'get' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string, validFrom?: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant', ...(validFrom ? { validFrom } : {}) });
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s4-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `s4-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `S4 ${run}`, slug, planId } })).id;
    const people: [string, string[]][] = [
      ['hr', ['org.settings.manage', 'org.structure.view']],
      ['admin', ['org.settings.manage', 'access.role.manage']],
      ['manager', ['employee.profile.view']],
    ];
    for (const [who, keys] of people) {
      const permissionProfileId = (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
      const email = `${who}-${run}@s4.test`;
      users[who] = (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email, name: who, passwordHash, role: 'panel', permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.organization.deleteMany({ where: { id: orgId } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the lifecycle and audit settings are listed with starter values; the audit log has its legal minimum', async () => {
    const body = (await api('hr', 'get', '/org/settings').expect(200)).body as { registry: Record<string, { default: string; dated: boolean }>; limits: Record<string, unknown> };
    for (const key of ['exit.notice.probation', 'rehire.pf', 'absconding.days', 'retirement.age', 'vrs.benefit_days', 'alumni.access_years', 'audit.retention_years']) expect([key, typeof body.registry[key]?.default]).toEqual([key, 'string']);
    expect(body.registry['exit.notice.confirmed']!.dated).toBe(true);
    expect(body.limits['audit.retention_years']).toEqual({ min: 8, act: 'Companies (Accounts) Rules, 2014 r.3(1) with the Companies Act, 2013 s.128(5)' });
  });

  it('a lifecycle setting saves and is audited with before and after; a dated one needs its start day and applies from it', async () => {
    await put('hr', 'retirement.age', '60').expect(200);
    await put('hr', 'rehire.leave', 'carry').expect(200);
    await put('hr', 'exit.notice.confirmed', '2m').expect(400); // dated: the start day is needed
    await put('hr', 'exit.notice.confirmed', '2m', todayIst()).expect(200);
    const rows = await inOrg((tx) => tx.setting.findMany({ where: { organizationId: orgId, key: { in: ['retirement.age', 'rehire.leave', 'exit.notice.confirmed'] } } }));
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual({ 'retirement.age': '60', 'rehire.leave': 'carry', 'exit.notice.confirmed': '2m' });
    const audits = await inOrg((tx) => tx.auditLog.findMany({ where: { organizationId: orgId, action: 'org.setting.changed' } }));
    const meta = audits.map((a) => JSON.parse(a.metadataJson ?? '{}') as { key: string; from: unknown; to: string; validFrom: string | null });
    expect(meta).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'retirement.age', from: null, to: '60' }), expect.objectContaining({ key: 'exit.notice.confirmed', to: '2m', validFrom: todayIst() })]));
    expect(audits.every((a) => a.actorUserId === users.hr)).toBe(true);
  });

  it('the audit log length: the access key too; never under the legal 8 years; 10 years is saved', async () => {
    await put('hr', 'audit.retention_years', '10').expect(403);
    await put('admin', 'audit.retention_years', '5').expect(400);
    await put('admin', 'audit.retention_years', '10').expect(200);
  });

  it('negative: someone without HR\'s settings key reads nothing and changes nothing', async () => {
    await api('manager', 'get', '/org/settings').expect(403);
    await put('manager', 'rehire.pf', 'fresh').expect(403);
  });
});
