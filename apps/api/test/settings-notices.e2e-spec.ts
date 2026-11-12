import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { SettingChangeNoticesService } from '../src/org-structure/setting-change-notices.service';

// Settings (founder answers 1522, 1523), against the real database. A payroll setting change waiting for a second person
// sends a bell notice and an email to each other holder of HR's settings key, never the person who asked; the person who
// asked hears the decision. A change nobody decides lapses after payroll.settings.lapse_days (default 14) IST days, by the
// nightly sweep, audited as the system, and the person who asked is told; a rerun is safe.
describe('Settings: notices and lapsing for payroll setting changes (1522, 1523)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let sweep: SettingChangeNoticesService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const DAY = 86_400_000;
  const server = () => app.getHttpServer();
  const mails: { to: string; subject: string }[] = [];
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orgId = '';
  let planId = '';
  const api = (who: string, method: 'put' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' });
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
  const bell = (who: string, type: string, entityId?: string) => inOrg((tx) => tx.userNotification.count({ where: { organizationId: orgId, recipientUserId: users[who], type, ...(entityId ? { entityId } : {}) } }));
  const backdate = (id: string, days: number) => inOrg((tx) => tx.settingChangeRequest.update({ where: { id }, data: { requestedAt: new Date(Date.now() - days * DAY) } }));
  const status = async (id: string) => (await inOrg((tx) => tx.settingChangeRequest.findUniqueOrThrow({ where: { id } }))).status;

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (mails.push({ to: m.to, subject: m.subject }), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    sweep = app.get(SettingChangeNoticesService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `sn-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `sn-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `SN ${run}`, slug, planId } })).id;
    const people: [string, string[]][] = [['asker', ['org.settings.manage']], ['hr2', ['org.settings.manage']], ['hr3', ['org.settings.manage']], ['payroll', ['payroll.setup.manage']]];
    for (const [who, keys] of people) {
      const permissionProfileId = (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
      const email = `${who}-${run}@sn.test`;
      users[who] = (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email, name: `Person ${who}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
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

  let first = '';
  it('a waiting change: each other holder of HR\'s settings key gets one notice and one email; the asker and payroll set-up none', async () => {
    first = (await put('asker', 'tax.proof_cutoff', '03-15').expect(200)).body.id;
    expect(await bell('hr2', 'settings.change.waiting', first)).toBe(1);
    expect(await bell('hr3', 'settings.change.waiting', first)).toBe(1);
    expect(await bell('asker', 'settings.change.waiting')).toBe(0);
    expect(await bell('payroll', 'settings.change.waiting')).toBe(0);
    const to = mails.map((m) => m.to);
    expect(to.filter((t) => t === `hr2-${run}@sn.test`)).toHaveLength(1);
    expect(to.filter((t) => t === `hr3-${run}@sn.test`)).toHaveLength(1);
    expect(to).not.toContain(`asker-${run}@sn.test`);
  });

  it('the asker is told the decision: approved, and rejected', async () => {
    await api('hr2', 'post', `/org/settings/requests/${first}/approve`).send({}).expect(200);
    expect(await bell('asker', 'settings.change.decided', first)).toBe(1);
    const second = (await put('asker', 'payroll.net_rounding', 'none').expect(200)).body.id as string;
    await api('hr3', 'post', `/org/settings/requests/${second}/reject`).send({}).expect(204);
    expect(await bell('asker', 'settings.change.decided', second)).toBe(1);
    expect(await bell('hr3', 'settings.change.decided')).toBe(0);
  });

  it('a change lapses at N+1 days but not at N days (N = 14 by default); audited as the system; the asker is told; a rerun is safe', async () => {
    const id = (await put('asker', 'payroll.mid_period.cutoff_day', '20').expect(200)).body.id as string;
    await backdate(id, 14);
    expect(await sweep.lapseSweep(new Date(), [orgId])).toBe(0);
    expect(await status(id)).toBe('pending');
    await backdate(id, 15);
    expect(await sweep.lapseSweep(new Date(), [orgId])).toBe(1);
    expect(await status(id)).toBe('lapsed');
    expect(await bell('asker', 'settings.change.decided', id)).toBe(1);
    const audit = await inOrg((tx) => tx.auditLog.findMany({ where: { organizationId: orgId, action: 'org.setting.change_lapsed', entityId: id } }));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorUserId).toBeNull();
    expect(JSON.parse(audit[0]!.metadataJson ?? '{}')).toMatchObject({ key: 'payroll.mid_period.cutoff_day', 'payroll.settings.lapse_days': 14 });
    expect(await sweep.lapseSweep(new Date(), [orgId])).toBe(0);
    expect(await bell('asker', 'settings.change.decided', id)).toBe(1);
    expect(await inOrg((tx) => tx.setting.findFirst({ where: { organizationId: orgId, key: 'payroll.mid_period.cutoff_day' } }))).toBeNull();
    await api('hr2', 'post', `/org/settings/requests/${id}/approve`).send({}).expect(404);
  });

  it('the company setting changes N: at 7 days a change of 8 days lapses', async () => {
    await inOrg((tx) => tx.setting.create({ data: { organizationId: orgId, key: 'payroll.settings.lapse_days', scopeType: 'tenant', scopeId: orgId, value: '7' } }));
    const id = (await put('asker', 'payroll.payslip_email', 'on').expect(200)).body.id as string;
    await backdate(id, 7);
    expect(await sweep.lapseSweep(new Date(), [orgId])).toBe(0);
    await backdate(id, 8);
    expect(await sweep.lapseSweep(new Date(), [orgId])).toBe(1);
  });
});
