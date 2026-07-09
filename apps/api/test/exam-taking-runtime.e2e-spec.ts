import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Exam-Taking Runtime HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  let singleMcqId: string;
  let multiMcqId: string;
  let trueFalseId: string;
  let singleMcqOptions: { id: string; text: string }[];
  let multiMcqOptions: { id: string; text: string }[];
  let trueFalseOptions: { id: string; text: string }[];
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-attempt-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Attempt Org', slug: `ci-attempt-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-attempt.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-attempt.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-attempt.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-attempt.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Full Stack Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const singleMcq = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    singleMcqId = singleMcq.body.id;
    singleMcqOptions = singleMcq.body.options;

    const multiMcq = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'multi_mcq', text: 'Which are prime numbers?', difficulty: 'medium', marks: 4,
        options: [
          { text: '2', isCorrect: true }, { text: '3', isCorrect: true },
          { text: '4', isCorrect: false }, { text: '9', isCorrect: false },
        ],
      })
      .expect(201);
    multiMcqId = multiMcq.body.id;
    multiMcqOptions = multiMcq.body.options;

    const trueFalse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'TypeScript is a superset of JavaScript.', difficulty: 'easy', marks: 1,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    trueFalseId = trueFalse.body.id;
    trueFalseOptions = trueFalse.body.options;

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [singleMcqId, multiMcqId, trueFalseId] })
      .expect(200);

    await request(app.getHttpServer())
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
    await app.close();
  });

  async function inviteAndRedeem(email: string, name: string): Promise<{ candidateId: string; token: string }> {
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const candidateId = candidateResponse.body.id;

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);

    return { candidateId, token: inviteResponse.body.created[0].token };
  }

  it('runs the full candidate exam-taking flow and reports a graded result to the recruiter', async () => {
    const { token } = await inviteAndRedeem('alice@ci-attempt.test', 'Alice');

    const redeemResponse = await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const candidateAccessToken = redeemResponse.body.accessToken;

    const previewResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(200);
    expect(previewResponse.body.exam.title).toBe('Full Stack Round');
    expect(previewResponse.body.sections).toBeUndefined();

    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(startResponse.body.status).toBe('in_progress');

    const stateResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(200);
    expect(stateResponse.body.sections).toHaveLength(1);
    const allQuestions = stateResponse.body.sections[0].questions;
    allQuestions.forEach((question: Record<string, unknown>) => {
      (question.options as Record<string, unknown>[]).forEach((option) => expect(option).not.toHaveProperty('isCorrect'));
    });

    const correctSingleOptionId = singleMcqOptions.find((option) => option.text === '4')!.id;
    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: singleMcqId, selectedOptionIds: [correctSingleOptionId] })
      .expect(201);

    const partialMultiOptionId = multiMcqOptions.find((option) => option.text === '2')!.id;
    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: multiMcqId, selectedOptionIds: [partialMultiOptionId] })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: 'not-a-real-question-id', selectedOptionIds: [correctSingleOptionId] })
      .expect(400);

    const correctTrueFalseOptionId = trueFalseOptions.find((option) => option.text === 'True')!.id;
    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: trueFalseId, selectedOptionIds: [correctTrueFalseOptionId] })
      .expect(201);

    const submitResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(submitResponse.body).toEqual({ status: 'submitted' });
    expect(submitResponse.body.score).toBeUndefined();

    const duplicateSubmitResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(duplicateSubmitResponse.body).toEqual({ status: 'submitted' });

    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: trueFalseId, selectedOptionIds: [correctSingleOptionId] })
      .expect(400);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const aliceResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Alice');
    expect(aliceResult.status).toBe('submitted');
    expect(aliceResult.score).toBe(6);
    expect(aliceResult.maxScore).toBe(10);
    expect(aliceResult.percentage).toBe(60);
    expect(aliceResult.passFail).toBe('pass');

    await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('rejects a candidate from accessing another candidate\'s attempt', async () => {
    const bobTokens = await inviteAndRedeem('bob@ci-attempt.test', 'Bob');
    const carolTokens = await inviteAndRedeem('carol@ci-attempt.test', 'Carol');

    const bobAccess = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token: bobTokens.token }).expect(200)).body.accessToken;
    const carolAccess = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token: carolTokens.token }).expect(200)).body.accessToken;

    await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${bobAccess}`).expect(201);

    const carolState = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${carolAccess}`)
      .expect(200);
    expect(carolState.body.sections).toBeUndefined();
  });

  it('auto-submits and grades an attempt that is touched again after its duration has elapsed', async () => {
    const { token } = await inviteAndRedeem('dave@ci-attempt.test', 'Dave');
    const daveAccess = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${daveAccess}`)
      .expect(201);

    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.attempt.update({ where: { id: startResponse.body.id }, data: { startedAt: new Date(Date.now() - 2 * 60 * 60_000) } }),
    );

    const currentResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${daveAccess}`)
      .expect(200);
    expect(currentResponse.body.status).toBe('auto_submitted');
    expect(currentResponse.body.remainingSeconds).toBe(0);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const daveResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Dave');
    expect(daveResult.status).toBe('auto_submitted');
    expect(daveResult.score).toBe(0);
  });

  it('rejects redeeming a revoked or expired invitation with a specific error, not a generic 404', async () => {
    const { candidateId, token } = await inviteAndRedeem('erin@ci-attempt.test', 'Erin');
    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const erinInvitation = listResponse.body.find((inv: { candidateId: string }) => inv.candidateId === candidateId);

    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${erinInvitation.id}/revoke`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/redeem')
      .send({ token })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/redeem')
      .send({ token: 'this-token-does-not-exist' })
      .expect(404);
  });
});
