import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { AiInvocationService } from '../src/ai/ai-invocation.service';
import { sealDob } from '../src/talent-crm/minor';
import { asApproved } from './fixtures/approved-question';
import { markSteppedUp } from './fixtures/step-up';

// Assessments AS-6 (answers 2019, 2154, 2165, 2237), end to end against the real database (forced RLS, the app role):
//   2154   a section below its cut-off fails the attempt even when the total passes;
//   PRC-19 blind marking, the AI suggestion only after my own mark and never for an under-18, two markers with a
//          moderator when their marks are far apart, the final mark reaches the answer and the attempt can be finished;
//   2019   fairness counts from voluntary answers only, small groups hidden, a finding opens one review, decided once;
//   2165   the survey summary, hidden below 5 answers;
//   2237   the candidate's test carries the company's applicant privacy notice.
describe('Assessments AS-6: marking and fairness', () => {
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
  type Who = 'adminA' | 'adminB' | 'm1' | 'm2' | 'm3' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const aiCalls: unknown[] = [];
  const fakeAi = {
    run: async (_c: unknown, o: unknown, fn: (p: unknown) => Promise<unknown>) => {
      aiCalls.push(o);
      return fn({ generateStructured: async () => ({ marks: 6, reason: 'Names the method and the owner.' }) });
    },
  };
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const cand = (ct: string, method: 'get' | 'post', path: string) => request(runtimeHttp)[method](`/api/v1${path}`).set('Authorization', `Bearer ${ct}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const setting = (key: string, value: string) => inOrg(org.A.id, (tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } }));

  /** A published test in company A with one section per question list; returns the test and its section ids. */
  const test = async (sections: string[][], extra: Record<string, unknown> = {}) => {
    const exam = (await api('adminA', 'post', '/exams').send({ title: `AS6 ${run} ${randomUUID().slice(0, 4)}`, ...extra }).expect(201)).body.id as string;
    const sectionIds: string[] = [];
    for (const [i, qs] of sections.entries()) {
      const s = (await api('adminA', 'post', `/exams/${exam}/sections`).send({ title: `Part ${i + 1}` }).expect(201)).body.id as string;
      await request(http).put(`/api/v1/exams/${exam}/sections/${s}/questions`).set('Authorization', `Bearer ${token.adminA}`).send({ questionIds: qs }).expect(200);
      sectionIds.push(s);
    }
    return { exam, sectionIds };
  };
  /** Invites n new candidates to a published test and redeems each link: their candidate ids and tokens. */
  const invite = async (exam: string, n: number) => {
    const cids: string[] = [];
    for (let i = 0; i < n; i++) cids.push((await api('adminA', 'post', '/candidates').send({ email: `c-${randomUUID().slice(0, 8)}@as6.test`, name: `Asha ${i}` }).expect(201)).body.id);
    const created = (await api('adminA', 'post', `/exams/${exam}/invitations`).send({ candidateIds: cids }).expect(201)).body.created as { token: string; candidateId: string }[];
    const out: { candidateId: string; ct: string }[] = [];
    for (const c of created) out.push({ candidateId: c.candidateId, ct: (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: c.token }).expect(200)).body.accessToken });
    return out;
  };
  const attemptOf = (exam: string, candidateId: string) => inOrg(org.A.id, async (tx) => (await tx.attempt.findFirstOrThrow({ where: { examId: exam, candidateId }, select: { id: true } })).id);

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).overrideProvider(AiInvocationService).useValue(fakeAi));
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as6-plan-${run}`, candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS6 ${k}`, slug: `as6-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['m1', 'A', 'panel', ['asmt.evaluate']],
      ['m2', 'A', 'panel', ['asmt.evaluate']],
      ['m3', 'A', 'panel', ['asmt.evaluate']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as6.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as6.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const mcq = async (text: string) => {
      const q = (await asApproved(await api('adminA', 'post', '/questions').send({ type: 'single_mcq', text, difficulty: 'easy', marks: 10, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201))).body;
      return { id: q.id as string, right: q.options.find((o: { text: string }) => o.text === 'Yes').id as string, wrong: q.options.find((o: { text: string }) => o.text === 'No').id as string };
    };
    const q1 = await mcq(`Capital one ${run}?`);
    const q2 = await mcq(`Capital two ${run}?`);
    Object.assign(ids, { q1: q1.id, q1right: q1.right, q2: q2.id, q2wrong: q2.wrong });
    ids.essay = (await asApproved(await api('adminA', 'post', '/questions').send({ type: 'essay', text: `How would you cut deviations ${run}?`, difficulty: 'easy', marks: 10, options: [], modelAnswer: 'Find the cause, then fix it.' }).expect(201))).body.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.asmtFairnessReview.deleteMany({ where: { organizationId: o } });
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.question.deleteMany({ where: { organizationId: o } });
          await tx.candidate.deleteMany({ where: { organizationId: o } });
          await tx.consentNotice.deleteMany({ where: { organizationId: o } });
          await tx.setting.deleteMany({ where: { organizationId: o } });
        }
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

  describe('2154: section cut-offs', () => {
    it('negative: a cut-off outside 1 to 100 is refused; another company cannot set one', async () => {
      const t = await test([[ids.q1], [ids.q2]], { passCriteriaPercent: 50 });
      Object.assign(ids, { cutExam: t.exam, cutS2: t.sectionIds[1]! });
      for (const bad of [0, 101, 2.5]) await api('adminA', 'patch', `/exams/${t.exam}/sections/${ids.cutS2}`).send({ cutoffPercent: bad }).expect(400);
      await api('adminB', 'patch', `/exams/${t.exam}/sections/${ids.cutS2}`).send({ cutoffPercent: 60 }).expect(404);
      await api('adminA', 'patch', `/exams/${t.exam}/sections/${ids.cutS2}`).send({ cutoffPercent: 60 }).expect(200);
      expect((await inOrg(org.A.id, (tx) => tx.examSection.findUniqueOrThrow({ where: { id: ids.cutS2 } }))).cutoffPercent).toBe(60);
    });

    it('the total passes (the second section weighs 0 by default), but that section at 0 % misses its 60 % cut-off: fail', async () => {
      await api('adminA', 'post', `/exams/${ids.cutExam}/publish`).expect(201);
      const [c] = await invite(ids.cutExam, 1);
      await cand(c!.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      await cand(c!.ct, 'post', '/attempt/answer').send({ questionId: ids.q1, selectedOptionIds: [ids.q1right] }).expect(201);
      await cand(c!.ct, 'post', '/attempt/answer').send({ questionId: ids.q2, selectedOptionIds: [ids.q2wrong] }).expect(201);
      await cand(c!.ct, 'post', '/attempt/submit').send({}).expect(201);
      const attemptId = await attemptOf(ids.cutExam, c!.candidateId);
      const r = await inOrg(org.A.id, (tx) => tx.result.findUniqueOrThrow({ where: { attemptId } }));
      expect(Number(r.percentage)).toBe(100);
      expect(r.passFail).toBe('fail');
      expect(r.cutoffMissed).toEqual([ids.cutS2]);
    });
  });

  describe('PRC-19: marking', () => {
    it('setup: two markers, a 25 % gap; an adult and an under-18 answer the essay', async () => {
      await setting('asmt.second_marker', 'on');
      const t = await test([[ids.essay]]);
      ids.markExam = t.exam;
      await api('adminA', 'post', `/exams/${t.exam}/publish`).expect(201);
      const [adult, kid] = await invite(t.exam, 2);
      for (const c of [adult!, kid!]) {
        await cand(c.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
        await cand(c.ct, 'post', '/attempt/answer').send({ questionId: ids.essay, selectedOptionIds: [], answerText: 'Group deviations by station, then 5 Whys; the line lead owns each fix.' }).expect(201);
        await cand(c.ct, 'post', '/attempt/submit').send({}).expect(201);
      }
      ids.adult = await attemptOf(t.exam, adult!.candidateId);
      ids.kid = await attemptOf(t.exam, kid!.candidateId);
      const twelve = `${new Date().getUTCFullYear() - 12}-01-15`;
      await inOrg(org.A.id, (tx) => tx.candidate.update({ where: { id: kid!.candidateId }, data: { dobSealed: sealDob(org.A.id, kid!.candidateId, twelve) } }));
      expect((await inOrg(org.A.id, (tx) => tx.attempt.findUniqueOrThrow({ where: { id: ids.adult } }))).status).toBe('pending_manual_grade');
    });

    it('the queue is blind; a results reader is refused; another company sees nothing of it', async () => {
      const q = (await api('m1', 'get', `/asmt/marking?examId=${ids.markExam}`).expect(200)).body as { attemptId: string; candidate: string; round: number }[];
      const row = q.find((r) => r.attemptId === ids.adult)!;
      expect(row).toMatchObject({ round: 1, candidate: `Candidate ${ids.adult!.slice(0, 4).toUpperCase()}` });
      expect(JSON.stringify(q)).not.toContain('Asha');
      await api('reader', 'get', '/asmt/marking').expect(403);
      expect((await api('adminB', 'get', '/asmt/marking').expect(200)).body).toEqual([]);
      await api('adminB', 'get', `/asmt/marking/${ids.adult}/${ids.essay}`).expect(404);
      await api('adminB', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 5 }).expect(404);
    });

    it('negative: no suggestion before my own mark; a mark above the question marks or negative is refused', async () => {
      await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/suggestion`).expect(400);
      await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 11 }).expect(400);
      await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: -1 }).expect(400);
      expect(aiCalls).toHaveLength(0);
    });

    it('first mark, then the suggestion (asked once, kept); the same marker cannot mark twice', async () => {
      expect((await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 2, feedback: 'Thin' }).expect(200)).body).toEqual({ round: 1, final: null, status: 'needs_second' });
      await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 3 }).expect(409);
      expect((await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/suggestion`).expect(200)).body).toEqual({ marks: 6, reason: 'Names the method and the owner.' });
      await api('m1', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/suggestion`).expect(200);
      expect(aiCalls).toHaveLength(1);
      const v = (await api('m1', 'get', `/asmt/marking/${ids.adult}/${ids.essay}`).expect(200)).body;
      expect(v).toMatchObject({ blind: true, mine: { marks: 2, round: 1 }, suggestion: { marks: 6 }, state: 'needs_second', attemptReady: false });
      // The second marker has not marked: no suggestion for them yet, and they never see the first mark.
      const v2 = (await api('m2', 'get', `/asmt/marking/${ids.adult}/${ids.essay}`).expect(200)).body;
      expect(v2).toMatchObject({ mine: null, suggestion: null, toModerate: null });
      expect((await api('m1', 'get', `/asmt/marking?examId=${ids.markExam}`).expect(200)).body.find((r: { attemptId: string }) => r.attemptId === ids.adult)).toBeUndefined();
    });

    it('marks 2 and 8 are far apart: a third person moderates, sees both, and their mark is final', async () => {
      expect((await api('m2', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 8 }).expect(200)).body).toMatchObject({ round: 2, status: 'needs_moderation' });
      expect((await api('m1', 'get', `/asmt/marking/${ids.adult}/${ids.essay}`).expect(200)).body.toModerate).toBeNull();
      const v = (await api('m3', 'get', `/asmt/marking/${ids.adult}/${ids.essay}`).expect(200)).body;
      expect(v.toModerate).toEqual({ a: 2, b: 8 });
      expect((await api('m3', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 5 }).expect(200)).body).toMatchObject({ round: 3, final: 5, status: 'final' });
      const ans = await inOrg(org.A.id, (tx) => tx.answer.findFirstOrThrow({ where: { attemptId: ids.adult, questionId: ids.essay } }));
      expect(Number(ans.marksAwarded)).toBe(5);
      await api('adminA', 'post', `/asmt/marking/${ids.adult}/${ids.essay}/mark`).send({ marks: 5 }).expect(409);
      expect((await api('m3', 'get', `/asmt/marking/${ids.adult}/${ids.essay}`).expect(200)).body.attemptReady).toBe(true);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'answer.marked', entityId: ids.adult } }))).toBe(3);
    });

    it('finishing the marking asks for the second factor, then settles the result', async () => {
      expect((await api('m3', 'post', `/attempts/${ids.adult}/finalize-manual-grade`).send({})).body.code).toBe('STEP_UP_REQUIRED');
      await markSteppedUp(tenantPrisma, token.m3);
      expect((await api('m3', 'post', `/attempts/${ids.adult}/finalize-manual-grade`).send({})).status).toBeLessThan(300);
      const r = await inOrg(org.A.id, (tx) => tx.result.findUniqueOrThrow({ where: { attemptId: ids.adult } }));
      expect(Number(r.percentage)).toBe(50);
    });

    it('an under-18 test-taker is marked by people only: no AI suggestion, even after a mark', async () => {
      await api('m1', 'post', `/asmt/marking/${ids.kid}/${ids.essay}/mark`).send({ marks: 7 }).expect(200);
      const r = await api('m1', 'post', `/asmt/marking/${ids.kid}/${ids.essay}/suggestion`).expect(400);
      expect(r.body.message).toMatch(/Under-18/);
      expect((await api('m1', 'get', `/asmt/marking/${ids.kid}/${ids.essay}`).expect(200)).body).toMatchObject({ minor: true, suggestion: null });
      expect(aiCalls).toHaveLength(1);
    });
  });

  describe('2019 and 2165: fairness and the survey', () => {
    it('setup: a group shows from 5; 5 men all pass, 5 women 2 pass, 1 another way, 1 prefers not to say', async () => {
      await setting('asmt.fairness_min_group', '5');
      const t = await test([[ids.q1]], { passCriteriaPercent: 50 });
      ids.fairExam = t.exam;
      await api('adminA', 'post', `/exams/${t.exam}/publish`).expect(201);
      const plan: ['man' | 'woman' | 'another' | 'not_say', boolean][] = [
        ...Array.from({ length: 5 }, () => ['man', true] as ['man', boolean]),
        ...[true, true, false, false, false].map((p) => ['woman', p] as ['woman', boolean]),
        ['another', true],
        ['not_say', false],
      ];
      const people = await invite(t.exam, plan.length);
      for (const [i, [gender, pass]] of plan.entries()) {
        const ct = people[i]!.ct;
        await cand(ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
        await cand(ct, 'post', '/attempt/answer').send({ questionId: ids.q1, selectedOptionIds: [pass ? ids.q1right : (await inOrg(org.A.id, (tx) => tx.questionOption.findFirstOrThrow({ where: { questionId: ids.q1, isCorrect: false } }))).id] }).expect(201);
        await cand(ct, 'post', '/attempt/submit').send({}).expect(201);
        await cand(ct, 'post', '/attempt/survey').send({ rating: i % 2 ? 4 : 5, clearInstructions: i !== 0, gender }).expect(201);
      }
      // Negative: an answer that is not one of the choices is refused.
      const [extra] = await invite(t.exam, 1);
      await cand(extra!.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      await cand(extra!.ct, 'post', '/attempt/submit').send({}).expect(201);
      await cand(extra!.ct, 'post', '/attempt/survey').send({ rating: 3, gender: 'female' }).expect(400);
    });

    it('pass rates per group from counts only; a small group is hidden; women at 40 % of men is a finding', async () => {
      const v = (await api('reader', 'get', `/asmt/fairness/${ids.fairExam}`).expect(200)).body;
      expect(v.minGroup).toBe(5);
      expect(v.described).toBe(11);
      expect(v.rows).toEqual([
        expect.objectContaining({ group: 'Men', attempts: 5, rate: 1, status: 'ok' }),
        expect.objectContaining({ group: 'Women', attempts: 5, rate: 0.4, status: 'flagged' }),
        expect.objectContaining({ group: 'Another way', attempts: null, rate: null, status: 'hidden' }),
      ]);
      expect(v.finding).toEqual({ group: 'Women', ratio: 0.4 });
      expect(JSON.stringify(v)).not.toMatch(/Asha|candidateId|attemptId/);
      // 2165: 12 answers; the first said the instructions were not clear.
      expect(v.survey).toEqual({ responses: 12, averageRating: 4.5, clearPercent: 92 });
    });

    it('a small survey is hidden; another company sees nothing', async () => {
      expect((await api('adminA', 'get', `/asmt/fairness/${ids.cutExam}`).expect(200)).body.survey).toBeNull();
      await api('adminB', 'get', `/asmt/fairness/${ids.fairExam}`).expect(404);
      await api('adminB', 'post', `/asmt/fairness/${ids.fairExam}/review`).expect(404);
    });

    it('a finding opens one review; a reader cannot; no finding, no review; decided once with a reason', async () => {
      await api('reader', 'post', `/asmt/fairness/${ids.fairExam}/review`).expect(403);
      await api('adminA', 'post', `/asmt/fairness/${ids.cutExam}/review`).expect(400);
      const id = (await api('adminA', 'post', `/asmt/fairness/${ids.fairExam}/review`).expect(201)).body.id as string;
      await api('adminA', 'post', `/asmt/fairness/${ids.fairExam}/review`).expect(409);
      await api('adminA', 'post', `/asmt/fairness/reviews/${id}/decide`).send({ decision: 'revise', reason: 'short' }).expect(400);
      await api('adminA', 'post', `/asmt/fairness/reviews/${id}/decide`).send({ decision: 'drop', reason: 'Two items favour one group' }).expect(400);
      await api('reader', 'post', `/asmt/fairness/reviews/${id}/decide`).send({ decision: 'revise', reason: 'Two items favour one group' }).expect(403);
      await api('adminB', 'post', `/asmt/fairness/reviews/${id}/decide`).send({ decision: 'revise', reason: 'Two items favour one group' }).expect(404);
      await api('adminA', 'post', `/asmt/fairness/reviews/${id}/decide`).send({ decision: 'revise', reason: 'Two items favour one group' }).expect(200);
      await api('adminA', 'post', `/asmt/fairness/reviews/${id}/decide`).send({ decision: 'keep', reason: 'Changed my mind on this' }).expect(404);
      const v = (await api('adminA', 'get', `/asmt/fairness/${ids.fairExam}`).expect(200)).body;
      expect(v.review).toMatchObject({ id, decision: 'revise', reason: 'Two items favour one group', finding: expect.stringContaining('women') });
    });
  });

  describe('2237: the privacy notice on the candidate pages', () => {
    it('the test carries the company latest applicant notice, and nothing when there is none', async () => {
      const t = await test([[ids.q1]]);
      await api('adminA', 'post', `/exams/${t.exam}/publish`).expect(201);
      const [c] = await invite(t.exam, 1);
      expect((await cand(c!.ct, 'get', '/attempt/current').expect(200)).body.privacyNotice).toBeNull();
      await inOrg(org.A.id, async (tx) => {
        await tx.consentNotice.create({ data: { organizationId: org.A.id, purpose: 'application', version: 1, text: 'Old notice.' } });
        await tx.consentNotice.create({ data: { organizationId: org.A.id, purpose: 'application', version: 2, text: 'We keep your test for 90 days.' } });
        await tx.consentNotice.create({ data: { organizationId: org.A.id, purpose: 'talent_pool', version: 9, text: 'Keep me for other roles.' } });
      });
      await inOrg(org.B.id, (tx) => tx.consentNotice.create({ data: { organizationId: org.B.id, purpose: 'application', version: 5, text: 'Company B notice.' } }));
      expect((await cand(c!.ct, 'get', '/attempt/current').expect(200)).body.privacyNotice).toBe('We keep your test for 90 days.');
    });
  });
});
