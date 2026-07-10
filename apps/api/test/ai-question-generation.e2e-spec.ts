import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeQuestionGenerationClient } from '../src/jobs/processors/claude-question-generation.client';

describe('AI Question Generation flow', () => {
  let adminApp: INestApplication;
  let adminHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  const fakeClaudeClient = { generate: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(ClaudeQuestionGenerationClient).useValue(fakeClaudeClient));
    adminHttp = adminApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-questiongen-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'CI AI QuestionGen Org', slug: `ci-ai-questiongen-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-questiongen.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-questiongen.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.aiJob.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
  });

  async function pollJob(aiJobId: string): Promise<{ status: string; outputJson: string | null }> {
    let statusBody: { status: string; outputJson: string | null } = { status: 'pending', outputJson: null };
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const statusResponse = await request(adminHttp)
        .get(`/api/v1/ai-jobs/${aiJobId}`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      statusBody = statusResponse.body;
      if (statusBody.status === 'completed' || statusBody.status === 'failed') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return statusBody;
  }

  it('generates draft questions end-to-end, keeps them out of the active list, and publishes one', async () => {
    fakeClaudeClient.generate.mockResolvedValueOnce([
      {
        type: 'single_mcq',
        text: 'What is a closure?',
        options: [
          { text: 'A function bound to its lexical scope', isCorrect: true },
          { text: 'A loop', isCorrect: false },
        ],
      },
    ]);

    const generateResponse = await request(adminHttp)
      .post('/api/v1/questions/ai-generate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ topic: 'JavaScript closures', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1 })
      .expect(201);

    const { aiJobId } = generateResponse.body;
    const finalStatus = await pollJob(aiJobId);

    expect(finalStatus.status).toBe('completed');
    const output = JSON.parse(finalStatus.outputJson as string);
    expect(output.created).toBe(1);
    expect(output.questionIds).toHaveLength(1);
    const [questionId] = output.questionIds;

    const draftListResponse = await request(adminHttp)
      .get('/api/v1/questions?status=draft')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(draftListResponse.body.map((q: { id: string }) => q.id)).toContain(questionId);

    const activeListResponse = await request(adminHttp)
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListResponse.body.map((q: { id: string }) => q.id)).not.toContain(questionId);

    const publishResponse = await request(adminHttp)
      .post(`/api/v1/questions/${questionId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(publishResponse.body.status).toBe('active');

    const activeListAfterPublish = await request(adminHttp)
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListAfterPublish.body.map((q: { id: string }) => q.id)).toContain(questionId);
  });

  it('fails the job with zero questions created when the Claude client throws', async () => {
    fakeClaudeClient.generate.mockRejectedValueOnce(new Error('rate limited'));

    const generateResponse = await request(adminHttp)
      .post('/api/v1/questions/ai-generate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ topic: 'Networking', difficulty: 'hard', questionTypes: ['single_mcq'], count: 3 })
      .expect(201);

    const finalStatus = await pollJob(generateResponse.body.aiJobId);

    expect(finalStatus.status).toBe('failed');
  });

  it('rejects a count above the cap of 20', async () => {
    await request(adminHttp)
      .post('/api/v1/questions/ai-generate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ topic: 'Networking', difficulty: 'hard', questionTypes: ['single_mcq'], count: 21 })
      .expect(400);
  });
});
