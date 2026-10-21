import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { LeaveService } from '../src/time/leave.service';
import { DayEngine } from '../src/time/day-engine.service';
import { instantAt } from '../src/time/time-maths';
import { TicketsService } from '../src/service-desk/tickets.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Step 4 · Time and leave batch 1, end to end against the real database (forced RLS, the app role) and Redis: set-up
// by HR only, two companies kept apart, who sees whose leave (employee / manager / HR in scope), medical reasons as
// Special data, day counting with weekly offs, holidays and the sandwich rule, overlap and balance checks, approvals
// through the P03 engine (manager, then HR by rule, the ledger debit exactly once), delegation while the approver is
// away (and the Service Desk leave seam), withdraw and cancel, punches with the geofence (refusals logged),
// regularisation with the monthly limit, the muster and team calendar.
describe('Time and leave batch 1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let leave: LeaveService;
  let emailSend: jest.Mock;
  let dayEngine: DayEngine;
  let tickets: TicketsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'boss' | 'mgr' | 'emp' | 'peer' | 'other' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  // The company calendar is India time.
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  const asDay = (on: string) => new Date(`${on}T00:00:00Z`);
  // The test location's only weekly off is the weekday two days from today, so today is always a working day.
  const offWeekday = ((new Date(`${d(2)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; requestId: string; title: string; summary: { label: string; value: string }[]; onBehalfOf: string | null; step: { name: string } }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  const balance = async (who: Who, code: string) => ((await api(who, 'get', '/time/me/leave').expect(200)).body.balances as { code: string; balance: number; available: number }[]).find((b) => b.code === code)!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    leave = moduleRef.get(LeaveService);
    emailSend = moduleRef.get(EmailService).send as unknown as jest.Mock;
    dayEngine = moduleRef.get(DayEngine);
    tickets = moduleRef.get(TicketsService);

    planId = (await prisma.plan.create({ data: { name: `time-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Time Org ${k}`, slug: `time-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['boss', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@time-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@time-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Time Foods ${k}`, shortName: `TF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', bindDevice: false } })).id;
        await tx.locationFence.create({ data: { ...o, locationId: ids[`loc${k}`], name: 'Main point', lat: 12.9716, lng: 77.5946, radiusM: 150 } });
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Ops', code: 'OPS', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-3), userId: users[who], workEmail: `${who}@time-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.bossEmp = await hire('adminA', 'boss', null);
    ids.mgrEmp = await hire('adminA', 'mgr', ids.bossEmp);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.otherEmp = await hire('adminA', 'other', ids.bossEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', ids.bossEmp);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every new table has forced RLS; statutory rule sets are read-only to the app', async () => {
    const tables = ['holiday_calendars', 'holidays', 'optional_holiday_choices', 'leave_types', 'leave_policies', 'leave_policy_versions', 'leave_policy_assignments', 'leave_ledger', 'leave_requests', 'leave_request_days', 'location_attendance_rules', 'punches', 'attendance_days', 'attendance_requests'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[])`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
    await expect(prisma.$executeRaw`INSERT INTO statutory_rule_sets (statute, jurisdiction, version, valid_from, values, source) VALUES ('IN.SE', 'IN-XX', 'x', '2026-01-01', '{}', 'x')`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE statutory_rule_sets SET verify = false`).rejects.toThrow();
    // The ledger is append-only for the app role.
    await expect(prisma.$executeRaw`UPDATE leave_ledger SET days = 1`).rejects.toThrow();
  });

  describe('set-up (HR, company-wide)', () => {
    it('only the set-up key may change it; the other company never sees it', async () => {
      await api('emp', 'get', '/time/setup').expect(403);
      await api('hrExec', 'post', '/time/setup/types').send({ code: 'EL', name: 'Earned leave', kind: 'earned', paid: true }).expect(403);
      ids.EL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, rules: { sandwich: 'sandwich', hrApprovalAboveDays: 3, maxDays: 10 } }).expect(201)).body.id;
      ids.CL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'casual', paid: true, rules: { sandwich: 'none' } }).expect(201)).body.id;
      ids.SL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true, rules: { medical: true, certificateAfterDays: 2 } }).expect(201)).body.id;
      ids.LOP = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'LOP', name: 'Leave without pay', kind: 'lop', paid: false }).expect(201)).body.id;
      // Plain refusals: unpaid with a negative limit, an unknown rule, a duplicate code.
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'LWP', name: 'LWP', kind: 'lop', paid: false, rules: { negativeLimit: 2 } }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'X', name: 'X', kind: 'other', paid: true, rules: { eval: 'x' } }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'EL', name: 'Again', kind: 'earned', paid: true }).expect(409);
      // Company B cannot reach A's type.
      await api('adminB', 'put', `/time/setup/types/${ids.EL}`).send({ code: 'EL', name: 'Hijack', kind: 'earned', paid: true }).expect(404);
      expect((await api('adminB', 'get', '/time/setup').expect(200)).body.types).toEqual([]);

      ids.policy = (await api('hrAdmin', 'post', '/time/setup/policies').send({ name: 'Karnataka staff' }).expect(201)).body.id;
      // Below the Karnataka floor (EL 18, CL 12, SL 12): accepted, and the floor is applied when crediting (P07).
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: '2026-01-01', lines: [{ leaveTypeId: ids.EL, annualDays: 12, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: 10 }, { leaveTypeId: ids.CL, annualDays: 6, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }, { leaveTypeId: ids.SL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }] }).expect(201);
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: '2026-02-01', lines: [{ leaveTypeId: randomUUID(), annualDays: 1, frequency: 'monthly', proRata: true, rounding: 0.5, carryForwardMax: null }] }).expect(400);
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: '2026-01-01' }).expect(201);
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityB, validFrom: '2026-01-01' }).expect(404);
      ids.cal = (await api('hrAdmin', 'post', '/time/setup/calendars').send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 1 }).expect(201)).body.id;
      await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(12), name: 'Test festival', kind: 'festival' }).expect(201);
      ids.optional = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(25), name: 'Optional one', kind: 'optional' }).expect(201)).body.id;
      ids.optional2 = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(26), name: 'Optional two', kind: 'restricted' }).expect(201)).body.id;
      await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: today, shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: offWeekday }], checkIn: 'restricted' }).expect(201);
      await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: d(-10), shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [], checkIn: 'restricted' }).expect(400);
      // The same rule for the last month (set-up only adds future rows; the test needs past days evaluated alike).
      await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locA, validFrom: new Date(`${d(-30)}T00:00:00Z`), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: offWeekday }] } }));
      const setup = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body;
      expect(setup.statutory.map((s: { jurisdiction: string }) => s.jurisdiction)).toEqual(expect.arrayContaining(['IN-KA', 'IN-TN']));
    });

    it('accruals follow the policy with the state floor, idempotently; HR adjusts with a reason, never their own', async () => {
      const first = await leave.accrue(org.A.id);
      expect(first).toBeGreaterThan(0);
      expect(await leave.accrue(org.A.id)).toBe(0);
      // Karnataka CL floor 12 a year (the policy said 6), credited once a year in full (proRata off).
      expect((await balance('emp', 'CL')).balance).toBe(12);
      await api('emp', 'post', `/time/people/${ids.empEmp}/adjust`).send({ leaveTypeId: ids.EL, days: 5, reason: 'Try' }).expect(403);
      await api('hrAdmin', 'post', `/time/people/${ids.empEmp}/adjust`).send({ leaveTypeId: ids.EL, days: 10, reason: '' }).expect(400);
      await api('hrAdmin', 'post', `/time/people/${ids.hrEmp}/adjust`).send({ leaveTypeId: ids.EL, days: 10, reason: 'Opening balance' }).expect(403);
      await api('hrAdmin', 'post', `/time/people/${ids.empBEmp}/adjust`).send({ leaveTypeId: ids.EL, days: 10, reason: 'Opening balance' }).expect(404);
      for (const e of ['empEmp', 'mgrEmp', 'peerEmp']) await api('hrAdmin', 'post', `/time/people/${ids[e]}/adjust`).send({ leaveTypeId: ids.EL, days: 10, reason: 'Opening balance' }).expect(201);
      const audit = await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.balance.adjusted' } }));
      expect(audit).toBe(3);
    });
  });

  describe('apply and approve (P03)', () => {
    it('counts days with weekly offs, holidays and the sandwich rule (YX-LV-03)', async () => {
      const plan = (typeId: string, from: string, to: string, extra: object = {}) => api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: typeId, from, to, ...extra }).expect(200);
      expect((await plan(ids.EL, d(1), d(3))).body).toMatchObject({ total: 3, sandwichDays: 1 });
      expect((await plan(ids.CL, d(1), d(3))).body).toMatchObject({ total: 2, sandwichDays: 0 });
      expect((await plan(ids.CL, d(11), d(13))).body).toMatchObject({ total: 2, holidaysExcluded: 1 });
      expect((await plan(ids.CL, d(5), d(5), { toHalf: 'first' })).body.total).toBe(0.5);
      const blocked = (await plan(ids.CL, d(2), d(2))).body;
      expect(blocked.blocks[0]).toMatch(/holidays or weekly offs/);
    });

    it('applies, routes to the manager with the team view, and debits the ledger once when approved (YX-WF-10)', async () => {
      const before = await balance('emp', 'EL');
      const res = await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: d(5), to: d(6), reason: 'Visiting family' }).expect(201);
      ids.req1 = res.body.id;
      expect(res.body).toMatchObject({ status: 'pending', days: 2 });
      // The manager's email: who asks for what, in the designed YukthiX email (founder review 19 Oct 2026).
      const send = app.get(EmailService).send as jest.Mock;
      await new Promise((r) => setTimeout(r, 300));
      const mail = send.mock.calls.map((c) => c[0] as { subject: string; html: string }).find((m) => / asks for Earned leave/.test(m.subject));
      expect(mail?.subject).not.toMatch(/Leave: /);
      expect(mail?.html).toContain('Review in YukthiX');
      expect(mail?.html).toContain('Sent to');
      expect((await balance('emp', 'EL')).available).toBe(before.available - 2);
      // Overlap is refused, and so is more than the balance.
      expect((await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(6), to: d(6) }).expect(400)).body.message).toMatch(/already have leave/);
      expect((await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: d(29), to: d(38) }).expect(400)).body.message).toMatch(/Not enough/);
      // The peer is off too: the card says so.
      await api('peer', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(6), to: d(6) }).expect(201);
      const tasks = await inbox('mgr');
      const card = tasks.find((t) => t.title.includes('Earned leave'))!;
      expect(card.summary).toEqual(expect.arrayContaining([{ label: 'Reason', value: 'Visiting family' }]));
      expect(await inbox('emp')).toEqual([]);
      await decide('emp', card.taskId, 'approve').expect(404);
      await decide('mgr', card.taskId, 'approve').expect(200);
      await decide('mgr', card.taskId, 'approve').expect(409);
      const r = (await api('emp', 'get', `/time/requests/${ids.req1}`).expect(200)).body;
      expect(r.status).toBe('approved');
      const ledger = await inA((tx) => tx.leaveLedgerEntry.findMany({ where: { organizationId: org.A.id, requestId: ids.req1 } }));
      expect(ledger.map((l) => Number(l.days))).toEqual([-2]);
      expect((await balance('emp', 'EL')).balance).toBe(before.balance - 2);
    });

    it('a long request goes on to HR after the manager (rule: more than 3 days)', async () => {
      ids.req2 = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: d(17), to: d(20) }).expect(201)).body.id;
      const t = (await inbox('mgr')).find((x) => x.title.includes(`(4 days)`))!;
      await decide('mgr', t.taskId, 'approve').expect(200);
      const hr = (await inbox('hrAdmin')).find((x) => x.title.includes('(4 days)'))!;
      expect(hr.step.name).toBe('HR');
      expect((await api('emp', 'get', `/time/requests/${ids.req2}`).expect(200)).body.status).toBe('pending');
      await decide('hrAdmin', hr.taskId, 'reject', 'Quarter-end close').expect(200);
      expect((await api('emp', 'get', `/time/requests/${ids.req2}`).expect(200)).body.status).toBe('rejected');
    });

    it("an HR admin never approves their own leave: the HR step goes to the next tier (here the System Admin)", async () => {
      await inA((tx) => tx.leaveLedgerEntry.create({ data: { organizationId: org.A.id, employeeId: ids.hrEmp, leaveTypeId: ids.EL, entryOn: new Date(`${today}T00:00:00Z`), kind: 'opening', days: 10, reason: 'Test opening balance' } }));
      await api('hrAdmin', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: d(17), to: d(20), delegateUserId: users.other }).expect(201);
      const first = (await inbox('boss')).find((x) => x.title.startsWith('hrAdmin') && x.title.includes('(4 days)'))!;
      expect(first.summary).toEqual(expect.arrayContaining([{ label: 'Approves for them while away', value: `other ${run}` }]));
      await decide('boss', first.taskId, 'approve').expect(200);
      expect((await inbox('hrAdmin')).some((x) => x.title.startsWith('hrAdmin'))).toBe(false);
      expect((await inbox('adminA')).some((x) => x.title.startsWith('hrAdmin') && x.step.name === 'HR')).toBe(true);
    });

    it('withdraw a pending request; cancel approved leave with approval, which credits the days back', async () => {
      const w = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(8), to: d(8) }).expect(201)).body.id;
      await api('peer', 'post', `/time/me/leave/${w}/withdraw`).expect(404);
      await api('emp', 'post', `/time/me/leave/${w}/withdraw`).expect(200);
      const wf = await inA(async (tx) => tx.wfRequest.findFirstOrThrow({ where: { organizationId: org.A.id, id: (await tx.leaveRequest.findFirstOrThrow({ where: { id: w } })).wfRequestId! } }));
      expect(wf.status).toBe('withdrawn');
      expect(await inA((tx) => tx.wfTask.count({ where: { organizationId: org.A.id, requestId: wf.id, status: 'open' } }))).toBe(0);
      const before = await balance('emp', 'EL');
      await api('emp', 'post', `/time/me/leave/${ids.req1}/cancel`).send({ reason: 'Trip called off' }).expect(200);
      const t = (await inbox('mgr')).find((x) => x.title.includes('cancel'))!;
      await decide('mgr', t.taskId, 'approve').expect(200);
      expect((await api('emp', 'get', `/time/requests/${ids.req1}`).expect(200)).body.status).toBe('cancelled');
      expect((await balance('emp', 'EL')).balance).toBe(before.balance + 2);
    });
  });

  describe('who sees whose leave (P02)', () => {
    it('employee: own only; manager: team; HR: in scope; the other company: nothing', async () => {
      await api('peer', 'get', `/time/requests/${ids.req1}`).expect(404);
      await api('other', 'get', `/time/requests/${ids.req1}`).expect(404);
      await api('empB', 'get', `/time/requests/${ids.req1}`).expect(404);
      await api('adminB', 'get', `/time/requests/${ids.req1}`).expect(404);
      await api('mgr', 'get', `/time/requests/${ids.req1}`).expect(200);
      await api('boss', 'get', `/time/requests/${ids.req1}`).expect(200);
      await api('hrExec', 'get', `/time/requests/${ids.req1}`).expect(200);
      await api('emp', 'get', `/time/people/${ids.peerEmp}/ledger`).expect(404);
      await api('hrExec', 'get', `/time/people/${ids.peerEmp}/ledger`).expect(200);
      await api('emp', 'get', '/time/hr/balances').expect(403);
      const cal = (who: Who) => api(who, 'get', `/time/team/calendar?from=${today}&to=${d(30)}`).expect(200);
      const names = async (who: Who) => ((await cal(who)).body.people as { id: string }[]).map((p) => p.id).sort();
      expect(await names('emp')).toEqual([ids.empEmp]);
      expect(await names('mgr')).toEqual([ids.empEmp, ids.mgrEmp, ids.peerEmp].sort());
      expect((await names('hrExec')).length).toBeGreaterThanOrEqual(6);
      expect(await names('empB')).toEqual([ids.empBEmp]);
      const muster = async (who: Who) => ((await api(who, 'get', `/time/muster?month=${today.slice(0, 7)}`).expect(200)).body.people as { id: string }[]).map((p) => p.id).sort();
      expect(await muster('emp')).toEqual([ids.empEmp]);
      expect(await muster('mgr')).toEqual([ids.empEmp, ids.mgrEmp, ids.peerEmp].sort());
      // The added details (department, weekly offs, leave, overtime, waiting fixes) come only with people in scope.
      const mine = ((await cal('emp')).body.people as { id: string; location: string; department: string; offs: string[] }[])[0];
      expect(mine).toMatchObject({ location: 'Bengaluru', department: 'Ops' });
      expect(mine.offs).toContain(d(2));
      const row = ((await api('mgr', 'get', `/time/muster?month=${today.slice(0, 7)}`).expect(200)).body.people as { id: string; department: string; days: Record<string, unknown>[] }[]).find((p) => p.id === ids.empEmp)!;
      expect(row.department).toBe('Ops');
      for (const day of row.days) for (const k of ['leave', 'ot', 'waiting', 'wfh', 'lastOut']) expect(day).toHaveProperty(k);
    });

    it('a medical reason is Special: never to the manager or the approval card; HR with leave.medical.view reads it, audited', async () => {
      ids.sick = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.SL, from: d(15), to: d(15), reason: 'Migraine' }).expect(201)).body.id;
      const card = (await inbox('mgr')).find((t) => t.title.includes('Sick leave'))!;
      expect(JSON.stringify(card.summary)).not.toContain('Migraine');
      expect((await api('mgr', 'get', `/time/requests/${ids.sick}`).expect(200)).body.reason).toBeNull();
      expect((await api('hrExec', 'get', `/time/requests/${ids.sick}`).expect(200)).body.reason).toBeNull();
      expect((await api('emp', 'get', `/time/requests/${ids.sick}`).expect(200)).body.reason).toBe('Migraine');
      expect((await api('hrAdmin', 'get', `/time/requests/${ids.sick}`).expect(200)).body.reason).toBe('Migraine');
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.medical.viewed', entityId: ids.sick } }))).toBe(1);
      // More than 2 days of sick leave needs a certificate; HR verifies it, the card shows only its status.
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.SL, from: d(31), to: d(34) }).expect(400);
      const cert = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.SL, from: d(31), to: d(34), certificate: true }).expect(201)).body.id;
      await api('hrExec', 'post', `/time/requests/${cert}/certificate/verify`).expect(403);
      await api('hrAdmin', 'post', `/time/requests/${cert}/certificate/verify`).expect(200);
      expect((await inbox('mgr')).find((t) => t.title.includes('Sick') && t.title.includes('4 days'))!.summary).toEqual(expect.arrayContaining([{ label: 'Certificate', value: 'To be given · pending' }]));
    });
  });

  describe('delegation while the approver is away (P03 Q3) and the Service Desk seam', () => {
    it('approved leave of the manager hands their approvals to their own manager, and the desk sees them on leave', async () => {
      const pending = (await inbox('mgr')).length;
      expect(pending).toBeGreaterThan(0);
      const mine = (await api('mgr', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: today, to: today }).expect(201)).body.id;
      const t = (await inbox('boss')).find((x) => x.title.includes('Earned leave'))!;
      await decide('boss', t.taskId, 'approve').expect(200);
      expect((await api('mgr', 'get', `/time/requests/${mine}`).expect(200)).body.status).toBe('approved');
      // Open tasks moved at once; the new request lands with the boss on behalf of the manager.
      expect(await inbox('mgr')).toEqual([]);
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(22), to: d(22) }).expect(201);
      const moved = (await inbox('boss')).filter((x) => x.onBehalfOf);
      expect(moved.length).toBeGreaterThanOrEqual(pending + 1);
      const away = await inA((tx) => tickets.leaveToday(tx, org.A.id, [users.mgr, users.emp], new Date()));
      expect(away).toEqual([{ userId: users.mgr, part: 'full' }]);
    });
  });

  describe('attendance', () => {
    it('punches: inside the geofence accepted; outside refused with a plain reason and logged; duplicates ignored', async () => {
      const out = (await api('emp', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9716, lng: 77.6026, accuracyM: 20 }).expect(200)).body;
      expect(out).toMatchObject({ accepted: false });
      expect(out.message).toMatch(/^Outside Bengaluru, \d+ m away$/);
      const ok = (await api('emp', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9717, lng: 77.5947, accuracyM: 20 }).expect(200)).body;
      expect(ok).toMatchObject({ accepted: true, verdict: 'inside' });
      expect((await api('emp', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9717, lng: 77.5947, accuracyM: 20 }).expect(200)).body.duplicate).toBe(true);
      await api('emp', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9717 }).expect(400);
      const rows = await inA((tx) => tx.punch.findMany({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }));
      expect(rows.map((r) => r.accepted).sort()).toEqual([false, true]);
      const me = (await api('emp', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me.next).toBe('out');
      expect(me.fences).toEqual([{ name: 'Bengaluru', lat: 12.9716, lng: 77.5946, radiusM: 150 }]);
      // Day cards: the manager in scope, never the peer or the other company.
      expect((await api('mgr', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(200)).body).toHaveProperty('shift');
      await api('peer', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(404);
      await api('empB', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(404);
    });

    it('a fix goes to the manager; beyond the monthly limit HR approves too; approval re-evaluates the day', async () => {
      await api('emp', 'post', '/time/me/regularise').send({ on: d(1), kind: 'full_day', reason: 'Client visit all day long' }).expect(400);
      await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'missed_out', reason: 'Forgot to check out at the gate' }).expect(400);
      const r = (await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'full_day', reason: 'Client visit all day' }).expect(201)).body;
      expect(r.hrStep).toBe(false);
      await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'full_day', reason: 'Again for the same day' }).expect(409);
      const t = (await inbox('boss')).find((x) => x.title.includes('fix'))!;
      await decide('boss', t.taskId, 'approve').expect(200);
      const day = await inA((tx) => tx.attendanceDay.findFirst({ where: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${d(-1)}T00:00:00Z`) } }));
      expect(day).toMatchObject({ status: 'present', regularised: true });
      await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'attendance.regularise_monthly_limit', value: '0' } }));
      const second = (await api('peer', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'missed_in', inMinute: 600, reason: 'Badge reader down' }).expect(201)).body;
      expect(second.hrStep).toBe(true);
    });

    it('optional holidays: choose up to the calendar limit', async () => {
      await api('emp', 'post', `/time/me/holidays/${ids.optional}/choose`).expect(200);
      expect((await api('emp', 'post', `/time/me/holidays/${ids.optional2}/choose`).expect(409)).body.message).toMatch(/1 optional/);
      await api('empB', 'post', `/time/me/holidays/${ids.optional}/choose`).expect(404);
      // A chosen optional holiday is a holiday in the day count.
      expect((await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.CL, from: d(25), to: d(25) }).expect(200)).body.total).toBe(0);
    });
  });

  describe('locations and geofences in Time (TIM-31, founder decision 20 Oct 2026)', () => {
    const checkIn = (over: object = {}) => ({ fences: [{ name: 'Main block', lat: 12.9716, lng: 77.5946, radiusM: 150 }, { name: 'Annexe', lat: 12.98, lng: 77.6, radiusM: 100 }], ipRanges: ['198.51.100.0/24'], wifiNames: ['TF-Office'], bindDevice: true, ...over });

    it('only the set-up key, for the whole company, changes check-in; bad input is refused; Settings shows the same points', async () => {
      await api('hrExec', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn()).expect(403);
      await api('emp', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn()).expect(403);
      await api('adminB', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn()).expect(404);
      await api('hrAdmin', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn({ ipRanges: ['10.0.0.300/8'] })).expect(400);
      await api('hrAdmin', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn({ fences: [{ name: 'Tiny', lat: 12.97, lng: 77.59, radiusM: 20 }] })).expect(400);
      await api('hrAdmin', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn()).expect(200);
      const loc = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body.locations.find((l: { id: string }) => l.id === ids.locA);
      expect(loc).toMatchObject({ ipRanges: ['198.51.100.0/24'], wifiNames: ['TF-Office'], bindDevice: true });
      expect(loc.fences.map((f: { name: string }) => f.name)).toEqual(['Main block', 'Annexe']);
      // One source of truth: Settings › Locations reads the same points.
      const inSettings = (await api('adminA', 'get', '/org/locations').expect(200)).body.find((l: { id: string }) => l.id === ids.locA);
      expect(inSettings.fences.map((f: { name: string }) => f.name)).toEqual(['Main block', 'Annexe']);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.location.checkin_changed' } }))).toBeGreaterThan(0);
      // Company B's set-up never shows company A's points.
      expect((await api('adminB', 'get', '/time/setup').expect(200)).body.locations.flatMap((l: { fences: { name: string }[] }) => l.fences.map((f) => f.name))).not.toContain('Annexe');
    });

    it('a punch is checked against every point; the first phone is bound; another phone is refused until HR resets it', async () => {
      const punch = (kind: string, lat: number, lng: number, deviceId?: string) => api('peer', 'post', '/time/me/punch').send({ kind, lat, lng, accuracyM: 20, ...(deviceId ? { deviceId } : {}) }).expect(200);
      const phone1 = randomUUID();
      const phone2 = randomUUID();
      // Far from both points: refused with the nearest one's distance.
      expect((await punch('in', 13.05, 77.7, phone1)).body).toMatchObject({ accepted: false, verdict: 'outside' });
      // No key from a site that binds phones: refused in plain words.
      expect((await punch('in', 12.98, 77.6)).body).toMatchObject({ accepted: false, verdict: 'other_phone' });
      // Inside the second point (the Annexe): accepted, and this phone is bound (only its hash is kept).
      expect((await punch('in', 12.9801, 77.6001, phone1)).body).toMatchObject({ accepted: true, verdict: 'inside' });
      const bound = await inA((tx) => tx.checkinDevice.findFirst({ where: { organizationId: org.A.id, employeeId: ids.peerEmp } }));
      expect(bound?.deviceHash).toHaveLength(64);
      expect(bound?.deviceHash).not.toContain(phone1);
      // Inside the first point, from another phone: refused.
      expect((await punch('out', 12.9716, 77.5946, phone2)).body).toMatchObject({ accepted: false, verdict: 'other_phone', message: expect.stringMatching(/bound to another phone/) });
      // HR resets it: only with the set-up key, only in their company.
      await api('hrExec', 'post', `/time/setup/phones/${ids.peerEmp}/reset`).expect(403);
      await api('adminB', 'post', `/time/setup/phones/${ids.peerEmp}/reset`).expect(404);
      await api('hrAdmin', 'post', `/time/setup/phones/${ids.peerEmp}/reset`).expect(200);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.phone.reset' } }))).toBe(1);
      expect((await punch('out', 12.9716, 77.5946, phone2)).body).toMatchObject({ accepted: true, verdict: 'inside' });
      // Back to one point and no binding for the tests after this one.
      await api('hrAdmin', 'put', `/time/setup/locations/${ids.locA}/checkin`).send(checkIn({ fences: [{ name: 'Main point', lat: 12.9716, lng: 77.5946, radiusM: 150 }], ipRanges: [], wifiNames: [], bindDevice: false })).expect(200);
    });
  });

  describe('dated versions of a leave type (TIM-27, founder decision 20 Oct 2026)', () => {
    it('a change applies from a chosen date; leave before it, and leave already asked for, keep the old rules', async () => {
      const total = async (from: string, to: string) => (await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.CL, from, to }).expect(200)).body.total;
      const mine = async () => (await api('emp', 'get', '/time/me/leave').expect(200)).body as { balances: { code: string; balance: number; pending: number }[]; requests: { id: string; days: number; status: string }[] };
      // d(2) and d(23) are the location's weekly off: CL never counts them (version 1).
      expect(await total(d(1), d(3))).toBe(2);
      expect(await total(d(22), d(24))).toBe(2);
      const before = await mine();
      const body = { code: 'CL', name: 'Casual leave', kind: 'casual', paid: true, rules: { sandwich: 'always' } };
      await api('hrExec', 'put', `/time/setup/types/${ids.CL}`).send({ ...body, validFrom: d(20) }).expect(403);
      await api('adminB', 'put', `/time/setup/types/${ids.CL}`).send({ ...body, validFrom: d(20) }).expect(404);
      await api('hrAdmin', 'put', `/time/setup/types/${ids.CL}`).send({ ...body, validFrom: d(-1) }).expect(400);
      await api('hrAdmin', 'put', `/time/setup/types/${ids.CL}`).send({ ...body, validFrom: d(20) }).expect(200);
      // Version 2 from d(20): leave starting before it keeps version 1; leave starting on or after it follows version 2.
      expect(await total(d(1), d(3))).toBe(2);
      expect(await total(d(22), d(24))).toBe(3);
      const after = await mine();
      expect(after.requests).toEqual(before.requests);
      expect(after.balances).toEqual(before.balances);
      const t = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === ids.CL);
      expect(t).toMatchObject({ version: 1, rules: { sandwich: 'none' } });
      expect(t.versions.map((v: { version: number; validFrom: string }) => [v.version, v.validFrom])).toEqual([[2, d(20)], [1, today]]);
      // A version used on an earlier day never changes, even through the database (the app role, RLS on); none is removed.
      const old = await inA(async (tx) => {
        const t = await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'OLDL', name: 'Old leave', kind: 'other' } });
        await tx.leaveTypeVersion.create({ data: { organizationId: org.A.id, leaveTypeId: t.id, version: 1, validFrom: new Date(`${d(-5)}T00:00:00Z`) } });
        return t.id;
      });
      await expect(inA((tx) => tx.leaveTypeVersion.updateMany({ where: { organizationId: org.A.id, leaveTypeId: old }, data: { note: 'x' } }))).rejects.toThrow(/YX_VERSION_IN_FORCE/);
      await expect(inA((tx) => tx.leaveTypeVersion.deleteMany({ where: { organizationId: org.A.id, leaveTypeId: ids.CL } }))).rejects.toThrow();
      // The live example: only the set-up key, only this company; balances only with leave.view for the whole company.
      await api('hrExec', 'get', `/time/setup/types/${ids.CL}/example`).expect(403);
      await api('adminB', 'get', `/time/setup/types/${ids.CL}/example`).expect(404);
      const example = (await api('hrAdmin', 'get', `/time/setup/types/${ids.CL}/example`).expect(200)).body.people as { employeeId: string; policy: { name: string } }[];
      expect(example.length).toBeGreaterThan(0);
      expect(example.every((x) => x.policy.name === 'Karnataka staff')).toBe(true);
      // The other company never sees the versions.
      expect((await api('adminB', 'get', '/time/setup').expect(200)).body.types).toEqual([]);
    });
  });

  describe('leave type rules enforced on the server (TIM-27, founder decisions 20 Oct 2026)', () => {
    const rulesType = async (code: string, rules: object, kind = 'other') =>
      (await api('hrAdmin', 'post', '/time/setup/types').send({ code, name: `${code} leave`, kind, paid: true, rules: { negativeLimit: 30, ...rules } }).expect(201)).body.id as string;
    const plan = async (who: Who, leaveTypeId: string, from: string, to: string, extra: object = {}) => (await api(who, 'post', '/time/me/leave/preview').send({ leaveTypeId, from, to, ...extra }).expect(200)).body as { total: number; blocks: string[]; warnings: string[] };

    it('notice, blocked dates, months worked, most days in a month and hours: each refused with the rule in plain words', async () => {
      const id = await rulesType('RL', { noticeDays: 2, blockedDates: [{ from: d(30), to: d(31), reason: 'Year-end audit' }], maxDaysPerMonth: 2, hourly: true });
      // The type goes into the policy from today, so people can apply for it.
      const setup = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body;
      const lines = setup.policies.find((x: { id: string }) => x.id === ids.policy).versions[0].lines;
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: today, lines: [...lines, { leaveTypeId: id, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: null }] }).expect(201);
      expect((await plan('emp', id, d(1), d(1))).blocks).toContain("RL leave needs 2 days' notice.");
      expect((await plan('emp', id, d(31), d(31))).blocks.join(' ')).toMatch(/is a company block date for RL leave \(Year-end audit\)\. Pick other dates\./);
      expect((await plan('emp', id, d(40), d(46))).blocks.join(' ')).toMatch(/RL leave is at most 2 days in a month/);
      // By the hour: one day, a share of the day; a type without the rule refuses it.
      const hours = await plan('emp', id, d(5), d(5), { hours: 2 });
      expect(hours.total).toBeGreaterThan(0);
      expect(hours.total).toBeLessThan(1);
      expect(hours.blocks.join(' ')).not.toMatch(/by the hour/);
      expect((await plan('emp', ids.CL, d(5), d(5), { hours: 2 })).blocks).toContain("Casual leave can't be taken by the hour.");
      await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: id, from: d(5), to: d(6), hours: 2 }).expect(400);
      await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: id, from: d(5), to: d(5), hours: 2.2 }).expect(400);
      // Hours off are applied and stored as hours.
      const r = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: id, from: d(5), to: d(5), hours: 2, reason: 'Bank visit' }).expect(201)).body;
      expect(await inA((tx) => tx.leaveRequest.findFirst({ where: { organizationId: org.A.id, id: r.id }, select: { hours: true } }))).toMatchObject({ hours: expect.anything() });
      // Months worked: emp joined three days ago.
      const svc = await rulesType('SV', { minServiceMonths: 6 });
      expect((await plan('emp', svc, d(10), d(10))).blocks.join(' ')).toMatch(/SV leave can be taken after 6 months of work: from /);
      // Employment types: permanent staff only lets a permanent employee through.
      const perm = await rulesType('PM', { employment: 'permanent' });
      expect((await plan('emp', perm, d(10), d(10))).blocks.join(' ')).not.toMatch(/is for permanent staff only/);
      // Unpaid leave cannot be taken by the hour; a monthly limit below the request limit is refused at set-up.
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'UH', name: 'Unpaid hours', kind: 'other', paid: false, rules: { hourly: true } }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'ML2', name: 'Limits', kind: 'other', paid: true, rules: { maxDays: 5, maxDaysPerMonth: 2 } }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'BD', name: 'Bad dates', kind: 'other', paid: true, rules: { blockedDates: [{ from: d(5), to: d(1), reason: 'x' }] } }).expect(400);
    });

    it('during notice: not allowed, counted as unpaid leave, or the last working day moves when approved', async () => {
      // "other" is serving notice until d(40).
      await inA(async (tx) => {
        const e = await tx.employee.findFirstOrThrow({ where: { organizationId: org.A.id, id: ids.otherEmp }, select: { personId: true } });
        const m = await tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.otherEmp }, select: { id: true } });
        ids.exitCase = (await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: m.id, employeeId: ids.otherEmp, personId: e.personId, exitType: 'resignation', initiatedBy: 'employee', submittedOn: asDay(today), noticePeriod: '30d', standardLwd: asDay(d(40)), approvedLwd: asDay(d(40)), status: 'accepted' } })).id;
      });
      const blocked = await rulesType('NB', { duringNotice: 'blocked' });
      const unpaid = await rulesType('NU', { duringNotice: 'unpaid' });
      const moves = await rulesType('NE', { duringNotice: 'extends' });
      const setup = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body;
      const lines = setup.policies.find((x: { id: string }) => x.id === ids.policy).versions[0].lines;
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: d(1), lines: [...lines, ...[blocked, unpaid, moves].map((leaveTypeId) => ({ leaveTypeId, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: null }))] }).expect(201);
      expect((await plan('other', blocked, d(5), d(5))).blocks).toContain("NB leave can't be taken during your notice period.");
      expect((await plan('peer', blocked, d(5), d(5))).blocks.join(' ')).not.toMatch(/notice period/);
      // Counted as unpaid: recorded as the company's unpaid type.
      expect((await plan('other', unpaid, d(6), d(6))).warnings).toContain('You are serving notice: these days will be counted as loss of pay.');
      const u = (await api('other', 'post', '/time/me/leave').send({ leaveTypeId: unpaid, from: d(6), to: d(6), reason: 'Moving house' }).expect(201)).body;
      expect((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { organizationId: org.A.id, id: u.id } }))).leaveTypeId).toBe(ids.LOP);
      // Moves the last working day: said when asked, done when approved.
      expect((await plan('other', moves, d(8), d(8))).warnings.join(' ')).toMatch(/your last working day moves from .* \(1 day\)/);
      await api('other', 'post', '/time/me/leave').send({ leaveTypeId: moves, from: d(8), to: d(8), reason: 'Exam' }).expect(201);
      const t = (await inbox('boss')).find((x) => x.title.startsWith('other ') && x.title.includes('NE leave'))!;
      await decide('boss', t.taskId, 'approve').expect(200);
      const k = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { organizationId: org.A.id, id: ids.exitCase } }));
      expect(k.approvedLwd!.toISOString().slice(0, 10)).toBe(d(41));
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'exit.lwd.moved_by_leave' } }))).toBe(1);
    });

    it('pay is dated: a change to unpaid from a date leaves earlier days paid', async () => {
      const id = await rulesType('PD', {});
      await api('hrAdmin', 'put', `/time/setup/types/${id}`).send({ code: 'PD', name: 'PD leave', kind: 'other', paid: false, rules: { negativeLimit: 30 }, validFrom: d(20) }).expect(200);
      const paidOn = async (on: string) => (await inA((tx) => tx.$queryRaw<{ p: boolean }[]>`SELECT leave_type_paid_on(${org.A.id}::uuid, ${id}::uuid, ${on}::date) AS p`))[0].p;
      expect(await paidOn(d(5))).toBe(true);
      expect(await paidOn(d(25))).toBe(false);
      const t = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === id);
      expect(t).toMatchObject({ paid: true, version: 1 });
      expect(t.versions.map((v: { version: number; paid: boolean }) => [v.version, v.paid])).toEqual([[2, false], [1, true]]);
    });
  });

  describe('Time menu counts (TIM nav)', () => {
    it('exceptions and requests only for someone who may open their page, in scope and in their company', async () => {
      const counts = async (who: Who) => (await api(who, 'get', '/workspace/counts').expect(200)).body as { timeExceptions?: number; timeRequests?: number };
      // No grant and no team: no count at all.
      const emp = await counts('emp');
      expect(emp.timeExceptions).toBeUndefined();
      expect(emp.timeRequests).toBeUndefined();
      expect((await counts('empB')).timeRequests).toBeUndefined();
      // A manager sees their team's waiting requests, not the exceptions (no attendance.view).
      const mgr = await counts('mgr');
      expect(mgr.timeExceptions).toBeUndefined();
      const waiting = await inA((tx) => tx.leaveRequest.count({ where: { organizationId: org.A.id, status: { in: ['pending', 'cancel_pending'] }, employeeId: { in: [ids.empEmp, ids.peerEmp] } } }));
      expect(mgr.timeRequests).toBeGreaterThanOrEqual(waiting);
      // HR with attendance.view and leave.view sees both, for the whole company.
      const hr = await counts('hrExec');
      expect(typeof hr.timeExceptions).toBe('number');
      expect(hr.timeRequests).toBeGreaterThanOrEqual(mgr.timeRequests!);
      // The other company's admin counts only their own company's requests.
      expect((await counts('adminB')).timeRequests ?? 0).toBe(0);
    });
  });

  describe('clocking in again after clocking out (founder decision 21 Oct 2026)', () => {
    it('off: a second clock-in is refused; only HR turns it on; on: it is allowed and the day sums the sessions', async () => {
      // "peer" clocked in and out today (the geofence test above). The location's shift does not allow it: refused.
      const again = () => api('peer', 'post', '/time/me/punch').send({ kind: 'in', lat: 12.9716, lng: 77.5946, accuracyM: 20 });
      expect((await again().expect(409)).body.message).toMatch(/already clocked out today/);
      // Only the set-up key changes it, from a date, for the whole company.
      const rule = { shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: offWeekday }], checkIn: 'restricted', reclockIn: true };
      await api('hrExec', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: d(3), ...rule }).expect(403);
      await api('emp', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: d(3), ...rule }).expect(403);
      await api('adminB', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: d(3), ...rule }).expect(404);
      await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: d(3), ...rule }).expect(201);
      const loc = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body.locations.find((l: { id: string }) => l.id === ids.locA);
      expect(loc.upcoming.find((r: { validFrom: string }) => r.validFrom === d(3))).toMatchObject({ reclockIn: true });
      // Per shift: HR gives peer a shift that allows it, from today; then the second clock-in is accepted, still checked for the place.
      const shift = { code: 'RC', name: 'Split day', colour: 'teal', night: false, reclockIn: true, validFrom: today, start: 1, end: 1439, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300 };
      await api('hrExec', 'post', '/time/shifts').send(shift).expect(403);
      const rc = (await api('hrAdmin', 'post', '/time/shifts').send(shift).expect(201)).body.id;
      const pattern = (await api('hrAdmin', 'post', '/time/patterns').send({ name: 'Split days', kind: 'weekly', cycle: [rc, rc, rc, rc, rc, rc, rc] }).expect(201)).body.id;
      for (const e of [ids.peerEmp, ids.otherEmp]) await api('hrAdmin', 'post', `/time/patterns/${pattern}/assign`).send({ scopeType: 'employee', scopeId: e, validFrom: today, offsetDays: 0 }).expect(201);
      expect((await api('peer', 'post', '/time/me/punch').send({ kind: 'in', lat: 13.05, lng: 77.7, accuracyM: 20 }).expect(200)).body).toMatchObject({ accepted: false, verdict: 'outside' });
      expect((await again().expect(200)).body).toMatchObject({ accepted: true, verdict: 'inside' });
      expect((await api('peer', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body.shift).toMatchObject({ reclockIn: true });
      // The day engine adds the sessions: 9:30-13:30 and 15:30-19:00, less the 30-minute break rule (other is on the split shift today).
      const on = today;
      await inA((tx) =>
        tx.punch.createMany({
          data: (
            [
              ['in', 570],
              ['out', 810],
              ['in', 930],
              ['out', 1140],
            ] as const
          ).map(([kind, minute]) => ({ organizationId: org.A.id, employeeId: ids.otherEmp, punchedAt: instantAt(on, 'Asia/Kolkata', minute), workOn: new Date(`${on}T00:00:00Z`), kind, accepted: true, verdict: 'inside' })),
        }),
      );
      await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => dayEngine.evaluate(tx, { organizationId: org.A.id, isSuperAdmin: false }, ids.otherEmp, on, on));
      const day = await inA((tx) => tx.attendanceDay.findFirst({ where: { organizationId: org.A.id, employeeId: ids.otherEmp, workOn: new Date(`${on}T00:00:00Z`) } }));
      expect(day?.workedMinutes).toBe(4 * 60 + 3.5 * 60 - 30);
    });
  });

  describe('a fix needs a real note (founder decision 21 Oct 2026)', () => {
    it('a short reason is refused in plain words; the note reaches the approver in Approvals and the email, and stays with the day', async () => {
      const short = await api('other', 'post', '/time/me/regularise').send({ on: d(-2), kind: 'full_day', inMinute: 570, outMinute: 1110, reason: '  forgot  ' }).expect(400);
      expect(JSON.stringify(short.body)).toMatch(/Please say why, in a few words, so your manager can check it/);
      await api('other', 'post', '/time/me/wfh').send({ on: d(5), reason: 'home' }).expect(400);
      emailSend.mockClear();
      const note = 'The gate reader at Bengaluru was down all morning';
      await api('other', 'post', '/time/me/regularise').send({ on: d(-2), kind: 'full_day', inMinute: 570, outMinute: 1110, reason: note }).expect(201);
      const task = (await inbox('boss')).find((x) => x.title.startsWith('other ') && x.title.includes('fix'))!;
      expect(task.summary.find((s) => s.label === 'Why')?.value).toBe(note);
      // Notices go out after the commit: wait for the approver's email.
      for (let i = 0; i < 50 && !JSON.stringify(emailSend.mock.calls).includes(note); i++) await new Promise((r) => setTimeout(r, 200));
      expect(JSON.stringify(emailSend.mock.calls)).toContain(note);
      // The day card keeps the note, for the manager and HR to check later.
      const card = (await api('hrExec', 'get', `/time/people/${ids.otherEmp}/days/${d(-2)}`).expect(200)).body;
      expect(card.requests.map((r: { reason: string }) => r.reason)).toContain(note);
      await api('peer', 'get', `/time/people/${ids.otherEmp}/days/${d(-2)}`).expect(404);
    });
  });
});
