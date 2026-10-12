import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { PerformanceFeedbackService } from '../src/performance/feedback.service';

// Performance batch PM3 end to end against the real database (forced RLS, the app role): feedback to a colleague,
// never to oneself; "private" feedback seen by the recipient's manager chain, "recipient only" not; withdrawn within
// 24 hours by the giver only; requests for feedback answered and declined; HR sealing of a concern (the people see
// "removed by HR", the manager no longer sees it, only the sealer reads the text); 1:1s only with one's manager or
// direct report; private notes only for their author; open actions carry to the next 1:1; reminders; companies apart.

describe('Performance batch PM3', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'hr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Item = { id: string; text: string | null; sealed: boolean; toEmployeeId: string; can: { withdraw: boolean; seal: boolean } };
  const items = async (who: Who, view: string) => ((await api(who, 'get', `/feedback?view=${view}`).expect(200)).body.items as Item[]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `pm3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM3 Org ${k}`, slug: `pm3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['hr', 'A', 'panel', ['perf.concern.seal']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@pm3-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null);
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head);
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya);
    emp.sita = await hire('sita', 'Sita', 'KF-004', emp.priya);
    emp.hr = await hire('hr', 'Meena', 'KF-005', emp.head);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('feedback goes to a colleague; private reaches the manager chain, recipient-only does not (PM-3.01)', async () => {
    await api('sita', 'post', '/feedback').send({ toEmployeeId: emp.sita, kind: 'praise', text: 'Great job, me' }).expect(400);
    await api('sita', 'post', '/feedback').send({ toEmployeeId: emp.arjun, kind: 'boast', text: 'Great job' }).expect(400);
    const a = (await api('sita', 'post', '/feedback').send({ toEmployeeId: emp.arjun, kind: 'praise', text: 'Thanks for covering the Madurai visit.' }).expect(201)).body as Item;
    ids.praise = a.id;
    expect(a.can.withdraw).toBe(true);
    const b = (await api('sita', 'post', '/feedback').send({ toEmployeeId: emp.arjun, kind: 'suggestion', text: 'Share the call notes earlier.', visibility: 'recipient_only' }).expect(201)).body as Item;
    ids.quiet = b.id;
    expect((await items('arjun', 'received')).map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect((await items('sita', 'given')).length).toBe(2);
    // Priya (Arjun's manager) and the head above her see the private one only; a peer sees neither.
    const team = (await items('priya', 'team')).map((x) => x.id);
    expect(team).toContain(a.id);
    expect(team).not.toContain(b.id);
    expect((await items('head', 'team')).map((x) => x.id)).toContain(a.id);
    expect(await items('sita', 'team')).toEqual([]);
    // Only the giver withdraws.
    await api('arjun', 'post', `/feedback/${b.id}/withdraw`).expect(404);
    await api('sita', 'post', `/feedback/${b.id}/withdraw`).expect(200);
    await api('sita', 'post', `/feedback/${b.id}/withdraw`).expect(409);
    expect((await items('arjun', 'received')).map((x) => x.id)).not.toContain(b.id);
  });

  it('withdrawing ends after 24 hours', async () => {
    await inA((tx) => tx.feedbackItem.update({ where: { id: ids.praise }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } }));
    await api('sita', 'post', `/feedback/${ids.praise}/withdraw`).expect(409);
  });

  it('requests for feedback: about oneself or one’s team; answered or declined (PM-3.01)', async () => {
    await api('sita', 'post', '/feedback-requests').send({ aboutEmployeeId: emp.arjun, askedEmployeeIds: [emp.head], question: 'How is Arjun doing?' }).expect(403);
    await api('priya', 'post', '/feedback-requests').send({ aboutEmployeeId: emp.arjun, askedEmployeeIds: [emp.arjun], question: 'How is Arjun doing?' }).expect(400);
    await api('priya', 'post', '/feedback-requests').send({ aboutEmployeeId: emp.arjun, askedEmployeeIds: [emp.sita, emp.hr], question: 'How did Arjun handle the dealer meet?', dueOn: shift(today, 7) }).expect(201);
    const mine = (await api('sita', 'get', '/feedback-requests').expect(200)).body.requests as { id: string; aboutEmployeeId: string }[];
    expect(mine).toHaveLength(1);
    await api('arjun', 'post', '/feedback').send({ toEmployeeId: emp.sita, kind: 'praise', text: 'Not mine to answer', requestId: mine[0].id }).expect(400);
    await api('sita', 'post', '/feedback').send({ toEmployeeId: emp.arjun, kind: 'praise', text: 'He handled the dealers calmly.', requestId: mine[0].id }).expect(201);
    expect((await api('sita', 'get', '/feedback-requests').expect(200)).body.requests).toEqual([]);
    const hrs = (await api('hr', 'get', '/feedback-requests').expect(200)).body.requests as { id: string }[];
    await api('hr', 'post', `/feedback-requests/${hrs[0].id}/decline`).expect(200);
    await api('hr', 'post', `/feedback-requests/${hrs[0].id}/decline`).expect(404);
  });

  it('HR seals a concern: it leaves the manager’s view, the people see it removed, only the sealer reads it (§15.3)', async () => {
    const bad = (await api('sita', 'post', '/feedback').send({ toEmployeeId: emp.arjun, kind: 'suggestion', text: 'Something here belongs to the concern channel.' }).expect(201)).body as Item;
    await api('priya', 'post', `/feedback/${bad.id}/seal`).send({ reason: 'Raised as a concern' }).expect(403);
    await api('priya', 'get', `/feedback/employee/${emp.arjun}`).expect(403);
    await api('hr', 'post', `/feedback/${bad.id}/seal`).send({ reason: 'x' }).expect(400);
    await api('hr', 'post', `/feedback/${bad.id}/seal`).send({ reason: 'Passed to the confidential channel' }).expect(200);
    await api('hr', 'post', `/feedback/${bad.id}/seal`).send({ reason: 'Passed to the confidential channel' }).expect(409);
    const got = (await items('arjun', 'received')).find((x) => x.id === bad.id)!;
    expect(got).toMatchObject({ sealed: true, text: null });
    expect((await items('sita', 'given')).find((x) => x.id === bad.id)).toMatchObject({ sealed: true, text: null, can: { withdraw: false } });
    expect((await items('priya', 'team')).map((x) => x.id)).not.toContain(bad.id);
    const hr = (await api('hr', 'get', `/feedback/employee/${emp.arjun}`).expect(200)).body.items as (Item & { sealReason: string })[];
    expect(hr.find((x) => x.id === bad.id)).toMatchObject({ sealed: true, text: 'Something here belongs to the concern channel.', sealReason: 'Passed to the confidential channel' });
    const log = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'perf.feedback.sealed', entityId: bad.id } }));
    expect(log).toBeTruthy();
  });

  it('1:1s: only with one’s manager or direct report; only the two see it; private notes stay with their author (PM-3.02)', async () => {
    await api('arjun', 'post', '/one-on-ones').send({ withEmployeeId: emp.sita, on: shift(today, 1) }).expect(403);
    await api('arjun', 'post', '/one-on-ones').send({ withEmployeeId: emp.head, on: shift(today, 1) }).expect(403);
    const partners = (await api('priya', 'get', '/one-on-ones').expect(200)).body.partners as { value: string }[];
    expect(partners.map((p) => p.value).sort()).toEqual([emp.head, emp.arjun, emp.sita].sort());
    type M = { id: string; role: string; version: number; privateNote: string; agenda: { id: string; done: boolean }[]; actions: { id: string; done: boolean; text: string }[]; sharedNotes: string | null };
    let m = (await api('priya', 'post', '/one-on-ones').send({ withEmployeeId: emp.arjun, on: shift(today, 1) }).expect(201)).body as M;
    ids.m1 = m.id;
    expect(m.role).toBe('manager');
    expect((await api('arjun', 'get', `/one-on-ones/${m.id}`).expect(200)).body.role).toBe('employee');
    await api('sita', 'get', `/one-on-ones/${m.id}`).expect(404);
    await api('head', 'get', `/one-on-ones/${m.id}`).expect(404);
    await api('hr', 'get', `/one-on-ones/${m.id}`).expect(404);
    m = (await api('arjun', 'post', `/one-on-ones/${m.id}/agenda`).send({ text: 'Dealer targets' }).expect(201)).body;
    m = (await api('priya', 'put', `/one-on-ones/${m.id}/agenda/${m.agenda[0].id}`).send({ done: true }).expect(200)).body;
    expect(m.agenda[0].done).toBe(true);
    m = (await api('priya', 'put', `/one-on-ones/${m.id}/private-note`).send({ text: 'Ready for a bigger territory.' }).expect(200)).body;
    expect(m.privateNote).toBe('Ready for a bigger territory.');
    expect((await api('arjun', 'get', `/one-on-ones/${m.id}`).expect(200)).body.privateNote).toBe('');
    m = (await api('priya', 'put', `/one-on-ones/${m.id}`).send({ sharedNotes: 'Agreed on Q3 targets.', version: m.version }).expect(200)).body;
    await api('arjun', 'put', `/one-on-ones/${m.id}`).send({ status: 'held', version: m.version - 1 }).expect(409);
    m = (await api('arjun', 'post', `/one-on-ones/${m.id}/actions`).send({ text: 'Send the dealer list', ownerEmployeeId: emp.arjun, dueOn: shift(today, 5) }).expect(201)).body;
    await api('arjun', 'post', `/one-on-ones/${m.id}/actions`).send({ text: 'Not in this 1:1', ownerEmployeeId: emp.sita }).expect(400);
    m = (await api('priya', 'post', `/one-on-ones/${m.id}/actions`).send({ text: 'Book the review room', ownerEmployeeId: emp.priya }).expect(201)).body;
    m = (await api('priya', 'put', `/one-on-ones/${m.id}/actions/${m.actions[1].id}`).send({ done: true }).expect(200)).body;
    // The next 1:1 of the pair takes the open action; the done one stays.
    const next = (await api('arjun', 'post', '/one-on-ones').send({ withEmployeeId: emp.priya, on: shift(today, 14) }).expect(201)).body as M;
    expect(next.actions.map((a) => a.text)).toEqual(['Send the dealer list']);
    expect((await api('priya', 'get', `/one-on-ones/${ids.m1}`).expect(200)).body.actions.map((a: { text: string }) => a.text)).toEqual(['Book the review room']);
  });

  it('reminds both people the day before a planned 1:1, once', async () => {
    const svc = app.get(PerformanceFeedbackService);
    expect(await svc.sweepOrg(org.A.id, today)).toBe(2);
    expect(await svc.sweepOrg(org.A.id, today)).toBe(0);
    const n = await inA((tx) => tx.userNotification.count({ where: { type: 'perf.one_on_one.reminder', recipientUserId: { in: [users.priya, users.arjun] } } }));
    expect(n).toBe(2);
  });

  it('keeps companies apart', async () => {
    await api('adminB', 'get', `/one-on-ones/${ids.m1}`).expect(404);
    await api('adminB', 'post', '/feedback').send({ toEmployeeId: emp.arjun, kind: 'praise', text: 'From another company' }).expect(403);
    await api('adminB', 'post', `/feedback/${ids.praise}/seal`).send({ reason: 'Not ours to seal' }).expect(404);
  });
});
