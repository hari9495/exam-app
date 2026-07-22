import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Question code-snippet and image content HTTP flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  // 1x1 transparent PNG.
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-code-image-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Code Image Org', slug: `ci-code-image-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-code-image.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-code-image.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;
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

  it('flows a question\'s code snippet and images from authoring through the candidate attempt without affecting grading', async () => {
    const uploadResponse = await request(adminHttp)
      .post('/api/v1/questions/images')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .attach('file', pngBuffer, { filename: 'snippet.png', contentType: 'image/png' })
      .expect(201);
    const imageUrl = uploadResponse.body.imageUrl;
    expect(typeof imageUrl).toBe('string');

    const snippetCode = 'function add(a, b) {\n  return a + b;\n}';
    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'What does add(2, 3) return?',
        difficulty: 'easy',
        marks: 5,
        snippetCode,
        snippetLanguage: 'javascript',
        imageUrl,
        options: [
          { text: '5', isCorrect: true, imageUrl },
          { text: '6', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = questionResponse.body.id;
    const correctOptionId = questionResponse.body.options.find((o: { text: string }) => o.text === '5').id;
    expect(questionResponse.body.snippetCode).toBe(snippetCode);
    expect(questionResponse.body.snippetLanguage).toBe('javascript');
    expect(questionResponse.body.imageUrl).toBe(imageUrl);
    expect(questionResponse.body.options.find((o: { text: string }) => o.text === '5').imageUrl).toBe(imageUrl);

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Code Snippet Round' })
      .expect(201);
    const examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-code-image.test', name: 'Alice' })
      .expect(201);

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    const token = inviteResponse.body.created[0].token;

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201);

    const currentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const attemptQuestion = currentResponse.body.sections[0].questions.find((q: { id: string }) => q.id === questionId);
    expect(attemptQuestion.snippetCode).toBe(snippetCode);
    expect(attemptQuestion.snippetLanguage).toBe('javascript');
    expect(attemptQuestion.imageUrl).toBe(imageUrl);
    expect(attemptQuestion.options.find((o: { id: string }) => o.id === correctOptionId).imageUrl).toBe(imageUrl);

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);

    const submitResponse = await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);
    expect(submitResponse.body).toEqual({ status: 'submitted' });

    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const row = resultsResponse.body.find((r: { candidateName: string }) => r.candidateName === 'Alice');
    expect(row.status).toBe('submitted');
    expect(row.passFail).not.toBeNull();
  });
});
