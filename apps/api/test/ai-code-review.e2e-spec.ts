import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { CodeReviewClient } from '../../exam-runtime/src/code-review/code-review.client';

describe('AI Code Review flow', () => {
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
  let codeQuestionId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeCodeReviewClient = { review: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) =>
      builder.overrideProvider(CodeReviewClient).useValue(fakeCodeReviewClient),
    ));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-code-review-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Code Review Org', slug: `ci-ai-code-review-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-code-review.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-code-review.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'AI Code Review Round', durationMinutes: 60 })
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
        type: 'code',
        text: 'Write a function that reverses a string.',
        difficulty: 'easy',
        marks: 10,
        codeLanguage: 'javascript',
        starterCode: 'function reverse(str) {\n  \n}',
        options: [],
      })
      .expect(201);
    codeQuestionId = questionResponse.body.id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [codeQuestionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    // try/finally: any cleanup step throwing must not skip closing the Nest apps below — an
    // unclosed app leaves DB connections/listeners open and hangs the Jest process on exit
    // instead of failing loudly. (audit_logs_actor_user_id_fkey's ON DELETE SET NULL cascade
    // handles the user-delete-after-audit-write case here; see migration
    // 20260715210000_fix_audit_log_actor_fk_set_null.)
    try {
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    } finally {
      await adminApp.close();
      await runtimeApp.close();
    }
  });

  async function inviteStartAndSubmitCode(email: string, name: string, submittedCode: string): Promise<string> {
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
    const startResponse = await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201);
    const attemptId = startResponse.body.id;

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: codeQuestionId, selectedOptionIds: [], answerText: submittedCode })
      .expect(201);

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    return attemptId;
  }

  it('regenerates a completed code review and persists it, readable via GET', async () => {
    const submittedCode = 'function reverse(str) {\n  return str.split("").reverse().join("");\n}';
    const attemptId = await inviteStartAndSubmitCode('alice@ci-ai-code-review.test', 'Alice', submittedCode);

    fakeCodeReviewClient.review.mockResolvedValueOnce({ suggestedMarks: 7, summary: 'Correct logic, minor style issues.' });

    const regenerateResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/answers/${codeQuestionId}/code-review/regenerate`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    expect(regenerateResponse.body).toMatchObject({ status: 'completed', suggestedMarks: 7, summary: 'Correct logic, minor style issues.' });

    const getResponse = await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/answers/${codeQuestionId}/code-review`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(getResponse.body).toMatchObject({ status: 'completed', suggestedMarks: 7, summary: 'Correct logic, minor style issues.' });
  });

  it('degrades gracefully to a failed review when Claude is unavailable, and grading/finalizing still works', async () => {
    const submittedCode = 'function reverse(str) {\n  return str;\n}';
    const attemptId = await inviteStartAndSubmitCode('bob@ci-ai-code-review.test', 'Bob', submittedCode);

    fakeCodeReviewClient.review.mockRejectedValueOnce(new Error('Claude unavailable'));

    const regenerateResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/answers/${codeQuestionId}/code-review/regenerate`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    expect(regenerateResponse.body).toMatchObject({ status: 'failed', suggestedMarks: null, summary: null });

    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/answers/${codeQuestionId}/grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ marksAwarded: 6, feedback: 'Does not reverse the string' })
      .expect(201);

    const finalizeResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/finalize-manual-grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(finalizeResponse.body).toEqual({ status: 'submitted' });
  });
});
