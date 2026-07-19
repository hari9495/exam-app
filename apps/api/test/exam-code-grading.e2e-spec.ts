import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Exam code-grading HTTP flow', () => {
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

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-code-grading-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Code Grading Org', slug: `ci-code-grading-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-code-grading.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-code-grading.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Code Grading Round', durationMinutes: 60 })
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
    // instead of failing loudly. (This spec previously worked around a drifted
    // audit_logs_actor_user_id_fkey constraint here by manually nulling actorUserId before
    // deleting users; migration 20260715210000_fix_audit_log_actor_fk_set_null reconciled the
    // live constraint to its documented ON DELETE SET NULL behavior, so that workaround is no
    // longer needed — cascade deletion handles it now.)
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

  it('runs the full manual code-grading flow: submit, pending queue, grade, finalize, results', async () => {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-code-grading.test', name: 'Alice' })
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

    const submittedCode = 'function reverse(str) {\n  return str.split("").reverse().join("");\n}';
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: codeQuestionId, selectedOptionIds: [], answerText: submittedCode })
      .expect(201);

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const pendingResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/pending-grading`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(pendingResponse.body).toHaveLength(1);
    expect(pendingResponse.body[0]).toMatchObject({
      attemptId,
      candidateName: 'Alice',
      codeQuestions: [
        expect.objectContaining({
          questionId: codeQuestionId,
          answerText: submittedCode,
          marks: 10,
          marksAwarded: null,
        }),
      ],
    });

    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/answers/${codeQuestionId}/grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ marksAwarded: 8, feedback: 'Good approach' })
      .expect(201);

    const finalizeResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/finalize-manual-grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(finalizeResponse.body).toEqual({ status: 'submitted' });

    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const row = resultsResponse.body.find((r: any) => r.attemptId === attemptId);
    expect(row.passFail).not.toBeNull();

    const pendingAfterFinalize = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/pending-grading`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(pendingAfterFinalize.body).toHaveLength(0);
  });

  it('surfaces and allows finalizing an attempt where the candidate never answered the code question', async () => {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'bob@ci-code-grading.test', name: 'Bob' })
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

    // Candidate submits without ever answering the code question — no POST /attempt/answer call for it.
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const pendingResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/pending-grading`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const row = pendingResponse.body.find((r: any) => r.attemptId === attemptId);
    expect(row).toBeDefined();
    expect(row.codeQuestions).toEqual([
      expect.objectContaining({ questionId: codeQuestionId, answerText: null, marks: 10, marksAwarded: null }),
    ]);

    // Finalizing before grading the blank submission is still rejected.
    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/finalize-manual-grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);

    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/answers/${codeQuestionId}/grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ marksAwarded: 0, feedback: 'No submission' })
      .expect(201);

    const finalizeResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/finalize-manual-grade`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(finalizeResponse.body).toEqual({ status: 'submitted' });
  });
});
