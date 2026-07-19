import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from '../../api/test/dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../../api/src/email/email.service';
import { ClaudeIntegrityClient } from '../src/integrity/claude-integrity.client';
import { ClaudeProctoringClient } from '../src/proctoring-analysis/claude-proctoring.client';

// Settlement (grading) and the integrity/proctoring analyses it kicks off are fire-and-forget
// (see attempt-settlement.service.ts), so assertions on integrity_analyses must poll rather than
// assume the row exists the instant /attempt/submit responds.
jest.setTimeout(30000);

// Real, identical (post-normalization) code for two different candidates answering the same
// question — this is what proves the similarity engine's counterpart-update path (Task 5) fires
// end-to-end, not just under unit-test mocks.
const IDENTICAL_CODE = `function computeInvoiceTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    total += item.price * item.quantity;
    if (item.discountPercent) {
      total -= total * (item.discountPercent / 100);
    }
  }
  return Math.round(total * 100) / 100;
}`;

interface IntegrityFlagRow {
  type: string;
  severity: string;
  counterpartAttemptId?: string;
}

describe('Integrity analysis e2e', () => {
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
  let codeQuestionId: string;

  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeClaudeIntegrityClient = { writeNarrative: jest.fn().mockResolvedValue('Mock integrity narrative for CI.') };
  const fakeClaudeProctoringClient = { assessRisk: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) =>
      builder
        .overrideProvider(ClaudeIntegrityClient).useValue(fakeClaudeIntegrityClient)
        .overrideProvider(ClaudeProctoringClient).useValue(fakeClaudeProctoringClient),
    ));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-integrity-e2e-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 10, proctoringMinutesLimit: 10 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Integrity E2E Org', slug: `ci-integrity-e2e-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-integrity-e2e.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-integrity-e2e.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Integrity E2E Round', durationMinutes: 60 })
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
        type: 'code',
        text: 'Write a function that totals an invoice.',
        difficulty: 'easy',
        marks: 10,
        codeLanguage: 'javascript',
        starterCode: 'function computeInvoiceTotal(items) {\n  \n}',
        options: [],
      })
      .expect(201);
    codeQuestionId = questionResponse.body.id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [codeQuestionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    // try/finally: a throw here must not skip app.close() below, or the Jest process hangs
    // instead of failing loudly (see project dev-environment quirks re: e2e afterAll discipline).
    try {
      // ai_credit_usage has no FK/cascade relation to organizations (see schema.prisma) — the
      // integrity narrative call in this spec writes rows there, so it must be cleaned explicitly
      // or it leaks across runs.
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.aiCreditUsage.deleteMany({ where: { organizationId: orgId } }));
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

  async function pollIntegrityAnalysis(
    attemptId: string,
    predicate: (row: { status: string; level: string | null; flagsJson: string | null } | null) => boolean,
    timeoutMs = 10000,
  ): Promise<{ status: string; level: string | null; flagsJson: string | null }> {
    const deadline = Date.now() + timeoutMs;
    let last: { status: string; level: string | null; flagsJson: string | null } | null = null;
    while (Date.now() < deadline) {
      last = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
        tx.integrityAnalysis.findUnique({ where: { attemptId } }),
      );
      if (predicate(last)) return last as { status: string; level: string | null; flagsJson: string | null };
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for integrity analysis condition on attempt ${attemptId}. Last row: ${JSON.stringify(last)}`);
  }

  it('rejects starting an attempt without consent, and records consentAt when consent is given', async () => {
    const accessToken = await inviteAndRedeem('alice@ci-integrity-e2e.test', 'Alice');

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(400);

    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ consent: true })
      .expect(201);
    const attemptId = startResponse.body.id;

    const attempt = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.attempt.findUnique({ where: { id: attemptId } }),
    );
    expect(attempt?.consentAt).not.toBeNull();
  });

  it('flags a large paste as high_concern, and links similarity_match between two candidates with identical code', async () => {
    const bobAccessToken = await inviteAndRedeem('bob@ci-integrity-e2e.test', 'Bob');
    const bobStart = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${bobAccessToken}`)
      .send({ consent: true })
      .expect(201);
    const bobAttemptId = bobStart.body.id;

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${bobAccessToken}`)
      .send({
        questionId: codeQuestionId,
        selectedOptionIds: [],
        answerText: IDENTICAL_CODE,
        telemetry: {
          keystrokeChars: 50,
          pastedChars: 900,
          pasteCount: 1,
          largestPasteChars: 900,
          secondsToFirstEdit: 2,
          activeSeconds: 30,
          runCount: 1,
        },
      })
      .expect(201);

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${bobAccessToken}`).expect(201);

    const bobAnalysis = await pollIntegrityAnalysis(bobAttemptId, (row) => row?.status === 'completed' && row.level === 'high_concern');
    expect(bobAnalysis.level).toBe('high_concern');
    const bobFlags: IntegrityFlagRow[] = JSON.parse(bobAnalysis.flagsJson ?? '[]');
    expect(bobFlags).toContainEqual(expect.objectContaining({ type: 'large_paste', severity: 'high' }));

    // Second candidate submits textually identical code to the same question.
    const carolAccessToken = await inviteAndRedeem('carol@ci-integrity-e2e.test', 'Carol');
    const carolStart = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${carolAccessToken}`)
      .send({ consent: true })
      .expect(201);
    const carolAttemptId = carolStart.body.id;

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${carolAccessToken}`)
      .send({ questionId: codeQuestionId, selectedOptionIds: [], answerText: IDENTICAL_CODE })
      .expect(201);

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${carolAccessToken}`).expect(201);

    const carolAnalysis = await pollIntegrityAnalysis(carolAttemptId, (row) => {
      if (row?.status !== 'completed') return false;
      const flags: IntegrityFlagRow[] = JSON.parse(row.flagsJson ?? '[]');
      return flags.some((f) => f.type === 'similarity_match' && f.counterpartAttemptId === bobAttemptId);
    });
    const carolFlags: IntegrityFlagRow[] = JSON.parse(carolAnalysis.flagsJson ?? '[]');
    expect(carolFlags).toContainEqual(expect.objectContaining({ type: 'similarity_match', counterpartAttemptId: bobAttemptId }));

    // Bob's already-completed analysis must have been updated in place with the counterpart match
    // (the update path from Task 5) — not just Carol's fresh one.
    const bobAnalysisAfter = await pollIntegrityAnalysis(bobAttemptId, (row) => {
      if (!row) return false;
      const flags: IntegrityFlagRow[] = JSON.parse(row.flagsJson ?? '[]');
      return flags.some((f) => f.type === 'similarity_match' && f.counterpartAttemptId === carolAttemptId);
    });
    const bobFlagsAfter: IntegrityFlagRow[] = JSON.parse(bobAnalysisAfter.flagsJson ?? '[]');
    expect(bobFlagsAfter).toContainEqual(expect.objectContaining({ type: 'similarity_match', counterpartAttemptId: carolAttemptId }));
  });
});
