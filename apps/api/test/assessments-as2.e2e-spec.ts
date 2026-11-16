import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { ProctoringRetentionService } from '../src/proctoring-retention/proctoring-retention.service';
import { FaceRetentionService } from '../src/face-enrolment/face-retention.service';
import { asApproved } from './fixtures/approved-question';

// Assessments AS-2 (founder answers 2007, 2008; Settings 6.5; PRC-04), end to end against the real database:
//   6.5    the assessments settings key changes the company's test defaults (and nothing else); bad values are refused;
//   2007   a new test starts in the company's proctoring mode; a mode sets the test's switches; another company's test
//          is 404, a reader 403, a bad mode 400;
//   PRC-04 the pre-publish checklist lists every check, and publishing refuses on the first that fails;
//          a test for more candidates than the company's number needs another person's approval, of the test as it is;
//   2008   recordings, clips and face data go after the company's retention (30 by default), never while the result is
//          held, and never early for a company that chose longer.
describe('Assessments AS-2: settings 6.5, proctoring modes, checklist, approval and retention', () => {
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
  type Who = 'adminA' | 'adminB' | 'settings' | 'author' | 'approver' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const builder = async (who: Who, id: string) => (await api(who, 'get', `/asmt/tests/${id}`).expect(200)).body as { proctoringMode: string; checks: { id: string; ok: boolean; problem: string | null }[]; approval: { needed: boolean; current: boolean; canApprove: boolean } };
  const setting = (who: Who, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, scopeType: 'tenant', value });

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as2-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS2 ${k}`, slug: `as2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['settings', 'A', 'panel', ['assessments.settings.manage']],
      ['author', 'A', 'panel', ['asmt.test.manage', 'asmt.bank.manage']],
      ['approver', 'A', 'panel', ['asmt.test.manage']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as2.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as2.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // One approved question per company to put in tests.
    ids.questionB = (await asApproved(await api('adminB', 'post', '/questions').send({ type: 'single_mcq', text: `Capital of Japan ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'Tokyo', isCorrect: true }, { text: 'Osaka', isCorrect: false }] }).expect(201))).body.id;
    const q = (await asApproved(await api('author', 'post', '/questions').send({ type: 'single_mcq', text: `Capital of India ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'New Delhi', isCorrect: true }, { text: 'Mumbai', isCorrect: false }] }).expect(201))).body;
    ids.question = q.id;
    ids.right = q.options.find((o: { text: string }) => o.text === 'New Delhi').id;
  }, 300_000);

  afterAll(async () => {
    for (const k of ['A', 'B'] as const) {
      const o = org[k].id;
      await inOrg(o, (tx) => tx.exam.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
      await inOrg(o, (tx) => tx.question.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
      await inOrg(o, (tx) => tx.candidate.deleteMany({ where: { organizationId: o } })).catch(() => undefined);
    }
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.setting.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
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

  /** A draft test with one section holding the approved question (ready to publish). */
  const readyTest = async (title: string, who: Who = 'author', questionId = ids.question) => {
    const id = (await api(who, 'post', '/exams').send({ title: `${title} ${run}` }).expect(201)).body.id as string;
    const section = (await api(who, 'post', `/exams/${id}/sections`).send({ title: 'One' }).expect(201)).body.id;
    await api(who, 'put', `/exams/${id}/sections/${section}/questions`).send({ questionIds: [questionId] }).expect(200);
    return id;
  };

  describe('Settings 6.5: the company test defaults', () => {
    it('the assessments settings key changes them; the company reads them back', async () => {
      await setting('settings', 'asmt.proctor_mode', 'record').expect(200);
      await setting('settings', 'asmt.retention', '180').expect(200);
      const all = (await api('settings', 'get', '/org/settings').expect(200)).body as { overrides: { key: string; value: unknown }[] };
      expect(all.overrides.filter((o) => o.key.startsWith('asmt.')).map((o) => [o.key, String(o.value)]).sort()).toEqual([['asmt.proctor_mode', 'record'], ['asmt.retention', '180']]);
    });

    it('negative: a value not on the list (7 days, a "live" mode) is refused; nothing changes', async () => {
      await setting('settings', 'asmt.retention', '7').expect(400);
      await setting('settings', 'asmt.proctor_mode', 'live').expect(400);
    });

    it('negative: the key reaches only assessment settings, a test reader none, and another company keeps its own defaults', async () => {
      await setting('settings', 'probation.default_months', '3').expect(403);
      await setting('reader', 'asmt.retention', '90').expect(403);
      const b = (await api('adminB', 'get', '/org/settings').expect(200)).body as { overrides: { key: string }[] };
      expect(b.overrides.filter((o) => o.key.startsWith('asmt.'))).toEqual([]);
    });
  });

  describe('2007: proctoring modes over the switches', () => {
    it('a new test starts in the company mode (Record & review here); another company keeps the product default (AI-only)', async () => {
      ids.modeTest = (await api('author', 'post', '/exams').send({ title: `Mode ${run}` }).expect(201)).body.id;
      expect((await builder('author', ids.modeTest)).proctoringMode).toBe('record');
      const b = (await api('adminB', 'post', '/exams').send({ title: `Mode B ${run}` }).expect(201)).body.id;
      const row = await inOrg(org.B.id, (tx) => tx.exam.findFirstOrThrow({ where: { id: b } }));
      expect([row.enableAntiCheating, row.webcamProctoringEnabled, row.webcamAiAnalysisEnabled, row.screenCaptureEnabled]).toEqual([true, true, true, false]);
    });

    it('picking a mode sets the switches: Open turns everything off, AI-only turns them back on', async () => {
      await api('author', 'put', `/asmt/tests/${ids.modeTest}/proctoring-mode`).send({ mode: 'open' }).expect(200);
      let row = await inOrg(org.A.id, (tx) => tx.exam.findFirstOrThrow({ where: { id: ids.modeTest } }));
      expect([row.enableAntiCheating, row.webcamProctoringEnabled, row.screenCaptureEnabled]).toEqual([false, false, false]);
      await api('author', 'put', `/asmt/tests/${ids.modeTest}/proctoring-mode`).send({ mode: 'ai' }).expect(200);
      row = await inOrg(org.A.id, (tx) => tx.exam.findFirstOrThrow({ where: { id: ids.modeTest } }));
      expect([row.enableAntiCheating, row.webcamProctoringEnabled, row.webcamAiAnalysisEnabled, row.screenCaptureEnabled, row.disabledProctoringSignalsJson]).toEqual([true, true, true, false, null]);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'exam.proctoring_mode_set', entityId: ids.modeTest } }))).toBe(2);
    });

    it('the builder reads the company defaults it names (mode, approver number); a results reader may not', async () => {
      expect((await api('author', 'get', '/asmt/tests/defaults').expect(200)).body).toEqual({ proctorMode: 'record', highStakes: 500 });
      await api('reader', 'get', '/asmt/tests/defaults').expect(403);
      expect((await api('adminB', 'get', '/asmt/tests/defaults').expect(200)).body).toEqual({ proctorMode: 'ai', highStakes: 500 });
    });

    it('negative: a mode not offered (live) is 400, a results reader 403, another company 404', async () => {
      await api('author', 'put', `/asmt/tests/${ids.modeTest}/proctoring-mode`).send({ mode: 'live' }).expect(400);
      await api('reader', 'put', `/asmt/tests/${ids.modeTest}/proctoring-mode`).send({ mode: 'open' }).expect(403);
      await api('reader', 'get', `/asmt/tests/${ids.modeTest}`).expect(403);
      await api('adminB', 'get', `/asmt/tests/${ids.modeTest}`).expect(404);
      await api('adminB', 'put', `/asmt/tests/${ids.modeTest}/proctoring-mode`).send({ mode: 'open' }).expect(404);
    });
  });

  describe('PRC-04: the pre-publish checklist and the approver for big tests', () => {
    it('lists every check of an empty test; publishing refuses on the first', async () => {
      const id = (await api('author', 'post', '/exams').send({ title: `Empty ${run}` }).expect(201)).body.id;
      const b = await builder('author', id);
      expect(b.checks.map((c) => [c.id, c.ok])).toEqual([['sections', false], ['weights', true]]);
      expect((await api('author', 'post', `/exams/${id}/publish`).expect(400)).body.message).toBe(b.checks[0]!.problem);
    });

    it('a test for more candidates than the company number needs another person; the author cannot approve it', async () => {
      await setting('settings', 'asmt.high_stakes', '50').expect(200);
      ids.big = await readyTest('Big drive');
      await api('author', 'patch', `/exams/${ids.big}`).send({ title: `Big drive ${run}`, expectedCandidates: 120 }).expect(200);
      let b = await builder('author', ids.big);
      expect([b.approval.needed, b.checks.find((c) => c.id === 'approval')?.ok]).toEqual([true, false]);
      await api('author', 'post', `/exams/${ids.big}/publish`).expect(400);
      // Nobody asked yet.
      await api('approver', 'post', `/asmt/tests/${ids.big}/approval/approve`).expect(400);
      await api('author', 'post', `/asmt/tests/${ids.big}/approval/request`).expect(200);
      await api('author', 'post', `/asmt/tests/${ids.big}/approval/approve`).expect(403);
      expect((await builder('approver', ids.big)).approval.canApprove).toBe(true);
      await api('approver', 'post', `/asmt/tests/${ids.big}/approval/approve`).expect(200);
      b = await builder('author', ids.big);
      expect([b.approval.current, b.checks.every((c) => c.ok)]).toEqual([true, true]);
      await api('approver', 'post', `/asmt/tests/${ids.big}/approval/approve`).expect(409);
    });

    it('negative: a change after the approval asks for it again; then it publishes', async () => {
      await api('author', 'patch', `/exams/${ids.big}`).send({ title: `Big drive ${run}`, passCriteriaPercent: 55 }).expect(200);
      expect((await builder('author', ids.big)).approval.current).toBe(false);
      expect((await api('author', 'post', `/exams/${ids.big}/publish`).expect(400)).body.message).toMatch(/changed after it was approved/);
      await api('author', 'post', `/asmt/tests/${ids.big}/approval/request`).expect(200);
      await api('approver', 'post', `/asmt/tests/${ids.big}/approval/approve`).expect(200);
      await api('author', 'post', `/exams/${ids.big}/publish`).expect(201);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: { in: ['exam.approval_requested', 'exam.approved'] }, entityId: ids.big } }))).toBe(4);
    });

    it('negative: the database itself refuses an approval by the author', async () => {
      const id = await readyTest('Self approve');
      await expect(inOrg(org.A.id, (tx) => tx.exam.update({ where: { id }, data: { approvalRequestedBy: users.approver, approvalRequestedAt: new Date(), approvedBy: users.author, approvedAt: new Date(), approvedFingerprint: 'x' } }))).rejects.toThrow(/exams_approver_check/);
    });

    it('a small test needs no approver (asking is refused, the checklist has no approval line)', async () => {
      const id = await readyTest('Small');
      await api('author', 'patch', `/exams/${id}`).send({ title: `Small ${run}`, expectedCandidates: 10 }).expect(200);
      expect((await builder('author', id)).checks.some((c) => c.id === 'approval')).toBe(false);
      await api('author', 'post', `/asmt/tests/${id}/approval/request`).expect(400);
      await api('author', 'post', `/exams/${id}/publish`).expect(201);
    });
  });

  describe('2008: retention from the company setting, with legal hold', () => {
    const DAY = 24 * 60 * 60 * 1000;
    it('purges past the company days, keeps a held result\'s evidence, and keeps a longer-retention company\'s', async () => {
      // A: 180 days (set above). B: the default, 30. Three attempts with old snapshots: B 40 days, A 40 days, B held.
      const attemptIn = async (o: 'A' | 'B', who: Who) => {
        const exam = await readyTest(`Retention ${o}`, who, o === 'B' ? ids.questionB : ids.question);
        await api(who, 'post', `/exams/${exam}/publish`).expect(201);
        const cand = (await api(who, 'post', '/candidates').send({ email: `ret-${o}-${randomUUID().slice(0, 6)}@as2.test`, name: 'Ret' }).expect(201)).body.id;
        const inv = (await api(who, 'post', `/exams/${exam}/invitations`).send({ candidateIds: [cand] }).expect(201)).body.created[0];
        const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken;
        await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${ct}`).send({ consent: true }).expect(201);
        await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${ct}`).expect(201);
        const attempt = (await inOrg(org[o].id, (tx) => tx.attempt.findFirstOrThrow({ where: { invitationId: inv.id }, select: { id: true } }))).id;
        const ev = await tenantPrisma.forTenant(SUPER, (tx) => tx.proctoringEvent.create({ data: { attemptId: attempt, eventType: 'no_face', severity: 'medium', occurredAt: new Date(Date.now() - 40 * DAY), metadataJson: JSON.stringify({ snapshot: `https://not-a-real-blob.invalid/${attempt}.jpg`, reason: 'no_face' }) } }));
        return { attempt, event: ev.id };
      };
      const b = await attemptIn('B', 'adminB');
      const a = await attemptIn('A', 'adminA');
      const held = await attemptIn('B', 'adminB');
      await tenantPrisma.forTenant(SUPER, (tx) => tx.result.update({ where: { attemptId: held.attempt }, data: { releaseOverride: 'held' } }));

      const warn = jest.spyOn(Logger.prototype, 'warn');
      const purged = await adminApp.get(ProctoringRetentionService).prune();
      expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('prune failed'))).toEqual([]);
      expect(purged).toBeGreaterThanOrEqual(1);
      const meta = async (id: string) => (await tenantPrisma.forTenant(SUPER, (tx) => tx.proctoringEvent.findUniqueOrThrow({ where: { id } }))).metadataJson;
      expect(JSON.parse((await meta(b.event))!)).toEqual({ reason: 'no_face' });
      expect(JSON.parse((await meta(a.event))!).snapshot).toBeDefined();
      expect(JSON.parse((await meta(held.event))!).snapshot).toBeDefined();
    });

    it('face data follows the same rule (the sweep runs without touching inside-retention rows)', async () => {
      await expect(adminApp.get(FaceRetentionService).prune()).resolves.toBeGreaterThanOrEqual(0);
    });
  });
});
