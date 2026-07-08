import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EmailService } from '../src/email/email.service';

describe('Session Enforcement & Anti-Cheat HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
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
      data: { name: `ci-anticheat-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Anti-Cheat Org', slug: `ci-anticheat-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-anticheat.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-anticheat.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-anticheat.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-anticheat.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Anti-Cheat Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const questionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this a test question?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
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

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);

    return inviteResponse.body.created[0].token;
  }

  it('kills an old session live when the same invitation is redeemed again, and logs a multi_login event once an attempt exists', async () => {
    const token = await inviteAndGetToken('alice@ci-anticheat.test', 'Alice');

    const firstRedeem = await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const firstAccessToken = firstRedeem.body.accessToken;

    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ deviceFingerprint: 'fp-first-device' })
      .expect(201);
    const attemptId = startResponse.body.id;

    const secondRedeem = await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const secondAccessToken = secondRedeem.body.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(200);

    const eventsResponse = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const multiLoginEvent = eventsResponse.body.find((event: { eventType: string }) => event.eventType === 'multi_login');
    expect(multiLoginEvent).toBeDefined();
    expect(multiLoginEvent.severity).toBe('high');
  });

  it('records client-reported proctoring events with server-computed severity, and rejects a client-submitted multi_login', async () => {
    const token = await inviteAndGetToken('bob@ci-anticheat.test', 'Bob');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).expect(201)).body.id;

    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'multi_login' })
      .expect(400);

    const eventsResponse = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const tabSwitchEvent = eventsResponse.body.find((event: { eventType: string }) => event.eventType === 'tab_switch');
    expect(tabSwitchEvent.severity).toBe('medium');

    await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('force-submits an in-progress attempt and records an audit log entry', async () => {
    const token = await inviteAndGetToken('carol@ci-anticheat.test', 'Carol');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).expect(201)).body.id;

    const forceSubmitResponse = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(forceSubmitResponse.body).toEqual({ status: 'force_submitted' });

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);

    const auditRows = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.auditLog.findMany({ where: { entityType: 'attempt', entityId: attemptId, action: 'attempt.force_submit' } }),
    );
    expect(auditRows).toHaveLength(1);
  });

  it('starts an attempt successfully with no device fingerprint provided', async () => {
    const token = await inviteAndGetToken('dave@ci-anticheat.test', 'Dave');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
  });
});
