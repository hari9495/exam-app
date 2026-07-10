import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { JobsService } from '../src/jobs/jobs.service';

describe('AI Jobs HTTP flow', () => {
  let adminApp: INestApplication;
  let adminHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let jobsService: JobsService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;

  beforeAll(async () => {
    adminApp = await bootAdminApp();
    adminHttp = adminApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    jobsService = adminApp.get(JobsService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-jobs-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Jobs Org', slug: `ci-ai-jobs-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-jobs.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-ai-jobs.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-jobs.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-ai-jobs.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.aiJob.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
  });

  it('processes an echo job end-to-end: enqueue -> worker completes it -> pollable via HTTP', async () => {
    const context = { organizationId: orgId, isSuperAdmin: false };
    const enqueued = await jobsService.enqueue(context, 'echo', JSON.stringify({ message: 'hello' }), randomUUID());

    let statusBody: { status: string; outputJson: string | null } = { status: 'pending', outputJson: null };
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const statusResponse = await request(adminHttp)
        .get(`/api/v1/ai-jobs/${enqueued.id}`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      statusBody = statusResponse.body;
      if (statusBody.status === 'completed' || statusBody.status === 'failed') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(statusBody.status).toBe('completed');
    expect(JSON.parse(statusBody.outputJson as string)).toEqual({ echoed: { message: 'hello' } });
  });

  it('returns 404 for a job belonging to a different organization', async () => {
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-ai-jobs-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({
      data: { name: 'CI AI Jobs Other Org', slug: `ci-ai-jobs-other-org-${randomUUID()}`, planId: otherPlan.id },
    });
    const otherContext = { organizationId: otherOrg.id, isSuperAdmin: false };
    const otherJob = await jobsService.enqueue(otherContext, 'echo', JSON.stringify({ message: 'other' }), randomUUID());

    await request(adminHttp)
      .get(`/api/v1/ai-jobs/${otherJob.id}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);

    await tenantPrisma.forTenant(otherContext, (tx) => tx.aiJob.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });

  it('rejects a role without ai_jobs:view from polling job status', async () => {
    const context = { organizationId: orgId, isSuperAdmin: false };
    const job = await jobsService.enqueue(context, 'echo', JSON.stringify({ message: 'perm-check' }), randomUUID());

    await request(adminHttp)
      .get(`/api/v1/ai-jobs/${job.id}`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });
});
