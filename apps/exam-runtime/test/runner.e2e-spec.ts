import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { bootAdminApp, bootRuntimeApp } from '../../api/test/dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../../api/src/email/email.service';
import { SETTINGS } from '../../api/src/org-structure/settings-registry';
import { RUNNER_SETTINGS } from '../src/attempts/runner-settings';
import { IntegrityNarrativeClient } from '../src/integrity/integrity-narrative.client';
import { ProctoringRiskClient } from '../src/proctoring-analysis/proctoring-risk.client';
import { asApproved } from '../../api/test/fixtures/approved-question';

// Assessments AS-4a (PRC-26, PRC-27), against the real database on a throwaway company: the version each answer saw
// (answer 2122), answers kept on the device (an older copy never wins), time given back for a lost connection (capped by
// the company setting), breaks, the after-test survey, and a held result. Every query runs as the candidate's company.
jest.setTimeout(60000);

describe('Designed runner (AS-4a)', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId = '';
  let orgId = '';
  let recruiter = '';
  let examId = '';
  let questionId = '';
  const options: string[] = [];
  const run = randomUUID().slice(0, 8);
  const org = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn) as Promise<T>;
  const as = (token: string, method: 'get' | 'post', path: string) => request(runtimeHttp)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    ({ app: runtimeApp } = await bootRuntimeApp((b) =>
      b.overrideProvider(IntegrityNarrativeClient).useValue({ writeNarrative: jest.fn().mockResolvedValue('n') }).overrideProvider(ProctoringRiskClient).useValue({ assessRisk: jest.fn() }),
    ));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `runner-plan-${run}`, candidateLimit: 10, aiCreditLimit: 10, proctoringMinutesLimit: 10 } })).id;
    const o = await prisma.organization.create({ data: { name: `Runner ${run}`, slug: `runner-${run}`, planId } });
    orgId = o.id;
    const hash = await argon2.hash('RecruiterPassw0rd!');
    await org((tx) => tx.user.create({ data: { organizationId: orgId, email: `rec-${run}@runner.test`, passwordHash: hash, role: 'recruiter' } }));
    recruiter = (await request(adminHttp).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `rec-${run}@runner.test`, password: 'RecruiterPassw0rd!' }).expect(200)).body.accessToken;
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${recruiter}`);
    examId = (await auth(request(adminHttp).post('/api/v1/exams')).send({ title: 'Runner test', durationMinutes: 60 }).expect(201)).body.id;
    const section = (await auth(request(adminHttp).post(`/api/v1/exams/${examId}/sections`)).send({ title: 'One' }).expect(201)).body.id;
    const q = (await asApproved(await auth(request(adminHttp).post('/api/v1/questions')).send({ type: 'single_mcq', text: 'Two plus two?', difficulty: 'easy', marks: 1, options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }).expect(201))).body;
    questionId = q.id;
    options.push(...(q.options as { id: string }[]).map((x) => x.id));
    await auth(request(adminHttp).put(`/api/v1/exams/${examId}/sections/${section}/questions`)).send({ questionIds: [questionId] }).expect(200);
    await auth(request(adminHttp).post(`/api/v1/exams/${examId}/publish`)).expect(201);
  });

  afterAll(async () => {
    try {
      await org((tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
      await org((tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
      await org((tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
      await org((tx) => tx.setting.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
      await org((tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    } finally {
      await adminApp.close();
      await runtimeApp.close();
    }
  });

  async function startCandidate(name: string): Promise<{ token: string; attemptId: string }> {
    const c = (await request(adminHttp).post('/api/v1/candidates').set('Authorization', `Bearer ${recruiter}`).send({ email: `${name}-${run}@runner.test`, name }).expect(201)).body;
    const inv = (await request(adminHttp).post(`/api/v1/exams/${examId}/invitations`).set('Authorization', `Bearer ${recruiter}`).send({ candidateIds: [c.id] }).expect(201)).body;
    const token = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.created[0].token }).expect(200)).body.accessToken as string;
    const attemptId = (await as(token, 'post', '/attempt/start').send({ consent: true }).expect(201)).body.id as string;
    return { token, attemptId };
  }

  it('the runner reads the same settings, values and defaults as the API registry', () => {
    for (const [key, def] of Object.entries(RUNNER_SETTINGS)) {
      const reg = SETTINGS[key as keyof typeof SETTINGS] as { values: readonly string[]; default: string };
      expect([key, reg.values, reg.default]).toEqual([key, def.values, def.default]);
    }
  });

  it('answer 2122 and answers kept on the device: the version answered is stored; an older device copy never wins', async () => {
    const { token, attemptId } = await startCandidate('ver');
    const version = (await org((tx) => tx.question.findUniqueOrThrow({ where: { id: questionId }, select: { version: true } }))).version;
    await as(token, 'post', '/attempt/answer').send({ questionId, selectedOptionIds: [options[1]], clientSavedAt: '2026-11-16T10:05:00.000Z' }).expect(201);
    const stale = await as(token, 'post', '/attempt/answer').send({ questionId, selectedOptionIds: [options[0]], clientSavedAt: '2026-11-16T10:00:00.000Z' }).expect(201);
    expect(stale.body).toMatchObject({ stale: true, selectedOptionIds: [options[1]] });
    const a = await org((tx) => tx.answer.findFirstOrThrow({ where: { attemptId, questionId } }));
    expect([a.questionVersion, JSON.parse(a.selectedOptionIdsJson), a.clientSavedAt?.toISOString(), a.organizationId]).toEqual([version, [options[1]], '2026-11-16T10:05:00.000Z', orgId]);
    // A newer copy wins; a device time in the future counts as now.
    await as(token, 'post', '/attempt/answer').send({ questionId, selectedOptionIds: [options[0]], clientSavedAt: '2099-01-01T00:00:00.000Z' }).expect(201);
    const b = await org((tx) => tx.answer.findFirstOrThrow({ where: { attemptId, questionId } }));
    expect(JSON.parse(b.selectedOptionIdsJson)).toEqual([options[0]]);
    expect(b.clientSavedAt!.getTime()).toBeLessThanOrEqual(Date.now());
    // Negative: a device time that is not a date is refused.
    await as(token, 'post', '/attempt/answer').send({ questionId, selectedOptionIds: [options[0]], clientSavedAt: 'yesterday' }).expect(400);
  });

  // AS-4a part 2 (answer 2161): the writer's alt text (2126) reaches the runner, matched to options by their written order
  // even though the options are shown shuffled; a blank alt is sent as none.
  it('sends the question and option alt text the writer gave', async () => {
    await org((tx) => tx.question.update({ where: { id: questionId }, data: { imageAlt: 'A sum written on a board', optionAlts: ['The number four', '  '] } }));
    const { token } = await startCandidate('alt');
    const q = (await as(token, 'get', '/attempt/current').expect(200)).body.sections[0].questions[0] as { imageAlt: string | null; options: { id: string; imageAlt: string | null }[] };
    expect(q.imageAlt).toBe('A sum written on a board');
    expect(Object.fromEntries(q.options.map((o) => [o.id, o.imageAlt]))).toEqual({ [options[0]!]: 'The number four', [options[1]!]: null });
  });

  it('a lost connection: the time is given back before the request is handled, up to the company cap', async () => {
    const { token, attemptId } = await startCandidate('net');
    await org((tx) => tx.attempt.update({ where: { id: attemptId }, data: { lastSeenAt: new Date(Date.now() - 180_000) } }));
    const now = (await as(token, 'get', '/attempt/current').expect(200)).body as { runner: { offlineCreditSeconds: number; timeCreditCapMinutes: number; offlineMinutes: number } };
    expect(now.runner.offlineCreditSeconds).toBeGreaterThanOrEqual(130);
    expect(now.runner.offlineCreditSeconds).toBeLessThanOrEqual(140);
    expect([now.runner.timeCreditCapMinutes, now.runner.offlineMinutes]).toEqual([10, 5]);
    const after = await org((tx) => tx.attempt.findUniqueOrThrow({ where: { id: attemptId } }));
    expect(after.pausedDurationMs).toBe(after.offlineCreditMs);
    // Negative: with the company cap at 0, nothing is given back.
    await org((tx) => tx.setting.create({ data: { organizationId: orgId, scopeType: 'tenant', scopeId: orgId, key: 'asmt.time_credit_cap', value: '0' } }));
    const other = await startCandidate('cap');
    await org((tx) => tx.attempt.update({ where: { id: other.attemptId }, data: { lastSeenAt: new Date(Date.now() - 180_000) } }));
    expect((await as(other.token, 'post', '/attempt/reconnected').expect(200)).body).toMatchObject({ offlineCreditSeconds: 0, timeCreditCapMinutes: 0 });
    await org((tx) => tx.setting.deleteMany({ where: { organizationId: orgId, key: 'asmt.time_credit_cap' } }));
  });

  it('breaks: none by default; one allowed stops the timer, blocks answering, and ends with at most its length given back', async () => {
    const { token, attemptId } = await startCandidate('brk');
    expect((await as(token, 'post', '/attempt/break/start').expect(400)).body.message).toMatch(/no breaks/);
    await org((tx) => tx.exam.update({ where: { id: examId }, data: { breaksAllowed: 1, breakMinutes: 1 } }));
    const started = (await as(token, 'post', '/attempt/break/start').expect(200)).body;
    expect(started).toMatchObject({ status: 'paused', breaksLeft: 0 });
    await as(token, 'post', '/attempt/answer').send({ questionId, selectedOptionIds: [options[0]] }).expect(400);
    expect((await as(token, 'get', '/attempt/current').expect(200)).body).toMatchObject({ status: 'paused', pausedReason: 'break', runner: { breaksUsed: 1, breakEndsAt: expect.any(String) } });
    const ended = (await as(token, 'post', '/attempt/break/end').expect(200)).body;
    expect(ended.status).toBe('in_progress');
    const a = await org((tx) => tx.attempt.findUniqueOrThrow({ where: { id: attemptId } }));
    expect(a.pausedDurationMs).toBeLessThanOrEqual(60_000);
    // Negatives: no breaks left; ending a break that is not on.
    expect((await as(token, 'post', '/attempt/break/start').expect(400)).body.message).toMatch(/all the breaks/);
    await as(token, 'post', '/attempt/break/end').expect(400);
    // A break left past its length ends on its own.
    await org((tx) => tx.exam.update({ where: { id: examId }, data: { breaksAllowed: 2 } }));
    await as(token, 'post', '/attempt/break/start').expect(200);
    await org((tx) => tx.attempt.update({ where: { id: attemptId }, data: { pausedAt: new Date(Date.now() - 5 * 60_000) } }));
    expect((await as(token, 'get', '/attempt/current').expect(200)).body.status).toBe('in_progress');
    await org((tx) => tx.exam.update({ where: { id: examId }, data: { breaksAllowed: 0, breakMinutes: 5 } }));
  });

  it('the survey: only after the test, once, rating 1 to 5; stored as the attempt company; a held result shows as held', async () => {
    const { token, attemptId } = await startCandidate('srv');
    await as(token, 'post', '/attempt/survey').send({ rating: 5 }).expect(400);
    await as(token, 'post', '/attempt/submit').expect(201);
    await as(token, 'post', '/attempt/survey').send({ rating: 6 }).expect(400);
    await as(token, 'post', '/attempt/survey').send({ rating: 4, clearInstructions: true, comment: 'Fine' }).expect(201);
    await as(token, 'post', '/attempt/survey').send({ rating: 3 }).expect(409);
    const s = await org((tx) => tx.attemptSurvey.findUniqueOrThrow({ where: { attemptId } }));
    expect([s.rating, s.organizationId]).toEqual([4, orgId]);
    expect((await as(token, 'get', '/attempt/current').expect(200)).body.runner.surveyDone).toBe(true);
    // PRC-27: a result held for review says so, with no score.
    for (let i = 0; i < 50 && !(await org((tx) => tx.result.findUnique({ where: { attemptId } }))); i++) await new Promise((r) => setTimeout(r, 100));
    await org((tx) => tx.result.update({ where: { attemptId }, data: { releaseOverride: 'held' } }));
    expect((await as(token, 'get', '/attempt/current').expect(200)).body.feedback).toMatchObject({ status: 'held', passFail: null, percentage: null });
  });
});
