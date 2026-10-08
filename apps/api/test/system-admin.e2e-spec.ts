import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Founder decision (8 Oct 2026): Roles & access makes a person a System Admin (users.role = org_admin) and
// takes it away, with step-up, a reason on the audit trail, emails, and never the last System Admin gone.
describe('System Admin from Roles & access', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  let planId: string;
  const org = { id: '', slug: '' };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'admin' | 'hrHead' | 'clerk';
  const email = (who: Who) => `${who}-${runId}@sa.test`;
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const up = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const role = async (who: Who) => (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUniqueOrThrow({ where: { id: users[who] } }))).role;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `sa-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'Kaveri Foods', slug: `sa-${runId}`, planId } });
    Object.assign(org, { id: created.id, slug: created.slug });
    const passwordHash = await argon2.hash(PASSWORD);
    for (const [who, r] of [['admin', 'org_admin'], ['hrHead', 'recruiter'], ['clerk', 'panel']] as [Who, string][]) {
      users[who] = (await tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org.id, email: email(who), name: who, passwordHash, role: r } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: email(who), password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: org.id } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only a System Admin, freshly confirmed with a second factor, can do it; a reason is required', async () => {
    await up('clerk');
    await api('clerk', 'post', `/access/users/${users.hrHead}/system-admin`).send({ reason: 'x' }).expect(403);
    await api('admin', 'post', `/access/users/${users.hrHead}/system-admin`).send({ reason: 'HR head runs access' }).expect(403); // step-up
    await up('admin');
    await api('admin', 'post', `/access/users/${users.hrHead}/system-admin`).send({}).expect(400);
    expect(await role('hrHead')).toBe('recruiter');
  });

  it('makes the HR head a System Admin: audited with the reason, sessions ended, two-step due, everyone emailed', async () => {
    await api('hrHead', 'get', '/users/me').expect(200);
    await up('admin');
    const res = await api('admin', 'post', `/access/users/${users.hrHead}/system-admin`).send({ reason: 'HR head runs access' }).expect(201);
    expect(res.body).toMatchObject({ id: users.hrHead, role: 'org_admin' });
    expect(await role('hrHead')).toBe('org_admin');
    const listed = (await api('admin', 'get', '/access/users').expect(200)).body as { id: string; role: string }[];
    expect(listed.find((u) => u.id === users.hrHead)?.role).toBe('org_admin');
    await api('hrHead', 'get', '/users/me').expect(401); // signs in again to get the new menus
    const user = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUniqueOrThrow({ where: { id: users.hrHead } }));
    expect(user.mfaEnrolmentDueAt.getTime()).toBeLessThanOrEqual(Date.now());
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.id, action: 'access.system_admin.granted' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: users.admin, entityId: users.hrHead });
    expect(JSON.parse(rows[0].metadataJson!)).toMatchObject({ reason: 'HR head runs access', previousRole: 'recruiter', role: 'org_admin' });
    expect(sent.map((m) => m.to).sort()).toEqual([email('admin'), email('hrHead')].sort());
    expect(sent.find((m) => m.to === email('hrHead'))!.subject).toBe('You are now a System Admin in YukthiX');
  });

  it('removes it again, back to their earlier role, and audits it', async () => {
    sent.length = 0;
    await up('admin');
    await api('admin', 'post', `/access/users/${users.hrHead}/system-admin/remove`).send({ reason: 'Handover done' }).expect(201);
    expect(await role('hrHead')).toBe('recruiter');
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.id, action: 'access.system_admin.removed' } }));
    expect(JSON.parse(rows[0].metadataJson!)).toMatchObject({ reason: 'Handover done', previousRole: 'org_admin', role: 'recruiter' });
    expect(sent.map((m) => m.to).sort()).toEqual([email('admin'), email('hrHead')].sort());
  });

  it('never removes the last active System Admin, from Roles & access or the staff users page', async () => {
    await up('admin');
    const res = await api('admin', 'post', `/access/users/${users.admin}/system-admin/remove`).send({ reason: 'Leaving' }).expect(409);
    expect(res.body.code).toBe('LAST_SYSTEM_ADMIN');
    await up('admin');
    await api('admin', 'patch', `/users/${users.admin}`).send({ role: 'recruiter' }).expect(409);
    expect(await role('admin')).toBe('org_admin');
  });
});
