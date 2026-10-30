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
import { LeaveV2Service } from '../src/time/leave-v2.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Leave v2 end to end against the real database (forced RLS, the app role) and Redis: company block dates, short
// notice, probation, the notice period and the Factories Act rule in Apply leave; comp-off claims and expiry on the
// one ledger; encashment; long absences; year end with pending requests; optional holidays over the limit; the HR
// leave home; leave reports with filters, paging and export; the block-leave planner; public-holiday feeds. For each
// action the positive path and the negatives: wrong role, another company, bad input, a repeat, a conflict.
describe('Leave v2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let leave: LeaveService;
  let v2: LeaveV2Service;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrB' | 'hrExec' | 'boss' | 'mgr' | 'emp' | 'peer' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  // The location's only weekly off is the weekday two days from today, so today is a working day.
  const offWeekday = ((new Date(`${d(2)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  // Joined at the start of this financial year (past-dated hires may go back to it).
  const fyStart = today.slice(5) >= '04-01' ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  const isOff = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1 === offWeekday;
  /** The first working day on or after today + n. */
  const work = (n: number) => (isOff(d(n)) ? d(n + 1) : d(n));
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string; summary: { label: string; value: string }[] }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision });
  const approveAll = async (title: RegExp, who: Who[]) => {
    for (const w of who) for (const t of (await inbox(w)).filter((x) => title.test(x.title))) await decide(w, t.taskId, 'approve').expect(200);
  };
  const preview = (who: Who, leaveTypeId: string, from: string, to = from) => api(who, 'post', '/time/me/leave/preview').send({ leaveTypeId, from, to }).expect(200);
  const setting = (key: string, value: string, scope: { scopeType: string; scopeId?: string } = { scopeType: 'tenant' }) => api('adminA', 'put', '/org/settings').send({ key, value, ...scope }).expect(200);
  const balance = async (who: Who, code: string) => ((await api(who, 'get', '/time/me/leave').expect(200)).body.balances as { code: string; balance: number; available: number; pending: number }[]).find((b) => b.code === code)!;

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
    v2 = moduleRef.get(LeaveV2Service);

    planId = (await prisma.plan.create({ data: { name: `leave2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Leave2 Org ${k}`, slug: `leave2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrB', 'B', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['boss', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@leave2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@leave2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Leave Foods ${k}`, shortName: `LF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', geoLat: 12.9716, geoLng: 77.5946, geoRadiusM: 150 } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Cash', code: 'CSH', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Cashier', code: 'CA' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    ids.locA2 = await inA(async (tx) => (await tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', geoLat: 13.08, geoLng: 80.27, geoRadiusM: 150 } })).id);
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', joinedOn = fyStart) =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn, userId: users[who], workEmail: `${who}@leave2-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.bossEmp = await hire('adminA', 'boss', null);
    ids.mgrEmp = await hire('adminA', 'mgr', ids.bossEmp);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', ids.bossEmp);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');

    // Set-up: earned (encashable, 3 days' notice flagged only), casual (2 days' notice refused), sick, unpaid, comp-off.
    ids.EL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, rules: { encashable: true, noticeDays: 3, noticeMode: 'warn', hrApprovalAboveDays: 15 } }).expect(201)).body.id;
    ids.CL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'casual', paid: true, rules: { noticeDays: 2 } }).expect(201)).body.id;
    ids.SL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true }).expect(201)).body.id;
    ids.LOP = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'LOP', name: 'Leave without pay', kind: 'lop', paid: false }).expect(201)).body.id;
    ids.CO = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'CO', name: 'Comp-off', kind: 'comp_off', paid: true }).expect(201)).body.id;
    ids.policy = (await api('hrAdmin', 'post', '/time/setup/policies').send({ name: 'Staff' }).expect(201)).body.id;
    await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: '2025-01-01', lines: [{ leaveTypeId: ids.EL, annualDays: 18, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 30 }, { leaveTypeId: ids.CL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }, { leaveTypeId: ids.SL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }, { leaveTypeId: ids.LOP, annualDays: 0, frequency: 'yearly', proRata: false, rounding: 0, carryForwardMax: 0 }] }).expect(201);
    await api('hrAdmin', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: '2025-01-01' }).expect(201);
    ids.cal = (await api('hrAdmin', 'post', '/time/setup/calendars').send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 2 }).expect(201)).body.id;
    for (const [n, k] of [[20, 'o1'], [21, 'o2'], [22, 'o3']] as const) ids[k] = (await api('hrAdmin', 'post', `/time/setup/calendars/${ids.cal}/holidays`).send({ on: d(n), name: `Optional ${k}`, kind: 'optional' }).expect(201)).body.id;
    await api('hrAdmin', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: today, shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: offWeekday }], checkIn: 'restricted' }).expect(201);
    await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locA, validFrom: new Date(`${d(-120)}T00:00:00Z`), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: offWeekday }] } }));
    await leave.accrue(org.A.id);
  }, 300_000);

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

  it('every new table has forced RLS and the app role cannot delete from it', async () => {
    const tables = ['leave_block_dates', 'comp_off_claims', 'leave_encashments', 'long_absences', 'block_leave_plans', 'holiday_feeds', 'holiday_feed_changes'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[])`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
    for (const t of tables) await expect(prisma.$executeRawUnsafe(`DELETE FROM ${t}`)).rejects.toThrow();
  });

  describe('company block dates', () => {
    it('only leave set-up may add them; bad input and other companies are refused', async () => {
      await api('emp', 'post', '/time/setup/block-dates').send({ from: d(10), to: d(10), reason: 'Audit', scopeType: 'tenant' }).expect(403);
      await api('hrExec', 'get', '/time/setup/block-dates').expect(403);
      await api('hrAdmin', 'post', '/time/setup/block-dates').send({ from: d(10), to: d(9), reason: 'Audit', scopeType: 'tenant' }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/block-dates').send({ from: d(-1), to: d(1), reason: 'Audit', scopeType: 'tenant' }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/block-dates').send({ from: d(10), to: d(10), reason: 'Audit', scopeType: 'location' }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/block-dates').send({ from: d(10), to: d(10), reason: 'Audit', scopeType: 'location', scopeId: ids.locB }).expect(400);
      ids.block = (await api('hrAdmin', 'post', '/time/setup/block-dates').send({ from: work(10), to: work(10), reason: 'Quality audit', scopeType: 'location', scopeId: ids.locA }).expect(201)).body.id;
      expect((await api('hrAdmin', 'get', '/time/setup/block-dates').expect(200)).body).toMatchObject({ mode: 'block', dates: [{ id: ids.block, reason: 'Quality audit' }] });
      expect((await api('adminB', 'get', '/time/setup/block-dates').expect(200)).body.dates).toEqual([]);
      await api('adminB', 'post', `/time/setup/block-dates/${ids.block}/remove`).expect(404);
    });

    it('stops planned leave on them, never sick leave; the setting turns it into a warning for the approver', async () => {
      const el = (await preview('emp', ids.EL, work(10))).body;
      expect(el.blocks.join(' ')).toMatch(/company block date \(Quality audit\)/);
      expect(el.blockDates).toHaveLength(1);
      expect((await preview('emp', ids.SL, work(10))).body.blocks).toEqual([]);
      await setting('leave.block_dates.mode', 'warn');
      const warned = (await preview('emp', ids.EL, work(10))).body;
      expect(warned.blocks).toEqual([]);
      expect(warned.warnings.join(' ')).toMatch(/Your approver sees this/);
      await setting('leave.block_dates.mode', 'block');
    });

    it('a removed block date no longer counts; removing twice is a conflict', async () => {
      await api('hrAdmin', 'post', `/time/setup/block-dates/${ids.block}/remove`).expect(200);
      await api('hrAdmin', 'post', `/time/setup/block-dates/${ids.block}/remove`).expect(409);
      expect((await preview('emp', ids.EL, work(10))).body.blockDates).toEqual([]);
    });
  });

  describe('Apply leave rules', () => {
    it('short notice is a warning for one type and a refusal for another (the type decides)', async () => {
      const el = (await preview('emp', ids.EL, work(1))).body;
      expect(el).toMatchObject({ shortNotice: true, blocks: [] });
      expect(el.warnings.join(' ')).toMatch(/Short notice/);
      expect((await preview('emp', ids.CL, work(1))).body.blocks.join(' ')).toMatch(/needs 2 days' notice. Pick a date on or after/);
      expect((await preview('emp', ids.EL, work(5))).body.shortNotice).toBe(false);
    });

    it('probation limits paid leave by the setting; an HR override lets one person through', async () => {
      const employmentId = await inA(async (tx) => (await tx.employeeAssignment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.peerEmp } })).employmentId);
      await inA((tx) => tx.probation.upsert({ where: { organizationId_employmentId: { organizationId: org.A.id, employmentId } }, create: { organizationId: org.A.id, employmentId, startOn: new Date(`${d(-30)}T00:00:00Z`), originalEndOn: new Date(`${d(60)}T00:00:00Z`), plannedEndOn: new Date(`${d(60)}T00:00:00Z`) }, update: { plannedEndOn: new Date(`${d(60)}T00:00:00Z`) } }));
      expect((await preview('peer', ids.EL, work(5))).body.blocks).toEqual([]);
      await setting('leave.probation.leave', 'casual_sick_unpaid');
      expect((await preview('peer', ids.EL, work(5))).body.blocks.join(' ')).toMatch(/on probation until .* Only casual, sick and unpaid leave/);
      expect((await preview('peer', ids.CL, work(5))).body.blocks).toEqual([]);
      expect((await preview('emp', ids.EL, work(5))).body.blocks).toEqual([]);
      await api('hrAdmin', 'post', `/time/people/${ids.peerEmp}/eligibility-override`).send({ leaveTypeId: ids.EL, validUntil: d(30), reason: 'Joined from a group company, probation waived for leave' }).expect(201);
      expect((await preview('peer', ids.EL, work(5))).body.blocks).toEqual([]);
      await setting('leave.probation.leave', 'all');
    });

    it('on notice: the last day stays, moves by the leave days, or only sick and unpaid leave is allowed', async () => {
      const a = await inA((tx) => tx.employeeAssignment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }));
      const person = await inA((tx) => tx.employee.findFirstOrThrow({ where: { organizationId: org.A.id, id: ids.empEmp } }));
      ids.exit = await inA(async (tx) => (await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: a.employmentId, employeeId: ids.empEmp, personId: person.personId, exitType: 'resignation', initiatedBy: 'employee', submittedOn: new Date(`${today}T00:00:00Z`), noticePeriod: '30d', standardLwd: new Date(`${d(40)}T00:00:00Z`), status: 'accepted', acceptedAt: new Date(), approvedLwd: new Date(`${d(40)}T00:00:00Z`) } })).id);
      const stays = (await preview('emp', ids.EL, work(5))).body;
      expect(stays.notice).toEqual({ lastDay: d(40), newLastDay: d(40) });
      await setting('leave.notice_period.leave', 'extends_last_day');
      const moves = (await preview('emp', ids.EL, work(5))).body;
      expect(moves.notice).toEqual({ lastDay: d(40), newLastDay: d(41) });
      expect(moves.warnings.join(' ')).toMatch(/moves your last working day/);
      expect((await preview('emp', ids.EL, d(41), d(42))).body.blocks.join(' ')).toMatch(/Leave can't go past it/);
      await setting('leave.notice_period.leave', 'sick_and_unpaid_only');
      expect((await preview('emp', ids.EL, work(5))).body.blocks.join(' ')).toMatch(/only sick and unpaid leave/);
      expect((await preview('emp', ids.SL, work(5))).body.blocks).toEqual([]);
      await setting('leave.notice_period.leave', 'no_change');
      await inA((tx) => tx.exitCase.update({ where: { id: ids.exit }, data: { status: 'withdrawn' } }));
      expect((await preview('emp', ids.EL, work(5))).body.notice).toBeNull();
    });

    it('in a factory, earned leave needs 240 days worked the year before (Factories Act)', async () => {
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.factories_act', scopeType: 'location', scopeId: ids.locA, value: 'covered', validFrom: '2025-01-01' }).expect(200);
      expect((await preview('emp', ids.EL, work(5))).body.blocks.join(' ')).toMatch(/needs 240 days worked in \d{4} \(Factories Act\)/);
      expect((await preview('emp', ids.CL, work(5))).body.blocks).toEqual([]);
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.factories_act', scopeType: 'location', scopeId: ids.locA, value: 'not_covered', validFrom: today }).expect(200);
      expect((await preview('emp', ids.EL, work(5))).body.blocks).toEqual([]);
    });
  });

  describe('comp-off (TIM-22)', () => {
    it('lists only weekly offs and holidays worked in the window, with the half or full day allowed', async () => {
      // Worked a weekly off a week ago (8 h 20 min) and another one two weeks ago (5 h); a working day does not count.
      ids.offFull = d(-5);
      ids.offHalf = d(-12);
      expect(isOff(ids.offFull) && isOff(ids.offHalf)).toBe(true);
      await inA((tx) => tx.attendanceDay.createMany({ data: [
        { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${ids.offFull}T00:00:00Z`), mode: 'punch', status: 'present', workedMinutes: 500 },
        { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${ids.offHalf}T00:00:00Z`), mode: 'punch', status: 'present', workedMinutes: 300 },
        { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${d(-1)}T00:00:00Z`), mode: 'punch', status: 'present', workedMinutes: 600 },
      ] }));
      const me = (await api('emp', 'get', '/time/me/comp-off').expect(200)).body;
      expect(me).toMatchObject({ enabled: true, within: 30, expiryDays: 60 });
      expect(me.eligible).toEqual([
        expect.objectContaining({ on: ids.offFull, kind: 'weekly_off', maxDays: 1 }),
        expect.objectContaining({ on: ids.offHalf, kind: 'weekly_off', maxDays: 0.5 }),
      ]);
      // The other company has no comp-off type: nothing of A's shows there.
      expect((await api('empB', 'get', '/time/me/comp-off').expect(200)).body).toMatchObject({ enabled: false, eligible: [], claims: [] });
    });

    it('claims go to the manager; a repeat, a working day, too much and bad input are refused', async () => {
      await api('emp', 'post', '/time/me/comp-off').send({ on: ids.offFull, days: 2, reason: 'Stock count' }).expect(400);
      await api('emp', 'post', '/time/me/comp-off').send({ on: ids.offFull, days: 1, reason: '' }).expect(400);
      await api('emp', 'post', '/time/me/comp-off').send({ on: d(-1), days: 1, reason: 'Stock count' }).expect(400);
      await api('emp', 'post', '/time/me/comp-off').send({ on: ids.offHalf, days: 1, reason: 'Stock count' }).expect(400);
      const c = (await api('emp', 'post', '/time/me/comp-off').send({ on: ids.offFull, days: 1, reason: 'Stock count' }).expect(201)).body;
      expect(c).toMatchObject({ status: 'pending', days: 1, useBy: addDays(ids.offFull, 60) });
      await api('emp', 'post', '/time/me/comp-off').send({ on: ids.offFull, days: 1, reason: 'Stock count again' }).expect(409);
      ids.claimHalf = (await api('emp', 'post', '/time/me/comp-off').send({ on: ids.offHalf, days: 0.5, reason: 'Vendor visit' }).expect(201)).body.id;
      await api('peer', 'post', `/time/me/comp-off/${ids.claimHalf}/withdraw`).expect(404);
      await api('emp', 'post', `/time/me/comp-off/${ids.claimHalf}/withdraw`).expect(200);
      await api('emp', 'post', `/time/me/comp-off/${ids.claimHalf}/withdraw`).expect(409);
      expect((await inbox('emp')).filter((t) => /comp-off/.test(t.title))).toEqual([]);
      const task = (await inbox('mgr')).find((t) => /comp-off/.test(t.title))!;
      expect(task.summary).toEqual(expect.arrayContaining([{ label: 'Use by', value: expect.any(String) }]));
      await decide('mgr', task.taskId, 'approve').expect(200);
      expect((await balance('emp', 'CO')).balance).toBe(1);
      await api('emp', 'post', `/time/me/comp-off/${c.id}/withdraw`).expect(409);
      // The approved day is no longer offered, and the half day can be claimed again after the withdrawal.
      expect((await api('emp', 'get', '/time/me/comp-off').expect(200)).body.eligible.map((x: { on: string }) => x.on)).toEqual([ids.offHalf]);
    });

    it('one ledger: overtime credits through the same service, and unused comp-off lapses once, oldest first', async () => {
      await inA((tx) => v2.creditCompOff(tx, { organizationId: org.A.id, employeeId: ids.empEmp, workedOn: d(-80), days: 1, key: `ot:${run}`, reason: 'Comp-off for overtime' }));
      await inA((tx) => v2.creditCompOff(tx, { organizationId: org.A.id, employeeId: ids.empEmp, workedOn: d(-80), days: 1, key: `ot:${run}`, reason: 'Repeat' }));
      expect((await balance('emp', 'CO')).balance).toBe(2);
      expect(await v2.expireCompOff(org.A.id)).toBe(1);
      expect(await v2.expireCompOff(org.A.id)).toBe(0);
      expect((await balance('emp', 'CO')).balance).toBe(1);
      const ledger = (await api('emp', 'get', '/time/me/leave/ledger').expect(200)).body;
      expect(ledger.ledger.find((l: { kind: string; reason: string }) => l.kind === 'lapse' && /not used by/.test(l.reason))).toBeTruthy();
    });
  });

  describe('encashment (TIM-24)', () => {
    it('is closed until the company opens the window', async () => {
      const me = (await api('emp', 'get', '/time/me/encashment').expect(200)).body;
      expect(me).toMatchObject({ window: 'off', open: false, maxPerYear: 7, minLeft: 7, taxNote: expect.stringMatching(/10\(10AA\)/) });
      expect((await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 2 }).expect(409)).body.message).toMatch(/final settlement/);
      await setting('leave.encashment.window', 'any_month');
    });

    it('caps by the year and the days that must stay; one request waits at a time, holding its days', async () => {
      const me = (await api('emp', 'get', '/time/me/encashment').expect(200)).body;
      const el = me.types.find((t: { leaveTypeId: string }) => t.leaveTypeId === ids.EL);
      expect(el).toMatchObject({ available: 18, max: 7 });
      await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 8 }).expect(400);
      await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 1.25 }).expect(400);
      await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.CL, days: 1 }).expect(400);
      await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 0 }).expect(400);
      const x = (await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 3 }).expect(201)).body;
      expect(x).toMatchObject({ status: 'pending', days: 3, estimate: null });
      await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 1 }).expect(409);
      expect(await balance('emp', 'EL')).toMatchObject({ balance: 18, pending: 3, available: 15 });
      ids.encash = x.id;
    });

    it('manager then HR approve; the days leave the ledger once; it cannot be withdrawn after', async () => {
      await approveAll(/cash in/, ['mgr']);
      await approveAll(/cash in/, ['hrAdmin']);
      expect(await balance('emp', 'EL')).toMatchObject({ balance: 15, pending: 0 });
      const row = await inA((tx) => tx.leaveEncashment.findFirstOrThrow({ where: { id: ids.encash } }));
      expect(row.status).toBe('approved');
      await api('emp', 'post', `/time/me/encashment/${ids.encash}/withdraw`).expect(409);
      expect((await api('emp', 'get', '/time/me/encashment').expect(200)).body.types.find((t: { leaveTypeId: string }) => t.leaveTypeId === ids.EL)).toMatchObject({ encashedThisYear: 3, max: 4 });
    });

    it('a waiting request can be withdrawn by its owner only', async () => {
      const x = (await api('emp', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 1 }).expect(201)).body;
      await api('peer', 'post', `/time/me/encashment/${x.id}/withdraw`).expect(404);
      await api('emp', 'post', `/time/me/encashment/${x.id}/withdraw`).expect(200);
      expect((await balance('emp', 'EL')).pending).toBe(0);
      await setting('leave.encashment.window', 'off');
    });
  });

  describe('long absences (TIM-25)', () => {
    it('HR with the adjust key records a sabbatical; others, own record, other companies and bad dates are refused', async () => {
      const body = { employeeId: ids.peerEmp, kind: 'sabbatical', from: d(60), to: d(150), note: 'Sabbatical for higher studies' };
      await api('hrExec', 'post', '/time/hr/long-absences').send(body).expect(403);
      await api('hrAdmin', 'post', '/time/hr/long-absences').send({ ...body, employeeId: ids.hrEmp }).expect(403);
      await api('hrAdmin', 'post', '/time/hr/long-absences').send({ ...body, employeeId: ids.empBEmp }).expect(404);
      await api('hrAdmin', 'post', '/time/hr/long-absences').send({ ...body, to: d(50) }).expect(400);
      await api('hrAdmin', 'post', '/time/hr/long-absences').send({ ...body, note: 'short' }).expect(400);
      const a = (await api('hrAdmin', 'post', '/time/hr/long-absences').send(body).expect(201)).body;
      expect(a).toMatchObject({ kind: 'sabbatical', accrues: false, version: 1 });
      await api('hrAdmin', 'post', '/time/hr/long-absences').send({ ...body, from: d(100), to: d(200) }).expect(409);
      ids.absence = a.id;
      expect((await api('hrExec', 'get', '/time/hr/long-absences').expect(200)).body.map((x: { id: string }) => x.id)).toContain(a.id);
      expect((await api('adminB', 'get', '/time/hr/long-absences').expect(200)).body).toEqual([]);
      await api('emp', 'get', '/time/hr/long-absences').expect(403);
    });

    it('the employee sees it and tells HR a new return date', async () => {
      expect((await api('peer', 'get', '/time/me/long-absence').expect(200)).body.absence).toMatchObject({ id: ids.absence, to: d(150) });
      await api('peer', 'post', `/time/me/long-absence/${ids.absence}/return-date`).send({ on: d(-1), note: 'Back early' }).expect(400);
      await api('emp', 'post', `/time/me/long-absence/${ids.absence}/return-date`).send({ on: d(120), note: 'Back early' }).expect(404);
      expect((await api('peer', 'post', `/time/me/long-absence/${ids.absence}/return-date`).send({ on: d(120), note: 'Course ends early' }).expect(200)).body).toMatchObject({ returnAskedOn: d(120) });
    });

    it('HR extends or records an early return; a stale version and out-of-range dates are refused', async () => {
      await api('hrAdmin', 'post', `/time/hr/long-absences/${ids.absence}/extend`).send({ on: d(170), note: 'Course extended', version: 1 }).expect(409);
      const now = (await api('hrExec', 'get', '/time/hr/long-absences').expect(200)).body.find((x: { id: string }) => x.id === ids.absence);
      await api('hrAdmin', 'post', `/time/hr/long-absences/${ids.absence}/extend`).send({ on: d(140), note: 'Course extended', version: now.version }).expect(400);
      const ext = (await api('hrAdmin', 'post', `/time/hr/long-absences/${ids.absence}/extend`).send({ on: d(170), note: 'Course extended', version: now.version }).expect(200)).body;
      expect(ext).toMatchObject({ to: d(170), plannedTo: d(150), returnAskedOn: null });
      await api('hrAdmin', 'post', `/time/hr/long-absences/${ids.absence}/early-return`).send({ on: d(200), note: 'Back' }).expect(400);
      expect((await api('hrAdmin', 'post', `/time/hr/long-absences/${ids.absence}/early-return`).send({ on: d(121), note: 'Came back early' }).expect(200)).body).toMatchObject({ to: d(120) });
      await api('hrB', 'post', `/time/hr/long-absences/${ids.absence}/early-return`).send({ on: d(100), note: 'Back' }).expect(404);
      const trail = await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, entityId: ids.absence } }));
      expect(trail).toBeGreaterThanOrEqual(4);
    });
  });

  describe('optional holidays over the limit (TIM-23)', () => {
    it('after HR lowers the limit, new picks are refused until one is given back', async () => {
      await api('emp', 'post', `/time/me/holidays/${ids.o1}/choose`).expect(200);
      await api('emp', 'post', `/time/me/holidays/${ids.o2}/choose`).expect(200);
      await api('hrAdmin', 'put', `/time/setup/calendars/${ids.cal}`).send({ name: 'Bengaluru', locationId: ids.locA, optionalLimit: 1, halfDayOpenHalf: 'first' }).expect(200);
      const me = (await api('emp', 'get', '/time/me/leave').expect(200)).body;
      expect(me.holidays.calendar).toMatchObject({ optionalLimit: 1, yearlyLimit: 1, movedOn: null });
      expect(me.holidays.list.filter((h: { chosen: boolean }) => h.chosen)).toHaveLength(2);
      expect((await api('emp', 'post', `/time/me/holidays/${ids.o3}/choose`).expect(409)).body.message).toMatch(/limit is now 1\. Remove 1 first/);
      await api('emp', 'post', `/time/me/holidays/${ids.o2}/unchoose`).expect(200);
      expect((await api('emp', 'post', `/time/me/holidays/${ids.o3}/choose`).expect(409)).body.message).toMatch(/You can choose 1 optional holiday/);
    });
  });

  describe('year end with pending requests (TIM-29)', () => {
    it('lists them in the preview and posts only when HR posts anyway', async () => {
      const yearEnd = `${Number(today.slice(0, 4)) - 1}-12-31`;
      await inA((tx) => tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: ids.peerEmp, leaveTypeId: ids.CL, fromOn: new Date(`${yearEnd}T00:00:00Z`), toOn: new Date(`${yearEnd}T00:00:00Z`), days: 1, status: 'pending' } }));
      const p = (await api('hrAdmin', 'get', `/time/setup/year-end?yearEnd=${yearEnd}`).expect(200)).body;
      expect(p.pending).toEqual([expect.objectContaining({ employeeId: ids.peerEmp, from: yearEnd })]);
      expect((await api('hrAdmin', 'post', '/time/setup/year-end').send({ yearEnd }).expect(409)).body).toMatchObject({ code: 'YEAR_END_PENDING', pending: 1 });
      await api('hrAdmin', 'post', '/time/setup/year-end').send({ yearEnd, acknowledgePending: 'yes' }).expect(400);
      await api('hrExec', 'post', '/time/setup/year-end').send({ yearEnd, acknowledgePending: true }).expect(403);
      await api('hrAdmin', 'post', '/time/setup/year-end').send({ yearEnd, acknowledgePending: true }).expect(202);
      expect((await api('adminB', 'get', `/time/setup/year-end?yearEnd=${yearEnd}`).expect(200)).body.pending).toEqual([]);
    });
  });

  describe('HR leave home (TIM-17 HR)', () => {
    it('shows waiting requests with their approvers, who is away, and what needs HR; reminders once a day', async () => {
      const r = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: work(4), to: work(4), reason: 'Family' }).expect(201)).body;
      ids.pendingLeave = r.id;
      await api('emp', 'get', '/time/hr/leave-home').expect(403);
      const home = (await api('hrExec', 'get', '/time/hr/leave-home').expect(200)).body;
      expect(home.pending.rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: r.id, approvers: expect.stringContaining('mgr') })]));
      expect(home).toMatchObject({ negative: 0, certificates: null, yearEnd: { posted: false } });
      expect((await api('hrAdmin', 'get', '/time/hr/leave-home').expect(200)).body.certificates).toEqual([]);
      expect((await api('adminB', 'get', '/time/hr/leave-home').expect(200)).body.pending.total).toBe(0);
      await api('hrExec', 'post', `/time/hr/leave-home/remind/${r.id}`).expect(200);
      await api('hrExec', 'post', `/time/hr/leave-home/remind/${r.id}`).expect(409);
      await api('hrB', 'post', `/time/hr/leave-home/remind/${r.id}`).expect(404);
      await api('emp', 'post', `/time/hr/leave-home/remind/${r.id}`).expect(403);
    });
  });

  describe('leave reports (TIM-30)', () => {
    it('balances for everyone in scope, paged and filtered; others and bad input are refused', async () => {
      await api('emp', 'get', '/time/hr/leave-report?report=balances').expect(403);
      await api('hrExec', 'get', '/time/hr/leave-report?report=everything').expect(400);
      await api('hrExec', 'get', '/time/hr/leave-report?report=balances&pageSize=500').expect(400);
      await api('hrExec', 'get', '/time/hr/leave-report?report=balances&locationId=not-a-uuid').expect(400);
      const all = (await api('hrExec', 'get', '/time/hr/leave-report?report=balances&pageSize=10').expect(200)).body;
      expect(all.total).toBe(5);
      expect(all.types.map((t: { code: string }) => t.code)).toEqual(expect.arrayContaining(['EL', 'CL', 'LOP']));
      const emp = all.rows.find((x: { employeeId: string }) => x.employeeId === ids.empEmp);
      expect(emp.values[ids.EL]).toBe(15);
      const page2 = (await api('hrExec', 'get', '/time/hr/leave-report?report=balances&pageSize=10&page=2').expect(200)).body;
      expect(page2.rows).toEqual([]);
      expect((await api('hrExec', 'get', `/time/hr/leave-report?report=balances&locationId=${ids.locA2}`).expect(200)).body.total).toBe(0);
      expect((await api('hrExec', 'get', `/time/hr/leave-report?report=balances&departmentId=${ids.deptA}&q=emp`).expect(200)).body.total).toBe(1);
      expect((await api('hrExec', 'get', `/time/hr/leave-report?report=balances&entityId=${ids.entityA}`).expect(200)).body.total).toBe(5);
      expect((await api('adminB', 'get', '/time/hr/leave-report?report=balances').expect(200)).body.rows.map((x: { employeeId: string }) => x.employeeId)).toEqual([ids.empBEmp]);
    });

    it('negative balances, the ledger of a month, leave taken and unpaid days', async () => {
      await api('hrAdmin', 'post', `/time/people/${ids.peerEmp}/adjust`).send({ leaveTypeId: ids.CL, days: -13, reason: 'Recovered excess leave' }).expect(201);
      expect((await api('hrExec', 'get', '/time/hr/leave-report?report=negative').expect(200)).body.rows.map((x: { employeeId: string }) => x.employeeId)).toEqual([ids.peerEmp]);
      const ledger = (await api('hrExec', 'get', `/time/hr/leave-report?report=ledger&month=${today.slice(0, 7)}`).expect(200)).body;
      expect(ledger.rows.some((x: { kind: string }) => x.kind === 'encashed')).toBe(true);
      expect((await api('hrExec', 'get', '/time/hr/leave-report?report=taken').expect(200)).body.total).toBe(5);
      await inA((tx) => tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: ids.peerEmp, workOn: new Date(`${work(-3)}T00:00:00Z`), mode: 'punch', status: 'absent' } }));
      const lop = (await api('hrExec', 'get', `/time/hr/leave-report?report=lop&month=${work(-3).slice(0, 7)}`).expect(200)).body;
      expect(lop.rows).toEqual([expect.objectContaining({ employeeId: ids.peerEmp, absent: 1, days: 1 })]);
      await api('hrExec', 'get', '/time/hr/leave-report?report=ledger&month=2026-13').expect(400);
    });

    it('exports every row as CSV, audited and rate-limited by route', async () => {
      const res = await api('hrExec', 'get', '/time/hr/leave-report/export?report=balances').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="leave-balances-/);
      expect(res.text).toContain('"Employee","Code","Location","Department"');
      expect(res.text).toContain(`"emp ${run}"`);
      await api('emp', 'get', '/time/hr/leave-report/export?report=balances').expect(403);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.report.exported' } }))).toBe(1);
    });
  });

  describe('block-leave planner (TIM-39)', () => {
    it('lists only people whose role needs it; HR plans, nudges and schedules the access pause', async () => {
      expect((await api('hrExec', 'get', '/time/hr/block-leave').expect(200)).body.rows).toEqual([]);
      await setting('leave.block_leave.required', 'yes', { scopeType: 'department', scopeId: ids.deptA });
      await setting('leave.block_leave.days', '5');
      const list = (await api('hrExec', 'get', '/time/hr/block-leave').expect(200)).body.rows;
      expect(list.find((x: { employeeId: string }) => x.employeeId === ids.empEmp)).toMatchObject({ status: 'not_planned', need: 5, earnedLeft: 15 });
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.empEmp}/plan`).send({ from: d(30), to: d(32) }).expect(400);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.empEmp}/plan`).send({ from: d(-3), to: d(10) }).expect(400);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.empEmp}/plan`).send({ from: d(30), to: d(10) }).expect(400);
      await api('mgr', 'post', `/time/hr/block-leave/${ids.empEmp}/plan`).send({ from: d(30), to: d(37) }).expect(403);
      await api('hrB', 'post', `/time/hr/block-leave/${ids.empEmp}/plan`).send({ from: d(30), to: d(37) }).expect(404);
      expect((await api('hrExec', 'post', `/time/hr/block-leave/${ids.empEmp}/plan`).send({ from: d(30), to: d(37) }).expect(200)).body.workingDays).toBeGreaterThanOrEqual(5);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.peerEmp}/pause`).send({ pause: true }).expect(409);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.empEmp}/pause`).send({ pause: true }).expect(200);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.empEmp}/pause`).send({ pause: true }).expect(409);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.peerEmp}/nudge`).expect(200);
      await api('hrExec', 'post', `/time/hr/block-leave/${ids.peerEmp}/nudge`).expect(409);
      const after = (await api('hrExec', 'get', '/time/hr/block-leave').expect(200)).body.rows;
      expect(after.find((x: { employeeId: string }) => x.employeeId === ids.empEmp)).toMatchObject({ status: 'planned', plan: { from: d(30), to: d(37), accessPause: 'scheduled' } });
      // A manager sees their team read only.
      const team = (await api('mgr', 'get', '/time/hr/block-leave').expect(200)).body.rows.map((x: { employeeId: string }) => x.employeeId);
      expect(team).toEqual(expect.arrayContaining([ids.empEmp, ids.peerEmp]));
      expect(team).not.toContain(ids.hrEmp);
      await setting('leave.block_leave.required', 'no', { scopeType: 'department', scopeId: ids.deptA });
    });
  });

  describe('public-holiday feeds (TIM-42)', () => {
    it('are off until HR turns them on; only leave set-up manages them', async () => {
      const f = (await api('hrAdmin', 'get', '/time/setup/holiday-feeds').expect(200)).body;
      expect(f).toMatchObject({ on: false, provider: 'dev-fake', feeds: [] });
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds').send({ state: 'IN-KA' }).expect(409);
      await api('hrExec', 'get', '/time/setup/holiday-feeds').expect(403);
      await setting('holiday.feeds', 'on');
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds').send({ state: 'KA' }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds').send({ state: 'IN-ZZ' }).expect(400);
      ids.feed = (await api('hrAdmin', 'post', '/time/setup/holiday-feeds').send({ state: 'IN-KA' }).expect(201)).body.id;
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds').send({ state: 'IN-KA' }).expect(409);
    });

    it('a check lists the differences once; accepting a holiday gives back leave already on it', async () => {
      const first = (await api('hrAdmin', 'post', '/time/setup/holiday-feeds/check').expect(200)).body;
      expect(first.found).toBeGreaterThan(0);
      expect((await api('hrAdmin', 'post', '/time/setup/holiday-feeds/check').expect(200)).body.found).toBe(0);
      const feed = (await api('hrAdmin', 'get', '/time/setup/holiday-feeds').expect(200)).body;
      expect(feed.feeds[0]).toMatchObject({ state: 'IN-KA', checkError: null, locations: [{ name: 'Bengaluru', hasCalendar: true }] });
      // Leave on the first upcoming feed date that is a working day (approved), then accept that date.
      const add = feed.changes.find((x: { action: string; on: string }) => x.action === 'add' && x.on > d(5) && !isOff(x.on) && x.on <= d(190));
      expect(add).toBeTruthy();
      const applied = await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: add.on, to: add.on, reason: 'Trip' });
      expect([applied.status, applied.body.message]).toEqual([201, undefined]);
      await approveAll(/Earned leave/, ['mgr']);
      const before = (await balance('emp', 'EL')).balance;
      expect((await api('hrAdmin', 'get', '/time/setup/holiday-feeds').expect(200)).body.changes.find((x: { id: string }) => x.id === add.id).peopleOnLeave).toBe(1);
      const other = feed.changes.find((x: { id: string }) => x.id !== add.id);
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds/decide').send({ accept: [], ignore: [] }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds/decide').send({ accept: [add.id], ignore: [add.id] }).expect(400);
      await api('hrB', 'post', '/time/setup/holiday-feeds/decide').send({ accept: [add.id], ignore: [] }).expect(404);
      expect((await api('hrAdmin', 'post', '/time/setup/holiday-feeds/decide').send({ accept: [add.id], ignore: [other.id] }).expect(200)).body).toEqual({ accepted: 1, ignored: 1, leaveReturned: 1, leaveRecounted: 0 });
      expect((await balance('emp', 'EL')).balance).toBe(before + 1);
      await api('hrAdmin', 'post', '/time/setup/holiday-feeds/decide').send({ accept: [add.id], ignore: [] }).expect(409);
      expect(await inA((tx) => tx.holiday.count({ where: { organizationId: org.A.id, calendarId: ids.cal, holidayOn: new Date(`${add.on}T00:00:00Z`) } }))).toBe(1);
    });

    it('removing a feed drops its waiting changes; the other company never sees it', async () => {
      expect((await api('adminB', 'get', '/time/setup/holiday-feeds').expect(200)).body.feeds).toEqual([]);
      await api('hrB', 'post', `/time/setup/holiday-feeds/${ids.feed}/remove`).expect(404);
      await api('hrAdmin', 'post', `/time/setup/holiday-feeds/${ids.feed}/remove`).expect(200);
      await api('hrAdmin', 'post', `/time/setup/holiday-feeds/${ids.feed}/remove`).expect(404);
      expect((await api('hrAdmin', 'get', '/time/setup/holiday-feeds').expect(200)).body).toMatchObject({ feeds: [], changes: [] });
    });
  });

  it('my leave card: the ledger and what is still pending', async () => {
    const me = (await api('emp', 'get', '/time/me/leave/ledger').expect(200)).body;
    expect(me.employee.id).toBe(ids.empEmp);
    expect(me.pending).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.pendingLeave })]));
    expect(me.ledger.some((l: { kind: string }) => l.kind === 'encashed')).toBe(true);
    expect((await api('empB', 'get', '/time/me/leave/ledger').expect(200)).body.ledger).toEqual([]);
  });
});
