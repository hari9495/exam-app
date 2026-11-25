import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';

// YukthiX console C-2, Customer success (answers 1047, 1048, 1058), end to end against the real database (forced RLS,
// app role): staff only with the Customer success key; the health list read through the audited platformRead; churn
// alerts from the platform settings; messages to companies' System Admins, a second staff member for more than one
// company (never the writer, with step-up), delivered to each company's own copy, bell, email and audit log only.
describe('Console C-2: customer success', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '', C: '', Z: '' };
  let planId = '';
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]!);
  const down = async (who: string) => {
    const { sid } = JSON.parse(Buffer.from(token[who]!.split('.')[1]!, 'base64url').toString()) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 3_600_000) } }));
  };
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  const settingsBefore: { key: string; value: string }[] = [];

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    settingsBefore.push(...(await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findMany({ select: { key: true, value: true } }))));
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2', 'staffNoKey'] as const) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      // Staff roles (answer 1058): these suites test the console routes, so their staff hold every role.
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await up('staff');
    await up('staff2');
    planId = (await prisma.plan.create({ data: { name: `cs-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B', 'C', 'Z'] as const) {
      const slug = `cs-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `CS ${k} ${run}`, slug, planId } })).id;
      await inOrg(org[k], (tx) => tx.organizationProduct.create({ data: { organizationId: org[k], productCode: 'hrms' } }));
      const email = `admin-${k.toLowerCase()}-${run}@cs.test`;
      users[`admin${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }))).id;
      if (k !== 'Z') token[`admin${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    users.panelA = (await inOrg(org.A, (tx) => tx.user.create({ data: { organizationId: org.A, email: `panel-a-${run}@cs.test`, passwordHash, role: 'panel' } }))).id;
    token.panelA = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `cs-a-${run}`, email: `panel-a-${run}@cs.test`, password: PASSWORD }).expect(200)).body.accessToken;
    // C's admin last signed in 40 days ago; Z is closed (never offered).
    await inOrg(org.C, (tx) => tx.user.update({ where: { id: users.adminC! }, data: { lastLoginAt: new Date(Date.now() - 40 * 86_400_000) } }));
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.update({ where: { id: org.Z }, data: { lifecycle: 'closed' } }));
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.platformSetting.deleteMany({ where: { key: { in: ['cs.alert.health_below', 'cs.alert.admin_idle_days'] } } });
        for (const s of settingsBefore) await tx.platformSetting.upsert({ where: { key: s.key }, create: s, update: { value: s.value } });
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org).filter(Boolean) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('staff only, with the security key and the Customer success key', async () => {
    await request(server()).get('/api/v1/platform/customers/health').expect(401);
    await api('adminA', 'get', '/platform/customers/health').expect(403);
    await api('adminA', 'post', '/platform/customers/messages').send({ companyIds: [org.B], subject: 'Hello there', body: 'x' }).expect(403);
    expect((await api('staffNoKey', 'get', '/platform/customers/health').expect(403)).body.code).toBe('MFA_REQUIRED');
    await api('staff', 'get', '/platform/customers/health').expect(200);
    // Without the Customer success role (staff roles, answer 1058): every route refuses (restored straight after).
    await giveStaffRoles(users.staff!, ['support_agent', 'rules_editor', 'finance', 'security_lead']);
    try {
      await api('staff', 'get', '/platform/customers/health').expect(403);
      await api('staff', 'get', '/platform/customers/messages').expect(403);
    } finally {
      await giveStaffRoles(users.staff!);
    }
    await api('staff', 'get', '/platform/customers/health').expect(200);
  });

  it('health: every open company with its score and factors, read through the audited platformRead', async () => {
    const before = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { actorUserId: users.staff, action: 'platform.cross_tenant_read' } }));
    const { rows } = (await api('staff', 'get', '/platform/customers/health').expect(200)).body;
    const mine = rows.filter((r: { name: string }) => r.name.endsWith(run));
    expect(mine.map((r: { name: string }) => r.name).sort()).toEqual([`CS A ${run}`, `CS B ${run}`, `CS C ${run}`]); // Z is closed
    const c = mine.find((r: { name: string }) => r.name === `CS C ${run}`);
    expect(c).toMatchObject({ health: 60, factors: ['No admin sign-in for 30 days'], openTickets: 0 });
    // 1165 adds the band, churn risk, 30-day change and CS owner: account facts only, still no HR data.
    expect(Object.keys(c).sort()).toEqual(['adminLastSignIn', 'alerts', 'band', 'churn', 'factors', 'health', 'id', 'lifecycle', 'name', 'openTickets', 'owner', 'products', 'slug', 'trend']);
    const after = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staff, action: 'platform.cross_tenant_read' }, orderBy: { createdAt: 'desc' }, take: 1 }));
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { actorUserId: users.staff, action: 'platform.cross_tenant_read' } }))).toBeGreaterThan(before);
    expect(JSON.parse(after[0]!.metadataJson!)).toMatchObject({ purpose: 'customer_success.health' });
  });

  it('churn alerts come from the platform settings (defaults 50 and 30 days); changes are checked and audited', async () => {
    const row = async (k: 'A' | 'C') => (await api('staff', 'get', '/platform/customers/health').expect(200)).body.rows.find((r: { id: string }) => r.id === org[k]);
    expect((await row('C')).alerts).toEqual(['No System Admin sign-in for 40 days']);
    expect((await row('A')).alerts).toEqual([]);
    // Answer 1183: the direct save is gone; Console › Platform settings is the one place (security key and a reason).
    await api('staff', 'put', '/platform/customers/settings').send({ values: { 'cs.alert.health_below': 81 } }).expect(404);
    await markSteppedUp(tenantPrisma, token.staff!);
    const set = (key: string, value: string) => api('staff', 'put', `/platform/settings/${key}`).send({ value, reason: 'Testing the alert rules' });
    await set('cs.alert.health_below', '0').expect(400);
    await set('cs.alert.admin_idle_days', '6').expect(400);
    await set('cs.alert.health_below', '81').expect(200);
    await set('cs.alert.admin_idle_days', '45').expect(200);
    // Saved there, shown on the alert rules page and used by the alerts.
    const shown = (await api('staff', 'get', '/platform/customers/settings').expect(200)).body as { key: string; value: number; default: number }[];
    expect(shown.find((s) => s.key === 'cs.alert.health_below')).toMatchObject({ value: 81, default: 50 });
    expect((await row('A')).alerts).toEqual(['Health score below 81']);
    expect((await row('C')).alerts).toEqual(['Health score below 81']); // 40 days is now under 45
    const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { actorUserId: users.staff, action: 'platform.setting.changed', entityId: 'cs.alert.health_below' }, orderBy: { createdAt: 'desc' } }));
    expect(JSON.parse(audit!.metadataJson!)).toMatchObject({ before: '50', after: '81', reason: 'Testing the alert rules' });
    await set('cs.alert.health_below', '50').expect(200);
    await set('cs.alert.admin_idle_days', '30').expect(200);
  });

  it('bad messages are refused: no company, a closed or unknown company, a short or marked-up subject', async () => {
    const write = (body: Record<string, unknown>) => api('staff', 'post', '/platform/customers/messages').send({ companyIds: [org.A], subject: 'Payroll readiness', body: 'Twelve people lack bank details.', ...body });
    await write({ companyIds: [] }).expect(400);
    await write({ companyIds: [org.Z] }).expect(400);
    await write({ companyIds: [randomUUID()] }).expect(400);
    await write({ subject: 'Hi' }).expect(400);
    await write({ subject: 'Hello <b>there</b>' }).expect(400);
    await write({ body: '' }).expect(400);
    await write({ extra: 1 }).expect(400);
  });

  let single = '';
  it('one company: sent at once to its System Admins (bell, email, its own copy, its audit log); nobody else sees it', async () => {
    sent.length = 0;
    const list = (await api('staff', 'post', '/platform/customers/messages').send({ companyIds: [org.A], subject: `Trial ends soon ${run}`, body: 'Here is how to switch on.\n\nWrite to us any time.' }).expect(201)).body;
    const m = list.find((x: { subject: string }) => x.subject === `Trial ends soon ${run}`);
    single = m.id;
    expect(m).toMatchObject({ status: 'sent', mine: true, decidedBy: null, companyIds: [org.A] });
    // The company's own copy, for its System Admins (Settings > Support access).
    const forA = (await api('adminA', 'get', '/support-access/messages').expect(200)).body;
    expect(forA.map((x: { subject: string }) => x.subject)).toContain(`Trial ends soon ${run}`);
    expect(forA[0].body).toBe('Here is how to switch on.\n\nWrite to us any time.');
    await api('panelA', 'get', '/support-access/messages').expect(403);
    expect((await api('adminB', 'get', '/support-access/messages').expect(200)).body).toEqual([]);
    // Bell and email for A's System Admin; nothing for B.
    expect(await inOrg(org.A, (tx) => tx.userNotification.count({ where: { recipientUserId: users.adminA, type: 'yukthix.admin_message' } }))).toBe(1);
    expect(await inOrg(org.B, (tx) => tx.userNotification.count({ where: { type: 'yukthix.admin_message' } }))).toBe(0);
    expect(sent.map((s) => s.to)).toContain(`admin-a-${run}@cs.test`);
    expect(sent.find((s) => s.to === `admin-a-${run}@cs.test`)?.subject).toBe(`Message from YukthiX: Trial ends soon ${run}`);
    // The company sees it in its own audit log; the platform log has who wrote and sent it.
    expect(await inOrg(org.A, (tx) => tx.auditLog.count({ where: { action: 'yukthix.message.received' } }))).toBe(1);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { entityId: single, action: { in: ['platform.message.written', 'platform.message.sent'] } } }))).toBe(2);
  });

  let multi = '';
  it('more than one company: waits for a second staff member, never the writer; approving needs a fresh step-up', async () => {
    const list = (await api('staff', 'post', '/platform/customers/messages').send({ companyIds: [org.A, org.B], subject: `Payroll readiness ${run}`, body: 'Check bank details before the run.' }).expect(201)).body;
    const m = list.find((x: { subject: string }) => x.subject === `Payroll readiness ${run}`);
    multi = m.id;
    expect(m).toMatchObject({ status: 'pending_approval', version: 1 });
    expect((await api('adminB', 'get', '/support-access/messages').expect(200)).body).toEqual([]); // nothing sent yet
    expect((await api('staff', 'post', `/platform/customers/messages/${multi}/approve`).send({ version: 1 }).expect(403)).body.message).toBe('You wrote this message. Another staff member approves it.');
    await down('staff2');
    await api('staff2', 'post', `/platform/customers/messages/${multi}/approve`).send({ version: 1 }).expect(403);
    await up('staff2');
    await api('staff2', 'post', `/platform/customers/messages/${multi}/approve`).send({ version: 9 }).expect(409);
    const done = (await api('staff2', 'post', `/platform/customers/messages/${multi}/approve`).send({ version: 1 }).expect(200)).body.find((x: { id: string }) => x.id === multi);
    expect(done).toMatchObject({ status: 'sent', decidedBy: 'Staff staff2' });
    await api('staff2', 'post', `/platform/customers/messages/${multi}/approve`).send({ version: 2 }).expect(409);
    // A and B each have their copy; C has none; A never sees B's copy (forced RLS).
    expect((await api('adminB', 'get', '/support-access/messages').expect(200)).body.map((x: { subject: string }) => x.subject)).toEqual([`Payroll readiness ${run}`]);
    expect((await api('adminC', 'get', '/support-access/messages').expect(200)).body).toEqual([]);
    expect(await inOrg(org.A, (tx) => tx.companyMessage.count({ where: { organizationId: org.B } }))).toBe(0);
    expect(await inOrg(org.A, (tx) => tx.companyMessage.count())).toBe(2);
  });

  it('sending back needs another staff member and a reason; nothing is sent', async () => {
    const list = (await api('staff', 'post', '/platform/customers/messages').send({ companyIds: [org.B, org.C], subject: `Survey ${run}`, body: 'Tell us how we are doing.' }).expect(201)).body;
    const id = list.find((x: { subject: string }) => x.subject === `Survey ${run}`).id;
    await api('staff', 'post', `/platform/customers/messages/${id}/reject`).send({ version: 1, note: 'Not now' }).expect(403);
    await api('staff2', 'post', `/platform/customers/messages/${id}/reject`).send({ version: 1 }).expect(400);
    const back = (await api('staff2', 'post', `/platform/customers/messages/${id}/reject`).send({ version: 1, note: 'Too soon after the last one' }).expect(200)).body.find((x: { id: string }) => x.id === id);
    expect(back).toMatchObject({ status: 'rejected', decisionNote: 'Too soon after the last one', decidedBy: 'Staff staff2' });
    expect((await api('adminC', 'get', '/support-access/messages').expect(200)).body).toEqual([]);
    await api('staff2', 'post', `/platform/customers/messages/${id}/approve`).send({ version: 2 }).expect(409);
  });

  it('the database keeps staff data from companies, and the writer can never be the approver', async () => {
    expect(await inOrg(org.A, (tx) => tx.yukthixMessage.count())).toBe(0);
    expect(await inOrg(org.A, (tx) => tx.platformSetting.count())).toBe(0);
    await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.yukthixMessage.update({ where: { id: multi }, data: { decidedBy: users.staff } }))).rejects.toThrow();
    expect(single).not.toBe('');
  });
});
