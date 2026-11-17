import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { enableSalaryRecheck } from './fixtures/salary-recheck';

// This suite proves the rule, so it turns the e2e skip off (see fixtures/salary-recheck.ts).
enableSalaryRecheck();

// Batch B item 1 (pay B12 / admin B4, answers 2360-2363), against the real database (forced RLS, app role): salary pages
// need a recent "Confirm it's you" while the company's re-check is on (default, 15 minutes; 5 or 10 allowed); own-pay
// routes are not gated; the setting is per company, needs org:manage_settings plus step-up, and bad values save nothing.
describe('Batch B: confirm it is you again before salary pages', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const api = (who: string, method: 'get' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  // The session's last "Confirm it's you" was this many minutes ago (null: never).
  const confirmedAgo = async (who: string, minutes: number | null) => {
    const { sid } = new JwtService({}).decode(token[who]!) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) =>
      tx.session.update({ where: { id: sid }, data: minutes === null ? { assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null } : { assuranceLevel: 'aal2', mfaMethod: 'totp', mfaVerifiedAt: new Date(Date.now() - minutes * 60_000) } }),
    );
  };
  const policyA = () => tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.findUnique({ where: { organizationId: org.A! } }));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `sr-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `sr-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `SR ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      // pay: reads pay periods (a salary key); admin: security settings; emp: own pay only.
      const people: [string, string[]][] = k === 'A' ? [['pay', ['payroll.period.view']], ['admin', ['org:manage_settings']], ['emp', ['payroll.equity.own']]] : [['pay', ['payroll.period.view']]];
      for (const [who, keys] of people) {
        const permissionProfileId = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
        const email = `${who}-${k.toLowerCase()}-${run}@sr.test`;
        const id = `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    await markSteppedUp(tenantPrisma, token.adminA!);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('on by default: a salary page without a recent confirm is refused with STEP_UP_REQUIRED, then opens after it', async () => {
    await confirmedAgo('payA', null);
    const refused = await api('payA', 'get', '/payroll/reopen-requests').expect(403);
    expect(refused.body).toEqual(expect.objectContaining({ code: 'STEP_UP_REQUIRED', message: 'Confirm it is you to open salary details.' }));
    await confirmedAgo('payA', 0);
    await api('payA', 'get', '/payroll/reopen-requests').expect(200);
  });

  it('default 15 minutes: 14 minutes ago still opens, 16 minutes ago asks again', async () => {
    await confirmedAgo('payA', 14);
    await api('payA', 'get', '/payroll/reopen-requests').expect(200);
    await confirmedAgo('payA', 16);
    await api('payA', 'get', '/payroll/reopen-requests').expect(403);
  });

  it('own-pay routes are not salary pages (answer 2361)', async () => {
    await confirmedAgo('empA', null);
    const res = await api('empA', 'get', '/payroll/me/equity');
    expect(res.body?.code).not.toBe('STEP_UP_REQUIRED');
  });

  it('a company sets 5 minutes: 6 minutes ago now asks again; another company keeps its own default', async () => {
    await api('adminA', 'patch', '/security/policy').send({ salaryRecheckMinutes: 5 }).expect(200);
    expect((await policyA())?.salaryRecheckMinutes).toBe(5);
    await confirmedAgo('payA', 6);
    await api('payA', 'get', '/payroll/reopen-requests').expect(403);
    await confirmedAgo('payB', 6);
    await api('payB', 'get', '/payroll/reopen-requests').expect(200);
  });

  it('turned off (audited): no confirm needed in that company; the other company still asks', async () => {
    await api('adminA', 'patch', '/security/policy').send({ salaryRecheck: false }).expect(200);
    await confirmedAgo('payA', null);
    await api('payA', 'get', '/payroll/reopen-requests').expect(200);
    await confirmedAgo('payB', null);
    await api('payB', 'get', '/payroll/reopen-requests').expect(403);
    const audited = await tenantPrisma.forTenant({ organizationId: org.A!, isSuperAdmin: false }, (tx) => tx.auditLog.findMany({ where: { action: 'security_policy.updated', metadataJson: { contains: 'salaryRecheck' } }, select: { id: true } }));
    expect(audited.length).toBeGreaterThanOrEqual(2);
    await api('adminA', 'patch', '/security/policy').send({ salaryRecheck: true, salaryRecheckMinutes: 15 }).expect(200);
  });

  it('only org:manage_settings with a recent confirm may change it', async () => {
    await api('payA', 'patch', '/security/policy').send({ salaryRecheck: false }).expect(403);
    await confirmedAgo('adminA', null);
    expect((await api('adminA', 'patch', '/security/policy').send({ salaryRecheck: false }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
    expect((await policyA())?.salaryRecheck).toBe(true);
    await markSteppedUp(tenantPrisma, token.adminA!);
  });

  it('bad values are a 400 and save nothing', async () => {
    await api('adminA', 'patch', '/security/policy').send({ salaryRecheckMinutes: 7 }).expect(400);
    await api('adminA', 'patch', '/security/policy').send({ salaryRecheckMinutes: 30 }).expect(400);
    await api('adminA', 'patch', '/security/policy').send({ salaryRecheck: 'yes' }).expect(400);
    const p = await policyA();
    expect([p?.salaryRecheck, p?.salaryRecheckMinutes]).toEqual([true, 15]);
  });
});
