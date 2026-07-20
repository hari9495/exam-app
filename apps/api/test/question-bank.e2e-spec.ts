import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaModule } from '@exam-platform/shared';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';

describe('Question Bank Row-Level Security', () => {
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
      data: { name: `qb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'QB Org A', slug: `qb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'QB Org B', slug: `qb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.create({
        data: {
          organizationId: orgAId,
          type: 'true_false',
          text: 'Org A question',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgAId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.tag.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s questions', async () => {
    const orgBQuestions = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.question.findMany(),
    );
    expect(orgBQuestions).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.question.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });

  it('never returns another tenant\'s tags', async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.tag.create({ data: { organizationId: orgAId, name: 'org-a-only-tag' } }),
    );

    const orgBTags = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) => tx.tag.findMany());

    expect(orgBTags).toHaveLength(0);
  });
});

describe('Question Bank HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let questionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `qb-http-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'QB HTTP Org', slug: `qb-http-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@qb-http.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@qb-http.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@qb-http.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterAccessToken = recruiterLogin.body.accessToken;

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'orgadmin@qb-http.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    orgAdminAccessToken = orgAdminLogin.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.tag.deleteMany({ where: { organizationId: orgId } }),
    );
    // refresh_tokens has a plain FK (ON DELETE NO ACTION) to users, so any refresh tokens
    // issued to this org's users during login (in beforeAll) must be deleted before the users
    // themselves, or the user delete below fails with a foreign key violation. The
    // `user: { organizationId: orgId }` relation filter joins through dbo.users, which IS
    // covered by the RLS filter predicate, so this needs a super-admin session context or it
    // silently matches zero rows — same pattern as auth-flow.e2e-spec.ts's afterAll.
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }),
      )
      .catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a non-permitted role from creating a question', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({
        type: 'true_false',
        text: 'Should be forbidden',
        difficulty: 'easy',
        marks: 1,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(403);
  });

  it('creates, lists, retrieves, updates, and archives a question end-to-end', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'What is the capital of France?',
        topic: 'geography',
        difficulty: 'easy',
        marks: 5,
        negativeMarks: 1,
        options: [
          { text: 'Paris', isCorrect: true },
          { text: 'London', isCorrect: false },
        ],
      })
      .expect(201);
    questionId = createResponse.body.id;
    expect(createResponse.body.options).toHaveLength(2);

    const taggedCreateResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false',
        text: 'Is this tagged?',
        difficulty: 'easy',
        marks: 1,
        tags: ['geography', 'geography'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    expect(taggedCreateResponse.body.tags).toEqual([{ id: expect.any(String), name: 'geography' }]);
    const geographyTagId = taggedCreateResponse.body.tags[0].id;

    const tagFilteredListResponse = await request(app.getHttpServer())
      .get(`/api/v1/questions?tagId=${geographyTagId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(tagFilteredListResponse.body.data.map((q: { id: string }) => q.id)).toEqual([taggedCreateResponse.body.id]);

    const tagListResponse = await request(app.getHttpServer())
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(tagListResponse.body.map((t: { name: string }) => t.name)).toContain('geography');

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listResponse.body.data.map((q: { id: string }) => q.id)).toContain(questionId);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(getResponse.body.text).toBe('What is the capital of France?');

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'What is the capital of France? (updated)',
        difficulty: 'medium',
        marks: 10,
        tags: ['geography', 'capitals'],
        options: [
          { text: 'Paris', isCorrect: true },
          { text: 'Berlin', isCorrect: false },
        ],
      })
      .expect(200);
    expect(updateResponse.body.marks).toBe(10);
    expect(updateResponse.body.tags.map((t: { name: string }) => t.name).sort()).toEqual(['capitals', 'geography']);

    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionId}/archive`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const activeListResponse = await request(app.getHttpServer())
      .get('/api/v1/questions?status=active')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListResponse.body.data.map((q: { id: string }) => q.id)).not.toContain(questionId);

    const archivedListResponse = await request(app.getHttpServer())
      .get('/api/v1/questions?status=archived')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(archivedListResponse.body.data.map((q: { id: string }) => q.id)).toContain(questionId);
  });

  it('rejects an invalid question payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'Bad question — two correct answers',
        difficulty: 'easy',
        marks: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      })
      .expect(400);
  });

  it('downloads the bulk upload template as an xlsx file', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/questions/bulk-upload/template')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toContain('question-bulk-upload-template.xlsx');
  });

  it('bulk-uploads a CSV with valid and invalid rows, creating only the valid ones', async () => {
    const csv = [
      'Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct',
      'true_false,Bulk row one,easy,2,True,TRUE,False,FALSE',
      'true_false,Bulk row two - only one option,easy,2,True,TRUE,,',
      'single_mcq,Bulk row three - no correct answer,easy,5,A,FALSE,B,FALSE',
    ].join('\n');

    const response = await request(app.getHttpServer())
      .post('/api/v1/questions/bulk-upload')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .attach('file', Buffer.from(csv), { filename: 'questions.csv', contentType: 'text/csv' })
      .expect(201);

    expect(response.body.created).toHaveLength(1);
    expect(response.body.created[0].text).toBe('Bulk row one');
    expect(response.body.errors).toEqual([
      { row: 2, message: 'true_false questions must have exactly 2 options' },
      { row: 3, message: 'single_mcq questions must have exactly 1 correct option' },
    ]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listResponse.body.data.some((q: { text: string }) => q.text === 'Bulk row one')).toBe(true);
  });

  it('rejects a bulk upload file with an unsupported extension', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions/bulk-upload')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .attach('file', Buffer.from('irrelevant'), { filename: 'questions.txt', contentType: 'text/plain' })
      .expect(400);
  });
});
