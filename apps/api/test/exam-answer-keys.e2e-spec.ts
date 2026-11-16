import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { asApproved } from './fixtures/approved-question';

// Security fix (assessments audit, 13 Nov 2026): answer keys (correct options, model answers, code test cases) go only
// to people who write tests or questions; an Interview coordinator (candidate view only) reads no test results; the
// paid AI re-analysis needs a writer's key. Positive and negative, against the real database.
describe('Answer keys and test results (security fix)', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'writer' | 'coordinator' | 'manager' | 'auditor';
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
  // An answer key: an option marked correct (an option has text and isCorrect), a list of correct options, a model answer.
  // A candidate's own answer may still say whether it was right: that is the result, not the key.
  const hasKey = (body: unknown): boolean => {
    if (Array.isArray(body)) return body.some(hasKey);
    if (!body || typeof body !== 'object') return typeof body === 'string' && body.includes('Reference: Paris');
    const o = body as Record<string, unknown>;
    if ('text' in o && 'isCorrect' in o) return true;
    if (Array.isArray(o.correctOptionIds) && o.correctOptionIds.length) return true;
    return Object.values(o).some(hasKey);
  };

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    const runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `keys-plan-${run}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const org = await prisma.organization.create({ data: { name: 'Keys Org', slug: `keys-org-${run}`, planId } });
    orgId = org.id;
    const hash = await argon2.hash(PASSWORD);
    const profile = (name: string, keys: string[]) => inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    // The shipped templates: Interview coordinator and Hiring manager (role-templates.ts); an older auditor; a test writer.
    const roster: [Who, string, string | null][] = [
      ['writer', 'recruiter', null],
      ['coordinator', 'panel', await profile('coordinator', ['ats.interview.schedule', 'ats.candidate.view'])],
      ['manager', 'panel', await profile('manager', ['ats.requisition.raise', 'ats.candidate.view', 'ats.assessment.view'])],
      ['auditor', 'auditor', null],
    ];
    for (const [who, role, permissionProfileId] of roster) {
      await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email: `${who}-${run}@keys.test`, passwordHash: hash, role, permissionProfileId } }));
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: `${who}-${run}@keys.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.exam = (await api('writer', 'post', '/exams').send({ title: 'Capitals' }).expect(201)).body.id;
    const section = (await api('writer', 'post', `/exams/${ids.exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
    const q = (await asApproved(await api('writer', 'post', '/questions').send({ type: 'single_mcq', text: 'Capital of France?', difficulty: 'easy', marks: 10, options: [{ text: 'Paris', isCorrect: true }, { text: 'Lyon', isCorrect: false }] }).expect(201))).body;
    ids.question = q.id;
    ids.right = q.options.find((o: { text: string }) => o.text === 'Paris').id;
    ids.essay = (await asApproved(await api('writer', 'post', '/questions').send({ type: 'essay', text: 'Why Paris?', difficulty: 'easy', marks: 5, options: [], modelAnswer: 'Reference: Paris is the seat of government.' }).expect(201))).body.id;
    await request(http).put(`/api/v1/exams/${ids.exam}/sections/${section}/questions`).set('Authorization', `Bearer ${token.writer}`).send({ questionIds: [ids.question] }).expect(200);
    await api('writer', 'post', `/exams/${ids.exam}/publish`).expect(201);
    const cand = (await api('writer', 'post', '/candidates').send({ email: `asha-${run}@keys.test`, name: 'Asha' }).expect(201)).body.id;
    ids.candidate = cand;
    // AS-0 (answer 2004): a Hiring manager reads results only for candidates of their own jobs, so Asha applied to theirs.
    const job = (await api('writer', 'post', '/jobs').send({ title: `Analyst ${run}` }).expect(201)).body.id as string;
    const managerId = (await inOrg((tx) => tx.user.findFirstOrThrow({ where: { email: `manager-${run}@keys.test` }, select: { id: true } }))).id;
    await inOrg((tx) => tx.job.update({ where: { id: job }, data: { hiringManagerId: managerId } }));
    await api('writer', 'post', `/jobs/${job}/entries`).send({ candidateId: cand }).expect(201);
    const inv = (await api('writer', 'post', `/exams/${ids.exam}/invitations`).send({ candidateIds: [cand] }).expect(201)).body.created[0].token;
    const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${ct}`).send({ consent: true }).expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/answer').set('Authorization', `Bearer ${ct}`).send({ questionId: ids.question, selectedOptionIds: [ids.right] }).expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${ct}`).expect(201);
    ids.attempt = (await inOrg((tx) => tx.attempt.findFirstOrThrow({ where: { examId: ids.exam }, select: { id: true } }))).id;
  }, 240_000);

  afterAll(async () => {
    await inOrg((tx) => tx.exam.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await inOrg((tx) => tx.question.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await inOrg((tx) => tx.job.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await inOrg((tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } })).catch(() => undefined);
    await inOrg((tx) => tx.user.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await inOrg((tx) => tx.permissionProfile.deleteMany({ where: { organizationId: orgId } })).catch(() => undefined);
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  const report = (who: Who) => api(who, 'get', `/exams/${ids.exam}/candidates/${ids.candidate}/report`);

  it('a test writer still reads the answer keys: the test, the question bank and the candidate report', async () => {
    const exam = (await api('writer', 'get', `/exams/${ids.exam}`).expect(200)).body;
    expect(exam.sections[0].questions[0].question.options.find((o: { id: string }) => o.id === ids.right).isCorrect).toBe(true);
    expect((await api('writer', 'get', `/questions/${ids.question}`).expect(200)).body.options.find((o: { id: string }) => o.id === ids.right).isCorrect).toBe(true);
    expect((await api('writer', 'get', `/questions/${ids.essay}`).expect(200)).body.modelAnswer).toMatch(/Reference: Paris/);
    expect((await api('writer', 'get', '/questions').expect(200)).body.data.some((x: { modelAnswer: string | null }) => x.modelAnswer)).toBe(true);
    const detail = (await report('writer').expect(200)).body;
    expect(detail.sections[0].questions[0].correctOptionIds).toEqual([ids.right]);
  });

  it('a hiring manager reads the test and the result but no answer key, on any route', async () => {
    const exam = (await api('manager', 'get', `/exams/${ids.exam}`).expect(200)).body;
    expect(exam.sections[0].questions[0].question.options.map((o: { text: string }) => o.text).sort()).toEqual(['Lyon', 'Paris']);
    expect(hasKey(exam)).toBe(false);
    expect(exam.sections[0].questions[0].question.options.some((o: object) => 'isCorrect' in o)).toBe(false);
    const detail = (await report('manager').expect(200)).body;
    expect(detail.sections[0].questions[0]).toMatchObject({ selectedOptionIds: [ids.right], correctOptionIds: [], isCorrect: true });
    expect(hasKey(detail)).toBe(false);
    for (const path of [`/exams/${ids.exam}/results`, `/exams/${ids.exam}/results/summary`, `/exams/${ids.exam}/results/question-accuracy`, `/attempts/${ids.attempt}/ai-insight`]) {
      const r = await api('manager', 'get', path);
      expect([path, r.status]).not.toEqual([path, 403]);
      expect([path, hasKey(r.body)]).toEqual([path, false]);
    }
  });

  it('an auditor reads the question bank and tests without answer keys or model answers', async () => {
    const one = (await api('auditor', 'get', `/questions/${ids.question}`).expect(200)).body;
    expect(one.options.some((o: object) => 'isCorrect' in o)).toBe(false);
    expect((await api('auditor', 'get', `/questions/${ids.essay}`).expect(200)).body.modelAnswer).toBeNull();
    expect(hasKey((await api('auditor', 'get', '/questions').expect(200)).body)).toBe(false);
    expect(hasKey((await api('auditor', 'get', `/exams/${ids.exam}`).expect(200)).body)).toBe(false);
    expect(hasKey((await report('auditor').expect(200)).body)).toBe(false);
  });

  it('negative: an interview coordinator (candidate view only) gets no tests and no results (403)', async () => {
    for (const path of ['/exams', `/exams/${ids.exam}`, `/exams/${ids.exam}/results`, `/exams/${ids.exam}/results/summary`, `/exams/${ids.exam}/results/question-accuracy`, `/exams/${ids.exam}/candidates/${ids.candidate}/report`, `/exams/${ids.exam}/results/export?format=csv`, `/attempts/${ids.attempt}/ai-insight`, `/questions/${ids.question}`]) {
      expect([path, (await api('coordinator', 'get', path)).status]).toEqual([path, 403]);
    }
  });

  it('negative: readers cannot start the paid AI re-analysis; a test writer can', async () => {
    for (const who of ['manager', 'auditor', 'coordinator'] as const) expect([who, (await api(who, 'post', `/attempts/${ids.attempt}/ai-insight/regenerate`)).status]).toEqual([who, 403]);
    expect((await api('writer', 'post', `/attempts/${ids.attempt}/ai-insight/regenerate`)).status).not.toBe(403);
  });
});
