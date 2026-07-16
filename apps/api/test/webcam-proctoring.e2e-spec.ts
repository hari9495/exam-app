import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Webcam proctoring pause/block/unblock flow', () => {
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

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-webcam-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Webcam Org', slug: `ci-webcam-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-webcam.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-webcam.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Webcam Proctoring Round' })
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
        type: 'true_false', text: 'Is this a webcam proctoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp).post(`/api/v1/exams/${examId}/publish`).set('Authorization', `Bearer ${recruiterAccessToken}`).expect(201);
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
    const candidateResponse = await request(adminHttp).post('/api/v1/candidates').set('Authorization', `Bearer ${recruiterAccessToken}`).send({ email, name }).expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    return inviteResponse.body.created[0].token;
  }

  it('pauses on strikes 1-2 with self-resume, blocks on strike 3, and only a recruiter can unblock', async () => {
    const token = await inviteAndGetToken('carol@ci-webcam.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201)).body.id;

    // Strike 1: pauses.
    const strike1 = await request(runtimeHttp)
      .post('/api/v1/attempt/webcam-violation')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'no_face', snapshot: 'snap1' })
      .expect(201);
    expect(strike1.body).toEqual({ strike: 1, status: 'paused' });

    // Can't answer while paused.
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: 'irrelevant', selectedOptionIds: [] })
      .expect(400);

    // Self-resume.
    const resume1 = await request(runtimeHttp).post('/api/v1/attempt/webcam-resume').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    expect(resume1.body).toEqual({ status: 'in_progress' });

    // Strike 2: pauses again.
    await request(runtimeHttp)
      .post('/api/v1/attempt/webcam-violation')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'head_turned', snapshot: 'snap2' })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/webcam-resume').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);

    // Strike 3: blocks. Self-resume must now fail.
    const strike3 = await request(runtimeHttp)
      .post('/api/v1/attempt/webcam-violation')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'no_face', snapshot: 'snap3' })
      .expect(201);
    expect(strike3.body).toEqual({ strike: 3, status: 'blocked' });
    await request(runtimeHttp).post('/api/v1/attempt/webcam-resume').set('Authorization', `Bearer ${accessToken}`).send({}).expect(400);

    // Recruiter unblocks.
    const unblockResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/unblock`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(unblockResponse.body).toEqual({ status: 'in_progress' });

    // Candidate can act again.
    const current = await request(runtimeHttp).get('/api/v1/attempt/current').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(current.body.status).toBe('in_progress');
    expect(current.body.webcamViolationCount).toBe(3);
  });
});
