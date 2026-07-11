import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';

describe('AI Credit Usage endpoint', () => {
  let adminApp: INestApplication;
  let adminHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgAdminAccessToken: string;
  let recruiterAccessToken: string;

  beforeAll(async () => {
    adminApp = await bootAdminApp();
    adminHttp = adminApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-credit-usage-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 50, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'CI AI Credit Usage Org', slug: `ci-ai-credit-usage-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-ai-credit-usage.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-credit-usage.test', passwordHash: recruiterHash, role: 'recruiter' } }),
      ]),
    );

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-ai-credit-usage.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-credit-usage.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
  });

  it('returns the plan limit and a zero breakdown for an org that has never triggered either AI feature', async () => {
    const response = await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      aiCreditLimit: 50,
      totalUsed: 0,
      breakdown: { questionGeneration: 0, insightGeneration: 0 },
    });
  });

  it('rejects a role without org:manage_settings', async () => {
    await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
  });
});
