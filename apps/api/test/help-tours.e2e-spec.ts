import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Help H-5, founder answer 944: first-run tours. A tour applies once its event has happened, shows once per version,
// its progress is kept per person (forced RLS), the person can stop tours, and the company setting turns them off.
describe('Help H-5: first-run tours (944)', () => {
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
  let planId = '';
  const api = (who: string, method: 'get' | 'put' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const ids = (body: { tours: { id: string }[] }) => body.tours.map((t) => t.id);
  const tourOf = (body: { tours: { id: string }[] }, id: string) => body.tours.find((t) => t.id === id);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `tour-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `tour-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `Tour ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, fn);
      const people: [string, string, string[] | null][] =
        k === 'A'
          ? [['adminA', 'org_admin', null], ['plainA', 'panel', []], ['hrA', 'panel', ['leave.settings.manage', 'leave.view']], ['approverA', 'panel', []], ['payA', 'panel', ['payroll.run.view']]]
          : [['adminB', 'org_admin', null]];
      for (const [who, role, keys] of people) {
        const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k], name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
        const email = `${who.toLowerCase()}-${run}@tour.test`;
        users[who] = (await at((tx) => tx.user.create({ data: { organizationId: org[k], email, name: who, passwordHash, role, permissionProfileId } }))).id;
        token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    await markSteppedUp(tenantPrisma, token.adminA!);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A, org.B].filter(Boolean) } } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a tour applies only once its event has happened', async () => {
    await request(server()).get('/api/v1/help/tours').expect(401);
    expect((await api('plainA', 'get', '/help/tours').expect(200)).body).toEqual({ show: true, stopped: false, tours: [] });
    expect(ids((await api('hrA', 'get', '/help/tours').expect(200)).body)).toEqual(['admin']);
    expect(ids((await api('adminA', 'get', '/help/tours').expect(200)).body)).toContain('admin');
    // Payroll: the key alone is not the event; a pay run must exist.
    expect(ids((await api('payA', 'get', '/help/tours').expect(200)).body)).not.toContain('payroll');
    // Manager: the first request that comes to them to approve.
    expect(ids((await api('approverA', 'get', '/help/tours').expect(200)).body)).toEqual([]);
    await inA(async (tx) => {
      const r = await tx.wfRequest.create({ data: { organizationId: org.A, requestType: 'leave.request', subjectType: 'employee', subjectId: randomUUID(), title: 'Casual leave', steps: [{ name: 'Manager', approverIds: [users.approverA], need: 1, state: 'waiting' }], requesterUserId: null, status: 'pending', currentStep: 0 } });
      await tx.wfTask.create({ data: { organizationId: org.A, requestId: r.id, step: 0, assigneeUserId: users.approverA! } });
    });
    const mgr = (await api('approverA', 'get', '/help/tours').expect(200)).body;
    expect(tourOf(mgr, 'manager')).toEqual({ id: 'manager', version: 1, page: '/yx/approvals', status: null, step: 0 });
  });

  it('progress is saved per person at the current version; only a tour that is theirs; bad input refused', async () => {
    const save = (who: string, id: string, body: Record<string, unknown>) => api(who, 'put', `/help/tours/${id}`).send(body);
    await save('hrA', 'admin', { version: 2, status: 'in_progress', step: 1 }).expect(400);
    await save('hrA', 'admin', { version: 1, status: 'in_progress', step: 3 }).expect(400);
    await save('hrA', 'admin', { version: 1, status: 'stopped', step: 0 }).expect(400);
    await save('hrA', 'admin', { version: 1, status: 'in_progress', step: 0, extra: 1 }).expect(400);
    await save('hrA', 'nosuch', { version: 1, status: 'in_progress', step: 0 }).expect(400);
    await save('plainA', 'admin', { version: 1, status: 'completed', step: 2 }).expect(400); // not their tour
    expect(tourOf((await save('hrA', 'admin', { version: 1, status: 'in_progress', step: 1 }).expect(200)).body, 'admin')).toMatchObject({ status: 'in_progress', step: 1 });
    expect(tourOf((await save('hrA', 'admin', { version: 1, status: 'completed', step: 2 }).expect(200)).body, 'admin')).toMatchObject({ status: 'completed', step: 2 });
    // Another person's progress is their own.
    expect(tourOf((await api('adminA', 'get', '/help/tours').expect(200)).body, 'admin')).toMatchObject({ status: null, step: 0 });
    // Another company never sees company A's progress (forced RLS).
    expect(await tenantPrisma.forTenant({ organizationId: org.B, isSuperAdmin: false }, (tx) => tx.tourProgress.count({ where: { organizationId: org.A } }))).toBe(0);
    expect(await inA((tx) => tx.tourProgress.count({ where: { userId: users.hrA } }))).toBe(1);
  });

  it('a person can stop tours for themselves and start them again', async () => {
    await api('hrA', 'put', '/help/tours/stopped').send({ stopped: 'yes' }).expect(400);
    expect((await api('hrA', 'put', '/help/tours/stopped').send({ stopped: true }).expect(200)).body.stopped).toBe(true);
    expect((await api('adminA', 'get', '/help/tours').expect(200)).body.stopped).toBe(false);
    expect((await api('hrA', 'put', '/help/tours/stopped').send({ stopped: false }).expect(200)).body.stopped).toBe(false);
  });

  it("the company setting 'First-run tours' off stops them for everyone there; acting is refused", async () => {
    await api('adminA', 'put', '/org/settings').send({ key: 'help.tours.show', scopeType: 'tenant', value: 'off' }).expect(200);
    expect((await api('hrA', 'get', '/help/tours').expect(200)).body).toEqual({ show: false, stopped: false, tours: [] });
    expect((await api('adminB', 'get', '/help/tours').expect(200)).body.show).toBe(true);
    await api('adminA', 'put', '/org/settings').send({ key: 'help.tours.show', scopeType: 'tenant', value: 'on' }).expect(200);
    token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.hrA}`).expect(200)).body.accessToken;
    await api('acting', 'get', '/help/tours').expect(403);
    await api('acting', 'put', '/help/tours/admin').send({ version: 1, status: 'completed', step: 2 }).expect(403);
  });
});
