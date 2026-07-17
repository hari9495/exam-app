import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Dashboard summary', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `dashboard-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'Dashboard Org', slug: `dashboard-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@dashboard.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@dashboard.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterToken = login.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }),
    ).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.plan.delete({ where: { id: planId } });
    await app.close();
  });

  it('reflects a real invited candidate in stats and the activity feed', async () => {
    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ title: 'Dashboard Exam' })
      .expect(201);
    const examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ title: 'Section 1' })
      .expect(201);

    const questionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        text: 'Q1',
        type: 'single_mcq',
        difficulty: 'easy',
        marks: 1,
        options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .expect(201);

    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ email: `candidate-${randomUUID()}@test.com`, name: 'Dana Candidate' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);

    const summaryResponse = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .expect(200);

    expect(summaryResponse.body.stats.totalCandidates).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.stats.invitationsSent).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: expect.stringContaining('invited to Dashboard Exam') }),
      ]),
    );
  });
});
