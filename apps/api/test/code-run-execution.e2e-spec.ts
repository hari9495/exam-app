import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { PistonClient } from '../../exam-runtime/src/code-execution/piston-client';

describe('Code Run Execution HTTP flow', () => {
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
  let singleMcqId: string;
  let multiLangCodeQuestionId: string;
  let anyModeCodeQuestionId: string;
  let accessToken: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakePistonClient = {
    execute: jest.fn().mockResolvedValue({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }),
    listRuntimes: jest.fn().mockResolvedValue([
      { language: 'python', version: '3.10.0', aliases: [] },
      { language: 'javascript', version: '18.15.0', aliases: ['node'] },
    ]),
  };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) => builder.overrideProvider(PistonClient).useValue(fakePistonClient)));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-code-run-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Code Run Org', slug: `ci-code-run-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-code-run.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-code-run.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Code Run Round', durationMinutes: 60 })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const codeQuestionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'code',
        text: 'Print "hi".',
        difficulty: 'easy',
        marks: 5,
        languageMode: 'fixed',
        allowedLanguages: ['python'],
        starterCode: 'print("hi")',
        options: [],
      })
      .expect(201);
    codeQuestionId = codeQuestionResponse.body.id;

    const multiLangCodeQuestionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'code',
        text: 'Print "multi".',
        difficulty: 'easy',
        marks: 5,
        languageMode: 'fixed',
        allowedLanguages: ['python', 'javascript'],
        options: [],
      })
      .expect(201);
    multiLangCodeQuestionId = multiLangCodeQuestionResponse.body.id;

    const anyModeCodeQuestionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'code',
        text: 'Print "any".',
        difficulty: 'easy',
        marks: 5,
        languageMode: 'any',
        options: [],
      })
      .expect(201);
    anyModeCodeQuestionId = anyModeCodeQuestionResponse.body.id;

    const singleMcqResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    singleMcqId = singleMcqResponse.body.id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [codeQuestionId, singleMcqId, multiLangCodeQuestionId, anyModeCodeQuestionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-code-run.test', name: 'Alice' })
      .expect(201);

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    const token = inviteResponse.body.created[0].token;

    accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201);
  });

  afterAll(async () => {
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

  it('runs code for a code question and returns the sandbox result', async () => {
    const runResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: codeQuestionId, code: 'print("hi")', codeLanguage: 'python' })
      .expect(201);

    expect(runResponse.body).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 29 });
    expect(fakePistonClient.execute).toHaveBeenCalledWith({ language: 'python', version: '3.10.0', code: 'print("hi")', stdin: undefined });
  });

  it('rejects run-code for a non-code question with 400', async () => {
    await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: singleMcqId, code: 'x' })
      .expect(400);
  });

  it('rejects run-code with a clean 429, not a crash, once the run cap is exceeded', async () => {
    fakePistonClient.execute.mockClear();
    // MAX_RUNS_PER_QUESTION is 30; this question has already been run once by the first
    // test above, so 29 more exhausts it.
    for (let i = 0; i < 29; i++) {
      await request(runtimeHttp)
        .post('/api/v1/attempt/run-code')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ questionId: codeQuestionId, code: 'print("hi")', codeLanguage: 'python' })
        .expect(201);
    }

    const cappedResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: codeQuestionId, code: 'print("hi")', codeLanguage: 'python' })
      .expect(429);

    expect(cappedResponse.body.message).toBe('You have used all 30 runs for this question');
  });

  it('supports fixed mode with multiple allowed languages, rejecting a language outside the allowlist', async () => {
    const currentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const questions = currentResponse.body.sections.flatMap((section: { questions: { id: string }[] }) => section.questions);
    const multiLangQuestion = questions.find((q: { id: string }) => q.id === multiLangCodeQuestionId);
    expect(multiLangQuestion.languageMode).toBe('fixed');
    expect(multiLangQuestion.allowedLanguages).toEqual(expect.arrayContaining(['python', 'javascript']));
    expect(multiLangQuestion.allowedLanguages).toHaveLength(2);

    await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: multiLangCodeQuestionId, code: 'console.log("hi")', codeLanguage: 'javascript' })
      .expect(201);

    const rejectedResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: multiLangCodeQuestionId, code: 'puts "hi"', codeLanguage: 'ruby' })
      .expect(400);
    expect(rejectedResponse.body.message).toBe('ruby is not an allowed language for this question');
  });

  it('supports any mode: live language list, run-code with a chosen language, and Answer.codeLanguage round-tripping through submit', async () => {
    const languagesResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/code-languages')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(languagesResponse.body.languages.length).toBeGreaterThan(0);
    const chosenLanguage = languagesResponse.body.languages[0].language;

    await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: anyModeCodeQuestionId, code: 'print("hi")', codeLanguage: chosenLanguage })
      .expect(201);

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: anyModeCodeQuestionId, selectedOptionIds: [], answerText: 'print("hi")', codeLanguage: chosenLanguage })
      .expect(201);

    const submitResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(submitResponse.body.status).toBe('pending_manual_grade');
  });
});
