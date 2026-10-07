import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// Step 3, the YukthiX platform console, end to end against the real database (forced RLS, app role): staff-only
// access (P14 YX-CONSOLE-01, P12 Q7), company lifecycle and prices with reasons and audit (YX-CONSOLE-02, YX-TEN-08,
// YX-BILL-13), support sessions (P02 Q8 / YX-SEC-20: asked, approved by the company, time-boxed, read-only, every
// request recorded, pay and identity out of reach), the platform audit log and the shared SMS account's new home.
describe('YukthiX platform console (step 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '', C: '' };
  const slugA = `pc-a-${runId}`;
  let planId: string;
  type Who = 'staff' | 'staff2' | 'staffNoKey' | 'adminA' | 'panelA' | 'adminB' | 'adminC';
  const api = (who: Who | string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) =>
    request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  /** The step-up window has passed (P12 YX-IAM-02); the session stays AAL2. */
  const down = async (who: Who) => {
    const { sid } = JSON.parse(Buffer.from(token[who].split('.')[1], 'base64url').toString()) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 3_600_000) } }));
  };
  const companyLogin = async (who: Who, slug: string, email: string) => {
    token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
  };
  const audit = (organizationId: string | null, where: Record<string, unknown>) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, ...where }, orderBy: { createdAt: 'asc' } }));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);

    // Staff accounts (no company), signed in on their own page.
    for (const who of ['staff', 'staff2', 'staffNoKey'] as const) {
      const email = `${who.toLowerCase()}-${runId}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // A security key proven on the session (AAL2) for the two working staff members.
    await up('staff');
    await up('staff2');

    planId = (await prisma.plan.create({ data: { name: `pc-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    org.B = (await prisma.organization.create({ data: { name: `PC Other ${runId}`, slug: `pc-b-${runId}`, planId } })).id;
    users.adminB = (await tenantPrisma.forTenant({ organizationId: org.B, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.B, email: `admin-b-${runId}@pc.test`, passwordHash, role: 'org_admin' } }))).id;
    await companyLogin('adminB', `pc-b-${runId}`, `admin-b-${runId}@pc.test`);
    await up('adminB');
    // Org B is closed below; org C is the other company that stays open for the cross-company checks.
    org.C = (await prisma.organization.create({ data: { name: `PC Third ${runId}`, slug: `pc-c-${runId}`, planId } })).id;
    users.adminC = (await tenantPrisma.forTenant({ organizationId: org.C, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.C, email: `admin-c-${runId}@pc.test`, passwordHash, role: 'org_admin' } }))).id;
    await companyLogin('adminC', `pc-c-${runId}`, `admin-c-${runId}@pc.test`);
    await up('adminC');
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A, org.B, org.C].filter(Boolean) } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // =====================================================================================================
  describe('who may use the console (P14 YX-CONSOLE-01, P12 Q7)', () => {
    it('YukthiX staff only, with their security key: a company admin and a staff session without a key are refused', async () => {
      await api('adminB', 'get', '/platform/companies').expect(403);
      const noKey = await api('staffNoKey', 'get', '/platform/companies').expect(403);
      expect(noKey.body.code).toBe('MFA_REQUIRED');
      await api('staff', 'get', '/platform/companies').expect(200);
      await request(server()).get('/api/v1/platform/companies').expect(401);
    });
  });

  // =====================================================================================================
  describe('companies and their lifecycle (P14 §3, §6 flow 5)', () => {
    it('creates a company in a 30-day trial with its products, default legal entity and invited System Admin', async () => {
      const body = { name: 'Godavari Agro', slug: slugA, adminEmail: `admin-a-${runId}@pc.test`, adminName: 'Sunita Rao', products: ['hrms'] };
      await api('staff', 'post', '/platform/companies').send({ ...body, slug: 'Bad Slug' }).expect(400);
      await api('staff', 'post', '/platform/companies').send({ ...body, products: ['payroll_pro'] }).expect(400);
      await api('staff', 'post', '/platform/companies').send({ ...body, products: [] }).expect(400);
      await api('staff', 'post', '/platform/companies').send({ ...body, extra: 'x' }).expect(400);
      org.A = (await api('staff', 'post', '/platform/companies').send(body).expect(201)).body.id;
      await api('staff', 'post', '/platform/companies').send(body).expect(409);
      expect(sent.some((m) => m.to === body.adminEmail)).toBe(true);

      const detail = (await api('staff', 'get', `/platform/companies/${org.A}`).expect(200)).body;
      expect(detail).toMatchObject({ name: 'Godavari Agro', slug: slugA, lifecycle: 'trial', signInAllowed: true, products: ['hrms'], employees: 0, trialExtended: false });
      expect(detail.trialEndsAt.slice(0, 10)).toBe(addDays(todayIst(), 30));
      expect(detail.admins).toEqual([{ name: 'Sunita Rao', email: body.adminEmail, status: 'active' }]);
      const created = await audit(org.A, { action: 'platform.company.created' });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ actorUserId: users.staff, actorEmail: `staff-${runId}@platform.test`, actorRole: 'super_admin' });

      // The company admin signs in with a password of their own (set here instead of through the invite link).
      users.adminA = (await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.user.findFirstOrThrow({ where: { organizationId: org.A, email: body.adminEmail } }))).id;
      const passwordHash = await argon2.hash(PASSWORD);
      await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, async (tx) => {
        await tx.user.update({ where: { id: users.adminA }, data: { passwordHash } });
        users.panelA = (await tx.user.create({ data: { organizationId: org.A, email: `panel-a-${runId}@pc.test`, passwordHash, role: 'panel' } })).id;
      });
      await companyLogin('adminA', slugA, body.adminEmail);
      await companyLogin('panelA', slugA, `panel-a-${runId}@pc.test`);
    });

    it('lists and searches companies with account facts only (no HR data)', async () => {
      const list = (await api('staff', 'get', `/platform/companies?search=${runId}`).expect(200)).body;
      expect(list.map((c: { id: string }) => c.id).sort()).toEqual([org.A, org.B, org.C].sort());
      expect(Object.keys(list[0]).sort()).toEqual(['createdAt', 'employees', 'id', 'lifecycle', 'name', 'products', 'signInAllowed', 'slug', 'trialEndsAt']);
      expect((await api('staff', 'get', `/platform/companies?search=${runId}&lifecycle=trial`).expect(200)).body.map((c: { id: string }) => c.id)).toEqual([org.A]);
      await api('staff', 'get', '/platform/companies?lifecycle=gone').expect(400);
      await api('staff', 'get', `/platform/companies/${randomUUID()}`).expect(404);
      await api('staff', 'get', '/platform/companies/not-a-uuid').expect(400);
    });

    it('extends a trial once, by at most 14 days, with a reason', async () => {
      await api('staff', 'post', `/platform/companies/${org.A}/extend-trial`).send({ days: 15, reason: 'Set-up call booked' }).expect(400);
      await api('staff', 'post', `/platform/companies/${org.A}/extend-trial`).send({ days: 7 }).expect(400);
      const res = (await api('staff', 'post', `/platform/companies/${org.A}/extend-trial`).send({ days: 14, reason: 'Set-up call booked' }).expect(200)).body;
      expect(res.trialEndsAt.slice(0, 10)).toBe(addDays(todayIst(), 44));
      await api('staff', 'post', `/platform/companies/${org.A}/extend-trial`).send({ days: 1, reason: 'Once more please' }).expect(409);
      await api('staff', 'post', `/platform/companies/${org.B}/extend-trial`).send({ days: 1, reason: 'Not in trial' }).expect(409);
    });

    it('suspends with a step-up and a reason; sign-in stops; reinstating returns the company to its trial', async () => {
      await down('staff');
      expect((await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'suspend', reason: 'Payment fraud check' }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
      await up('staff');
      await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'suspend' }).expect(400);
      await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'delete', reason: 'Not a move' }).expect(400);
      const suspended = (await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'suspend', reason: 'Payment fraud check' }).expect(200)).body;
      expect(suspended).toMatchObject({ lifecycle: 'suspended', signInAllowed: false });
      // Everyone already signed in there is signed out at once.
      await api('adminA', 'get', '/rbac/me/permissions?keys=org:view').expect(401);
      await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slugA, email: `admin-a-${runId}@pc.test`, password: PASSWORD }).expect(401);
      const back = (await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'reinstate', reason: 'Check cleared' }).expect(200)).body;
      expect(back).toMatchObject({ lifecycle: 'trial', signInAllowed: true });
      await companyLogin('adminA', slugA, `admin-a-${runId}@pc.test`);
      await companyLogin('panelA', slugA, `panel-a-${runId}@pc.test`);
      await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'reinstate', reason: 'Twice' }).expect(409);
      const moves = await audit(org.A, { action: 'platform.company.lifecycle' });
      expect(moves.map((m) => JSON.parse(m.metadataJson!))).toEqual([
        { from: 'trial', to: 'suspended', reason: 'Payment fraud check', signedOut: 2 },
        { from: 'suspended', to: 'trial', reason: 'Check cleared', signedOut: 0 },
      ]);
      // Visible to the company's own admins in their audit log (YX-CONSOLE-02).
      const seen = (await api('adminA', 'get', '/audit-logs?limit=100&action=platform.company.lifecycle').expect(200)).body;
      expect(JSON.stringify(seen)).toContain('platform.company.lifecycle');
    });

    it('a closed company stays closed; the older status switch keeps the lifecycle in step', async () => {
      await prisma.organization.update({ where: { id: org.B }, data: { status: 'suspended' } });
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.B } })).lifecycle).toBe('suspended');
      await prisma.organization.update({ where: { id: org.B }, data: { status: 'active' } });
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.B } })).lifecycle).toBe('active');
      await up('staff');
      const closed = (await api('staff', 'post', `/platform/companies/${org.B}/lifecycle`).send({ action: 'close', reason: 'Customer left' }).expect(200)).body;
      expect(closed).toMatchObject({ lifecycle: 'closed', signInAllowed: false });
      for (const action of ['reinstate', 'activate', 'suspend']) await api('staff', 'post', `/platform/companies/${org.B}/lifecycle`).send({ action, reason: 'Try to reopen' }).expect(409);
    });
  });

  // =====================================================================================================
  describe('plans and prices (YX-BILL-01/13/14)', () => {
    let scheduled: string;

    it('one plan per product with the decided launch prices', async () => {
      const plans = (await api('staff', 'get', '/platform/products').expect(200)).body;
      const price = (code: string, currency: string) => plans.find((p: { code: string }) => p.code === code).prices.find((r: { currency: string; state: string }) => r.currency === currency && r.state === 'current');
      expect(price('hrms', 'INR')).toMatchObject({ unitPrice: 99, minimumMonthly: 499 });
      expect(price('hrms', 'USD')).toMatchObject({ unitPrice: 1, minimumMonthly: 5 });
      expect(price('service_desk', 'INR')).toMatchObject({ unitPrice: 999, minimumMonthly: 999 });
      expect(price('service_desk', 'USD')).toMatchObject({ unitPrice: 10, minimumMonthly: 10 });
      await api('adminA', 'get', '/platform/products').expect(403);
    });

    it('a new price gives 90 days notice, needs a step-up, and a price in force is never removed', async () => {
      const at = (days: number) => addDays(todayIst(), days);
      const body = { currency: 'INR', unitPrice: 109, minimumMonthly: 549, reason: 'Test price change' };
      await up('staff');
      expect((await api('staff', 'post', '/platform/products/hrms/prices').send({ ...body, validFrom: at(10) }).expect(400)).body.message).toContain(at(90));
      await api('staff', 'post', '/platform/products/hrms/prices').send({ ...body, validFrom: at(-1) }).expect(400);
      await api('staff', 'post', '/platform/products/hrms/prices').send({ ...body, unitPrice: 0, validFrom: at(400) }).expect(400);
      await api('staff', 'post', '/platform/products/hrms/prices').send({ ...body, unitPrice: 99.999, validFrom: at(400) }).expect(400);
      await api('staff', 'post', '/platform/products/nope/prices').send({ ...body, validFrom: at(400) }).expect(404);
      const plans = (await api('staff', 'post', '/platform/products/hrms/prices').send({ ...body, validFrom: at(400) }).expect(201)).body;
      const row = plans.find((p: { code: string }) => p.code === 'hrms').prices.find((r: { validFrom: string }) => r.validFrom === at(400));
      expect(row).toMatchObject({ state: 'scheduled', unitPrice: 109, minimumMonthly: 549 });
      scheduled = row.id;
      await api('staff', 'post', '/platform/products/hrms/prices').send({ ...body, validFrom: at(400) }).expect(409);
      await down('staff');
      await api('staff', 'delete', `/platform/products/prices/${scheduled}`).expect(403);
      await up('staff');
      await api('staff', 'delete', `/platform/products/prices/${scheduled}`).expect(200);
      const current = plans.find((p: { code: string }) => p.code === 'hrms').prices.find((r: { currency: string; state: string }) => r.currency === 'INR' && r.state === 'current');
      await api('staff', 'delete', `/platform/products/prices/${current.id}`).expect(409);
      // The database refuses too, and the app role may not edit a price at all.
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.productPrice.delete({ where: { id: current.id } }))).rejects.toThrow(/never removed/);
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.productPrice.update({ where: { id: current.id }, data: { unitPrice: 1 } }))).rejects.toThrow();
      expect((await audit(null, { action: { in: ['platform.price.scheduled', 'platform.price.withdrawn'] }, entityId: scheduled })).map((a) => a.action)).toEqual(['platform.price.scheduled', 'platform.price.withdrawn']);
    });
  });

  // =====================================================================================================
  describe('support sessions (P02 Q8, YX-SEC-20)', () => {
    let sessionId: string;
    let acting: string;

    it('no company access without a session the company approved', async () => {
      expect((await api('staff', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(403)).body.code).toBe('SUPPORT_SESSION_REQUIRED');
      await api('adminA', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Payroll stuck at readiness', hours: 4 }).expect(403);
    });

    it('staff ask with a reason and at most 72 hours; one open request each; the company admins are told', async () => {
      await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'short', hours: 4 }).expect(400);
      await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Payroll stuck at readiness', hours: 73 }).expect(400);
      await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Payroll stuck at readiness', hours: 4, ticket: 'bad ticket!' }).expect(400);
      await api('staff', 'post', `/platform/companies/${org.B}/support-sessions`).send({ reason: 'Closed company check', hours: 4 }).expect(409);
      sent.length = 0;
      const s = (await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Payroll stuck at readiness', hours: 4, ticket: 'TKT-8841' }).expect(201)).body;
      expect(s).toMatchObject({ status: 'requested', hours: 4, ticket: 'TKT-8841', requestedBy: 'Staff staff' });
      sessionId = s.id;
      await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Second request at once', hours: 4 }).expect(409);
      await new Promise((r) => setTimeout(r, 300)); // the admin email is sent in the background
      expect(sent.map((m) => m.to)).toContain(`admin-a-${runId}@pc.test`);
    });

    it('only the company System Admin sees and decides; another company sees nothing; staff cannot approve', async () => {
      expect((await api('adminA', 'get', '/support-access').expect(200)).body.map((r: { id: string }) => r.id)).toEqual([sessionId]);
      expect((await api('adminC', 'get', '/support-access').expect(200)).body).toEqual([]);
      await api('adminC', 'post', `/support-access/${sessionId}/approve`).send({}).expect(404);
      await api('panelA', 'get', '/support-access').expect(403);
      await api('staff', 'post', `/support-access/${sessionId}/approve`).send({}).expect(403);
      // RLS: another company's context reads none of it.
      expect(await tenantPrisma.forTenant({ organizationId: org.B, isSuperAdmin: false }, (tx) => tx.supportSession.count({ where: { id: sessionId } }))).toBe(0);
    });

    it('approving needs a step-up and never gives more hours than asked', async () => {
      await down('adminA');
      await api('adminA', 'post', `/support-access/${sessionId}/approve`).send({}).expect(403);
      await up('adminA');
      await api('adminA', 'post', `/support-access/${sessionId}/approve`).send({ hours: 0 }).expect(400);
      const ok = (await api('adminA', 'post', `/support-access/${sessionId}/approve`).send({ hours: 72, note: 'Go ahead' }).expect(200)).body;
      expect(ok.status).toBe('approved');
      expect(new Date(ok.endsAt).getTime() - new Date(ok.startsAt).getTime()).toBe(4 * 3_600_000);
      await api('adminA', 'post', `/support-access/${sessionId}/approve`).send({}).expect(409);
      await api('adminA', 'post', `/support-access/${sessionId}/decline`).send({}).expect(409);
    });

    it('inside the session: read-only, held to that company, every request recorded; never from another staff member', async () => {
      await api('staff2', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(403);
      acting = (await api('staff', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(200)).body.accessToken;
      const claims = JSON.parse(Buffer.from(acting.split('.')[1], 'base64url').toString());
      expect(claims).toMatchObject({ actingSuperAdmin: true, organizationId: org.A, supportSessionId: sessionId });
      expect(claims.exp * 1000).toBeLessThanOrEqual(Date.now() + 4 * 3_600_000 + 5000);

      const entities = (await api(acting, 'get', '/org/legal-entities').expect(200)).body;
      expect(entities.map((e: { name: string }) => e.name)).toEqual(['Godavari Agro']);
      expect((await api(acting, 'post', '/org/legal-entities').send({ name: 'X' }).expect(403)).body.code).toBe('SUPPORT_SESSION_READ_ONLY');
      await api(acting, 'post', `/support-access/${sessionId}/end`).send({}).expect(403);
      await api(acting, 'get', '/platform/companies').expect(403);
      await api(acting, 'post', `/auth/super-admin/switch-into/${org.B}`).expect(403);

      const activity = (await api('adminA', 'get', `/support-access/${sessionId}/activity`).expect(200)).body;
      expect(activity.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['support_session.requested', 'support_session.approved', 'super_admin.org_switch_in', 'support_session.request']));
      expect(activity.find((a: { path: string | null }) => a.path === '/org/legal-entities')).toMatchObject({ method: 'GET', byYukthix: true, by: 'Staff staff' });
      await api('adminC', 'get', `/support-access/${sessionId}/activity`).expect(404);
    });

    it('pay, identity and bank rows are out of reach inside any support session, by RLS', async () => {
      const demo = await prisma.organization.findUnique({ where: { slug: 'demo-org' } });
      if (!demo) return; // the seeded demo company holds pay rows; nothing to compare without it
      const count = (supportSessionId: string | null) =>
        tenantPrisma.forTenant({ organizationId: demo.id, isSuperAdmin: false, supportSessionId }, async (tx) => ({
          pay: await tx.compensation.count(),
          ids: await tx.employeeIdentifiers.count(),
          bank: await tx.employeeBankAccount.count(),
          people: await tx.employee.count(),
        }));
      const normal = await count(null);
      expect(normal.pay).toBeGreaterThan(0);
      expect(await count(randomUUID())).toEqual({ pay: 0, ids: 0, bank: 0, people: normal.people });
    });

    it('the company ends it: the very next request is refused, leaving still works', async () => {
      await up('adminA');
      await api('adminA', 'post', `/support-access/${sessionId}/end`).send({ note: 'Fixed, thanks' }).expect(200);
      expect((await api(acting, 'get', '/org/legal-entities').expect(403)).body.code).toBe('SUPPORT_SESSION_ENDED');
      await api(acting, 'post', '/auth/super-admin/switch-out').expect(200);
      await api('staff', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(403);
      const row = (await api('adminA', 'get', '/support-access').expect(200)).body.find((r: { id: string }) => r.id === sessionId);
      expect(row).toMatchObject({ status: 'ended', endedBy: 'Sunita Rao' });
    });

    it('windows close on their own; unanswered requests lapse after a day; staff withdraw only their own', async () => {
      const now = Date.now();
      const asA = { organizationId: org.A, isSuperAdmin: false };
      const past = await tenantPrisma.forTenant(asA, (tx) =>
        tx.supportSession.create({
          data: { organizationId: org.A, requestedBy: users.staff2, requestedByName: 'Staff staff2', requestedByEmail: 'x@platform.test', reason: 'Old approved session', hours: 1, status: 'approved', decidedBy: users.adminA, decidedByName: 'Sunita Rao', decidedAt: new Date(now - 3 * 3_600_000), startsAt: new Date(now - 2 * 3_600_000), endsAt: new Date(now - 3_600_000) },
        }),
      );
      await api('staff2', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(403);
      const stale = await tenantPrisma.forTenant(asA, (tx) => tx.supportSession.create({ data: { organizationId: org.A, requestedBy: users.staff, requestedByName: 'Staff staff', requestedByEmail: 'x@platform.test', reason: 'Nobody answered this one', hours: 4, createdAt: new Date(now - 25 * 3_600_000) } }));
      const list = (await api('adminA', 'get', '/support-access').expect(200)).body;
      expect(list.find((r: { id: string }) => r.id === past.id).status).toBe('expired');
      expect(list.find((r: { id: string }) => r.id === stale.id).status).toBe('expired');

      const fresh = (await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'One more look at PF set-up', hours: 2 }).expect(201)).body;
      await api('staff2', 'post', `/platform/support-sessions/${fresh.id}/cancel`).expect(404);
      expect((await api('staff', 'post', `/platform/support-sessions/${fresh.id}/cancel`).expect(200)).body.status).toBe('cancelled');
      await api('staff', 'post', `/platform/support-sessions/${fresh.id}/end`).expect(409);
      // A decided session never changes its window, even with the bypass (database guard).
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.supportSession.update({ where: { id: past.id }, data: { status: 'approved' } }))).rejects.toThrow();
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.supportSession.delete({ where: { id: past.id } }))).rejects.toThrow();
      // The staff list shows every company's sessions, mine marked.
      const staffList = (await api('staff', 'get', `/platform/support-sessions?organizationId=${org.A}`).expect(200)).body;
      expect(staffList.find((r: { id: string }) => r.id === sessionId)).toMatchObject({ company: 'Godavari Agro', mine: true, status: 'ended' });
      expect(staffList.find((r: { id: string }) => r.id === past.id)).toMatchObject({ mine: false });
    });
    it('suspending the company ends its support sessions and withdraws waiting requests', async () => {
      const now = Date.now();
      const asA = { organizationId: org.A, isSuperAdmin: false };
      const live = await tenantPrisma.forTenant(asA, (tx) =>
        tx.supportSession.create({
          data: { organizationId: org.A, requestedBy: users.staff2, requestedByName: 'Staff staff2', requestedByEmail: 'x@platform.test', reason: 'Live session before suspension', hours: 2, status: 'approved', decidedBy: users.adminA, decidedByName: 'Sunita Rao', decidedAt: new Date(now), startsAt: new Date(now), endsAt: new Date(now + 2 * 3_600_000) },
        }),
      );
      const waiting = (await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Waiting when the company is suspended', hours: 2 }).expect(201)).body;
      await up('staff');
      await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'suspend', reason: 'Suspension check' }).expect(200);
      await api('staff2', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(403);
      const rows = await tenantPrisma.forTenant(asA, (tx) => tx.supportSession.findMany({ where: { id: { in: [live.id, waiting.id] } }, orderBy: { createdAt: 'asc' } }));
      expect(rows.map((r) => r.status)).toEqual(['ended', 'cancelled']);
      await api('staff', 'post', `/platform/companies/${org.A}/lifecycle`).send({ action: 'reinstate', reason: 'Suspension check over' }).expect(200);
      await companyLogin('adminA', slugA, `admin-a-${runId}@pc.test`);
      await up('adminA');
    });
  });

  // =====================================================================================================
  describe('platform audit log and the shared SMS account', () => {
    it('lists staff actions across companies; the console reads are recorded and shown on request', async () => {
      const page = (await api('staff', 'get', `/platform/audit?organizationId=${org.A}`).expect(200)).body;
      const actions = page.data.map((r: { action: string }) => r.action);
      expect(actions).toEqual(expect.arrayContaining(['platform.company.created', 'platform.company.lifecycle', 'support_session.approved']));
      expect(actions).not.toContain('platform.cross_tenant_read');
      expect(page.data[0].company).toBe('Godavari Agro');
      const reads = (await api('staff', 'get', '/platform/audit?reads=true').expect(200)).body.data;
      expect(reads.some((r: { action: string; details: { purpose?: string } }) => r.action === 'platform.cross_tenant_read' && r.details?.purpose === 'companies.list')).toBe(true);
      await api('adminA', 'get', '/platform/audit').expect(403);
      await api('staff', 'get', '/platform/audit?before=nope').expect(400);
    });

    it('the YukthiX shared SMS account lives in the console, not in company settings', async () => {
      expect((await api('staff', 'get', '/platform/channels/sms').expect(200)).body.scope).toBe('platform');
      await api('staff', 'get', '/notifications/sms').expect(403);
      expect((await api('adminA', 'get', '/notifications/sms').expect(200)).body.scope).toBe('company');
      await api('adminA', 'get', '/platform/channels/sms').expect(403);
      await down('staff');
      await api('staff', 'post', '/platform/channels/sms/accounts').send({ name: 'x', provider: 'dev', config: {} }).expect(403);
    });
  });
});
