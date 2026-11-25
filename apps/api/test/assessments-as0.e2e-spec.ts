import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { markSteppedUp } from './fixtures/step-up';
import { asApproved } from './fixtures/approved-question';

// Assessments AS-0 (founder answers 2003 to 2006), end to end against the real database (forced RLS, the app role):
//   2005  every exam table is company data under forced RLS: another company reads and writes nothing of it;
//   2003  the asmt.* keys write tests and questions, proctor, mark and read results, the older keys still work;
//   2004  a Hiring manager reads the results of their own jobs' candidates only; an Interview coordinator reads the
//         jobs and the job board without any result; answer keys only for writers (the hotfix);
//   2006  no assessments change while acting for someone else; the second factor again and a reason to end an attempt,
//         to overturn a proctoring verdict, release results or finish marking.
describe('Assessments AS-0: company isolation, keys, own-job results, acting and step-up', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let runtimeHttp: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'adminA' | 'adminB' | 'recruiter' | 'tester' | 'proctor' | 'evaluator' | 'manager' | 'coordinator' | 'acting';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const template = (key: string): string[] => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as0-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS0 ${k}`, slug: `as0-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['recruiter', 'A', 'recruiter', null],
      ['tester', 'A', 'panel', ['asmt.test.manage', 'asmt.bank.manage']],
      ['proctor', 'A', 'panel', ['asmt.proctor']],
      ['evaluator', 'A', 'panel', ['asmt.evaluate']],
      ['manager', 'A', 'panel', template('hiring_manager')],
      ['coordinator', 'A', 'panel', template('interview_coordinator')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as0.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as0.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // The test is written with the YukthiX keys only (2003): exam:manage and question_bank:manage through their aliases.
    ids.exam = (await api('tester', 'post', '/exams').send({ title: `Capitals ${run}` }).expect(201)).body.id;
    const section = (await api('tester', 'post', `/exams/${ids.exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
    const q = (await asApproved(await api('tester', 'post', '/questions').send({ type: 'single_mcq', text: 'Capital of France?', difficulty: 'easy', marks: 10, options: [{ text: 'Paris', isCorrect: true }, { text: 'Lyon', isCorrect: false }] }).expect(201))).body;
    ids.question = q.id;
    ids.right = q.options.find((o: { text: string }) => o.text === 'Paris').id;
    await api('tester', 'put', `/exams/${ids.exam}/sections/${section}/questions`).send({ questionIds: [ids.question] }).expect(200);
    await api('tester', 'post', `/exams/${ids.exam}/publish`).expect(201);
    // Two jobs: J1 is the Hiring manager's, J2 is not. C1 applied to J1; C2 and C3 to J2.
    for (const j of ['J1', 'J2']) {
      ids[j] = (await api('recruiter', 'post', '/jobs').send({ title: `${j} ${run}` }).expect(201)).body.id;
    }
    await inOrg(org.A.id, (tx) => tx.job.update({ where: { id: ids.J1 }, data: { hiringManagerId: users.manager } }));
    for (const [c, j] of [['C1', 'J1'], ['C2', 'J2'], ['C3', 'J2']] as const) {
      ids[c] = (await api('recruiter', 'post', '/candidates').send({ email: `${c.toLowerCase()}-${run}@as0.test`, name: `${c} ${run}` }).expect(201)).body.id;
      await api('recruiter', 'post', `/jobs/${ids[j]}/entries`).send({ candidateId: ids[c] }).expect(201);
      const inv = (await api('recruiter', 'post', `/exams/${ids.exam}/invitations`).send({ candidateIds: [ids[c]] }).expect(201)).body.created[0];
      ids[`${c}inv`] = inv.id;
      const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken;
      await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${ct}`).send({ consent: true }).expect(201);
      await request(runtimeHttp).post('/api/v1/attempt/answer').set('Authorization', `Bearer ${ct}`).send({ questionId: ids.question, selectedOptionIds: [ids.right] }).expect(201);
      // C3 stays in the test (ended by a proctor below).
      if (c !== 'C3') await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${ct}`).expect(201);
      ids[`${c}att`] = (await inOrg(org.A.id, (tx) => tx.attempt.findFirstOrThrow({ where: { invitationId: inv.id }, select: { id: true } }))).id;
    }
    // The exam is linked to both jobs only now: linking (or inviting to a linked exam) would add every invited candidate
    // to every linked job, and the Hiring manager's job must hold C1 alone.
    for (const j of ['J1', 'J2']) await inOrg(org.A.id, (tx) => tx.jobExam.create({ data: { organizationId: org.A.id, jobId: ids[j], examId: ids.exam } }));
    token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.recruiter}`).expect(200)).body.accessToken;
  }, 300_000);

  afterAll(async () => {
    for (const k of ['A', 'B'] as const) {
      const o = org[k].id;
      await inOrg(o, (tx) => tx.exam.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
      await inOrg(o, (tx) => tx.question.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
      await inOrg(o, (tx) => tx.job.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
      await inOrg(o, (tx) => tx.candidate.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
    }
    await tenantPrisma
      .forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  // ------------------------------------------------------------------------------------------ 2005
  describe('2005: the exam tables are company data under forced RLS', () => {
    it('every row carries the exam company; that company reads it, another company reads none of it', async () => {
      const counts = (o: string) =>
        inOrg(o, async (tx) => ({
          sections: await tx.examSection.count({ where: { examId: ids.exam } }),
          options: await tx.questionOption.count({ where: { questionId: ids.question } }),
          invitations: await tx.invitation.count({ where: { examId: ids.exam } }),
          attempts: await tx.attempt.count({ where: { examId: ids.exam } }),
          answers: await tx.answer.count({ where: { questionId: ids.question } }),
          results: await tx.result.count({ where: { attemptId: { in: [ids.C1att, ids.C2att] } } }),
          events: await tx.proctoringEvent.count({ where: { attemptId: { in: [ids.C1att, ids.C2att, ids.C3att] } } }),
        }));
      const a = await counts(org.A.id);
      expect(a).toMatchObject({ sections: 1, options: 2, invitations: 3, attempts: 3, answers: 3, results: 2 });
      expect(await counts(org.B.id)).toEqual({ sections: 0, options: 0, invitations: 0, attempts: 0, answers: 0, results: 0, events: 0 });
      const orgs = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.answer.findMany({ where: { questionId: ids.question }, select: { organizationId: true } }));
      expect(new Set(orgs.map((x) => x.organizationId))).toEqual(new Set([org.A.id]));
    });

    it('negative: another company cannot write into this company\'s attempt, and its staff get 404 on every route', async () => {
      await expect(inOrg(org.B.id, (tx) => tx.proctoringEvent.create({ data: { attemptId: ids.C1att, eventType: 'tab_switch', severity: 'low' } }))).rejects.toThrow();
      await expect(inOrg(org.B.id, (tx) => tx.answer.updateMany({ where: { attemptId: ids.C1att }, data: { marksAwarded: 0 } }))).resolves.toEqual({ count: 0 });
      for (const path of [`/exams/${ids.exam}`, `/exams/${ids.exam}/results`, `/exams/${ids.exam}/candidates/${ids.C1}/report`, `/attempts/${ids.C1att}/ai-insight`]) {
        expect([path, (await api('adminB', 'get', path)).status]).toEqual([path, 404]);
      }
    });
  });

  // ------------------------------------------------------------------------------------------ 2003
  describe('2003: the YukthiX assessment keys', () => {
    it('the test writer (asmt.test.manage) reads the answer key; the Recruiter and Hiring manager templates carry the new keys', async () => {
      const exam = (await api('tester', 'get', `/exams/${ids.exam}`).expect(200)).body;
      expect(exam.sections[0].questions[0].question.options.find((o: { id: string }) => o.id === ids.right).isCorrect).toBe(true);
      expect(template('recruiter')).toEqual(expect.arrayContaining(['asmt.bank.manage', 'asmt.test.manage', 'asmt.proctor', 'asmt.evaluate', 'asmt.results.view']));
      expect(template('hiring_manager')).toContain('asmt.results.view');
      expect(template('hiring_manager')).not.toEqual(expect.arrayContaining(['asmt.test.manage']));
    });

    it('negative: each key does only its own job', async () => {
      await api('proctor', 'post', '/exams').send({ title: 'Nope' }).expect(403);
      await api('evaluator', 'post', '/questions').send({ type: 'single_mcq', text: 'x', difficulty: 'easy', marks: 1, options: [{ text: 'a', isCorrect: true }] }).expect(403);
      await api('manager', 'post', '/exams').send({ title: 'Nope' }).expect(403);
      await api('tester', 'post', `/attempts/${ids.C3att}/unblock`).send({}).expect(403);
      await api('proctor', 'post', `/exams/${ids.exam}/results/release`).send({}).expect(403);
    });
  });

  // ------------------------------------------------------------------------------------------ 2004
  describe('2004: a Hiring manager reads only their own jobs\' candidates; a coordinator reads no result', () => {
    const rowsOf = async (who: Who) => ((await api(who, 'get', `/exams/${ids.exam}/results`).expect(200)).body as { candidateId: string }[]).map((r) => r.candidateId).sort();

    it('the recruiter reads every candidate; the Hiring manager only C1 (their job), in the list, summary, export and report', async () => {
      expect(await rowsOf('recruiter')).toEqual([ids.C1, ids.C2, ids.C3].sort());
      expect(await rowsOf('manager')).toEqual([ids.C1]);
      expect((await api('manager', 'get', `/exams/${ids.exam}/results/summary`).expect(200)).body.totalCandidates).toBe(1);
      await api('manager', 'get', `/exams/${ids.exam}/candidates/${ids.C1}/report`).expect(200);
      const csv = (await api('manager', 'get', `/exams/${ids.exam}/results/export?format=csv`).expect(200)).text;
      expect(csv).toContain(`C1 ${run}`);
      expect(csv).not.toContain(`C2 ${run}`);
    });

    it('negative: another job\'s candidate is 404 to the Hiring manager (report, AI insight, compare); company-wide numbers are refused', async () => {
      await api('manager', 'get', `/exams/${ids.exam}/candidates/${ids.C2}/report`).expect(404);
      await api('manager', 'get', `/attempts/${ids.C2att}/ai-insight`).expect(404);
      expect((await api('manager', 'get', `/exams/${ids.exam}/candidates/compare?invitationIds=${ids.C1inv},${ids.C2inv}`)).status).toBeGreaterThanOrEqual(400);
      expect((await api('manager', 'get', '/dashboard/summary?window=all').expect(403)).body.message).toMatch(/Company-wide test numbers/);
      await api('recruiter', 'get', '/dashboard/summary?window=all').expect(200);
    });

    it('the job board: the Hiring manager sees results on their own job; the coordinator sees the jobs and boards without any result', async () => {
      const board = async (who: Who, job: string, path = `/hiring/jobs/${job}/board`) => {
        const b = (await api(who, 'get', path).expect(200)).body as { columns: Record<string, { candidateId: string; examResults: unknown[] }[]> };
        return new Map(Object.values(b.columns).flat().map((r) => [r.candidateId, r.examResults.length]));
      };
      expect((await board('manager', ids.J1)).get(ids.C1)).toBe(1);
      expect([...(await board('manager', ids.J2)).values()]).toEqual([0, 0]);
      expect((await board('recruiter', ids.J2)).get(ids.C2)).toBe(1);
      expect([...(await board('coordinator', ids.J1)).values()]).toEqual([0]);
      // The older job pipeline route (the job page) strips results the same way.
      expect([...(await board('coordinator', ids.J1, `/jobs/${ids.J1}/pipeline`)).values()]).toEqual([0]);
      expect((await board('manager', ids.J1, `/jobs/${ids.J1}/pipeline`)).get(ids.C1)).toBe(1);
      expect(((await api('coordinator', 'get', '/jobs').expect(200)).body as { id: string }[]).map((j) => j.id)).toEqual(expect.arrayContaining([ids.J1, ids.J2]));
      await api('coordinator', 'get', `/jobs/${ids.J1}`).expect(200);
    });

    it('negative: the coordinator gets no test or result route (403)', async () => {
      for (const path of [`/exams/${ids.exam}/results`, `/exams/${ids.exam}/results/summary`, `/exams/${ids.exam}/candidates/${ids.C1}/report`, `/attempts/${ids.C1att}/ai-insight`, '/dashboard/summary?window=all']) {
        expect([path, (await api('coordinator', 'get', path)).status]).toEqual([path, 403]);
      }
    });
  });

  // ------------------------------------------------------------------------------------------ 2006
  describe('2006: acting, step-up and reasons', () => {
    it('while acting for someone else, every assessments change is refused; reading still works', async () => {
      await api('acting', 'get', `/exams/${ids.exam}`).expect(200);
      for (const [method, path, body] of [['post', '/exams', { title: 'x' }], ['patch', `/exams/${ids.exam}`, { title: 'y' }], ['post', '/questions', {}], ['post', `/attempts/${ids.C3att}/force-submit`, { reason: 'x' }], ['post', `/exams/${ids.exam}/results/release`, {}]] as const) {
        const r = await api('acting', method, path).send(body);
        expect([path, r.status, r.body.message]).toEqual([path, 403, 'Not available while acting for someone else']);
      }
    });

    it('ending an attempt needs the second factor again and a reason, which the candidate\'s record keeps', async () => {
      expect((await api('proctor', 'post', `/attempts/${ids.C3att}/force-submit`).send({ reason: 'Phone on the desk' }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
      await markSteppedUp(tenantPrisma, token.proctor);
      await api('proctor', 'post', `/attempts/${ids.C3att}/force-submit`).send({}).expect(400);
      await api('proctor', 'post', `/attempts/${ids.C3att}/force-submit`).send({ reason: '   ' }).expect(400);
      await api('proctor', 'post', `/attempts/${ids.C3att}/force-submit`).send({ reason: 'Phone on the desk' }).expect(201);
      const ev = await inOrg(org.A.id, (tx) => tx.proctoringEvent.findFirstOrThrow({ where: { attemptId: ids.C3att, eventType: 'ended_by_staff' } }));
      expect(JSON.parse(ev.metadataJson!)).toEqual({ reason: 'Phone on the desk', byUserId: users.proctor });
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'attempt.force_submit', entityId: ids.C3att, metadataJson: { contains: 'Phone on the desk' } } }))).toBe(1);
    });

    it('releasing results, overturning a verdict and finishing marking ask for the second factor again', async () => {
      expect((await api('evaluator', 'post', `/exams/${ids.exam}/results/release`).send({})).body.code).toBe('STEP_UP_REQUIRED');
      expect((await api('evaluator', 'post', `/attempts/${ids.C1att}/finalize-manual-grade`).send({})).body.code).toBe('STEP_UP_REQUIRED');
      expect((await api('recruiter', 'post', `/attempts/${ids.C2att}/unblock`).send({})).body.code).toBe('STEP_UP_REQUIRED');
      expect((await api('recruiter', 'post', `/attempts/${ids.C2att}/proctoring-bypass`).send({ reason: 'Assisted candidate' })).body.code).toBe('STEP_UP_REQUIRED');
      await markSteppedUp(tenantPrisma, token.evaluator);
      expect((await api('evaluator', 'post', `/exams/${ids.exam}/results/release`).send({})).status).not.toBe(403);
    });
  });
});
