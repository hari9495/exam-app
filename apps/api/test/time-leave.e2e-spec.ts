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
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', geoLat: 12.9716, geoLng: 77.5946, geoRadiusM: 150 } })).id;
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
      // Batch C item 15 (answer 2509): attendance dots only for the viewer's own reporting line, up to today.
      const day = new Date(Date.now()).toISOString().slice(0, 10);
      const at = new Date(`${day}T00:00:00Z`);
      await inA((tx) => tx.attendanceDay.upsert({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: ids.empEmp!, workOn: at } }, create: { organizationId: org.A.id, employeeId: ids.empEmp!, workOn: at, mode: 'punch', status: 'present', lateMinutes: 15, workedMinutes: 480 }, update: { status: 'present', lateMinutes: 15 } }));
      type Row = { id: string; attendance?: { on: string; dot: string }[] };
      const rows = async (who: Who) => (await api(who, 'get', `/time/team/calendar?from=${day}&to=${d(30)}`).expect(200)).body.people as Row[];
      const mgrRows = await rows('mgr');
      expect(mgrRows.find((r) => r.id === ids.empEmp)?.attendance).toEqual([{ on: day, dot: 'late' }]);
      // Their own row and a peer outside their line: no dots.
      expect(mgrRows.find((r) => r.id === ids.mgrEmp)?.attendance).toBeUndefined();
      // HR with leave.view company-wide sees the people but no dots (not their team); the employee sees none either.
      expect((await rows('hrExec')).find((r) => r.id === ids.empEmp)?.attendance).toBeUndefined();
      expect((await rows('emp')).every((r) => r.attendance === undefined)).toBe(true);
      // Another company never sees A's people.
      expect((await rows('empB')).some((r) => r.id === ids.empEmp)).toBe(false);
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
    it("no manager to approve: HR gets the leave, and the HR Admins' notice names HR (not a desk's team leads)", async () => {
      const res = (await api('boss', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(40), to: d(40), reason: 'Personal' }).expect(201)).body;
      const notice = await inA((tx) => tx.userNotification.findFirst({ where: { recipientUserId: users.hrAdmin, type: 'workflow.approval.no_approver' }, orderBy: { createdAt: 'desc' } }));
      expect(notice?.contextText).toMatch(/so HR got it\. Check the person's manager on their record/);
      expect(notice?.contextText).not.toMatch(/team leads|cost-centre/);
      expect(res).toBeTruthy();
    });

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
      const card = (await api('mgr', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(200)).body;
      // The day's shift goes with the card (shift bar and late mark), or null on a weekly off.
      expect(card.shift === null || (typeof card.shift.name === 'string' && typeof card.shift.start === 'number' && typeof card.shift.grace === 'number')).toBe(true);
      await api('peer', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(404);
      await api('empB', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(404);
    });

    it('a fix goes to the manager; beyond the monthly limit HR approves too; approval re-evaluates the day', async () => {
      await api('emp', 'post', '/time/me/regularise').send({ on: d(1), kind: 'full_day', reason: 'x' }).expect(400);
      expect((await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'full_day', reason: 'Was there' }).expect(400)).body.message).toEqual(['Please say why, in at least 10 characters, so your manager can check it.']);
      await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'missed_out', reason: 'Forgot to clock out' }).expect(400);
      const r = (await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'full_day', reason: 'Client visit all day' }).expect(201)).body;
      expect(r.hrStep).toBe(false);
      await api('emp', 'post', '/time/me/regularise').send({ on: d(-1), kind: 'full_day', reason: 'Asking again for this day' }).expect(409);
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

  // ------------------------------------------------------------------------------------------ small items (30 Oct 2026)
  describe('TIM-26 calendars and TIM-28 policy order', () => {
    const next = String(Number(today.slice(0, 4)) + 1);
    const setup = async () => (await api('hrAdmin', 'get', '/time/setup').expect(200)).body;
    const calOf = async () => (await setup()).calendars.find((c: { id: string }) => c.id === ids.cal);

    it('calendar rules: weekly-off rule and the move rule are saved; bad values and other roles refused', async () => {
      await api('hrAdmin', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, onWeeklyOff: 'sometimes' }).expect(400);
      await api('hrExec', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, onWeeklyOff: 'substitute' }).expect(403);
      await api('adminB', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, onWeeklyOff: 'substitute' }).expect(404);
      await api('hrAdmin', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 1, onWeeklyOff: 'none', onMove: 'reset' }).expect(200);
      expect(await calOf()).toEqual(expect.objectContaining({ onWeeklyOff: 'none', onMove: 'reset' }));
      const row = await inA((tx) => tx.setting.findFirst({ where: { key: 'leave.optional_holiday.prorate_on_move', scopeType: 'location', scopeId: ids.locA } }));
      expect(row!.value).toBe('no');
      await api('hrAdmin', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 1, onMove: 'share' }).expect(200);
      expect((await calOf()).onMove).toBe('share');
    });

    it('a holiday on a weekly off gives the next working day off with the substitute rule only', async () => {
      // d(9) falls on the location's weekly off (the weekday of d(2)); its substitute is d(10).
      const h = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(9), name: 'Weekly-off festival', kind: 'national' }).expect(201)).body.id as string;
      // A preview with no days to count earlier in this suite used to break the next previews (a cached array type); fixed in plan().
      const total = async () => (await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.CL, from: d(10), to: d(10) }).expect(200)).body.total;
      expect(await total()).toBe(1);
      await api('hrAdmin', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 1, onWeeklyOff: 'substitute' }).expect(200);
      expect(await total()).toBe(0);
      await api('hrAdmin', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 1, onWeeklyOff: 'none' }).expect(200);
      await api('hrAdmin', 'post', `/time/setup/holidays/${h}/remove`).expect(200);
    });

    it('change date: a future holiday moves in its year; past, other year, clashes and other companies refused', async () => {
      const h = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(13), name: 'Movable day', kind: 'festival' }).expect(201)).body.id as string;
      await api('hrAdmin', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(-1) }).expect(400);
      await api('hrAdmin', 'post', `/time/setup/holidays/${h}/date`).send({ on: `${next}-01-15` }).expect(400);
      await api('hrAdmin', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(12) }).expect(409);
      await api('hrAdmin', 'post', `/time/setup/holidays/${h}/date`).send({ on: 'tomorrow' }).expect(400);
      await api('adminB', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(14) }).expect(404);
      await api('hrExec', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(14) }).expect(403);
      expect((await api('hrAdmin', 'post', `/time/setup/holidays/${h}/date`).send({ on: d(14) }).expect(200)).body).toEqual(expect.objectContaining({ id: h, on: d(14) }));
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'holiday.date_changed', entityId: h } }))).toBe(1);
      await api('hrAdmin', 'post', `/time/setup/holidays/${h}/remove`).expect(200);
    });

    it('clone to next year: a draft with festival dates to confirm; publish only after; drafts never reach employees', async () => {
      await api('hrExec', 'post', `/time/setup/calendars/${ids.cal}/clone`).expect(403);
      await api('adminB', 'post', `/time/setup/calendars/${ids.cal}/clone`).expect(404);
      // A feed change waiting for this calendar blocks the clone.
      const feed = await inA((tx) => tx.holidayFeed.create({ data: { organizationId: org.A.id, state: 'IN-KA', provider: 'dev-fake' } }));
      const change = await inA((tx) => tx.holidayFeedChange.create({ data: { organizationId: org.A.id, feedId: feed.id, calendarId: ids.cal, action: 'add', holidayOn: new Date(`${d(40)}T00:00:00Z`), name: 'Feed day' } }));
      expect((await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/clone`).expect(409)).body.message).toMatch(/^Review the holiday feed change first/);
      await inA((tx) => tx.holidayFeedChange.update({ where: { id: change.id }, data: { status: 'ignored' } }));
      const res = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/clone`).expect(201)).body;
      expect(res).toEqual(expect.objectContaining({ year: Number(next), toConfirm: 3 }));
      await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/clone`).expect(409);
      const cal = await calOf();
      const drafts = cal.drafts.filter((x: { on: string }) => x.on.startsWith(next));
      expect(drafts.filter((x: { confirm: boolean }) => x.confirm)).toHaveLength(3);
      expect(cal.holidays.some((x: { on: string }) => x.on.startsWith(next))).toBe(false);
      expect((await api('emp', 'get', '/time/me/leave').expect(200)).body.holidays.list.some((x: { on: string }) => x.on.startsWith(next))).toBe(false);
      expect((await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/publish`).send({ year: Number(next) }).expect(409)).body.message).toBe('Confirm the 3 festival dates first.');
      const [first, second, third] = drafts.filter((x: { confirm: boolean }) => x.confirm);
      await api('hrAdmin', 'post', `/time/setup/holiday-drafts/${first.id}/confirm`).send({ on: today }).expect(400);
      await api('hrAdmin', 'post', `/time/setup/holiday-drafts/${first.id}/confirm`).send({ on: second.on }).expect(409);
      await api('adminB', 'post', `/time/setup/holiday-drafts/${first.id}/confirm`).send({ on: first.on }).expect(404);
      for (const x of [first, second]) await api('hrAdmin', 'post', `/time/setup/holiday-drafts/${x.id}/confirm`).send({ on: x.on }).expect(200);
      await api('hrAdmin', 'post', `/time/setup/holiday-drafts/${third.id}/remove`).expect(200);
      await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/publish`).send({ year: 1999 }).expect(400);
      const pub = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/publish`).send({ year: Number(next) }).expect(200)).body;
      expect(pub.added).toBe(drafts.length - 1);
      const after = await calOf();
      expect(after.drafts).toEqual([]);
      expect(after.publishedAt).toEqual(expect.any(String));
      expect(after.holidays.filter((x: { on: string }) => x.on.startsWith(next))).toHaveLength(drafts.length - 1);
      await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/publish`).send({ year: Number(next) }).expect(404);
      const actions = (await inA((tx) => tx.auditLog.findMany({ where: { entityId: ids.cal }, select: { action: true } }))).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['holiday.calendar.cloned', 'holiday.draft.confirmed', 'holiday.draft.removed', 'holiday.calendar.published']));
    });

    it('state template: a location without holidays starts from its state as a draft; no template for an unknown state', async () => {
      const [ka, zz] = await inA(async (tx) => {
        const o = { organizationId: org.A.id, legalEntityId: ids.entityA, address: {}, country: 'IN', timezone: 'Asia/Kolkata' };
        return [(await tx.location.create({ data: { ...o, name: 'Mysuru', code: 'MYS', state: 'IN-KA' } })).id, (await tx.location.create({ data: { ...o, name: 'Nowhere', code: 'NWH', state: 'IN-ZZ' } })).id];
      });
      expect((await setup()).templates).toEqual(expect.objectContaining({ [ka]: 'Karnataka' }));
      await api('hrExec', 'post', '/time/setup/calendars/template').send({ locationId: ka }).expect(403);
      await api('hrAdmin', 'post', '/time/setup/calendars/template').send({ locationId: 'x' }).expect(400);
      await api('adminB', 'post', '/time/setup/calendars/template').send({ locationId: ka }).expect(404);
      expect((await api('hrAdmin', 'post', '/time/setup/calendars/template').send({ locationId: zz }).expect(409)).body.message).toBe('There is no state template for Nowhere. Add its holidays one by one.');
      await api('hrAdmin', 'post', '/time/setup/calendars/template').send({ locationId: ids.locA }).expect(409);
      // The dev-fake feed has Kannada Rajyotsava (1 Nov) as the only Karnataka day after the end of October.
      const res = await api('hrAdmin', 'post', '/time/setup/calendars/template').send({ locationId: ka });
      if (today <= `${today.slice(0, 4)}-11-01`) {
        expect(res.status).toBe(201);
        const cal = (await setup()).calendars.find((c: { locationId: string }) => c.locationId === ka);
        expect(cal.drafts).toEqual([expect.objectContaining({ name: 'Kannada Rajyotsava', kind: 'state', source: 'template', confirm: false })]);
        expect(cal.holidays).toEqual([]);
        await api('hrAdmin', 'post', '/time/setup/calendars/template').send({ locationId: ka }).expect(409);
        await api('hrAdmin', 'post', `/time/setup/calendars/${cal.id}/publish`).send({ year: Number(today.slice(0, 4)) }).expect(200);
        expect((await setup()).calendars.find((c: { locationId: string }) => c.locationId === ka).holidays).toHaveLength(1);
      } else {
        expect(res.status).toBe(409);
      }
    });

    it('policy order: people per policy; the order decides who gets which policy; dates and lists checked', async () => {
      const before = await setup();
      expect(before.coverage[ids.policy].people).toBeGreaterThan(0);
      expect(before.order).toEqual({ current: null, currentFrom: null, upcoming: null });
      const interns = (await api('hrAdmin', 'post', '/time/setup/policies').send({ name: 'Interns' }).expect(201)).body.id as string;
      await api('hrAdmin', 'post', `/time/setup/policies/${interns}/versions`).send({ validFrom: today, lines: [{ leaveTypeId: ids.CL, annualDays: 2, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }] }).expect(201);
      await api('hrAdmin', 'post', `/time/setup/policies/${interns}/assign`).send({ scopeType: 'location', scopeId: ids.locA, validFrom: today }).expect(201);
      // The location is more specific than the entity: everyone at it moves to Interns.
      const mid = await setup();
      expect(mid.coverage[interns].people).toBe(before.coverage[ids.policy].people);
      expect(mid.coverage[ids.policy].people).toBe(0);
      await api('hrExec', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy, interns], validFrom: today }).expect(403);
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy], validFrom: today }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy, ids.policy], validFrom: today }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy, interns], validFrom: d(-1) }).expect(400);
      await api('adminB', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy, interns], validFrom: today }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy, interns], validFrom: d(30) }).expect(201);
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [interns, ids.policy], validFrom: d(30) }).expect(201);
      expect((await setup()).order.upcoming).toEqual({ validFrom: d(30), policyIds: [interns, ids.policy] });
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [ids.policy, interns], validFrom: today }).expect(201);
      await api('hrAdmin', 'post', '/time/setup/policy-order').send({ policyIds: [interns, ids.policy], validFrom: today }).expect(409);
      const after = await setup();
      expect(after.order.current).toEqual([ids.policy, interns]);
      expect(after.coverage[ids.policy].people).toBe(before.coverage[ids.policy].people);
      expect(after.coverage[interns].people).toBe(0);
      expect(after.uncovered.count).toBe(0);
      // The person's balance follows the order too (Karnataka staff gives earned leave).
      expect((await api('emp', 'get', '/time/me/leave').expect(200)).body.balances.some((b: { code: string }) => b.code === 'EL')).toBe(true);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.policy.order_saved' } }))).toBe(3);
    });
  });
});
