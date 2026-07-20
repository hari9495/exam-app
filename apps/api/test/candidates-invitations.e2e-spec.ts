import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaModule } from '@exam-platform/shared';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Candidates Row-Level Security', () => {
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
      data: { name: `ci-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'CI Org A', slug: `ci-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'CI Org B', slug: `ci-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.candidate.create({ data: { organizationId: orgAId, email: 'candidate@org-a.test', name: 'Org A Candidate' } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.candidate.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("never returns another tenant's candidates", async () => {
    const orgBCandidates = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.candidate.findMany(),
    );
    expect(orgBCandidates).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.candidate.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});

describe('Candidates & Invitations HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
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
      data: { name: `ci-http-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI HTTP Org', slug: `ci-http-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-http.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-http.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@ci-http.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterAccessToken = recruiterLogin.body.accessToken;

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'orgadmin@ci-http.test', password: 'OrgAdminPassw0rd!' })
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
      tx.candidate.deleteMany({ where: { organizationId: orgId } }),
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

  it('rejects a non-permitted role from creating a candidate', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ email: 'blocked@test.com', name: 'Blocked' })
      .expect(403);
  });

  it('adds candidates manually and via CSV bulk upload, then rejects publishing an empty exam', async () => {
    const aliceResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-http.test', name: 'Alice' })
      .expect(201);
    const aliceId = aliceResponse.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'bob@ci-http.test', name: 'Bob' })
      .expect(201);

    const csvContent = [
      'email,name,phone',
      'not-an-email,Bad Row,',
      `alice@ci-http.test,Alice Updated,555-0001`,
      'carol@ci-http.test,Carol,',
      'dave@ci-http.test,Dave,',
      'erin@ci-http.test,Erin,',
    ].join('\n');

    const bulkResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates/bulk')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ csvContent })
      .expect(201);
    expect(bulkResponse.body.created).toBe(3);
    expect(bulkResponse.body.updated).toBe(1);
    expect(bulkResponse.body.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "not-an-email"' }]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listResponse.body.data).toHaveLength(5);
    const updatedAlice = listResponse.body.data.find((c: { id: string }) => c.id === aliceId);
    expect(updatedAlice.name).toBe('Alice Updated');

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Backend Round' })
      .expect(201);
    examId = examResponse.body.id;
    expect(examResponse.body.status).toBe('draft');

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);
  });

  it('publishes an exam once it has content, then runs the full invitation lifecycle', async () => {
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

    const publishResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(publishResponse.body.status).toBe('published');

    const candidatesResponse = await request(app.getHttpServer())
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const candidateIds = candidatesResponse.body.data.map((c: { id: string }) => c.id);
    expect(candidateIds).toHaveLength(5);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds })
      .expect(201);
    expect(inviteResponse.body.created).toHaveLength(5);
    expect(inviteResponse.body.skipped).toHaveLength(0);
    expect(fakeEmailService.send).toHaveBeenCalledTimes(5);

    const reinviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds })
      .expect(201);
    expect(reinviteResponse.body.created).toHaveLength(0);
    expect(reinviteResponse.body.skipped).toHaveLength(5);

    const listInvitationsResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listInvitationsResponse.body).toHaveLength(5);
    listInvitationsResponse.body.forEach((inv: Record<string, unknown>) => expect(inv).not.toHaveProperty('token'));
    const firstInvitation = listInvitationsResponse.body[0];
    const originalToken = inviteResponse.body.created.find(
      (inv: { id: string; token: string }) => inv.id === firstInvitation.id,
    ).token;

    const resendResponse = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${firstInvitation.id}/resend`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(resendResponse.body.token).not.toBe(originalToken);

    const secondInvitation = listInvitationsResponse.body[1];
    const revokeResponse = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${secondInvitation.id}/revoke`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(revokeResponse.body.status).toBe('revoked');

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ candidateIds: [candidateIds[0]] })
      .expect(403);
  });

  it('bulk-uploads a CSV of candidates and invites them, splitting created/skipped/errors', async () => {
    const csv = [
      'Email,Name,Phone',
      'frank@ci-http.test,Frank,555-2000',
      'alice@ci-http.test,Alice Renamed,',
      'not-an-email,Bad Row,',
    ].join('\n');

    const response = await request(app.getHttpServer())
      .post('/api/v1/candidates/bulk-upload-invite')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .field('examId', examId)
      .attach('file', Buffer.from(csv), { filename: 'candidates.csv', contentType: 'text/csv' })
      .expect(201);

    expect(response.body.created).toHaveLength(1);
    expect(response.body.created[0].candidateId).toBeDefined();
    expect(response.body.skipped).toEqual([{ email: 'alice@ci-http.test', reason: 'Candidate already has a live invitation for this exam' }]);
    expect(response.body.errors).toEqual([{ row: 3, message: 'Invalid or missing email: "not-an-email"' }]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const frank = listResponse.body.data.find((c: { email: string }) => c.email === 'frank@ci-http.test');
    expect(frank).toBeDefined();
    const alice = listResponse.body.data.find((c: { email: string }) => c.email === 'alice@ci-http.test');
    expect(alice.name).toBe('Alice Renamed');
  });

  it('rejects a bulk upload+invite file with an unsupported extension', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/candidates/bulk-upload-invite')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .field('examId', examId)
      .attach('file', Buffer.from('irrelevant'), { filename: 'candidates.txt', contentType: 'text/plain' })
      .expect(400);
  });
});
