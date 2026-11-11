import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';

// Console follow-ups (founder answers 1065, 1087, 1125 and C-5's hook), against the real database (forced RLS, app role).
// 1065: a notice about a published rule set goes only to open companies with a location in its state, as an admin
//       message (more than one company waits for a second staff member).
// 1087: the writer withdraws a waiting message; it can never be approved after.
// 1125: Console › Platform settings: each value checked against its own range; security key and reason; audited.
// C-5:  the company page's Products and features card shows the feature switches, a killed one as off.
describe('Console follow-ups: rule notices, withdrawing, platform settings, switches on the company page', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const org: Record<string, string> = {};
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  let planId: string;
  let rule: string;
  let withdrawnRule: string;
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]);
  const audit = (action: string, entityId?: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { action, ...(entityId ? { entityId } : {}) }, orderBy: { createdAt: 'desc' } }));
  type Msg = { id: string; ruleSetId: string | null; companyIds: string[]; status: string; version: number };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff1', 'staff2', 'staffNoKey']) {
      const email = `${who.toLowerCase()}-${runId}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      // Staff roles (answer 1058): the console keys come from staff roles.
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await up('staff1');
    await up('staff2');
    planId = (await prisma.plan.create({ data: { name: `fu-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    // A and D are in Karnataka, B in Tamil Nadu, C in Karnataka but closed.
    for (const [k, state, lifecycle] of [['A', 'IN-KA', 'active'], ['B', 'IN-TN', 'active'], ['C', 'IN-KA', 'closed'], ['D', 'IN-KA', 'active']] as const) {
      const o = await prisma.organization.create({ data: { name: `FU Company ${k} ${runId}`, slug: `fu-${k.toLowerCase()}-${runId}`, planId, lifecycle } });
      org[k] = o.id;
      await tenantPrisma.forTenant({ organizationId: o.id, isSuperAdmin: false }, async (tx) => {
        const le = await tx.legalEntity.create({ data: { organizationId: o.id, name: `Entity ${k}`, shortName: `E${k}`, isDefault: true } });
        await tx.location.create({ data: { organizationId: o.id, legalEntityId: le.id, name: `Site ${k}`, code: `S${k}`, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } });
      });
    }
    users.adminA = (await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.A, email: `admin-a-${runId}@fu.test`, passwordHash, role: 'org_admin' } }))).id;
    token.adminA = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `fu-a-${runId}`, email: `admin-a-${runId}@fu.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      rule = (await tx.statutoryRuleSet.findFirstOrThrow({ where: { statute: 'IN.PT', jurisdiction: 'IN-KA', status: 'published' }, select: { id: true } })).id;
      withdrawnRule = (await tx.statutoryRuleSet.findFirstOrThrow({ where: { status: 'withdrawn' }, select: { id: true } })).id;
      // Earlier runs' notices about the shared seeded rule set stop blocking this run's (one live notice per rule set).
      await tx.yukthixMessage.updateMany({ where: { ruleSetId: rule, status: { in: ['pending_approval', 'sent'] } }, data: { status: 'withdrawn' } });
    });
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.platformSetting.update({ where: { key: 'breach.certin_hours' }, data: { value: '6' } });
        await tx.featureFlag.updateMany({ data: { killedAt: null, killedBy: null, killReason: null } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('1065 notices for a published rule set', () => {
    it('refused for a company admin, staff without the security key, and a rule set that is not published', async () => {
      await api('adminA', 'post', `/platform/customers/rule-notices/${rule}`).send({ subject: 'PT changes', body: 'New slabs.' }).expect(403);
      await api('staffNoKey', 'post', `/platform/customers/rule-notices/${rule}`).send({ subject: 'PT changes', body: 'New slabs.' }).expect(403);
      await api('staff1', 'post', `/platform/customers/rule-notices/${withdrawnRule}`).send({ subject: 'PT changes', body: 'New slabs.' }).expect(409);
      await api('staff1', 'post', `/platform/customers/rule-notices/${rule}`).send({ subject: 'x', body: 'New slabs.' }).expect(400);
    });

    it('goes only to open companies in that state, and waits for a second staff member', async () => {
      const rows = (await api('staff1', 'post', `/platform/customers/rule-notices/${rule}`).send({ subject: 'Karnataka PT: new slabs', body: 'New professional tax slabs apply.' }).expect(201)).body as Msg[];
      const m = rows.find((r) => r.ruleSetId === rule && r.status === 'pending_approval')!;
      expect(m.companyIds).toEqual(expect.arrayContaining([org.A, org.D]));
      expect(m.companyIds).not.toContain(org.B);
      expect(m.companyIds).not.toContain(org.C);
      // One live notice per rule set.
      await api('staff2', 'post', `/platform/customers/rule-notices/${rule}`).send({ subject: 'Karnataka PT again', body: 'Again.' }).expect(409);
    });
  });

  describe('1087 withdrawing', () => {
    it('only the writer withdraws; a withdrawn message cannot be approved; audited', async () => {
      const m = ((await api('staff1', 'get', '/platform/customers/messages').expect(200)).body as Msg[]).find((r) => r.ruleSetId === rule && r.status === 'pending_approval')!;
      await api('staff2', 'post', `/platform/customers/messages/${m.id}/withdraw`).send({ version: m.version }).expect(403);
      await api('staff1', 'post', `/platform/customers/messages/${m.id}/withdraw`).send({ version: m.version }).expect(200);
      await api('staff2', 'post', `/platform/customers/messages/${m.id}/approve`).send({ version: m.version + 1 }).expect(409);
      await api('staff1', 'post', `/platform/customers/messages/${m.id}/withdraw`).send({ version: m.version + 1 }).expect(409);
      expect(await audit('platform.message.withdrawn', m.id)).toHaveLength(1);
      // Nothing reached the companies.
      expect(await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.companyMessage.count({ where: { messageId: m.id } }))).toBe(0);
    });

    it('after a withdrawal the notice can be written again, approved by another staff member and sent', async () => {
      const rows = (await api('staff1', 'post', `/platform/customers/rule-notices/${rule}`).send({ subject: 'Karnataka PT: new slabs', body: 'New professional tax slabs apply.' }).expect(201)).body as Msg[];
      const m = rows.find((r) => r.ruleSetId === rule && r.status === 'pending_approval')!;
      await up('staff2');
      await api('staff2', 'post', `/platform/customers/messages/${m.id}/approve`).send({ version: m.version }).expect(200);
      expect(await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.companyMessage.count({ where: { messageId: m.id } }))).toBe(1);
      expect(await tenantPrisma.forTenant({ organizationId: org.B, isSuperAdmin: false }, (tx) => tx.companyMessage.count({ where: { messageId: m.id } }))).toBe(0);
    });
  });

  describe('1125 platform settings', () => {
    it('refused for a company admin and staff without the security key', async () => {
      await api('adminA', 'get', '/platform/settings').expect(403);
      await api('staffNoKey', 'get', '/platform/settings').expect(403);
      await api('staffNoKey', 'put', '/platform/settings/breach.certin_hours').send({ value: '8', reason: 'Counsel confirmed' }).expect(403);
    });

    it('lists every setting with its label, value and the verify-with-counsel mark', async () => {
      const rows = (await api('staff1', 'get', '/platform/settings').expect(200)).body as { key: string; value: string; verify: boolean; editable: boolean }[];
      expect(rows.find((r) => r.key === 'breach.dpdp_board_report_hours')).toMatchObject({ value: '72', verify: true, editable: true });
      for (const k of ['cs.alert.health_below', 'maintenance.max_hours', 'maintenance.block_dates', 'breach.certin_hours']) expect(rows.map((r) => r.key)).toContain(k);
    });

    it('an out-of-range value, an unknown setting and a missing reason are refused; a good change is audited before and after', async () => {
      await api('staff1', 'put', '/platform/settings/breach.certin_hours').send({ value: '30', reason: 'Too long on purpose' }).expect(400);
      await api('staff1', 'put', '/platform/settings/maintenance.block_dates').send({ value: '7,31', reason: 'Day 31 is not allowed' }).expect(400);
      await api('staff1', 'put', '/platform/settings/no.such.key').send({ value: '1', reason: 'Nothing like it' }).expect(404);
      await api('staff1', 'put', '/platform/settings/breach.certin_hours').send({ value: '8' }).expect(400);
      const rows = (await api('staff1', 'put', '/platform/settings/breach.certin_hours').send({ value: '8', reason: 'Testing the change' }).expect(200)).body as { key: string; value: string }[];
      expect(rows.find((r) => r.key === 'breach.certin_hours')?.value).toBe('8');
      const [row] = await audit('platform.setting.changed', 'breach.certin_hours');
      expect(JSON.parse(row!.metadataJson!)).toMatchObject({ before: '6', after: '8', reason: 'Testing the change' });
    });
  });

  describe("C-5's card: feature switches for one company", () => {
    it('refused for a company admin', async () => {
      await api('adminA', 'get', `/platform/companies/${org.A}/feature-switches`).expect(403);
    });

    it('shows each switch through the one feature check: a company override and a killed feature are off', async () => {
      const get = async () => (await api('staff1', 'get', `/platform/companies/${org.A}/feature-switches`).expect(200)).body as { key: string; on: boolean; why: string | null }[];
      expect((await get()).find((f) => f.key === 'help.tours')).toMatchObject({ on: true, why: null });
      await api('staff1', 'put', `/platform/feature-flags/access.requests/companies/${org.A}`).send({ on: false, reason: 'Company asked to pause it' }).expect(200);
      await api('staff1', 'post', '/platform/feature-flags/help.tours/kill').send({ reason: 'Tours broke on a release' }).expect(201);
      const now = await get();
      expect(now.find((f) => f.key === 'help.tours')).toMatchObject({ on: false, why: 'Killed for everyone' });
      expect(now.find((f) => f.key === 'access.requests')).toMatchObject({ on: false, why: 'Off for this company' });
      await api('staff2', 'post', '/platform/feature-flags/help.tours/revive').send({ reason: 'Fixed and checked' }).expect(201);
      await api('staff1', 'put', `/platform/feature-flags/access.requests/companies/${org.A}`).send({ on: null, reason: 'Back to the default' }).expect(200);
    });
  });
});
