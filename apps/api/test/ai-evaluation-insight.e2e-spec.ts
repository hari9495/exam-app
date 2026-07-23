import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { ProctoringRiskClient } from '../../exam-runtime/src/proctoring-analysis/proctoring-risk.client';
import { InsightClient } from '../../exam-runtime/src/attempt-insight/insight.client';

describe('AI Evaluation Insight flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  let trueFalseQuestionId: string;
  let correctOptionId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeProctoringRiskClient = { assessRisk: jest.fn() };
  const fakeInsightClient = { generate: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) =>
      builder
        .overrideProvider(ProctoringRiskClient)
        .useValue(fakeProctoringRiskClient)
        .overrideProvider(InsightClient)
        .useValue(fakeInsightClient),
    ));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-insight-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Insight Org', slug: `ci-ai-insight-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-insight.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-ai-insight.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-insight.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-ai-insight.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'AI Insight Round', durationMinutes: 60 })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this an AI insight test?', topic: 'SQL', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    trueFalseQuestionId = questionResponse.body.id;
    correctOptionId = questionResponse.body.options.find((option: { text: string }) => option.text === 'True').id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteStartAndSubmit(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    const token = inviteResponse.body.created[0].token;

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201);
    // Answer the single true/false question correctly so the attempt has a non-empty
    // topicBreakdown to assert on — the settlement flow only scores answered questions.
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: trueFalseQuestionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const results = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const row = results.body.find((r: any) => r.candidateName === name);
    return row.attemptId;
  }

  async function pollForInsight(attemptId: string, timeoutMs = 5000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const response = await request(adminHttp)
        .get(`/api/v1/attempts/${attemptId}/ai-insight`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`);
      if (response.status === 200) {
        return response.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for AI insight for attempt ${attemptId}`);
  }

  it('generates a completed insight after settlement, sequenced after proctoring analysis', async () => {
    fakeProctoringRiskClient.assessRisk.mockClear();
    fakeInsightClient.generate.mockResolvedValueOnce('Strong in SQL overall.');

    const attemptId = await inviteStartAndSubmit('alice@ci-ai-insight.test', 'Alice');

    const insight = await pollForInsight(attemptId);

    expect(insight).toEqual(expect.objectContaining({ status: 'completed', summary: 'Strong in SQL overall.' }));
    expect(fakeInsightClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ topicBreakdown: [{ topic: 'SQL', correct: 1, total: 1 }] }),
    );

    const usageResponse = await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);
    expect(usageResponse.body.breakdown.insightGeneration).toBe(1);
  });

  it('regenerates an insight on demand and returns a fresh row', async () => {
    fakeInsightClient.generate.mockResolvedValueOnce('Initial summary.');
    const attemptId = await inviteStartAndSubmit('carol@ci-ai-insight.test', 'Carol');
    const initial = await pollForInsight(attemptId);

    fakeInsightClient.generate.mockResolvedValueOnce('Regenerated summary.');
    const regenerateResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/ai-insight/regenerate`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    expect(regenerateResponse.body.summary).toBe('Regenerated summary.');
    expect(new Date(regenerateResponse.body.generatedAt).getTime()).toBeGreaterThanOrEqual(new Date(initial.generatedAt).getTime());
  });

  it('returns 404 for an attempt with no insight yet generated', async () => {
    await request(adminHttp)
      .get(`/api/v1/attempts/${randomUUID()}/ai-insight`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
  });

  it('rejects a role without results:view from reading the insight', async () => {
    fakeInsightClient.generate.mockResolvedValueOnce('Org admin should not see this.');
    const attemptId = await inviteStartAndSubmit('dave@ci-ai-insight.test', 'Dave');
    await pollForInsight(attemptId);

    await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/ai-insight`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });
});
