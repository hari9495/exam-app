import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Candidate data subject rights (GDPR export + erasure)', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgBId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let orgBAdminAccessToken: string;
  let examId: string;
  let questionId: string;
  let questionOptions: { id: string; text: string }[];
  let candidateId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `gdpr-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'GDPR Org A', slug: `gdpr-org-a-${randomUUID()}`, planId } });
    orgId = org.id;
    const orgB = await prisma.organization.create({ data: { name: 'GDPR Org B', slug: `gdpr-org-b-${randomUUID()}`, planId } });
    orgBId = orgB.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@gdpr-a.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@gdpr-a.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );
    await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgBId, email: 'orgadmin@gdpr-b.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp).post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@gdpr-a.test', password: 'RecruiterPassw0rd!' }).expect(200)
    ).body.accessToken;
    orgAdminAccessToken = (
      await request(adminHttp).post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@gdpr-a.test', password: 'OrgAdminPassw0rd!' }).expect(200)
    ).body.accessToken;
    orgBAdminAccessToken = (
      await request(adminHttp).post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgB.slug, email: 'orgadmin@gdpr-b.test', password: 'OrgAdminPassw0rd!' }).expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'GDPR Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const question = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    questionId = question.body.id;
    questionOptions = question.body.options;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    // The candidate whose data-subject rights this suite exercises: full exam flow so the
    // export has real answers and a real score to show.
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'gina@gdpr-a.test', name: 'Gina GDPR', phone: '555-0100' })
      .expect(201);
    candidateId = candidateResponse.body.id;

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);
    const candidateAccessToken = (
      await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inviteResponse.body.created[0].token }).expect(200)
    ).body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${candidateAccessToken}`).send({ consent: true }).expect(201);
    const correctOptionId = questionOptions.find((option) => option.text === '4')!.id;
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${candidateAccessToken}`).expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: [orgId, orgBId] } } } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, orgBId] } } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  it('exports the candidate\'s full data footprint with real values', async () => {
    const exportResponse = await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(exportResponse.body.candidate.email).toBe('gina@gdpr-a.test');
    expect(exportResponse.body.candidate.name).toBe('Gina GDPR');
    expect(exportResponse.body.candidate.phone).toBe('555-0100');
    expect(exportResponse.body.invitations).toHaveLength(1);
    expect(exportResponse.body.invitations[0].examTitle).toBe('GDPR Round');
    expect(exportResponse.body.attempts).toHaveLength(1);
    expect(exportResponse.body.attempts[0].result.score).toBe(5);
    expect(exportResponse.body.attempts[0].answers).toEqual([
      expect.objectContaining({ questionText: 'What is 2+2?', selectedOptions: ['4'], isCorrect: true }),
    ]);
  });

  it('rejects recruiter (no candidate:data_rights) with 403 on both endpoints', async () => {
    await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
    await request(adminHttp)
      .post(`/api/v1/candidates/${candidateId}/erase`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
  });

  it('rejects another organization\'s admin with 404 on both endpoints', async () => {
    await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${orgBAdminAccessToken}`)
      .expect(404);
    await request(adminHttp)
      .post(`/api/v1/candidates/${candidateId}/erase`)
      .set('Authorization', `Bearer ${orgBAdminAccessToken}`)
      .expect(404);
  });

  it('erases the candidate: PII scrubbed in the list view and in a re-export, scores intact', async () => {
    await request(adminHttp)
      .post(`/api/v1/candidates/${candidateId}/erase`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(201);

    const listResponse = await request(adminHttp)
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const erased = listResponse.body.data.find((row: { id: string }) => row.id === candidateId);
    expect(erased.name).toBe('Redacted');
    expect(erased.email).toBe(`erased-${candidateId}@redacted.invalid`);
    expect(erased.phone).toBeNull();

    const reExportResponse = await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);
    expect(reExportResponse.body.candidate.name).toBe('Redacted');
    expect(reExportResponse.body.candidate.email).toBe(`erased-${candidateId}@redacted.invalid`);
    // Anonymize-in-place: the attempt's score survives under the pseudonymous UUID.
    expect(reExportResponse.body.attempts[0].result.score).toBe(5);
    expect(reExportResponse.body.attempts[0].deviceFingerprint).toBeNull();
  });

  it('records both data-rights actions in the audit log', async () => {
    const auditResponse = await request(adminHttp)
      .get('/api/v1/audit-logs')
      .query({ entityType: 'candidate' })
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    const actions = auditResponse.body.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('candidate.data_exported');
    expect(actions).toContain('candidate.erased');
    const erasedEntry = auditResponse.body.find((entry: { action: string }) => entry.action === 'candidate.erased');
    expect(erasedEntry.entityId).toBe(candidateId);
    expect(erasedEntry.actorEmail).toBe('orgadmin@gdpr-a.test');
  });

  it('looks up a candidate by exact email match for an org_admin', async () => {
    const response = await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .query({ email: `erased-${candidateId}@redacted.invalid` })
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body.id).toBe(candidateId);
  });

  it('returns 404 for an email with no match, and 400 when email is omitted', async () => {
    await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .query({ email: 'nobody@nowhere.test' })
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(404);

    await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(400);
  });

  it('rejects recruiter (no candidate:data_rights) on lookup with 403', async () => {
    await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .query({ email: `erased-${candidateId}@redacted.invalid` })
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
  });
});
