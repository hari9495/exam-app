import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Console C-4 (founder answers 1049 and 1050), against the real database (forced RLS, app role).
// 1049: feature switches: a default for every company, an override per company that beats it, a kill switch for
//       everyone; a killed feature comes back only from a second staff member. Audited.
// 1050: contain a company: everyone signed out, connected apps revoked, exports, bank-detail changes and payouts refused
//       by the API, a banner; lifting takes two different staff members; other companies untouched. Audited.
describe('Console C-4: feature switches and containing a company', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const org: Record<string, { id: string; slug: string }> = {};
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  let planId: string;
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]);
  const ctx = (k: string) => ({ organizationId: org[k].id, isSuperAdmin: false });
  const login = async (who: string, k: string) => {
    token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${runId}@c4.test`, password: PASSWORD }).expect(200)).body.accessToken;
  };
  const audit = (organizationId: string | null, action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, action } }));
  const whatsNewShown = async (who: string) => (await api(who, 'get', '/help/whats-new').expect(200)).body.show as boolean;

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff1', 'staff2', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${runId}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await up('staff1');
    await up('staff2');
    planId = (await prisma.plan.create({ data: { name: `c4-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const o = await prisma.organization.create({ data: { name: `C4 Company ${k} ${runId}`, slug: `c4-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
      for (const [who, role] of [[`admin${k}`, 'org_admin'], [`user${k}`, 'panel']]) {
        users[who] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${runId}@c4.test`, name: who, passwordHash, role } }))).id;
        await login(who, k);
      }
      await tenantPrisma.forTenant(ctx(k), (tx) => tx.orgIntegration.create({ data: { organizationId: o.id, type: 'webhook', label: `Hook ${k}`, targetUrlEncrypted: 'x', events: '[]', status: 'active' } }));
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.featureFlag.update({ where: { key: 'help.whats_new' }, data: { killedAt: null, killedBy: null, killReason: null, defaultOn: true } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org).map((o) => o.id) } } });
      })
      .catch((e) => console.warn('company cleanup', e));
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.deleteMany({ where: { id: { in: [users.staff1, users.staff2, users.staffNoKey] } } })).catch((e) => console.warn('staff cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('1049 feature switches', () => {
    it('staff without their security key, a company admin and a company user are refused', async () => {
      await api('staffNoKey', 'get', '/platform/feature-flags').expect(403);
      await api('adminA', 'get', '/platform/feature-flags').expect(403);
      await api('userA', 'post', '/platform/feature-flags/help.whats_new/kill').send({ reason: 'Not mine to do' }).expect(403);
    });

    it('lists the real switches, each tied to an existing company setting', async () => {
      const flags = (await api('staff1', 'get', '/platform/feature-flags').expect(200)).body as { key: string; defaultOn: boolean; killed: unknown }[];
      expect(flags.map((f) => f.key).sort()).toEqual(['access.requests', 'help.tours', 'help.whats_new', 'policy.ai_writer']);
      await api('staff1', 'put', '/platform/feature-flags/no.such/default').send({ on: false, reason: 'Testing a bad key' }).expect(404);
    });

    it('a company override beats the default, both ways; another company keeps the default', async () => {
      expect(await whatsNewShown('userA')).toBe(true);
      await api('staff1', 'put', `/platform/feature-flags/help.whats_new/companies/${org.A.id}`).send({ on: false, reason: 'Company asked to pause it' }).expect(200);
      expect(await whatsNewShown('userA')).toBe(false);
      expect(await whatsNewShown('userB')).toBe(true);
      await api('staff1', 'put', '/platform/feature-flags/help.whats_new/default').send({ on: false, reason: 'Off for everyone for now' }).expect(200);
      await api('staff1', 'put', `/platform/feature-flags/help.whats_new/companies/${org.A.id}`).send({ on: true, reason: 'Pilot company keeps it' }).expect(200);
      expect(await whatsNewShown('userA')).toBe(true);
      expect(await whatsNewShown('userB')).toBe(false);
      await api('staff1', 'put', '/platform/feature-flags/help.whats_new/default').send({ on: true, reason: 'Back on for everyone' }).expect(200);
      await api('staff1', 'put', `/platform/feature-flags/help.whats_new/companies/${org.A.id}`).send({ on: null, reason: 'Back to the default' }).expect(200);
      // RLS: a company reads only its own overrides, and cannot write one.
      await api('staff1', 'put', `/platform/feature-flags/help.whats_new/companies/${org.B.id}`).send({ on: false, reason: 'B pauses it' }).expect(200);
      expect(await tenantPrisma.forTenant(ctx('A'), (tx) => tx.featureFlagOverride.count())).toBe(0);
      await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.featureFlagOverride.create({ data: { organizationId: org.A.id, flagKey: 'help.tours', isOn: false, reason: 'x', setBy: users.adminA } }))).rejects.toThrow();
      await api('staff1', 'put', `/platform/feature-flags/help.whats_new/companies/${org.B.id}`).send({ on: null, reason: 'Back to the default' }).expect(200);
    });

    it('the kill switch turns it off for everyone, with a reason; only a second staff member turns it back on', async () => {
      await api('staff1', 'put', `/platform/feature-flags/help.whats_new/companies/${org.A.id}`).send({ on: true, reason: 'A keeps it on' }).expect(200);
      await api('staff1', 'post', '/platform/feature-flags/help.whats_new/kill').send({}).expect(400);
      await api('staff1', 'post', '/platform/feature-flags/help.whats_new/kill').send({ reason: 'Wrong entries shown to companies' }).expect(201);
      expect(await whatsNewShown('userA')).toBe(false); // the override does not beat the kill switch
      expect(await whatsNewShown('userB')).toBe(false);
      await api('staff1', 'post', '/platform/feature-flags/help.whats_new/revive').send({ reason: 'Fixed now' }).expect(403);
      await api('staff2', 'post', '/platform/feature-flags/help.whats_new/revive').send({ reason: 'Checked the fix' }).expect(201);
      expect(await whatsNewShown('userB')).toBe(true);
      expect(await audit(null, 'platform.flag.killed')).not.toHaveLength(0);
      expect(await audit(null, 'platform.flag.revived')).not.toHaveLength(0);
      expect(await audit(org.A.id, 'platform.flag.override_set')).not.toHaveLength(0);
    });
  });

  describe('1050 contain a company', () => {
    it('staff without their security key and company people are refused', async () => {
      await api('staffNoKey', 'post', `/platform/companies/${org.A.id}/contain`).send({ reason: 'Admin signed in from three countries' }).expect(403);
      await api('adminA', 'post', `/platform/companies/${org.A.id}/contain`).send({ reason: 'Admin signed in from three countries' }).expect(403);
      await api('staff1', 'post', `/platform/companies/${org.A.id}/contain`).send({ reason: 'short' }).expect(400);
    });

    it('contains: everyone signed out, connected apps revoked, the breach clock from the platform settings, audited', async () => {
      const before = Date.now();
      const view = (await api('staff1', 'post', `/platform/companies/${org.A.id}/contain`).send({ reason: 'Admin signed in from three countries; bulk export started' }).expect(201)).body;
      expect(view.containment).toMatchObject({ open: true, appsRevoked: 1 });
      expect(view.containment.signedOut).toBeGreaterThanOrEqual(2);
      expect(new Date(view.containment.certinDueAt).getTime() - before).toBeGreaterThanOrEqual(6 * 3_600_000 - 5_000);
      expect(new Date(view.containment.dpdpDueAt).getTime() - before).toBeGreaterThanOrEqual(72 * 3_600_000 - 5_000);
      await api('adminA', 'get', '/help/containment').expect(401); // the old session has ended
      await api('staff1', 'post', `/platform/companies/${org.A.id}/contain`).send({ reason: 'Containing it a second time' }).expect(409);
      const apps = await tenantPrisma.forTenant(SUPER, (tx) => tx.orgIntegration.findMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, select: { organizationId: true, status: true } }));
      expect(apps.find((a) => a.organizationId === org.A.id)?.status).toBe('disabled');
      expect(apps.find((a) => a.organizationId === org.B.id)?.status).toBe('active');
      expect(await audit(org.A.id, 'platform.company.contained')).toHaveLength(1);
    });

    it('signed in again, the company sees the banner; exports, bank changes and payouts are refused by the API', async () => {
      await login('adminA', 'A');
      await login('userA', 'A');
      await up('adminA');
      expect((await api('userA', 'get', '/help/containment').expect(200)).body).toMatchObject({ contained: true });
      const ex = await api('adminA', 'get', '/payroll/audit/export').expect(423);
      expect(ex.body).toMatchObject({ code: 'COMPANY_CONTAINED', hold: 'export' });
      expect(ex.body.message).toMatch(/^Exports are on hold/);
      expect((await api('adminA', 'post', '/expenses/payouts').send({}).expect(423)).body.hold).toBe('payout');
      expect((await request(server()).put(`/api/v1/portal/join/${org.A.slug}/sections/bank`).send({}).expect(423)).body.hold).toBe('bank');
    });

    it('other companies are untouched', async () => {
      await up('adminB');
      expect((await api('userB', 'get', '/help/containment').expect(200)).body).toEqual({ contained: false });
      expect((await api('adminB', 'get', '/payroll/audit/export')).status).not.toBe(423);
      expect((await api('adminB', 'post', '/expenses/payouts').send({})).status).not.toBe(423);
      expect((await request(server()).put(`/api/v1/portal/join/${org.B.slug}/sections/bank`).send({})).status).not.toBe(423);
      // RLS: company B cannot see A's containment; a company cannot write or end one.
      expect(await tenantPrisma.forTenant(ctx('B'), (tx) => tx.companyContainment.count())).toBe(0);
      await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.companyContainment.updateMany({ where: { organizationId: org.A.id }, data: { liftedAt: new Date() } }))).resolves.toEqual({ count: 0 });
    });

    it('lifting takes two different staff members; then the holds end', async () => {
      await api('staff1', 'post', `/platform/companies/${org.A.id}/containment/lift`).send({}).expect(400); // ask first
      await api('staff1', 'post', `/platform/companies/${org.A.id}/containment/request-lift`).send({ reason: 'Passwords reset and the export reviewed' }).expect(201);
      await api('staff1', 'post', `/platform/companies/${org.A.id}/containment/lift`).send({}).expect(403);
      const done = (await api('staff2', 'post', `/platform/companies/${org.A.id}/containment/lift`).send({}).expect(201)).body;
      expect(done.containment).toMatchObject({ open: false, lifted: { by: 'Staff staff2' } });
      expect((await api('userA', 'get', '/help/containment').expect(200)).body).toEqual({ contained: false });
      expect((await api('adminA', 'get', '/payroll/audit/export')).status).not.toBe(423);
      expect(await audit(org.A.id, 'platform.company.lift_requested')).toHaveLength(1);
      expect(await audit(org.A.id, 'platform.company.lifted')).toHaveLength(1);
    });
  });
});
