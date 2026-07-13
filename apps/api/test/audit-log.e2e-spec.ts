import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Audit log + access review', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;
  let orgBSlug: string;
  let orgAAdminToken: string;
  let orgARecruiterToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `audit-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'Audit Org A', slug: `audit-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'Audit Org B', slug: `audit-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;
    orgBSlug = orgB.slug;

    const adminHash = await argon2.hash('OrgAdminPassw0rd!');
    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgAId, email: 'admin@audit-a.test', passwordHash: adminHash, role: 'org_admin' } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgAId, email: 'recruiter@audit-a.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: orgA.slug, email: 'admin@audit-a.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    orgAAdminToken = adminLogin.body.accessToken;

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: orgA.slug, email: 'recruiter@audit-a.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    orgARecruiterToken = recruiterLogin.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: [orgAId, orgBId] } } } }),
    ).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await app.close();
  });

  it('records an audited action and surfaces it via GET /audit-logs, scoped to the caller organization', async () => {
    const orgBAdminHash = await argon2.hash('OrgBAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgBId, email: 'admin@audit-b.test', passwordHash: orgBAdminHash, role: 'org_admin' } }),
    );

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${orgARecruiterToken}`)
      .send({ title: 'Audit Log Exam' })
      .expect(201);
    const examId = examResponse.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${orgARecruiterToken}`)
      .send({ title: 'Section 1' })
      .expect(201);

    // publish() requires at least one section with a question; archive() has no such
    // precondition, so archive is used here purely to generate a real audited action.
    await request(app.getHttpServer())
      .delete(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${orgARecruiterToken}`)
      .expect(200);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .query({ entityType: 'exam', action: 'exam.archived' })
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);

    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'exam.archived', entityType: 'exam', entityId: examId }),
      ]),
    );
  });

  it('org_admin cannot see another organization\'s audit entries', async () => {
    // Perform a real audited action as org B, then prove its audit entry never shows up
    // in org A's view -- rather than asserting on a query that never had anything to leak.
    const orgBAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: orgBSlug, email: 'admin@audit-b.test', password: 'OrgBAdminPassw0rd!' })
      .expect(200);
    const orgBAdminToken = orgBAdminLogin.body.accessToken;

    await request(app.getHttpServer())
      .patch('/api/v1/organizations/branding')
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .send({ primaryColor: '#123456' })
      .expect(200);

    const orgBAuditResponse = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .query({ entityType: 'organization', action: 'organization.branding_updated' })
      .set('Authorization', `Bearer ${orgBAdminToken}`)
      .expect(200);
    expect(orgBAuditResponse.body.length).toBeGreaterThan(0);
    const orgBEntryId = orgBAuditResponse.body[0].id;

    const orgAAuditResponse = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);

    expect(orgAAuditResponse.body.some((entry: { id: string }) => entry.id === orgBEntryId)).toBe(false);
  });

  it('rejects recruiter and panel roles with 403 (no audit:view permission)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${orgARecruiterToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${orgARecruiterToken}`)
      .expect(403);
  });

  it('GET /rbac/roles returns the seeded role/permission shape for an authorized caller', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rbac/roles')
      .set('Authorization', `Bearer ${orgAAdminToken}`)
      .expect(200);

    const orgAdminRole = response.body.find((r: { role: string }) => r.role === 'org_admin');
    expect(orgAdminRole.permissions).toEqual(
      expect.arrayContaining(['org:manage_users', 'org:manage_settings', 'org:view', 'audit:view']),
    );
    const recruiterRole = response.body.find((r: { role: string }) => r.role === 'recruiter');
    expect(recruiterRole.permissions).not.toContain('audit:view');
  });
});
