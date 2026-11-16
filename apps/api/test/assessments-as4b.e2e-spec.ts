import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

// Assessments AS-4b (answer 2011), end to end against the real database (forced RLS, the app role):
//   PRC-23 a candidate asks for help before the test, with evidence checked by its first bytes; one open request;
//   PRC-11 the test writer decides each item; approved extra time becomes the invitation's; the evidence is opened
//          through an audited link; another company, a results reader and an evaluator see nothing of it;
//   PRC-10 time lost above the company cap waits for a person; approving gives it back to a running test, with a
//          reason; an ended test cannot get it.
describe('Assessments AS-4b: accommodations and connectivity credit', () => {
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
  type Who = 'adminA' | 'adminB' | 'writer' | 'proctor' | 'evaluator' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const cand = (ct: string, method: 'get' | 'post', path: string) => request(runtimeHttp)[method](`/api/v1${path}`).set('Authorization', `Bearer ${ct}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 doctor letter').toString('base64')}`;
  const FAKE_PDF = `data:application/pdf;base64,${Buffer.from('<html><script>alert(1)</script>').toString('base64')}`;

  /** A published test with one question and a signed-in candidate invited to it (in company A unless said). */
  const candidate = async (o: 'A' | 'B' = 'A', who: Who = 'adminA', face = false) => {
    const exam = (await api(who, 'post', '/exams').send({ title: `AS4b ${run} ${randomUUID().slice(0, 4)}`, faceVerificationEnabled: face }).expect(201)).body.id;
    const section = (await api(who, 'post', `/exams/${exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
    await request(http).put(`/api/v1/exams/${exam}/sections/${section}/questions`).set('Authorization', `Bearer ${token[who]}`).send({ questionIds: [ids[`q${o}`]] }).expect(200);
    await api(who, 'post', `/exams/${exam}/publish`).expect(201);
    const c = (await api(who, 'post', '/candidates').send({ email: `c-${randomUUID().slice(0, 8)}@as4b.test`, name: 'Asha' }).expect(201)).body.id;
    const inv = (await api(who, 'post', `/exams/${exam}/invitations`).send({ candidateIds: [c] }).expect(201)).body.created[0];
    const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken as string;
    return { exam, invitation: inv.id as string, ct };
  };

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as4b-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS4b ${k}`, slug: `as4b-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['writer', 'A', 'panel', ['asmt.test.manage']],
      ['proctor', 'A', 'panel', ['asmt.proctor']],
      ['evaluator', 'A', 'panel', ['asmt.evaluate']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as4b.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as4b.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const [k, who] of [['A', 'adminA'], ['B', 'adminB']] as const)
      ids[`q${k}`] = (await api(who, 'post', '/questions').send({ type: 'single_mcq', text: `Capital ${k} ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201)).body.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.question.deleteMany({ where: { organizationId: o } });
          await tx.candidate.deleteMany({ where: { organizationId: o } });
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

  describe('PRC-23 / PRC-11: accommodations', () => {
    it('a candidate asks for 25 % extra time and screen-reader mode with a PDF; one open request at a time', async () => {
      const c = await candidate();
      Object.assign(ids, { inv: c.invitation, ct: c.ct, exam: c.exam });
      const out = (await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['time', 'reader'], extraTimePercent: 25, note: 'Low vision', evidence: { fileName: '../../Doctor letter.pdf', dataUri: PDF } }).expect(201)).body;
      expect(out.request).toMatchObject({ kinds: ['time', 'reader'], status: 'pending' });
      expect(out.approved).toEqual([]);
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['font'] }).expect(409);
      const row = await inOrg(org.A.id, (tx) => tx.accommodationRequest.findFirstOrThrow({ where: { invitationId: c.invitation } }));
      expect([row.organizationId, row.evidenceName, row.evidenceType]).toEqual([org.A.id, 'Doctor letter.pdf', 'application/pdf']);
    });

    it('negative: a file that is not a PDF or photo, time without an amount, an unknown item, a manual check on a test without face checks', async () => {
      const c = await candidate();
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['reader'], evidence: { fileName: 'letter.pdf', dataUri: FAKE_PDF } }).expect(400);
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['time'] }).expect(400);
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['teleport'] }).expect(400);
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['identity'] }).expect(400);
      expect(await inOrg(org.A.id, (tx) => tx.accommodationRequest.count({ where: { invitationId: c.invitation } }))).toBe(0);
    });

    it('the test writer sees it and opens the evidence (audited); readers, evaluators, proctors and another company do not', async () => {
      const list = (await api('writer', 'get', '/asmt/accommodations').expect(200)).body as { id: string; kinds: string[]; evidenceName: string }[];
      const mine = list.find((r) => r.kinds.join() === 'time,reader')!;
      ids.req = mine.id;
      expect(mine.evidenceName).toBe('Doctor letter.pdf');
      expect((await api('writer', 'get', `/asmt/accommodations/${ids.req}/evidence`).expect(200)).body.url).toBeTruthy();
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'accommodation.evidence_viewed', entityId: ids.req } }))).toBe(1);
      for (const who of ['reader', 'evaluator', 'proctor'] as const) await api(who, 'get', '/asmt/accommodations').expect(403);
      expect((await api('adminB', 'get', '/asmt/accommodations').expect(200)).body).toEqual([]);
      await api('adminB', 'get', `/asmt/accommodations/${ids.req}/evidence`).expect(404);
      await api('adminB', 'post', `/asmt/accommodations/${ids.req}/decide`).send({ approvedKinds: [] }).expect(404);
    });

    it('negative: approving what was not asked for, or time without an amount, is refused', async () => {
      await api('writer', 'post', `/asmt/accommodations/${ids.req}/decide`).send({ approvedKinds: ['font'] }).expect(400);
      await api('writer', 'post', `/asmt/accommodations/${ids.req}/decide`).send({ approvedKinds: ['time'] }).expect(400);
    });

    it('approving 50 % and screen-reader mode sets the invitation\'s extra time; the candidate sees it; deciding twice is refused', async () => {
      expect((await api('writer', 'post', `/asmt/accommodations/${ids.req}/decide`).send({ approvedKinds: ['time', 'reader'], extraTimePercent: 50, message: 'Approved both.' }).expect(200)).body).toEqual({ status: 'approved' });
      expect((await inOrg(org.A.id, (tx) => tx.invitation.findUniqueOrThrow({ where: { id: ids.inv } }))).extraTimePercent).toBe(50);
      const help = (await cand(ids.ct!, 'get', '/attempt/accommodation').expect(200)).body;
      expect([help.request.status, help.approved.sort(), help.extraTimePercent, help.request.message]).toEqual(['approved', ['reader', 'time'], 50, 'Approved both.']);
      await api('writer', 'post', `/asmt/accommodations/${ids.req}/decide`).send({ approvedKinds: [] }).expect(409);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'accommodation.decided', entityId: ids.req } }))).toBe(1);
    });

    it('negative: once the test has started, asking is refused and extra time can no longer be approved (the rest can)', async () => {
      const c = await candidate();
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['time', 'font'], extraTimePercent: 25 }).expect(201);
      await cand(c.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['reader'] }).expect(409);
      const id = (await inOrg(org.A.id, (tx) => tx.accommodationRequest.findFirstOrThrow({ where: { invitationId: c.invitation } }))).id;
      await api('writer', 'post', `/asmt/accommodations/${id}/decide`).send({ approvedKinds: ['time', 'font'], extraTimePercent: 25 }).expect(409);
      expect((await api('writer', 'post', `/asmt/accommodations/${id}/decide`).send({ approvedKinds: ['font'] }).expect(200)).body).toEqual({ status: 'partly' });
    });

    it('a candidate on a test with face checks may ask for a manual identity check', async () => {
      const c = await candidate('A', 'adminA', true);
      await cand(c.ct, 'post', '/attempt/accommodation').send({ kinds: ['identity'] }).expect(201);
    });

    it('negative: the database refuses a decision without who and when, and the app may not delete a request', async () => {
      await expect(inOrg(org.A.id, (tx) => tx.accommodationRequest.update({ where: { id: ids.req }, data: { decidedBy: null } }))).rejects.toThrow(/accommodation_requests_decision_check/);
      await expect(inOrg(org.A.id, (tx) => tx.accommodationRequest.deleteMany({ where: { id: ids.req } }))).rejects.toThrow(/permission denied/);
    });
  });

  describe('PRC-10: connectivity credit above the cap', () => {
    const MIN = 60_000;
    /** The candidate was last seen this long ago; their next request measures the gap. */
    const offlineFor = async (attempt: string, ms: number) => tenantPrisma.forTenant(SUPER, (tx) => tx.attempt.update({ where: { id: attempt }, data: { lastSeenAt: new Date(Date.now() - ms) } }));

    it('20 minutes offline: 10 given back (the default cap), the rest waits for a person', async () => {
      const c = await candidate();
      await cand(c.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      const a = await inOrg(org.A.id, (tx) => tx.attempt.findFirstOrThrow({ where: { invitationId: c.invitation } }));
      Object.assign(ids, { att: a.id, attCt: c.ct, paused0: String(a.pausedDurationMs) });
      await offlineFor(a.id, 20 * MIN);
      await cand(c.ct, 'get', '/attempt/current').expect(200);
      const after = await inOrg(org.A.id, (tx) => tx.attempt.findUniqueOrThrow({ where: { id: a.id } }));
      expect(after.offlineCreditMs).toBe(10 * MIN);
      const row = await inOrg(org.A.id, (tx) => tx.connectivityCredit.findFirstOrThrow({ where: { attemptId: a.id } }));
      expect(Math.abs(row.lostMs - (10 * MIN - 45_000))).toBeLessThan(5_000);
      expect(row.organizationId).toBe(org.A.id);
      ids.credit = row.id;
      ids.paused1 = String(after.pausedDurationMs);
      ids.lost = String(row.lostMs);
    });

    it('negative: a short reason is refused; an evaluator, a results reader and another company cannot decide', async () => {
      await api('proctor', 'post', `/asmt/connectivity/${ids.credit}/approve`).send({ reason: 'ok' }).expect(400);
      for (const who of ['evaluator', 'reader'] as const) await api(who, 'post', `/asmt/connectivity/${ids.credit}/approve`).send({ reason: 'Area-wide outage confirmed' }).expect(403);
      await api('adminB', 'post', `/asmt/connectivity/${ids.credit}/approve`).send({ reason: 'Area-wide outage confirmed' }).expect(404);
      expect((await api('adminB', 'get', '/asmt/connectivity').expect(200)).body).toEqual([]);
    });

    it('a proctor approves it with a reason: the running test gets the time; deciding twice is refused', async () => {
      const list = (await api('proctor', 'get', '/asmt/connectivity').expect(200)).body as { id: string; creditedMs: number; capMinutes: number }[];
      expect(list.find((r) => r.id === ids.credit)).toMatchObject({ creditedMs: 10 * MIN, capMinutes: 10 });
      await api('proctor', 'post', `/asmt/connectivity/${ids.credit}/approve`).send({ reason: 'Area-wide outage confirmed by the college' }).expect(200);
      const after = await inOrg(org.A.id, (tx) => tx.attempt.findUniqueOrThrow({ where: { id: ids.att } }));
      expect(after.pausedDurationMs).toBe(Number(ids.paused1) + Number(ids.lost));
      await api('proctor', 'post', `/asmt/connectivity/${ids.credit}/decline`).send({ reason: 'Changed my mind about it' }).expect(409);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'attempt.connectivity_credit_approved', entityId: ids.att } }))).toBe(1);
    });

    it('negative: time lost after the test ended cannot be approved, only declined with a reason', async () => {
      await offlineFor(ids.att, 3 * MIN);
      await cand(ids.attCt!, 'get', '/attempt/current').expect(200);
      const open = await inOrg(org.A.id, (tx) => tx.connectivityCredit.findFirstOrThrow({ where: { attemptId: ids.att, status: 'pending' } }));
      await cand(ids.attCt!, 'post', '/attempt/submit').expect(201);
      await api('writer', 'post', `/asmt/connectivity/${open.id}/approve`).send({ reason: 'Area-wide outage confirmed' }).expect(409);
      await api('writer', 'post', `/asmt/connectivity/${open.id}/decline`).send({ reason: 'The test had already ended' }).expect(200);
    });

    it('negative: within the cap nothing waits for a person', async () => {
      const c = await candidate();
      await cand(c.ct, 'post', '/attempt/start').send({ consent: true }).expect(201);
      const a = await inOrg(org.A.id, (tx) => tx.attempt.findFirstOrThrow({ where: { invitationId: c.invitation } }));
      await offlineFor(a.id, 3 * MIN);
      await cand(c.ct, 'get', '/attempt/current').expect(200);
      expect(await inOrg(org.A.id, (tx) => tx.connectivityCredit.count({ where: { attemptId: a.id } }))).toBe(0);
    });
  });
});
