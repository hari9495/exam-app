import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { asApproved } from './fixtures/approved-question';

// Assessments AS-3 (answers 2001, 2013), end to end against the real database (forced RLS, the app role):
//   PRC-32 an earlier result on the same test may be used instead of a new one, within the company's months; the
//          candidate agrees; a held result or the setting at 0 offers nothing; a reused invitation cannot start;
//   PRC-21 the candidate sees their own tests at the company and opens another of them; never someone else's;
//   PRC-07 every invitation on one list with its state; drives with counts; a missed test is re-invited once, with a reason.
describe('Assessments AS-3: hiring delivery', () => {
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
  type Who = 'adminA' | 'adminB' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const cand = (ct: string, method: 'get' | 'post', path: string) => request(runtimeHttp)[method](`/api/v1${path}`).set('Authorization', `Bearer ${ct}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const DAY = 24 * 60 * 60 * 1000;

  const test = async (who: Who, q: string, title: string) => {
    const exam = (await api(who, 'post', '/exams').send({ title: `${title} ${run}` }).expect(201)).body.id as string;
    const section = (await api(who, 'post', `/exams/${exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
    await api(who, 'put', `/exams/${exam}/sections/${section}/questions`).send({ questionIds: [q] }).expect(200);
    await api(who, 'post', `/exams/${exam}/publish`).expect(201);
    return exam;
  };
  const invite = async (who: Who, exam: string, candidate: string) => (await api(who, 'post', `/exams/${exam}/invitations`).send({ candidateIds: [candidate] }).expect(201)).body.created[0] as { id: string; token: string };
  const signIn = async (tokenValue: string) => (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: tokenValue }).expect(200)).body.accessToken as string;
  const expire = (invitation: string, daysAgo = 1) => tenantPrisma.forTenant(SUPER, (tx) => tx.invitation.update({ where: { id: invitation }, data: { expiresAt: new Date(Date.now() - daysAgo * DAY) } }));

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as3-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS3 ${k}`, slug: `as3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as3.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as3.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const [k, who] of [['A', 'adminA'], ['B', 'adminB']] as const) {
      ids[`q${k}`] = (await asApproved(await api(who, 'post', '/questions').send({ type: 'single_mcq', text: `Capital ${k} ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201))).body.id;
    }
    ids.examA = await test('adminA', ids.qA!, 'Java L2');
    ids.examA2 = await test('adminA', ids.qA!, 'SQL basics');
    ids.examB = await test('adminB', ids.qB!, 'Other company');
    for (const [k, who] of [['c1', 'adminA'], ['c2', 'adminA'], ['cB', 'adminB']] as const)
      ids[k] = (await api(who, 'post', '/candidates').send({ email: `${k}-${run}@as3.test`, name: `Cand ${k}` }).expect(201)).body.id;
    // C1 takes Java L2 for the first job (its invitation stays open: a second job may still invite again).
    const first = await invite('adminA', ids.examA!, ids.c1!);
    ids.inv1 = first.id;
    const ct1 = await signIn(first.token);
    await cand(ct1, 'post', '/attempt/start').send({ consent: true }).expect(201);
    await cand(ct1, 'post', '/attempt/submit').expect(201);
    ids.att1 = (await inOrg(org.A.id, (tx) => tx.attempt.findFirstOrThrow({ where: { invitationId: first.id } }))).id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.setting.deleteMany({ where: { organizationId: o } });
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.driveSession.deleteMany({ where: { organizationId: o } });
          await tx.walkInGroup.deleteMany({ where: { organizationId: o } });
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

  describe('PRC-32: using an earlier result (answer 2013)', () => {
    it('a second job with the same test offers the earlier result; agreeing links it and the test cannot start', async () => {
      // The first invitation is still open but taken: a new one is sent (not skipped as already invited).
      const second = await invite('adminA', ids.examA!, ids.c1!);
      await expire(ids.inv1!);
      ids.inv2 = second.id;
      ids.ct2 = await signIn(second.token);
      const offer = (await cand(ids.ct2, 'get', '/attempt/reuse').expect(200)).body;
      expect(offer.offer).toMatchObject({ attemptId: ids.att1, months: 6 });
      await cand(ids.ct2, 'post', '/attempt/reuse').send({ attemptId: ids.att1 }).expect(400);
      expect((await cand(ids.ct2, 'post', '/attempt/reuse').send({ attemptId: ids.att1, agree: true }).expect(201)).body.reused).toBeTruthy();
      const inv = await inOrg(org.A.id, (tx) => tx.invitation.findUniqueOrThrow({ where: { id: second.id } }));
      expect([inv.status, inv.reusedAttemptId]).toEqual(['reused', ids.att1]);
      await cand(ids.ct2, 'post', '/attempt/start').send({ consent: true }).expect(400);
      expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { action: 'invitation.result_reused', entityId: second.id } }))).toBe(1);
    });

    it('withdrawing the choice lets the candidate take the test; nothing is offered for a test without an earlier attempt', async () => {
      await cand(ids.ct2!, 'post', '/attempt/reuse/withdraw').expect(201);
      expect((await inOrg(org.A.id, (tx) => tx.invitation.findUniqueOrThrow({ where: { id: ids.inv2 } }))).status).toBe('invited');
      const other = await invite('adminA', ids.examA2!, ids.c1!);
      ids.inv3 = other.id;
      expect((await cand(await signIn(other.token), 'get', '/attempt/reuse').expect(200)).body).toEqual({ offer: null, reused: null });
    });

    it('negative: a held result, an earlier result past the months, or the setting at 0 offers nothing; another attempt id is refused', async () => {
      await cand(ids.ct2!, 'post', '/attempt/reuse').send({ attemptId: randomUUID(), agree: true }).expect(400);
      await tenantPrisma.forTenant(SUPER, (tx) => tx.result.update({ where: { attemptId: ids.att1 }, data: { releaseOverride: 'held' } }));
      expect((await cand(ids.ct2!, 'get', '/attempt/reuse').expect(200)).body.offer).toBeNull();
      await tenantPrisma.forTenant(SUPER, (tx) => tx.result.update({ where: { attemptId: ids.att1 }, data: { releaseOverride: null } }));
      await api('adminA', 'put', '/org/settings').send({ key: 'asmt.result_reuse_months', scopeType: 'tenant', value: '0' }).expect(200);
      expect((await cand(ids.ct2!, 'get', '/attempt/reuse').expect(200)).body.offer).toBeNull();
      await api('adminA', 'put', '/org/settings').send({ key: 'asmt.result_reuse_months', scopeType: 'tenant', value: '6' }).expect(200);
      await tenantPrisma.forTenant(SUPER, (tx) => tx.attempt.update({ where: { id: ids.att1 }, data: { submittedAt: new Date(Date.now() - 200 * DAY) } }));
      expect((await cand(ids.ct2!, 'get', '/attempt/reuse').expect(200)).body.offer).toBeNull();
      await tenantPrisma.forTenant(SUPER, (tx) => tx.attempt.update({ where: { id: ids.att1 }, data: { submittedAt: new Date(Date.now() - 2 * DAY) } }));
    });
  });

  describe('PRC-21: the candidate\'s own tests', () => {
    it('lists only this candidate\'s tests at the company, with their states, and marks the open one', async () => {
      const mine = (await cand(ids.ct2!, 'get', '/attempt/my-tests').expect(200)).body as { invitationId: string; status: string; current: boolean }[];
      expect(mine.map((t) => [t.invitationId, t.status, t.current]).sort()).toEqual(
        [
          [ids.inv1, 'completed', false],
          [ids.inv2, 'invited', true],
          [ids.inv3, 'invited', false],
        ].sort(),
      );
    });

    it('opens another of their tests; never another candidate\'s or another company\'s', async () => {
      const ct3 = (await cand(ids.ct2!, 'post', '/candidate-auth/switch').send({ invitationId: ids.inv3 }).expect(200)).body.accessToken as string;
      expect((await cand(ct3, 'get', '/attempt/current').expect(200)).body.exam.title).toBe(`SQL basics ${run}`);
      const someoneElse = await invite('adminA', ids.examA2!, ids.c2!);
      await cand(ids.ct2!, 'post', '/candidate-auth/switch').send({ invitationId: someoneElse.id }).expect(404);
      const otherCompany = await invite('adminB', ids.examB!, ids.cB!);
      await cand(ids.ct2!, 'post', '/candidate-auth/switch').send({ invitationId: otherCompany.id }).expect(404);
      // A closed one (its window passed) cannot be opened.
      await cand(ids.ct2!, 'post', '/candidate-auth/switch').send({ invitationId: ids.inv1 }).expect(400);
    });
  });

  describe('PRC-07: invitations and drives', () => {
    it('lists every invitation with its state; filters; another company sees none of them; a results reader is refused', async () => {
      const all = (await api('adminA', 'get', '/asmt/invitations').expect(200)).body as { id: string; status: string; test: string }[];
      expect(all.find((r) => r.id === ids.inv1)?.status).toBe('Completed');
      expect(all.find((r) => r.id === ids.inv3)?.status).toBe('Invited');
      const only = (await api('adminA', 'get', `/asmt/invitations?examId=${ids.examA2}`).expect(200)).body as { test: string }[];
      expect(new Set(only.map((r) => r.test))).toEqual(new Set([`SQL basics ${run}`]));
      expect(((await api('adminB', 'get', '/asmt/invitations').expect(200)).body as { id: string }[]).some((r) => r.id === ids.inv1)).toBe(false);
      await api('reader', 'get', '/asmt/invitations').expect(403);
    });

    it('a missed test is re-invited once, with a reason: a new window; again is refused', async () => {
      await expire(ids.inv3!);
      expect(((await api('adminA', 'get', '/asmt/invitations?status=Missed').expect(200)).body as { id: string }[]).map((r) => r.id)).toContain(ids.inv3);
      await api('adminA', 'post', `/asmt/invitations/${ids.inv3}/reinvite`).send({ reason: 'short' }).expect(400);
      await api('adminA', 'post', `/asmt/invitations/${ids.inv3}/reinvite`).send({ reason: 'Power cut at the college that day' }).expect(200);
      const inv = await inOrg(org.A.id, (tx) => tx.invitation.findUniqueOrThrow({ where: { id: ids.inv3 } }));
      expect(inv.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(inv.reinviteReason).toBe('Power cut at the college that day');
      await expire(ids.inv3!);
      await api('adminA', 'post', `/asmt/invitations/${ids.inv3}/reinvite`).send({ reason: 'Power cut at the college again' }).expect(409);
    });

    it('negative: a test that was taken, or one still open, is not re-invited; another company gets 404', async () => {
      await api('adminA', 'post', `/asmt/invitations/${ids.inv1}/reinvite`).send({ reason: 'Wants another go at it' }).expect(400);
      await api('adminA', 'post', `/asmt/invitations/${ids.inv2}/reinvite`).send({ reason: 'Wants another go at it' }).expect(400);
      await api('adminB', 'post', `/asmt/invitations/${ids.inv2}/reinvite`).send({ reason: 'Wants another go at it' }).expect(404);
    });

    it('drives list their tests, sessions and counts', async () => {
      const g = await inOrg(org.A.id, (tx) => tx.walkInGroup.create({ data: { organizationId: org.A.id, name: `Campus TN ${run}` } }));
      await inOrg(org.A.id, (tx) => tx.exam.update({ where: { id: ids.examA2 }, data: { walkInGroupId: g.id } }));
      const s = await inOrg(org.A.id, (tx) => tx.driveSession.create({ data: { organizationId: org.A.id, walkInGroupId: g.id, name: 'Day 1', startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + 2 * DAY) } }));
      await inOrg(org.A.id, (tx) => tx.invitation.update({ where: { id: ids.inv3 }, data: { driveSessionId: s.id } }));
      const d = ((await api('adminA', 'get', '/asmt/drives').expect(200)).body as { id: string; tests: string[]; sessions: number; invited: number; status: string }[]).find((x) => x.id === g.id)!;
      expect([d.tests, d.sessions, d.invited, d.status]).toEqual([[`SQL basics ${run}`], 1, 1, 'Registration open']);
      expect(((await api('adminB', 'get', '/asmt/drives').expect(200)).body as { id: string }[]).some((x) => x.id === g.id)).toBe(false);
    });
  });
});
