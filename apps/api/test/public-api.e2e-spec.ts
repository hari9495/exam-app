import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Public API + Webhooks HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let apiKey: string;
  let candidateId: string;
  let examId: string;
  let invitationId: string;
  const fakeEmailService = {
    send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }),
  };

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
      data: { name: `ci-public-api-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    orgSlug = `ci-public-api-org-${randomUUID()}`;
    const org = await prisma.organization.create({ data: { name: 'CI Public API Org', slug: orgSlug, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-public-api.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-public-api.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: 'recruiter@ci-public-api.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgSlug, email: 'orgadmin@ci-public-api.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    // Seed a candidate, a published exam with one question, and an invitation via the
    // normal staff-facing endpoints -- these are exactly what the public API endpoints
    // under test read back out.
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-public-api.test', name: 'Alice Example' })
      .expect(201);
    candidateId = candidateResponse.body.id;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Backend Screening' })
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
        type: 'true_false',
        text: 'Is this a test question?',
        difficulty: 'easy',
        marks: 1,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = questionResponse.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);
    invitationId = inviteResponse.body.created[0].id;

    // Generate the public API key as org-admin (org:manage_settings) -- the same
    // endpoint and role exercised by apps/web's Integrations page.
    const apiKeyResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations/integrations/api-key')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(201);
    apiKey = apiKeyResponse.body.apiKey;
    expect(apiKey).toMatch(/^pk_live_[0-9a-f]{64}$/);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.invitation.deleteMany({ where: { examId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a request with no API key', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/candidates').expect(401);
  });

  it('rejects a request with a garbage API key', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/public/candidates')
      .set('Authorization', 'Bearer pk_live_not-a-real-key')
      .expect(401);
  });

  it('lists candidates scoped to the calling organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/public/candidates')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(response.body.data).toEqual([
      { id: candidateId, name: 'Alice Example', email: 'alice@ci-public-api.test', createdAt: expect.any(String) },
    ]);
  });

  it('fetches a single candidate by id, and 404s for an unknown id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(response.body).toEqual({ id: candidateId, name: 'Alice Example', email: 'alice@ci-public-api.test', createdAt: expect.any(String) });

    await request(app.getHttpServer())
      .get(`/api/v1/public/candidates/${randomUUID()}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(404);
  });

  it('lists exams scoped to the calling organization', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/public/exams')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(response.body.data).toEqual([
      expect.objectContaining({ id: examId, title: 'Backend Screening', status: 'published' }),
    ]);
  });

  it('fetches a single exam by id, and 404s for an unknown id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/exams/${examId}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(response.body).toMatchObject({ id: examId, title: 'Backend Screening', status: 'published' });

    await request(app.getHttpServer())
      .get(`/api/v1/public/exams/${randomUUID()}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(404);
  });

  it('lists results for an exam, reflecting the not-yet-attempted invitation', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/exams/${examId}/results`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(response.body.data).toEqual([
      {
        candidateId,
        candidateName: 'Alice Example',
        status: 'invited',
        score: null,
        maxScore: null,
        percentage: null,
        passFail: null,
        submittedAt: null,
      },
    ]);
  });

  it('404s exam results for an exam that does not belong to the caller', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/public/exams/${randomUUID()}/results`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(404);
  });

  it('lists invitations, filterable by examId, candidateId, and status', async () => {
    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/public/invitations')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200);
    expect(listResponse.body).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(listResponse.body.data).toEqual([
      expect.objectContaining({ id: invitationId, examId, candidateId, status: 'invited' }),
    ]);

    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations?examId=${examId}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200)
      .then((res) => expect(res.body.total).toBe(1));

    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations?candidateId=${candidateId}`)
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200)
      .then((res) => expect(res.body.total).toBe(1));

    await request(app.getHttpServer())
      .get('/api/v1/public/invitations?status=revoked')
      .set('Authorization', `Bearer ${apiKey}`)
      .expect(200)
      .then((res) => expect(res.body.total).toBe(0));
  });
});
