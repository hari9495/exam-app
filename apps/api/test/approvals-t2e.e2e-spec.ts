import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import * as webpush from 'web-push';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PushService } from '../src/notifications/push.service';

// Batch T2-E items 49 and 50 end to end (founder answers 2872, 2873, 27 Nov 2026): each waiting request and each Team
// history decision says whether the requester is in my direct team or my whole team (the Asked by filter), and
// "Decided by me" lists what I approved, did not approve or sent back in 30 days, 3 months or 12 months, with the
// request's present status and the decisions I made for someone else marked. Positive and negative.

jest.setTimeout(300_000);

describe('Approvals T2-E 49 and 50', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let engine: ApprovalsEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { id: '', slug: '' };
  type Who = 'admin' | 'mgr' | 'emp' | 'deep' | 'other' | 'boss';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctx = () => ({ organizationId: org.id, isSuperAdmin: false });
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(ctx(), fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const submit = (requester: Who) =>
    inA((tx) => engine.submit(tx, ctx(), { type: 'test.t2e', subjectType: 'test', subjectId: randomUUID(), title: `Request of ${requester} ${run}`, summary: [], subjectPersonId: null, requesterUserId: users[requester]!, raisedByUserId: users[requester]!, steps: [{ name: 'Manager', approvers: [{ kind: 'users', userIds: [users.mgr!] }], mode: 'any' }], payload: {}, payloadFields: [], fallbackUserIds: [] }));
  const taskOf = (requestId: string) => inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    engine = moduleRef.get(ApprovalsEngine);
    engine.register({ key: 'test.t2e', label: 'Test request', risk: 'normal', autoActions: false, onDecided: async () => undefined, requesterLink: () => '/yx/me/requests' });
    planId = (await prisma.plan.create({ data: { name: `t2e-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'T2E Org', slug: `t2e-${run}`, planId } });
    Object.assign(org, { id: created.id, slug: created.slug });
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['admin', 'mgr', 'emp', 'deep', 'other', 'boss'] as const) {
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: org.id, email: `${who}@t2e-${run}.test`, name: `${who} ${run}`, passwordHash, role: who === 'admin' ? 'org_admin' : 'panel' } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: `${who}@t2e-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'T2E Tech', shortName: `T2E-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'CHN', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Ops', code: 'OPS', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Officer', code: 'OFF' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const joined = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const hire = async (who: Who, manager: string | null) =>
      (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: joined, userId: users[who], workEmail: `${who}@t2e-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(want(201))
      ).body.id as string;
    // mgr manages emp; deep reports to emp (mgr's whole team); other is no one's report.
    ids.mgrEmp = await hire('mgr', null);
    ids.empEmp = await hire('emp', ids.mgrEmp);
    ids.deepEmp = await hire('deep', ids.empEmp);
    ids.otherEmp = await hire('other', null);
    ids.r1 = (await submit('emp')).id;
    ids.r2 = (await submit('deep')).id;
    ids.r3 = (await submit('other')).id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: org.id } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('49: waiting requests say whether who asked is in my direct or whole team; others are neither', async () => {
    const inbox = (await api('mgr', 'get', '/workflow/approvals/inbox').expect(want(200))).body as { requestId: string; requesterTeam: string | null }[];
    const team = (id: string) => inbox.find((r) => r.requestId === id)?.requesterTeam;
    expect(team(ids.r1!)).toBe('direct');
    expect(team(ids.r2!)).toBe('whole');
    expect(team(ids.r3!)).toBeNull();
    // Negative: emp is not mgr's manager, so to emp nobody here is "team"; another person sees none of these tasks.
    expect((await api('other', 'get', '/workflow/approvals/inbox').expect(want(200))).body).toEqual([]);
  });

  it('50: Decided by me lists my decisions in the period with the present status; for-someone-else is marked', async () => {
    const t1 = await taskOf(ids.r1!);
    const t2 = await taskOf(ids.r2!);
    const t3 = await taskOf(ids.r3!);
    await api('mgr', 'post', `/workflow/approvals/tasks/${t1.id}/decide`).send({ decision: 'approve' }).expect(want(200));
    await api('mgr', 'post', `/workflow/approvals/tasks/${t2.id}/decide`).send({ decision: 'reject', reason: 'Not this month' }).expect(want(200));
    // mgr decides r3 as boss's delegate (the task names who it is for).
    await inA((tx) => tx.wfTask.update({ where: { id: t3.id }, data: { onBehalfOfUserId: users.boss } }));
    await api('mgr', 'post', `/workflow/approvals/tasks/${t3.id}/decide`).send({ decision: 'approve' }).expect(want(200));
    type D = { requestId: string; decision: string; requestStatus: string; requesterTeam: string | null; onBehalfOf: string | null };
    const h = (await api('mgr', 'get', '/workflow/approvals/history').expect(want(200))).body as { days: number; decided: D[] };
    expect(h.days).toBe(90);
    const of = (id: string) => h.decided.find((x) => x.requestId === id)!;
    expect(of(ids.r1!)).toMatchObject({ decision: 'approved', requestStatus: 'approved', requesterTeam: 'direct', onBehalfOf: null });
    expect(of(ids.r2!)).toMatchObject({ decision: 'rejected', requestStatus: 'rejected', requesterTeam: 'whole' });
    expect(of(ids.r3!)).toMatchObject({ decision: 'approved', onBehalfOf: `boss ${run}`, requesterTeam: null });
    // The period: a decision 60 days ago is in 3 months and 12 months, not in 30 days.
    await inA((tx) => tx.wfTask.update({ where: { id: t2.id }, data: { decidedAt: new Date(Date.now() - 60 * 86_400_000) } }));
    const in30 = (await api('mgr', 'get', '/workflow/approvals/history?days=30').expect(want(200))).body.decided as D[];
    expect(in30.map((x) => x.requestId)).not.toContain(ids.r2);
    expect(((await api('mgr', 'get', '/workflow/approvals/history?days=365').expect(want(200))).body.decided as D[]).map((x) => x.requestId)).toContain(ids.r2);
    // Negative: another period is refused; nobody else sees my decisions.
    await api('mgr', 'get', '/workflow/approvals/history?days=7').expect(400);
    expect((await api('other', 'get', '/workflow/approvals/history').expect(want(200))).body.decided).toEqual([]);
    // Team history carries the team flag too.
    const team = (await api('mgr', 'get', '/workflow/approvals/team-history').expect(want(200))).body as { requestId: string; requesterTeam: string | null }[];
    expect(team.find((x) => x.requestId === ids.r1)?.requesterTeam).toBe('direct');
  });
  it('51: Home cards for a request sent back to me and a survey closing in 2 days; each kind a company switch; only my own', async () => {
    const api2 = (who: Who, method: 'get' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const plus = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000);
    const sentBack = (await submit('emp')).id;
    await inA((tx) => tx.wfRequest.update({ where: { id: sentBack }, data: { status: 'sent_back', decidedAt: new Date() } }));
    await inA(async (tx) => {
      const mk = (name: string, closes: Date) => tx.engSurvey.create({ data: { organizationId: org.id, name, type: 'pulse', opensOn: plus(-3), closesOn: closes, launchedAt: new Date(), createdBy: users.admin! } });
      const soon = await mk('Pulse soon', plus(1));
      const later = await mk('Pulse later', plus(5));
      for (const s of [soon, later]) await tx.engSurveyInvite.create({ data: { organizationId: org.id, surveyId: s.id, userId: users.emp! } });
      ids.soon = soon.id;
    });
    type Card = { kind: string; id: string; href: string };
    const cards = async (who: Who) => (await api2(who, 'get', '/notifications/home-reminders').expect(want(200))).body.cards as Card[];
    const mine = await cards('emp');
    expect(mine.map((c) => c.kind)).toEqual(['sent_back', 'survey']);
    expect(mine[1]).toMatchObject({ id: `survey:${ids.soon}`, href: `/yx/engage/surveys/${ids.soon}/take` });
    // Negative: someone else has none of these; the survey closing in 5 days never shows.
    expect(await cards('other')).toEqual([]);
    expect(JSON.stringify(mine)).not.toContain('Pulse later');
    // The company switches surveys off: only the sent-back card stays.
    await api2('admin', 'put', '/org/settings').send({ key: 'home.reminders.survey', scopeType: 'tenant', value: 'off' }).expect(want(200));
    expect((await cards('emp')).map((c) => c.kind)).toEqual(['sent_back']);
  });
  it('52: push with keys from config only: one subscription per device, neutral title, choices, quiet hours, gone and sign-out', async () => {
    const api3 = (who: Who, method: 'get' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
    const keys = webpush.generateVAPIDKeys(); // made for this run only, never stored
    const sub = { endpoint: `https://fcm.googleapis.com/fcm/send/t2e-${run}`, p256dh: 'BFakeP256dhKeyForTestsOnly_abcdefgh', auth: 'FakeAuthKey_123' };
    // Without keys in config: push is not available and nothing subscribes.
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    expect((await api3('emp', 'get', '/notifications/push').expect(want(200))).body).toMatchObject({ available: false, publicKey: null, paused: false, quietFrom: '21:00', quietTo: '08:00' });
    await api3('emp', 'put', '/notifications/push/subscription').send(sub).expect(400);
    Object.assign(process.env, { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey, WEB_PUSH_SUBJECT: 'mailto:push-test@example.test' });
    try {
      expect((await api3('emp', 'get', '/notifications/push').expect(want(200))).body).toMatchObject({ available: true, publicKey: keys.publicKey });
      await api3('emp', 'put', '/notifications/push/subscription').send({ ...sub, endpoint: 'http://push.example.test/x' }).expect(400);
      await api3('emp', 'put', '/notifications/push/subscription').send({ ...sub, endpoint: 'https://169.254.169.254/latest' }).expect(400);
      await api3('emp', 'put', '/notifications/push/subscription').send(sub).expect(want(200));
      // The same device signed in by someone else of the company moves to them, never two.
      await api3('other', 'put', '/notifications/push/subscription').send(sub).expect(want(200));
      expect(await inA((tx) => tx.pushSubscription.findMany({ where: { endpoint: sub.endpoint }, select: { userId: true } }))).toEqual([{ userId: users.other }]);
      await api3('emp', 'put', '/notifications/push/subscription').send(sub).expect(want(200));
      const sent = jest.spyOn(PushService.transport, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });
      const push = app.get(PushService);
      const noon = new Date(`${new Date().toISOString().slice(0, 10)}T06:30:00Z`); // 12:00 India time
      // An approval pushes by default, with the kind's neutral title only and the page to open.
      expect(await push.send(ctx(), [users.emp!], 'approval.requested', '/yx/approvals?request=x', noon)).toBe(1);
      expect(sent).toHaveBeenCalledWith(expect.objectContaining({ endpoint: sub.endpoint }), JSON.stringify({ title: 'A request needs your approval', url: '/yx/approvals?request=x' }), expect.anything());
      // Negative: a kind off by default, quiet hours, Pause push, and the company switch all send nothing.
      expect(await push.send(ctx(), [users.emp!], 'assigned', '/yx/home', noon)).toBe(0);
      expect(await push.send(ctx(), [users.emp!], 'approval.requested', '/yx/approvals', new Date(`${noon.toISOString().slice(0, 10)}T17:00:00Z`))).toBe(0); // 22:30 India time
      await api3('emp', 'patch', '/notifications/preferences').send({ type: 'assigned', pushEnabled: true }).expect(want(200));
      expect(await push.send(ctx(), [users.emp!], 'assigned', '/yx/home', noon)).toBe(1);
      await api3('emp', 'patch', '/notifications/push').send({ quietFrom: '25:00' }).expect(400);
      await api3('emp', 'patch', '/notifications/push').send({ paused: true }).expect(want(200));
      expect(await push.send(ctx(), [users.emp!], 'approval.requested', '/yx/approvals', noon)).toBe(0);
      await api3('emp', 'patch', '/notifications/push').send({ paused: false }).expect(want(200));
      await api3('admin', 'put', '/org/settings').send({ key: 'notify.push.enabled', scopeType: 'tenant', value: 'off' }).expect(want(200));
      expect(await push.send(ctx(), [users.emp!], 'approval.requested', '/yx/approvals', noon)).toBe(0);
      await api3('admin', 'put', '/org/settings').send({ key: 'notify.push.enabled', scopeType: 'tenant', value: 'on' }).expect(want(200));
      // The bell path pushes too (notifySystem), and a subscription the push service says is gone is removed.
      sent.mockClear();
      await app.get(NotificationsService).notifySystem(ctx(), [users.emp!], 'approval.requested', { entityType: 'test', entityId: randomUUID(), linkPath: '/yx/approvals' }, null);
      for (let k = 0; k < 50 && !sent.mock.calls.length; k++) await new Promise((r) => setTimeout(r, 100));
      expect(sent).toHaveBeenCalled();
      sent.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
      expect(await push.send(ctx(), [users.emp!], 'approval.requested', '/yx/approvals', noon)).toBe(0);
      expect(await inA((tx) => tx.pushSubscription.count({ where: { endpoint: sub.endpoint } }))).toBe(0);
      // Sign-out removes this device for me only.
      await api3('emp', 'put', '/notifications/push/subscription').send(sub).expect(want(200));
      await api3('other', 'delete', '/notifications/push/subscription').send({ endpoint: sub.endpoint }).expect(want(200));
      expect(await inA((tx) => tx.pushSubscription.count({ where: { endpoint: sub.endpoint } }))).toBe(1);
      await api3('emp', 'delete', '/notifications/push/subscription').send({ endpoint: sub.endpoint }).expect(want(200));
      expect(await inA((tx) => tx.pushSubscription.count({ where: { endpoint: sub.endpoint } }))).toBe(0);
      sent.mockRestore();
    } finally {
      for (const k of ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT']) delete process.env[k];
    }
  });
});
