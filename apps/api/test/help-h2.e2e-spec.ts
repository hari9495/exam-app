import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// Help and onboarding H-2 (founder answers 946 and 947), against the real database (forced RLS).
// 946: anyone asks for access from a "You don't have access" page (a reason, how long up to the company's longest
// access); System Admins approve with a role grant that ends by itself (a Confidential role still waits for a second
// admin) or refuse with a reason; nobody decides their own; the company can turn requests off; all audited.
// 947: a 404 carries a short reference (the same for a missing record and another company's), that support looks up.
describe('Help H-2: request access and Not found references', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'anitha' | 'suresh' | 'agent' | 'admin1' | 'admin2' | 'adminB' | 'acting';
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@helph2.test`;
  const roles: Record<string, string> = {};
  const ask = (who: Who, page: string, body: Record<string, unknown> = {}) => api(who, 'post', '/access/requests').send({ page, what: 'payroll runs', reason: 'I cover the October run while Suresh is on leave.', days: 14, ...body });
  const approve = async (who: Who, id: string, body: Record<string, unknown>, status: number) => {
    await markSteppedUp(tenantPrisma, token[who]);
    return api(who, 'post', `/access/requests/${id}/approve`).send({ scopeType: 'tenant', reason: 'Covering the run', ...body }).expect(status);
  };
  const audits = (action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const notices = (who: Who, type: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, recipientUserId: users[who], type } }));
  const NF = /^NF-[A-HJ-NP-Z2-9]{6}$/;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `helph2-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `helph2-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = (k: 'A' | 'B', keys: string[], name: string) => tenantPrisma.forTenant(ctx(k), (tx) => tx.permissionProfile.create({ data: { organizationId: org[k].id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    roles.reports = await profile('A', ['payroll.reports.view'], 'Payroll reports');
    roles.salary = await profile('A', ['employee.salary.view'], 'Salary viewer');
    const agentRole = await profile('A', ['desk.ticket.view'], 'Helpdesk agent');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string | null][] = [
      ['anitha', 'A', 'panel', null],
      ['suresh', 'A', 'panel', null],
      ['agent', 'A', 'panel', agentRole],
      ['admin1', 'A', 'org_admin', null],
      ['admin2', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), name: `${name[0]!.toUpperCase()}${name.slice(1)}`, passwordHash, role, permissionProfileId } }))).id;
    }
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin1', 'post', `/auth/impersonate/${users.anitha}`).expect(200)).body.accessToken;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('946 request access', () => {
    const req: Record<string, string> = {};

    it('a no-access page reads the company rules: on, up to 30 days, nothing asked yet', async () => {
      expect((await api('anitha', 'get', '/access/requests/mine?page=/yx/payroll/runs').expect(200)).body).toEqual({ allowed: true, maxDays: 30, sent: null });
    });

    it('a person asks with a reason and how long; the System Admins are told and it is audited', async () => {
      const r = (await ask('anitha', '/yx/payroll/runs?tab=open').expect(201)).body;
      expect(r).toMatchObject({ page: '/yx/payroll/runs', what: 'payroll runs', days: 14, state: 'waiting', user: { id: users.anitha } });
      req.reports = r.id;
      expect((await api('anitha', 'get', '/access/requests/mine?page=/yx/payroll/runs').expect(200)).body.sent).toMatchObject({ id: r.id, state: 'waiting' });
      expect(await notices('admin1', 'access.request.waiting')).toHaveLength(1);
      expect(await notices('admin2', 'access.request.waiting')).toHaveLength(1);
      expect(await notices('anitha', 'access.request.waiting')).toHaveLength(0);
      expect((await audits('access.request.sent')).map((a) => a.entityId)).toContain(r.id);
    });

    it('refuses a short reason, too many days, a bad page, a second open request for the page, and acting for someone', async () => {
      await ask('anitha', '/yx/people/succession', { reason: 'need it' }).expect(400);
      await ask('anitha', '/yx/people/succession', { days: 31 }).expect(400);
      await ask('anitha', '/yx/people/succession', { days: 0 }).expect(400);
      await ask('anitha', 'https://evil.test/x').expect(400);
      await ask('anitha', '/yx/payroll/runs').expect(409);
      await ask('acting', '/yx/people/succession').expect(403);
    });

    it('only people who can grant access list requests; another company sees none of them', async () => {
      await api('anitha', 'get', '/access/requests').expect(403);
      await api('agent', 'get', '/access/requests').expect(403);
      expect((await api('adminB', 'get', '/access/requests').expect(200)).body.rows).toEqual([]);
      const list = (await api('admin1', 'get', '/access/requests').expect(200)).body;
      expect(list.maxDays).toBe(30);
      expect(list.rows.map((r: { id: string }) => r.id)).toContain(req.reports);
    });

    it('waiting requests join the System Admins’ Approvals inbox, never the asker’s', async () => {
      const inbox = (who: Who) => api(who, 'get', '/workflow/approvals/inbox').then((r) => (r.body?.items ?? r.body ?? []) as { requestId: string }[]);
      const mine = await inbox('admin1');
      expect(Array.isArray(mine) && mine.some((i) => i.requestId === req.reports)).toBe(true);
      const theirs = await inbox('anitha');
      expect(Array.isArray(theirs) ? theirs.some((i) => i.requestId === req.reports) : false).toBe(false);
    });

    it('approving needs a last day within the longest access; another company gets 404', async () => {
      await approve('admin1', req.reports, { permissionProfileId: roles.reports }, 400);
      await approve('admin1', req.reports, { permissionProfileId: roles.reports, validTo: addDays(today, 30) }, 400);
      await approve('adminB', req.reports, { permissionProfileId: roles.reports, validTo: addDays(today, 13) }, 404);
      await api('anitha', 'post', `/access/requests/${req.reports}/approve`).send({ permissionProfileId: roles.reports, scopeType: 'tenant', reason: 'x', validTo: addDays(today, 13) }).expect(403);
    });

    it('approved: a grant until the last day, the person is told, audited; it cannot be decided twice', async () => {
      const r = (await approve('admin1', req.reports, { permissionProfileId: roles.reports, validTo: addDays(today, 13) }, 201)).body;
      expect(r).toMatchObject({ state: 'open', validTo: addDays(today, 13), decidedBy: 'Admin1' });
      const grant = await tenantPrisma.forTenant(SUPER, (tx) => tx.roleGrant.findFirstOrThrow({ where: { organizationId: org.A.id, userId: users.anitha } }));
      expect(grant).toMatchObject({ status: 'active', permissionProfileId: roles.reports, scopeType: 'tenant', grantedBy: users.admin1 });
      expect(grant.validTo?.toISOString().slice(0, 10)).toBe(addDays(today, 13));
      expect(await notices('anitha', 'access.request.decided')).toHaveLength(1);
      expect((await audits('access.request.approved')).map((a) => a.entityId)).toContain(req.reports);
      await approve('admin2', req.reports, { permissionProfileId: roles.reports, validTo: addDays(today, 13) }, 409);
      await api('admin2', 'post', `/access/requests/${req.reports}/refuse`).send({ reason: 'Too late' }).expect(409);
    });

    it('the access ends by itself on its last day', async () => {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.roleGrant.updateMany({ where: { organizationId: org.A.id, userId: users.anitha }, data: { validFrom: new Date(`${addDays(today, -3)}T00:00:00Z`), validTo: new Date(`${addDays(today, -1)}T00:00:00Z`) } }));
      expect((await api('anitha', 'get', '/access/requests/mine?page=/yx/payroll/runs').expect(200)).body.sent.state).toBe('ended');
    });

    it('nobody decides their own request', async () => {
      const own = (await ask('admin2', '/yx/people/succession', { what: 'succession plans' }).expect(201)).body;
      await approve('admin2', own.id, { permissionProfileId: roles.reports, validTo: addDays(today, 6) }, 403);
      await api('admin2', 'post', `/access/requests/${own.id}/refuse`).send({ reason: 'Mine' }).expect(403);
      await api('admin1', 'post', `/access/requests/${own.id}/refuse`).send({ reason: 'Succession stays with HR leadership.' }).expect(201);
    });

    it('refusing needs a reason; the person reads it and can ask again', async () => {
      const r = (await ask('suresh', '/yx/people/succession', { what: 'succession plans' }).expect(201)).body;
      await api('admin1', 'post', `/access/requests/${r.id}/refuse`).send({ reason: ' ' }).expect(400);
      const refused = (await api('admin1', 'post', `/access/requests/${r.id}/refuse`).send({ reason: 'Succession stays with HR leadership.' }).expect(201)).body;
      expect(refused).toMatchObject({ state: 'refused', decisionNote: 'Succession stays with HR leadership.' });
      expect(await notices('suresh', 'access.request.decided')).toHaveLength(1);
      expect((await audits('access.request.refused')).map((a) => a.entityId)).toContain(r.id);
      await ask('suresh', '/yx/people/succession', { what: 'succession plans' }).expect(201);
    });

    it('a Confidential role still waits for a second admin, who neither gave it nor receives it', async () => {
      const r = (await ask('suresh', '/yx/people/pay', { what: 'salaries' }).expect(201)).body;
      const out = (await approve('admin1', r.id, { permissionProfileId: roles.salary, validTo: addDays(today, 6) }, 201)).body;
      expect(out.state).toBe('approval');
      const grant = await tenantPrisma.forTenant(SUPER, (tx) => tx.roleGrant.findFirstOrThrow({ where: { organizationId: org.A.id, userId: users.suresh, permissionProfileId: roles.salary } }));
      expect(grant.status).toBe('pending');
      await markSteppedUp(tenantPrisma, token.admin1);
      await api('admin1', 'post', `/access/grants/${grant.id}/approve`).send({}).expect(403);
      await markSteppedUp(tenantPrisma, token.admin2);
      await api('admin2', 'post', `/access/grants/${grant.id}/approve`).send({}).expect(201);
      expect((await api('suresh', 'get', '/access/requests/mine?page=/yx/people/pay').expect(200)).body.sent.state).toBe('open');
    });

    it('the company can turn requests off, and set the longest access', async () => {
      await tenantPrisma.forTenant(ctx('A'), (tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'access.request.max_days', value: '7' } }));
      expect((await api('anitha', 'get', '/access/requests/mine?page=/yx/time/registers').expect(200)).body).toMatchObject({ allowed: true, maxDays: 7 });
      await ask('anitha', '/yx/time/registers', { days: 14 }).expect(400);
      await tenantPrisma.forTenant(ctx('A'), (tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'access.request.allowed', value: 'off' } }));
      expect((await api('anitha', 'get', '/access/requests/mine?page=/yx/time/registers').expect(200)).body.allowed).toBe(false);
      await ask('anitha', '/yx/time/registers', { days: 7 }).expect(403);
    });
  });

  describe('947 Not found references', () => {
    let missing: { body: Record<string, unknown> };
    let foreign: { body: Record<string, unknown> };

    it('a missing record and another company’s record give the same 404, each with a reference', async () => {
      missing = await api('admin1', 'get', `/access/users/${randomUUID()}/effective`).expect(404);
      foreign = await api('admin1', 'get', `/access/users/${users.adminB}/effective`).expect(404);
      for (const r of [missing, foreign]) expect(r.body.reference).toMatch(NF);
      expect(Object.keys(missing.body).sort()).toEqual(Object.keys(foreign.body).sort());
      expect(missing.body.message).toEqual(foreign.body.message);
      expect(missing.body.reference).not.toEqual(foreign.body.reference);
      // Written in the asker's company only, with the address they asked for (no query).
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.notFoundRef.findMany({ where: { code: { in: [missing.body.reference as string, foreign.body.reference as string] } } }));
      expect(rows.map((r) => r.organizationId)).toEqual([org.A.id, org.A.id]);
      expect(rows.every((r) => r.userId === users.admin1 && r.path.startsWith('/api/v1/access/users/'))).toBe(true);
    });

    it('support looks a reference up: who, when, which address; nothing about the record', async () => {
      const found = (await api('agent', 'get', `/help/not-found/${foreign.body.reference as string}`).expect(200)).body;
      expect(found).toEqual({ code: foreign.body.reference, at: expect.any(String), who: 'Admin1', path: `/api/v1/access/users/${users.adminB}/effective` });
      expect((await api('admin2', 'get', `/help/not-found/${(missing.body.reference as string).toLowerCase()}`).expect(200)).body.code).toBe(missing.body.reference);
    });

    it('another company, a person without the keys, a bad code and an unknown code are refused', async () => {
      const lookUp404 = await api('adminB', 'get', `/help/not-found/${missing.body.reference as string}`).expect(404);
      expect(lookUp404.body.reference).toBeUndefined(); // the lookup itself makes no reference
      await api('anitha', 'get', `/help/not-found/${missing.body.reference as string}`).expect(403);
      await api('agent', 'get', '/help/not-found/NF-0OI1AA').expect(400);
      await api('agent', 'get', '/help/not-found/NF-ZZZZZZ').expect(404);
    });

    it('the web Not found page gets a reference for its address; signed out, a 404 has none', async () => {
      const r = (await api('anitha', 'post', '/help/not-found').send({ path: '/yx/no-such-page' }).expect(201)).body;
      expect(r.reference).toMatch(NF);
      expect((await api('agent', 'get', `/help/not-found/${r.reference}`).expect(200)).body).toMatchObject({ who: 'Anitha', path: '/yx/no-such-page' });
      await api('anitha', 'post', '/help/not-found').send({ path: 'no-slash' }).expect(400);
      const anonymous = await request(server()).get(`/api/v1/no-such-route-${runId}`).expect(404);
      expect(anonymous.body.reference).toBeUndefined();
    });
  });
});
