import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaModule } from '@exam-platform/shared';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';

describe('Exam Builder Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `eb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'EB Org A', slug: `eb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'EB Org B', slug: `eb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.create({ data: { organizationId: orgAId, title: 'Org A Exam', createdBy: randomUUID() } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s exams', async () => {
    const orgBExams = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.exam.findMany(),
    );
    expect(orgBExams).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.exam.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});

describe('Exam Builder HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let questionAId: string;
  let questionBId: string;
  let examId: string;
  let sectionOneId: string;
  let sectionTwoId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `eb-http-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'EB HTTP Org', slug: `eb-http-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const questions = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, async (tx) => {
      await Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@eb-http.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@eb-http.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]);
      const questionA = await tx.question.create({
        data: {
          organizationId: orgId,
          type: 'true_false',
          text: 'Question A',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      });
      const questionB = await tx.question.create({
        data: {
          organizationId: orgId,
          type: 'true_false',
          text: 'Question B',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      });
      return { questionA, questionB };
    });
    questionAId = questions.questionA.id;
    questionBId = questions.questionB.id;

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@eb-http.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterAccessToken = recruiterLogin.body.accessToken;

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'orgadmin@eb-http.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    orgAdminAccessToken = orgAdminLogin.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.tag.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a non-permitted role from creating an exam', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ title: 'Should be forbidden' })
      .expect(403);
  });

  it('builds an exam end-to-end: sections, question assignment, ordering, and archived-question retention', async () => {
    const createExamResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Backend Round', instructions: 'Answer all questions.' })
      .expect(201);
    examId = createExamResponse.body.id;

    const sectionOneResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    sectionOneId = sectionOneResponse.body.id;
    expect(sectionOneResponse.body.orderIndex).toBe(0);

    const sectionTwoResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section Two' })
      .expect(201);
    sectionTwoId = sectionTwoResponse.body.id;
    expect(sectionTwoResponse.body.orderIndex).toBe(1);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionOneId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionBId, questionAId] })
      .expect(200);

    const examDetailResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const sectionOneQuestions = examDetailResponse.body.sections.find((s: { id: string }) => s.id === sectionOneId).questions;
    expect(sectionOneQuestions.map((q: { questionId: string }) => q.questionId)).toEqual([questionBId, questionAId]);

    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionBId}/archive`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionOneId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionAId, questionBId] })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionTwoId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionBId] })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/v1/exams/${examId}/sections/${sectionTwoId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    const examAfterSectionDeleteResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(examAfterSectionDeleteResponse.body.sections).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    const activeListResponse = await request(app.getHttpServer())
      .get('/api/v1/exams?status=active')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListResponse.body.map((e: { id: string }) => e.id)).not.toContain(examId);
  });

  it('rejects publishing an exam with an underfilled pool section, then succeeds once enough matching questions exist', async () => {
    const poolExamResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Round' })
      .expect(201);
    const poolExamId = poolExamResponse.body.id;

    const poolSectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${poolExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section' })
      .expect(201);
    const poolSectionId = poolSectionResponse.body.id;

    const sqlQuestionOne = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'SQL question one', difficulty: 'medium', marks: 1, tags: ['sql'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    const sqlTagId = sqlQuestionOne.body.tags[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/exams/${poolExamId}/sections/${poolSectionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section', selectionMode: 'pool', poolSize: 2, poolTagIds: [sqlTagId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${poolExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'SQL question two', difficulty: 'medium', marks: 1, tags: ['sql'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${poolExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  it('sets and retrieves a section\'s target duration', async () => {
    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Timed Sections Round' })
      .expect(201);
    const timedExamId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${timedExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One', targetDurationMinutes: 20 })
      .expect(201);
    expect(sectionResponse.body.targetDurationMinutes).toBe(20);
    const timedSectionId = sectionResponse.body.id;

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/exams/${timedExamId}/sections/${timedSectionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One', targetDurationMinutes: 25 })
      .expect(200);
    expect(updateResponse.body.targetDurationMinutes).toBe(25);

    const examDetailResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${timedExamId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const timedSection = examDetailResponse.body.sections.find((s: { id: string }) => s.id === timedSectionId);
    expect(timedSection.targetDurationMinutes).toBe(25);
  });
});
