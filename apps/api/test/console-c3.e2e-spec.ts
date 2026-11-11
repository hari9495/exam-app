import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Console C-3, support (founder answers 1051 and 1052), against the real database (forced RLS, app role).
// 1051: YukthiX staff look a Not found reference up across companies in Console › Support desk: every company that has
// the code, with when and the page, never who or the record; the read is audited through platformRead.
// 1052: inside a company support session the Helpdesk look-up works (read only); the rest of /help stays refused.
describe('Console C-3: Not found references for YukthiX support', () => {
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
  const CODE = `NF-${runId.replace(/[^a-z2-9]/gi, '').toUpperCase().replace(/[01IO]/g, 'A').padEnd(6, 'Z').slice(0, 6)}`;
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]);
  const companyLogin = async (who: string, slug: string, email: string) => {
    token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
  };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    users.staff = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email: `staff-${runId}@platform.test`, name: 'Staff C3', passwordHash, role: 'super_admin', organizationId: null } }))).id;
    token.staff = (await request(server()).post('/api/v1/auth/platform/login').send({ email: `staff-${runId}@platform.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await up('staff');
    planId = (await prisma.plan.create({ data: { name: `c3-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      org[k] = (await prisma.organization.create({ data: { name: `C3 Company ${k} ${runId}`, slug: `c3-${k.toLowerCase()}-${runId}`, planId } })).id;
      const at = { organizationId: org[k], isSuperAdmin: false };
      users[`admin${k}`] = (await tenantPrisma.forTenant(at, (tx) => tx.user.create({ data: { organizationId: org[k], email: `admin-${k.toLowerCase()}-${runId}@c3.test`, passwordHash, role: 'org_admin' } }))).id;
      await companyLogin(`admin${k}`, `c3-${k.toLowerCase()}-${runId}`, `admin-${k.toLowerCase()}-${runId}@c3.test`);
      await up(`admin${k}`);
      // The same code in both companies (codes are unique per company only).
      await tenantPrisma.forTenant(at, (tx) => tx.notFoundRef.create({ data: { organizationId: org[k], code: CODE, userId: users[`admin${k}`], path: `/api/v1/people/employees/${randomUUID()}/profile` } }));
    }
    users.panelA = (await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.A, email: `panel-a-${runId}@c3.test`, passwordHash, role: 'panel' } }))).id;
    await companyLogin('panelA', `c3-a-${runId}`, `panel-a-${runId}@c3.test`);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
      })
      .catch((e) => console.warn('company cleanup', e));
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.deleteMany({ where: { id: users.staff } })).catch((e) => console.warn('staff cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('1051 across companies (Console › Support desk)', () => {
    it('staff see the code in each company that has it: company, when and page; never who or the record', async () => {
      const rows = (await api('staff', 'get', `/platform/support-desk/references/${CODE.toLowerCase()}`).expect(200)).body as Record<string, unknown>[];
      expect(rows.map((r) => r.company).sort()).toEqual([`C3 Company A ${runId}`, `C3 Company B ${runId}`]);
      for (const r of rows) {
        expect(Object.keys(r).sort()).toEqual(['at', 'code', 'company', 'path']);
        expect(r.path).toMatch(/^\/api\/v1\/people\/employees\/.+\/profile$/);
      }
    });

    it('every look-up is audited with its purpose', async () => {
      const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { actorUserId: users.staff, action: 'platform.cross_tenant_read' } }));
      expect(rows.some((r) => (r.metadataJson ?? '').includes(`look up Not found reference ${CODE}`))).toBe(true);
    });

    it('an unknown code returns empty; a bad format is 400', async () => {
      expect((await api('staff', 'get', '/platform/support-desk/references/NF-ZZZZZZ').expect(200)).body).toEqual([]);
      await api('staff', 'get', '/platform/support-desk/references/NF-0OI1AA').expect(400);
      await api('staff', 'get', '/platform/support-desk/references/hello').expect(400);
    });

    it('a company admin, a company user and no sign-in are refused at the staff route', async () => {
      await api('adminA', 'get', `/platform/support-desk/references/${CODE}`).expect(403);
      await api('panelA', 'get', `/platform/support-desk/references/${CODE}`).expect(403);
      await request(server()).get(`/api/v1/platform/support-desk/references/${CODE}`).expect(401);
    });
  });

  describe('1052 inside a support session', () => {
    let acting: string;

    beforeAll(async () => {
      const s = (await api('staff', 'post', `/platform/companies/${org.A}/support-sessions`).send({ reason: 'Look up a Not found reference', hours: 2 }).expect(201)).body;
      await up('adminA');
      await api('adminA', 'post', `/support-access/${s.id}/approve`).send({}).expect(200);
      acting = (await api('staff', 'post', `/auth/super-admin/switch-into/${org.A}`).expect(200)).body.accessToken;
    });

    it('the Helpdesk look-up works read only, in that company only', async () => {
      const found = (await api(acting, 'get', `/help/not-found/${CODE}`).expect(200)).body;
      expect(found).toMatchObject({ code: CODE, path: expect.stringMatching(/^\/api\/v1\/people\/employees\//) });
      await api(acting, 'get', '/help/not-found/NF-ZZZZZZ').expect(404);
    });

    it('the rest of /help stays out of scope, and nothing can be written', async () => {
      expect((await api(acting, 'get', '/help/setup-hub').expect(403)).body.code).toBe('SUPPORT_SESSION_OUT_OF_SCOPE');
      for (const path of ['/help/whats-new', '/help/tours']) expect((await api(acting, 'get', path).expect(403)).body.code).toBe('SUPPORT_SESSION_OUT_OF_SCOPE');
      expect((await api(acting, 'post', '/help/not-found').send({ path: '/yx/x' }).expect(403)).body.code).toBe('SUPPORT_SESSION_READ_ONLY');
    });
  });
});
