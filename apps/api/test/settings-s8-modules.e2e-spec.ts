import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { SETTINGS } from '../src/org-structure/settings-registry';
import { NotificationsService } from '../src/notifications/notifications.service';

// Settings S-8 (answer 1323), against the real database: 4.8 Expenses & travel and 6.3 Performance. Expense set-up
// (expense.policy.manage) changes the expenses settings, performance set-up (perf.setup.manage) the performance ones;
// each only its own; HR's settings key both. Expense policy viewers read them.
describe('Settings S-8: expenses and performance settings and who changes them', () => {
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
  const api = (who: string, method: 'get' | 'put' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' });
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
  const valueOf = async (key: string) => (await inOrg((tx) => tx.setting.findFirst({ where: { organizationId: orgId, key, scopeType: 'tenant' } })))?.value ?? null;
  const audits = (action: string) => inOrg(async (tx) => (await tx.auditLog.findMany({ where: { organizationId: orgId, action } })).map((a) => ({ actor: a.actorUserId, meta: JSON.parse(a.metadataJson ?? '{}') as Record<string, unknown> })));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s8-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `s8-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `S8 ${run}`, slug, planId } })).id;
    const people: [string, string[]][] = [
      ['hr1', ['org.settings.manage', 'org.structure.view', 'access.role.manage']],
      ['hr2', ['org.settings.manage', 'org.structure.view']],
      ['hr3', ['org.settings.manage', 'access.role.manage']],
      ['exp', ['expense.policy.manage']],
      ['expview', ['expense.policy.view']],
      ['perf', ['perf.setup.manage']],
      ['plain', []],
    ];
    for (const [who, keys] of people) {
      const permissionProfileId = (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
      const email = `${who}-${run}@s8.test`;
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
        await tx.user.deleteMany({ where: { organizationId: orgId } });
        await tx.organization.deleteMany({ where: { id: orgId } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every expenses and performance setting is listed (16 and 22): each has its place on 4.8 or 6.3', async () => {
    // 16 since T2-B item 67 (expense.advance.enabled and expense.advance.cap, on 4.8 in the kit).
    expect(Object.keys(SETTINGS).filter((k) => k.startsWith('expense.'))).toHaveLength(16);
    // 22 since T2-C item 72 (the company guide: perf.calibration.default_guide, guide_shares, guide_tolerance, on 6.3 in the kit).
    expect(Object.keys(SETTINGS).filter((k) => k.startsWith('perf.'))).toHaveLength(22);
    const body = (await api('expview', 'get', '/org/settings').expect(200)).body as { registry: Record<string, unknown> };
    expect(body.registry['expense.finance_audit']).toBeDefined();
  });

  it('expense set-up changes an expenses setting, audited; negative: not a performance, payroll or leave setting', async () => {
    await put('exp', 'expense.finance_audit', 'all').expect(200);
    expect(await valueOf('expense.finance_audit')).toBe('all');
    expect((await audits('org.setting.changed')).find((a) => a.meta.key === 'expense.finance_audit')).toMatchObject({ actor: users.exp });
    await put('exp', 'perf.goal.approval', 'none').expect(403);
    await put('exp', 'tax.proof_cutoff', '03-15').expect(403);
    await put('exp', 'leave.send_back', 'off').expect(403);
    expect(await valueOf('perf.goal.approval')).toBeNull();
  });

  it('performance set-up changes a performance setting; negative: not an expenses one', async () => {
    await put('perf', 'perf.goal.approval', 'none').expect(200);
    expect(await valueOf('perf.goal.approval')).toBe('none');
    await put('perf', 'expense.gst.capture', 'on').expect(403);
    expect(await valueOf('expense.gst.capture')).toBeNull();
  });

  it('negative: an expense policy viewer reads the settings and their history but changes nothing; no key reads nothing', async () => {
    await api('expview', 'get', '/org/settings/history?keys=expense.finance_audit').expect(200);
    await put('expview', 'expense.finance_audit', 'off').expect(403);
    await api('plain', 'get', '/org/settings').expect(403);
    await put('plain', 'expense.finance_audit', 'off').expect(403);
  });

  it("HR's settings key still changes both", async () => {
    await put('hr2', 'expense.payroll_cutoff_day', '25').expect(200);
    await put('hr2', 'perf.coach.frequency', 'off').expect(200);
    expect([await valueOf('expense.payroll_cutoff_day'), await valueOf('perf.coach.frequency')]).toEqual(['25', 'off']);
  });

  it('5.4: with notification emails off the bell still gets the notice and no email goes; back on, the email goes', async () => {
    const send = app.get(EmailService).send as jest.Mock;
    const eid = randomUUID();
    const notify = () => app.get(NotificationsService).notifySystem({ organizationId: orgId, isSuperAdmin: false }, [users.plain!], 'expense.payment.update', { entityType: 'test', entityId: eid, contextText: 'S-8 test', linkPath: '/yx' }, { subject: `S-8 ${run}`, html: '<p>x</p>' });
    const bells = () => inOrg((tx) => tx.userNotification.count({ where: { organizationId: orgId, recipientUserId: users.plain!, entityId: eid } }));
    const mailsTo = () => send.mock.calls.filter((c) => c[0]?.subject === `S-8 ${run}`).length;
    await put('hr2', 'notify.email.enabled', 'off').expect(200);
    await notify();
    expect([await bells(), mailsTo()]).toEqual([1, 0]);
    await put('hr2', 'notify.email.enabled', 'on').expect(200);
    await notify();
    expect([await bells(), mailsTo()]).toEqual([2, 1]);
  });

  it('negative (5.4): expense or performance set-up cannot change the notification settings; a digest time not offered is refused', async () => {
    await put('exp', 'notify.email.enabled', 'off').expect(403);
    await put('perf', 'notify.digest.time', '08:00').expect(403);
    await put('hr2', 'notify.digest.time', '03:00').expect(400);
    expect(await valueOf('notify.email.enabled')).toBe('on');
  });

  // Answer 1826: what new people start with; applied when the account is made; each person changes their own.
  it('1826: with the company default on the daily digest, a new person starts on it and can change their own; people already there keep theirs', async () => {
    const make = async (who: string) => (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email: `${who}-${run}@s8.test`, name: who, passwordHash: 'x', role: 'panel' }, select: { notificationDigest: true } }))).notificationDigest;
    expect(await make('new1')).toBe('immediate');
    await put('hr2', 'notify.email.default_cadence', 'daily').expect(200);
    expect(await make('new2')).toBe('daily');
    const existing = await inOrg((tx) => tx.user.findUniqueOrThrow({ where: { id: users.plain! }, select: { notificationDigest: true } }));
    expect(existing.notificationDigest).toBe('immediate');
    await api('plain', 'patch', '/notifications/digest').send({ mode: 'daily' }).expect(200);
    await put('hr2', 'notify.email.default_cadence', 'immediate').expect(200);
    expect(await make('new3')).toBe('immediate');
  });

  it('negative (1826): a value not offered is refused; set-up keys cannot change it', async () => {
    await put('hr2', 'notify.email.default_cadence', 'weekly').expect(400);
    await put('exp', 'notify.email.default_cadence', 'daily').expect(403);
    expect(await valueOf('notify.email.default_cadence')).toBe('immediate');
  });
});
