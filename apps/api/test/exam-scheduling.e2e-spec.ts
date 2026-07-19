import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Exam scheduling HTTP flow', () => {
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

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-exam-scheduling-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Exam Scheduling Org', slug: `ci-exam-scheduling-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-exam-scheduling.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-exam-scheduling.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    // try/finally: any cleanup step throwing must not skip closing the Nest apps below — an
    // unclosed app leaves DB connections/listeners open and hangs the Jest process on exit
    // instead of failing loudly. See exam-code-grading.e2e-spec.ts for the same pattern.
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

  it('gates start() by the scheduling window, leaves an in-progress attempt unaffected once closed, and re-syncs invitation expiry', async () => {
    // Step 1: recruiter creates a plain single_mcq question, then a scheduled exam not open for another hour.
    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'What is 2+2?',
        difficulty: 'easy',
        marks: 5,
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
        ],
      })
      .expect(201);
    const questionId = questionResponse.body.id;
    const correctOptionId = questionResponse.body.options.find((option: { isCorrect: boolean }) => option.isCorrect).id;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        title: 'Scheduled Round',
        durationMinutes: 60,
        schedulingEnabled: true,
        availabilityWindowStart: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        availabilityWindowEnd: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      })
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

    // Step 2: invite Alice and Bob, capturing both invite tokens.
    const aliceCandidate = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-exam-scheduling.test', name: 'Alice' })
      .expect(201);
    const bobCandidate = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'bob@ci-exam-scheduling.test', name: 'Bob' })
      .expect(201);

    const aliceInvite = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [aliceCandidate.body.id] })
      .expect(201);
    const aliceToken = aliceInvite.body.created[0].token;

    const bobInvite = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [bobCandidate.body.id] })
      .expect(201);
    const bobToken = bobInvite.body.created[0].token;

    // Step 3: Alice redeems her invite early — before the window opens — and it still succeeds.
    const aliceAuthResponse = await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: aliceToken }).expect(200);
    const aliceAccessToken = aliceAuthResponse.body.accessToken;

    // Step 4: preview reports the window has not opened yet.
    const previewNotOpen = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .expect(200);
    expect(previewNotOpen.body.schedulingWindowState).toBe('not_open');

    // Step 5: starting the attempt before the window opens is rejected.
    const startBeforeOpen = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .send({ consent: true })
      .expect(400);
    expect(startBeforeOpen.body.message).toContain('not open yet');

    // Step 6: recruiter moves the window to already-open (30 min ago -> 30 min from now).
    await request(adminHttp)
      .patch(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        title: 'Scheduled Round',
        schedulingEnabled: true,
        availabilityWindowStart: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        availabilityWindowEnd: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .expect(200);

    // Step 7: preview now reports the window is open.
    const previewOpen = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .expect(200);
    expect(previewOpen.body.schedulingWindowState).toBe('open');

    // Step 8: starting the attempt now succeeds.
    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .send({ consent: true })
      .expect(201);
    const attemptId = startResponse.body.id;
    expect(startResponse.body.status).toBe('in_progress');

    // Step 9: recruiter moves the window fully into the past — now closed.
    await request(adminHttp)
      .patch(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        title: 'Scheduled Round',
        schedulingEnabled: true,
        availabilityWindowStart: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        availabilityWindowEnd: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      })
      .expect(200);

    // Step 10: Alice's already-started attempt is unaffected by the now-closed window — start()
    // returns the same attempt idempotently, and answer/submit both still succeed.
    const startAgainResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .send({ consent: true })
      .expect(201);
    expect(startAgainResponse.body.id).toBe(attemptId);

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${aliceAccessToken}`).expect(201);

    // Step 11: Bob never redeemed or started — his invitation's expiresAt was re-synced to the new
    // (already-past) availabilityWindowEnd in step 9, so redeem() now correctly rejects him as expired.
    const bobRedeemResponse = await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: bobToken }).expect(400);
    expect(bobRedeemResponse.body.message).toContain('expired');
  });
});
