import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Exam Reporting HTTP flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let panelAccessToken: string;
  let examId: string;
  let questionId: string;
  let correctOptionId: string;
  let wrongOptionId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-reporting-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Reporting Org', slug: `ci-reporting-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const panelHash = await argon2.hash('PanelPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-reporting.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-reporting.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'panel@ci-reporting.test', passwordHash: panelHash, role: 'panel' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-reporting.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-reporting.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    panelAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'panel@ci-reporting.test', password: 'PanelPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Reporting Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const question = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 10,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    questionId = question.body.id;
    correctOptionId = question.body.options.find((o: { text: string }) => o.text === '4').id;
    wrongOptionId = question.body.options.find((o: { text: string }) => o.text === '5').id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    async function inviteAndRedeem(email: string, name: string): Promise<string> {
      const candidateResponse = await request(adminHttp)
        .post('/api/v1/candidates')
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .send({ email, name })
        .expect(201);
      const inviteResponse = await request(adminHttp)
        .post(`/api/v1/exams/${examId}/invitations`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .send({ candidateIds: [candidateResponse.body.id] })
        .expect(201);
      const token = inviteResponse.body.created[0].token;
      return (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    }

    const aliceAccessToken = await inviteAndRedeem('alice@ci-reporting.test', 'Alice');
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${aliceAccessToken}`).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${aliceAccessToken}`).expect(201);

    const bobAccessToken = await inviteAndRedeem('bob@ci-reporting.test', 'Bob');
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${bobAccessToken}`).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${bobAccessToken}`)
      .send({ questionId, selectedOptionIds: [wrongOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${bobAccessToken}`).expect(201);

    const carolAccessToken = await inviteAndRedeem('carol@ci-reporting.test', 'Carol');
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${carolAccessToken}`).expect(201);

    await inviteAndRedeem('dave@ci-reporting.test', 'Dave');
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

  it('returns exam summary stats reflecting settled, in-progress, and not-started candidates', async () => {
    const response = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/summary`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(response.body.totalCandidates).toBe(4);
    expect(response.body.settledCount).toBe(2);
    expect(response.body.inProgressCount).toBe(1);
    expect(response.body.notStartedCount).toBe(1);
    expect(response.body.passRate).toBe(50);
    expect(response.body.averagePercentage).toBe(50);
    expect(response.body.scoreDistribution).toEqual([
      { rangeLabel: '0-20', count: 1 },
      { rangeLabel: '20-40', count: 0 },
      { rangeLabel: '40-60', count: 0 },
      { rangeLabel: '60-80', count: 0 },
      { rangeLabel: '80-100', count: 1 },
    ]);
    expect(response.body.attemptDuration).not.toBeNull();
    expect(response.body.attemptDuration.avgMinutes).toBeGreaterThanOrEqual(0);
  });

  it('rejects a summary request from a role without exam:manage', async () => {
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/summary`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('returns per-question accuracy computed only from settled attempts', async () => {
    const response = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/question-accuracy`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(response.body).toEqual([
      {
        questionId,
        questionText: 'What is 2+2?',
        timesIncluded: 2,
        timesAttempted: 2,
        timesSkipped: 0,
        timesCorrect: 1,
        accuracyPercentage: 50,
      },
    ]);
  });

  it('exports results as CSV, XLSX, and PDF with correct headers and non-empty bodies', async () => {
    const csvResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=csv`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.headers['content-disposition']).toContain('attachment');
    expect(csvResponse.text).toContain('Alice');

    const xlsxResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=xlsx`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(xlsxResponse.headers['content-type']).toContain('spreadsheetml');
    expect(Number(xlsxResponse.headers['content-length'])).toBeGreaterThan(0);

    const pdfResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=pdf`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    expect(Number(pdfResponse.headers['content-length'])).toBeGreaterThan(0);

    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=bogus`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);
  });

  it('returns 404 for all three reporting endpoints when the exam belongs to a different organization', async () => {
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-reporting-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({
      data: { name: 'CI Reporting Other Org', slug: `ci-reporting-other-org-${randomUUID()}`, planId: otherPlan.id },
    });
    const otherExam = await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) =>
      tx.exam.create({ data: { organizationId: otherOrg.id, title: 'Other Org Exam', createdBy: randomUUID() } }),
    );

    await request(adminHttp)
      .get(`/api/v1/exams/${otherExam.id}/results/summary`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
    await request(adminHttp)
      .get(`/api/v1/exams/${otherExam.id}/results/question-accuracy`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
    await request(adminHttp)
      .get(`/api/v1/exams/${otherExam.id}/results/export?format=csv`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);

    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });

  it('grants panel-role users read access to all results/report routes via results:view', async () => {
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/summary`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/question-accuracy`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=csv`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
  });

  it('rejects panel-role users from exam-management routes -- results:view does not imply exam:manage', async () => {
    await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .send({ title: 'Should Not Be Created' })
      .expect(403);
  });
});
