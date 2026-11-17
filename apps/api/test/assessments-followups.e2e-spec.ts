import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { AiInvocationService } from '../src/ai/ai-invocation.service';
import { approveQuestion, asApproved } from './fixtures/approved-question';

// Assessments follow-ups (answers 2151, 2158, 2202, 2204, 2224), end to end against the real database (forced RLS):
//   2224 a retired question approved before is restored, approved and audited; a never-approved one is not;
//   2158 asking for approval of a big test sends a bell note to the people who may approve it (never the asker or author);
//   2204 each accommodation decision emails the candidate what was approved;
//   2202 approved breaks and the "no gaze flags" profile change that one invitation's test;
//   2151 a job description proposes skills (AI faked) and makes a draft test of pool sections; off by the setting;
//   2271 a rubric per essay and code question, written in the bank and marked criterion by criterion;
//   2273 retiring a test after a fairness finding archives it.
describe('Assessments follow-ups', () => {
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
  type Who = 'adminA' | 'adminB' | 'writer' | 'writer2' | 'banker' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const sent: { to: string; subject: string; text?: string }[] = [];
  /** 2204: the decision emails to one address (the invitation email goes there too). */
  const decisions = (to: string) => sent.filter((m) => m.to === to && /your request for help/.test(m.subject));
  const aiSkills: { name: string; weight: number }[] = [];
  const fakeAi = { run: async (_c: unknown, _o: unknown, fn: (p: unknown) => Promise<unknown>) => fn({ generateStructured: async () => ({ level: 'hard', skills: aiSkills }) }) };
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const cand = (ct: string, method: 'get' | 'post', path: string) => request(runtimeHttp)[method](`/api/v1${path}`).set('Authorization', `Bearer ${ct}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const JD = 'Senior backend developer, 4 to 6 years, Java 17, Spring Boot and SQL joins for our distributor app.';

  /** A published test with one question and a signed-in candidate invited to it (company A). */
  const candidate = async () => {
    const exam = (await api('adminA', 'post', '/exams').send({ title: `FU ${run} ${randomUUID().slice(0, 4)}` }).expect(201)).body.id as string;
    const section = (await api('adminA', 'post', `/exams/${exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
    await request(http).put(`/api/v1/exams/${exam}/sections/${section}/questions`).set('Authorization', `Bearer ${token.adminA}`).send({ questionIds: [ids.q] }).expect(200);
    await api('adminA', 'post', `/exams/${exam}/publish`).expect(201);
    const email = `c-${randomUUID().slice(0, 8)}@fu.test`;
    const c = (await api('adminA', 'post', '/candidates').send({ email, name: 'Meera Joseph' }).expect(201)).body.id;
    const inv = (await api('adminA', 'post', `/exams/${exam}/invitations`).send({ candidateIds: [c] }).expect(201)).body.created[0];
    const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken as string;
    return { exam, invitation: inv.id as string, ct, email };
  };

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) =>
      b
        .overrideProvider(EmailService)
        .useValue({ send: jest.fn(async (m: { to: string; subject: string; text?: string }) => (sent.push(m), { success: true })) })
        .overrideProvider(AiInvocationService)
        .useValue(fakeAi),
    );
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `fu-plan-${run}`, candidateLimit: 50, aiCreditLimit: 5, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `FU ${k}`, slug: `fu-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['writer', 'A', 'panel', ['asmt.test.manage']],
      ['writer2', 'A', 'panel', ['asmt.test.manage']],
      ['banker', 'A', 'panel', ['asmt.bank.manage']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@fu.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@fu.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.q = (await asApproved(await api('adminA', 'post', '/questions').send({ type: 'single_mcq', text: `Capital ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201))).body.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.question.deleteMany({ where: { organizationId: o } });
          await tx.tag.deleteMany({ where: { organizationId: o } });
          await tx.candidate.deleteMany({ where: { organizationId: o } });
          await tx.setting.deleteMany({ where: { organizationId: o } });
          await tx.userNotification.deleteMany({ where: { organizationId: o } });
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

  describe('2224: Restore in the question bank', () => {
    it('a retired question approved before comes back approved and audited', async () => {
      await api('adminA', 'post', `/questions/${ids.q}/archive`).expect(201);
      expect((await api('banker', 'get', '/question-bank/questions?status=retired').expect(200)).body.find((r: { id: string }) => r.id === ids.q)).toMatchObject({ status: 'retired', wasApproved: true });
      expect((await api('banker', 'post', `/question-bank/questions/${ids.q}/restore`).expect(200)).body).toEqual({ status: 'approved' });
      expect((await inOrg(org.A.id, (tx) => tx.question.findUniqueOrThrow({ where: { id: ids.q } }))).status).toBe('active');
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'question.restored', entityId: ids.q } }))).toBe(1);
    });

    it('negative: not retired, never approved, another company and no bank key are refused', async () => {
      await api('banker', 'post', `/question-bank/questions/${ids.q}/restore`).expect(409);
      const draft = (await api('adminA', 'post', '/questions').send({ type: 'single_mcq', text: `Draft ${run}?`, difficulty: 'easy', marks: 1, options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] }).expect(201)).body.id;
      await api('adminA', 'post', `/questions/${draft}/archive`).expect(201);
      expect((await api('banker', 'post', `/question-bank/questions/${draft}/restore`).expect(409)).body.message).toMatch(/never approved/);
      expect((await inOrg(org.A.id, (tx) => tx.question.findUniqueOrThrow({ where: { id: draft } }))).status).toBe('archived');
      await api('adminB', 'post', `/question-bank/questions/${ids.q}/restore`).expect(404);
      await api('reader', 'post', `/question-bank/questions/${ids.q}/restore`).expect(403);
    });
  });

  describe('2158: a bell note when approval is asked', () => {
    it('the people who may approve get one; the asker, the author, a reader and another company do not', async () => {
      const exam = (await api('writer', 'post', '/exams').send({ title: `Big ${run}` }).expect(201)).body.id as string;
      await api('writer', 'patch', `/exams/${exam}`).send({ title: `Big ${run}`, expectedCandidates: 900 }).expect(200);
      await api('writer2', 'post', `/asmt/tests/${exam}/approval/request`).expect(200);
      const notes = await inOrg(org.A.id, (tx) => tx.userNotification.findMany({ where: { type: 'asmt.test.approval_requested', entityId: exam } }));
      const to = notes.map((n) => n.recipientUserId);
      expect(to).toContain(users.adminA);
      expect(to).not.toContain(users.writer2);
      expect(to).not.toContain(users.writer);
      expect(to).not.toContain(users.reader);
      expect(notes[0]).toMatchObject({ linkPath: `/yx/hiring/assessments/tests/${exam}`, contextText: expect.stringContaining(`Big ${run}`) });
      expect(await inOrg(org.B.id, (tx) => tx.userNotification.count({ where: { entityId: exam } }))).toBe(0);
      // Negative: a small test needs no approver, so nobody is told.
      const small = (await api('writer', 'post', '/exams').send({ title: `Small ${run}` }).expect(201)).body.id as string;
      await api('writer', 'patch', `/exams/${small}`).send({ title: `Small ${run}`, expectedCandidates: 10 }).expect(200);
      await api('writer2', 'post', `/asmt/tests/${small}/approval/request`).expect(400);
      expect(await inOrg(org.A.id, (tx) => tx.userNotification.count({ where: { entityId: small } }))).toBe(0);
    });
  });

  describe('2202 and 2204: accommodations change the invitation and are emailed', () => {
    it('approving breaks and the no-gaze profile changes that invitation only; the candidate is emailed what was approved', async () => {
      const c = await candidate();
      await inOrg(org.A.id, (tx) => tx.exam.update({ where: { id: c.exam }, data: { breaksAllowed: 1, breakMinutes: 10 } }));
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['breaks', 'profile'], note: 'Nystagmus: my eyes move on their own.' }).expect(201);
      const req = await inOrg(org.A.id, (tx) => tx.accommodationRequest.findFirstOrThrow({ where: { invitationId: c.invitation } }));
      // Negative: breaks without how many and how long, or values outside the choices, are refused.
      await api('writer', 'post', `/asmt/accommodations/${req.id}/decide`).send({ approvedKinds: ['breaks'] }).expect(400);
      await api('writer', 'post', `/asmt/accommodations/${req.id}/decide`).send({ approvedKinds: ['breaks'], extraBreaks: 9, breakMinutes: 20 }).expect(400);
      await api('writer', 'post', `/asmt/accommodations/${req.id}/decide`).send({ approvedKinds: ['breaks'], extraBreaks: 2, breakMinutes: 7 }).expect(400);
      expect(decisions(c.email)).toHaveLength(0);
      await api('writer', 'post', `/asmt/accommodations/${req.id}/decide`).send({ approvedKinds: ['breaks', 'profile'], extraBreaks: 2, breakMinutes: 20, message: 'Both approved.' }).expect(200);
      expect(await inOrg(org.A.id, (tx) => tx.invitation.findUniqueOrThrow({ where: { id: c.invitation } }))).toMatchObject({ extraBreaks: 2, breakMinutes: 20, proctoringProfile: 'no_gaze' });
      // 2204: one email to the candidate with what was approved and the message.
      const mail = decisions(c.email);
      expect(mail).toHaveLength(1);
      expect(mail[0]!.text).toMatch(/approved the help you asked for with FU .*: 2 extra breaks of up to 20 minutes; proctoring that does not watch where you look/);
      expect(mail[0]!.text).toMatch(/Their message: Both approved\./);
      // 2202: the runner gives 1 + 2 breaks of 20 minutes and does not watch gaze for this candidate.
      await cand(c.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      const cur = (await cand(c.ct, 'get', '/attempt/current').expect(200)).body;
      expect(cur.runner).toMatchObject({ breaksAllowed: 3, breakMinutes: 20 });
      expect(cur.exam.proctoring.disabledSignals).toEqual(expect.arrayContaining(['looking_down', 'webcam_head_turned']));
      // Another candidate of the same test keeps the test's own settings.
      const other = (await api('adminA', 'post', '/candidates').send({ email: `o-${randomUUID().slice(0, 8)}@fu.test`, name: 'Ravi' }).expect(201)).body.id;
      const inv = (await api('adminA', 'post', `/exams/${c.exam}/invitations`).send({ candidateIds: [other] }).expect(201)).body.created[0];
      const ct2 = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken as string;
      await cand(ct2, 'post', '/attempt/start').send({ consent: true }).expect(201);
      const cur2 = (await cand(ct2, 'get', '/attempt/current').expect(200)).body;
      expect(cur2.runner).toMatchObject({ breaksAllowed: 1, breakMinutes: 10 });
      expect(cur2.exam.proctoring.disabledSignals).not.toContain('webcam_head_turned');
    });

    it('a declined request is emailed too; negative: breaks cannot change once the test has started', async () => {
      const c = await candidate();
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['breaks'] }).expect(201);
      await cand(c.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      const req = await inOrg(org.A.id, (tx) => tx.accommodationRequest.findFirstOrThrow({ where: { invitationId: c.invitation } }));
      await api('writer', 'post', `/asmt/accommodations/${req.id}/decide`).send({ approvedKinds: ['breaks'], extraBreaks: 1, breakMinutes: 10 }).expect(409);
      await api('writer', 'post', `/asmt/accommodations/${req.id}/decide`).send({ approvedKinds: [], message: 'The test has already started.' }).expect(200);
      expect(decisions(c.email).map((m) => m.text)).toEqual([expect.stringMatching(/could not approve the help you asked for/)]);
    });
  });

  describe('2151: build a test from a job description', () => {
    it('proposes skills matched to ours (unknown ones unmapped) and makes a draft of pool sections', async () => {
      const [java, sql] = await inOrg(org.A.id, async (tx) => [await tx.tag.create({ data: { organizationId: org.A.id, name: 'Java streams' } }), await tx.tag.create({ data: { organizationId: org.A.id, name: 'SQL joins' } })]);
      ids.java = java.id;
      ids.sql = sql.id;
      aiSkills.splice(0, aiSkills.length, { name: 'java Streams', weight: 50 }, { name: 'SQL joins', weight: 30 }, { name: 'Spring', weight: 20 });
      const plan = (await api('writer', 'post', '/asmt/tests/from-job-description/propose').send({ jobDescription: JD }).expect(200)).body;
      expect(plan).toEqual({ level: 'hard', skills: [{ name: 'java Streams', tagId: java.id, percent: 50 }, { name: 'SQL joins', tagId: sql.id, percent: 30 }, { name: 'Spring', tagId: null, percent: 20 }] });
      const made = (await api('writer', 'post', '/asmt/tests/from-job-description').send({ title: `Backend L3 ${run}`, level: 'hard', total: 20, skills: [{ tagId: java.id, percent: 60 }, { tagId: sql.id, percent: 40 }] }).expect(201)).body;
      const exam = await inOrg(org.A.id, (tx) => tx.exam.findUniqueOrThrow({ where: { id: made.id }, include: { sections: { orderBy: { orderIndex: 'asc' }, include: { poolTags: true } } } }));
      expect(exam.status).toBe('draft');
      expect(exam.sections.map((s) => [s.title, s.selectionMode, s.poolSize, s.poolDifficulty, s.weightPercent, s.poolTags.map((t) => t.tagId)])).toEqual([
        ['Java streams', 'pool', 12, 'hard', 60, [java.id]],
        ['SQL joins', 'pool', 8, 'hard', 40, [sql.id]],
      ]);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'exam.created_from_job_description', entityId: made.id } }))).toBe(1);
    });

    it("negative: a short text, another company's skill, a skill twice, no tests key, and the setting off are refused", async () => {
      await api('writer', 'post', '/asmt/tests/from-job-description/propose').send({ jobDescription: 'Java dev' }).expect(400);
      const theirs = await inOrg(org.B.id, (tx) => tx.tag.create({ data: { organizationId: org.B.id, name: 'Java streams' } }));
      await api('writer', 'post', '/asmt/tests/from-job-description').send({ title: 'X', level: 'easy', total: 10, skills: [{ tagId: theirs.id, percent: 100 }] }).expect(400);
      await api('writer', 'post', '/asmt/tests/from-job-description').send({ title: 'X', level: 'easy', total: 10, skills: [{ tagId: ids.java, percent: 50 }, { tagId: ids.java, percent: 50 }] }).expect(400);
      await api('reader', 'post', '/asmt/tests/from-job-description/propose').send({ jobDescription: JD }).expect(403);
      await inOrg(org.A.id, (tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'asmt.ai_generation', value: 'off' } }));
      expect((await api('writer', 'post', '/asmt/tests/from-job-description/propose').send({ jobDescription: JD }).expect(403)).body.message).toMatch(/switched off/);
      await api('writer', 'post', '/asmt/tests/from-job-description').send({ title: 'X', level: 'easy', total: 10, skills: [{ tagId: ids.java, percent: 100 }] }).expect(403);
      expect((await api('writer', 'get', '/asmt/tests/defaults').expect(200)).body.aiDrafts).toBe(false);
    });
  });

  describe('2271: rubrics', () => {
    it('the bank keeps a rubric that adds up; negative: one that does not, or on a choice question, is refused', async () => {
      const base = { type: 'essay', text: `Reduce deviations ${run}?`, difficulty: 'easy', marks: 10, options: [] };
      await api('banker', 'post', '/question-bank/questions').send({ ...base, rubric: [{ criterion: 'Finds the cause', marks: 4 }] }).expect(400);
      await api('banker', 'post', '/question-bank/questions').send({ ...base, rubric: [{ criterion: 'Cause', marks: 5 }, { criterion: 'cause', marks: 5 }] }).expect(400);
      await api('banker', 'post', '/question-bank/questions').send({ type: 'single_mcq', text: 'Pick', difficulty: 'easy', marks: 2, options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }], rubric: [{ criterion: 'X', marks: 2 }] }).expect(400);
      ids.essay = (await api('banker', 'post', '/question-bank/questions').send({ ...base, rubric: [{ criterion: 'Finds the cause', marks: 4 }, { criterion: 'Names the owner', marks: 6 }] }).expect(201)).body.id;
      expect((await api('banker', 'get', `/question-bank/questions/${ids.essay}`).expect(200)).body.content.rubric).toEqual([{ criterion: 'Finds the cause', marks: 4 }, { criterion: 'Names the owner', marks: 6 }]);
      await approveQuestion(ids.essay);
    });

    it('PRC-19 marks it criterion by criterion; negative: a criterion missing, above its own marks or not adding up', async () => {
      const exam = (await api('adminA', 'post', '/exams').send({ title: `Rubric ${run}` }).expect(201)).body.id as string;
      const section = (await api('adminA', 'post', `/exams/${exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
      await request(http).put(`/api/v1/exams/${exam}/sections/${section}/questions`).set('Authorization', `Bearer ${token.adminA}`).send({ questionIds: [ids.essay] }).expect(200);
      await api('adminA', 'post', `/exams/${exam}/publish`).expect(201);
      const c = (await api('adminA', 'post', '/candidates').send({ email: `r-${randomUUID().slice(0, 8)}@fu.test`, name: 'Asha' }).expect(201)).body.id;
      const inv = (await api('adminA', 'post', `/exams/${exam}/invitations`).send({ candidateIds: [c] }).expect(201)).body.created[0];
      const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken as string;
      const attemptId = (await cand(ct, 'post', '/attempt/start').send({ consent: true }).expect(201)).body.id as string;
      await cand(ct, 'post', '/attempt/answer').send({ questionId: ids.essay, selectedOptionIds: [], answerText: 'Group deviations by station; the line lead owns each fix.' }).expect(201);
      await cand(ct, 'post', '/attempt/submit').send({}).expect(201);
      const at = `/asmt/marking/${attemptId}/${ids.essay}`;
      expect((await api('adminA', 'get', at).expect(200)).body.question.rubric).toEqual([{ criterion: 'Finds the cause', marks: 4 }, { criterion: 'Names the owner', marks: 6 }]);
      await api('adminA', 'post', `${at}/mark`).send({ marks: 7 }).expect(400);
      await api('adminA', 'post', `${at}/mark`).send({ marks: 7, criteria: [5, 2] }).expect(400);
      await api('adminA', 'post', `${at}/mark`).send({ marks: 9, criteria: [3, 4] }).expect(400);
      expect((await api('adminA', 'post', `${at}/mark`).send({ marks: 7, criteria: [3, 4] }).expect(200)).body).toMatchObject({ final: 7, status: 'final' });
      const mark = await inOrg(org.A.id, (tx) => tx.answerMark.findFirstOrThrow({ where: { attemptId, questionId: ids.essay } }));
      expect(mark.criteria).toEqual([3, 4]);
      expect((await api('adminA', 'get', at).expect(200)).body.mine).toMatchObject({ marks: 7, criteria: [3, 4] });
    });
  });

  describe('2273: retiring after a fairness finding archives the test', () => {
    it('keep leaves the test as it is; retire archives it (audited); another company cannot decide', async () => {
      const keep = (await api('writer', 'post', '/exams').send({ title: `Keep ${run}` }).expect(201)).body.id as string;
      const gone = (await api('writer', 'post', '/exams').send({ title: `Retire ${run}` }).expect(201)).body.id as string;
      const open = (examId: string) => inOrg(org.A.id, (tx) => tx.asmtFairnessReview.create({ data: { organizationId: org.A.id, examId, finding: 'Pass rate for women is 40 % of the highest group', openedBy: users.writer } }));
      const k = await open(keep);
      const r = await open(gone);
      await api('adminB', 'post', `/asmt/fairness/reviews/${r.id}/decide`).send({ decision: 'retire', reason: 'Two items favour one group' }).expect(404);
      await api('writer', 'post', `/asmt/fairness/reviews/${k.id}/decide`).send({ decision: 'keep', reason: 'The groups differ in experience' }).expect(200);
      await api('writer', 'post', `/asmt/fairness/reviews/${r.id}/decide`).send({ decision: 'retire', reason: 'Two items favour one group' }).expect(200);
      const status = async (id: string) => (await inOrg(org.A.id, (tx) => tx.exam.findUniqueOrThrow({ where: { id } }))).status;
      expect(await status(keep)).toBe('draft');
      expect(await status(gone)).toBe('archived');
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'exam.archived', entityId: gone } }))).toBe(1);
    });
  });
});
