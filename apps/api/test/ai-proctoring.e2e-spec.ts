import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { ClaudeProctoringClient } from '../../exam-runtime/src/proctoring-analysis/claude-proctoring.client';

describe('AI Proctoring flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeClaudeProctoringClient = { assessRisk: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) => builder.overrideProvider(ClaudeProctoringClient).useValue(fakeClaudeProctoringClient)));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-proctoring-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Proctoring Org', slug: `ci-ai-proctoring-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-proctoring.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-proctoring.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'AI Proctoring Round', durationMinutes: 60 })
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
        type: 'true_false', text: 'Is this an AI proctoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

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

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
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
    return inviteResponse.body.created[0].token;
  }

  async function pollForAnalysis(attemptCandidateEmail: string, timeoutMs = 5000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const results = await request(adminHttp)
        .get(`/api/v1/exams/${examId}/results`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      const row = results.body.find((r: any) => r.candidateName === attemptCandidateEmail);
      if (row?.proctoringAnalysis) {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for proctoring analysis for ${attemptCandidateEmail}`);
  }

  it('records a completed analysis with the LLM-provided risk level and summary for an attempt with proctoring events', async () => {
    fakeClaudeProctoringClient.assessRisk.mockResolvedValueOnce({ riskLevel: 'medium', summary: 'One tab switch mid-exam.' });

    const token = await inviteAndGetToken('alice@ci-ai-proctoring.test', 'Alice');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const row = await pollForAnalysis('Alice');

    expect(row.proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'medium', summary: 'One tab switch mid-exam.' });
    expect(fakeClaudeProctoringClient.assessRisk).toHaveBeenCalledWith([
      expect.objectContaining({ eventType: 'tab_switch', severity: 'medium' }),
    ]);
  });

  it('records skipped_clean without ever calling the LLM for an attempt with no proctoring events', async () => {
    const token = await inviteAndGetToken('bob@ci-ai-proctoring.test', 'Bob');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    fakeClaudeProctoringClient.assessRisk.mockClear();

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const row = await pollForAnalysis('Bob');

    expect(row.proctoringAnalysis).toEqual({ status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.' });
    expect(fakeClaudeProctoringClient.assessRisk).not.toHaveBeenCalled();
  });

  it('records a failed analysis when the LLM client throws, then replaces it with a completed one via reanalyze', async () => {
    fakeClaudeProctoringClient.assessRisk.mockRejectedValueOnce(new Error('rate limited'));

    const token = await inviteAndGetToken('carol@ci-ai-proctoring.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'copy_paste' })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const failedRow = await pollForAnalysis('Carol');
    expect(failedRow.proctoringAnalysis).toEqual({ status: 'failed', riskLevel: null, summary: null });

    fakeClaudeProctoringClient.assessRisk.mockResolvedValueOnce({ riskLevel: 'high', summary: 'Copy-paste detected.' });
    await request(adminHttp)
      .post(`/api/v1/attempts/${failedRow.attemptId}/reanalyze`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const finalResults = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const finalRow = finalResults.body.find((r: any) => r.candidateName === 'Carol');
    expect(finalRow.proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'high', summary: 'Copy-paste detected.' });
  });
});
