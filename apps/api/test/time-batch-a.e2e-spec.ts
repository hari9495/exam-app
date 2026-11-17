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
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Tier 1 batch A (attendance and leave daily), end to end against the real database (forced RLS, the app role): each item
// positive and negative, two companies kept apart.
describe('Time batch A', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'mgr' | 'emp' | 'peer' | 'empB' | 'payApprover';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  // The company calendar is India time.
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);

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

    planId = (await prisma.plan.create({ data: { name: `batch-a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Batch A Org ${k}`, slug: `bata-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
      ['payApprover', 'A', 'panel', ['payroll.correction.approve']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@bata-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@bata-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Batch Foods ${k}`, shortName: `BF${k}-${run}`, isDefault: true } })).id;
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
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-3), userId: users[who], workEmail: `${who}@bata-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
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

  // ------------------------------------------------------------------ item 2 (C2): my full leave history
  describe('C2 full leave history', () => {
    beforeAll(async () => {
      await inA(async (tx) => {
        const o = { organizationId: org.A.id };
        ids.cl = (await tx.leaveType.create({ data: { ...o, code: 'CL', name: 'Casual leave', kind: 'casual' } })).id;
        ids.sl = (await tx.leaveType.create({ data: { ...o, code: 'SL', name: 'Sick leave', kind: 'sick' } })).id;
        // 30 requests over two years: older than the Home's 13 months too.
        const rows = Array.from({ length: 30 }, (_, i) => ({
          ...o,
          employeeId: ids.empEmp,
          leaveTypeId: i % 3 === 0 ? ids.sl : ids.cl,
          fromOn: new Date(`${d(-20 - i * 24)}T00:00:00Z`),
          toOn: new Date(`${d(-20 - i * 24)}T00:00:00Z`),
          days: 1,
          status: i % 5 === 0 ? 'rejected' : 'approved',
          reason: i === 7 ? 'Cousin wedding in Mysuru' : `Errand ${i}`,
        }));
        await tx.leaveRequest.createMany({ data: rows });
        // Someone else's leave is never in mine.
        await tx.leaveRequest.create({ data: { ...o, employeeId: ids.peerEmp, leaveTypeId: ids.cl, fromOn: new Date(`${d(-30)}T00:00:00Z`), toOn: new Date(`${d(-30)}T00:00:00Z`), days: 1, status: 'approved', reason: 'Cousin wedding' } });
      });
    });

    it('every request, newest first, a page at a time; the Home still shows the last 13 months only', async () => {
      const p1 = (await api('emp', 'get', '/time/me/leave/history?page=1&pageSize=25').expect(200)).body;
      expect(p1).toMatchObject({ total: 30, page: 1, pageSize: 25 });
      expect(p1.rows).toHaveLength(25);
      expect(p1.rows[0].from > p1.rows[1].from).toBe(true);
      expect((await api('emp', 'get', '/time/me/leave/history?page=2&pageSize=25').expect(200)).body.rows).toHaveLength(5);
      expect((await api('emp', 'get', '/time/me/leave').expect(200)).body.requests.length).toBeLessThan(30);
    });

    it('filters by type, status, dates and the reason', async () => {
      const sick = (await api('emp', 'get', `/time/me/leave/history?types=${ids.sl}`).expect(200)).body;
      expect(sick.total).toBe(10);
      expect(sick.rows.every((r: { type: { id: string } }) => r.type.id === ids.sl)).toBe(true);
      expect((await api('emp', 'get', '/time/me/leave/history?statuses=rejected').expect(200)).body.total).toBe(6);
      expect((await api('emp', 'get', `/time/me/leave/history?from=${d(-100)}&to=${d(-20)}`).expect(200)).body.total).toBe(4);
      const q = (await api('emp', 'get', '/time/me/leave/history?q=wedding').expect(200)).body;
      expect(q.rows.map((r: { reason: string }) => r.reason)).toEqual(['Cousin wedding in Mysuru']);
    });

    it('negative: a bad status, type or page is refused; another company and a colleague see none of it', async () => {
      await api('emp', 'get', '/time/me/leave/history?statuses=lost').expect(400);
      await api('emp', 'get', '/time/me/leave/history?types=not-a-uuid').expect(400);
      await api('emp', 'get', '/time/me/leave/history?page=0').expect(400);
      await api('emp', 'get', '/time/me/leave/history?pageSize=1000').expect(400);
      expect((await api('empB', 'get', '/time/me/leave/history').expect(200)).body.total).toBe(0);
      expect((await api('peer', 'get', '/time/me/leave/history').expect(200)).body.total).toBe(1);
    });
  });

  // ------------------------------------------------------------------ items 5 and 18 (A1, A2, A3): list, table, requests
  describe('A1-A3 my month as a list or table, and my requests', () => {
    const month = today.slice(0, 7);
    beforeAll(async () => {
      await inA(async (tx) => {
        const o = { organizationId: org.A.id };
        await tx.attendanceDay.create({ data: { ...o, employeeId: ids.empEmp, workOn: new Date(`${month}-01T00:00:00Z`), mode: 'punch', status: 'present', firstIn: new Date(`${month}-01T04:20:00Z`), lastOut: new Date(`${month}-01T12:30:00Z`), workedMinutes: 490, lateMinutes: 20 } });
        await tx.attendanceRequest.createMany({ data: [
          { ...o, employeeId: ids.empEmp, workOn: new Date(`${month}-01T00:00:00Z`), kind: 'missed_out', outMinute: 1090, reason: 'Forgot to clock out', status: 'pending' },
          { ...o, employeeId: ids.empEmp, workOn: new Date(`${month}-01T00:00:00Z`), kind: 'wfh', reason: 'Plumber visit', status: 'approved' },
          { ...o, employeeId: ids.peerEmp, workOn: new Date(`${month}-01T00:00:00Z`), kind: 'wfh', reason: 'Not mine', status: 'pending' },
        ] });
      });
    });

    it('the month gives each day its first in, last out, worked and late minutes, and my requests with their status', async () => {
      const m = (await api('emp', 'get', `/time/me/attendance?month=${month}`).expect(200)).body;
      expect(m.days.find((x: { on: string }) => x.on === `${month}-01`)).toMatchObject({ status: 'present', workedMinutes: 490, lateMinutes: 20, firstIn: expect.any(String), lastOut: expect.any(String) });
      const reasons = m.requests.map((r: { reason: string; status: string }) => [r.reason, r.status]);
      expect(reasons).toEqual(expect.arrayContaining([['Forgot to clock out', 'pending'], ['Plumber visit', 'approved']]));
    });

    it('negative: a colleague’s request is not mine; another company sees none; a bad month is refused', async () => {
      const m = (await api('emp', 'get', `/time/me/attendance?month=${month}`).expect(200)).body;
      expect(m.requests.map((r: { reason: string }) => r.reason)).not.toContain('Not mine');
      expect((await api('empB', 'get', `/time/me/attendance?month=${month}`).expect(200)).body.requests).toEqual([]);
      await api('emp', 'get', '/time/me/attendance?month=2026-13').expect(400);
    });
  });

  // ------------------------------------------------------------------ item 9 (D11): exceptional working days
  describe('D11 exceptional working days', () => {
    // The location has no rule of its own, so the default applies: Sunday is the weekly off.
    const sundayFrom = (n: number) => { for (let i = n; i < n + 7; i++) if (new Date(`${d(i)}T00:00:00Z`).getUTCDay() === 0) return d(i); return d(n); };
    const sunday = sundayFrom(2);
    const saturday = addDays(sunday, -1);
    const monday = addDays(sunday, 1);
    let cal: string;
    let req: string;
    let mark: string;
    beforeAll(async () => {
      cal = (await api('hrAdmin', 'post', '/time/setup/calendars').send({ name: 'Bengaluru holidays', locationId: ids.locA, optionalLimit: 2 }).expect(201)).body.id;
      // Approved leave over Saturday and Sunday: Saturday is leave, the Sunday weekly off is not counted.
      req = await inA(async (tx) => {
        const o = { organizationId: org.A.id };
        const r = await tx.leaveRequest.create({ data: { ...o, employeeId: ids.empEmp, leaveTypeId: ids.cl, fromOn: new Date(`${saturday}T00:00:00Z`), toOn: new Date(`${sunday}T00:00:00Z`), days: 1, status: 'approved', reason: 'Family visit' } });
        await tx.leaveRequestDay.createMany({ data: [
          { ...o, requestId: r.id, employeeId: ids.empEmp, leaveOn: new Date(`${saturday}T00:00:00Z`), part: 'full', portion: 1, countedAs: 'leave' },
          { ...o, requestId: r.id, employeeId: ids.empEmp, leaveOn: new Date(`${sunday}T00:00:00Z`), part: 'full', portion: 0, countedAs: 'weekly_off' },
        ] });
        return r.id;
      });
    });

    it('HR marks the Sunday as worked: the leave counts it from the balance, it shows on the calendar, and it is audited', async () => {
      const out = (await api('hrAdmin', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: sunday, reason: 'Make-up day for the Diwali bridge' }).expect(201)).body;
      expect(out).toMatchObject({ on: sunday, leaveRecounted: 1 });
      mark = out.id;
      const r = await inA((tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: req } }));
      expect(Number(r.days)).toBe(2);
      const day = await inA((tx) => tx.leaveRequestDay.findFirstOrThrow({ where: { requestId: req, leaveOn: new Date(`${sunday}T00:00:00Z`) } }));
      expect({ portion: Number(day.portion), countedAs: day.countedAs }).toEqual({ portion: 1, countedAs: 'leave' });
      expect(await inA((tx) => tx.leaveLedgerEntry.count({ where: { requestId: req, kind: 'taken', entryOn: new Date(`${sunday}T00:00:00Z`) } }))).toBe(1);
      expect(await inA((tx) => tx.auditLog.count({ where: { entityId: cal, action: 'holiday.working_day_marked' } }))).toBe(1);
      const setup = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body;
      expect(setup.calendars.find((c: { id: string }) => c.id === cal).workingDays).toEqual([{ id: mark, on: sunday, reason: 'Make-up day for the Diwali bridge' }]);
    });

    it('negative: a past day, a plain working day, the same day twice, a short reason, an employee, another company', async () => {
      await api('hrAdmin', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: d(-1), reason: 'Too late for this' }).expect(400);
      await api('hrAdmin', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: monday, reason: 'Already a working day' }).expect(400);
      await api('hrAdmin', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: sunday, reason: 'Make-up day again' }).expect(409);
      await api('hrAdmin', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: addDays(sunday, 7), reason: 'no' }).expect(400);
      await api('emp', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: addDays(sunday, 7), reason: 'Make-up day' }).expect(403);
      await api('adminB', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: addDays(sunday, 7), reason: 'Make-up day' }).expect(404);
      // The leave already counts the day: the mark stays.
      expect((await api('hrAdmin', 'post', `/time/setup/working-days/${mark}/remove`).expect(409)).body.message).toMatch(/counts the day/);
    });

    it('a mark no leave counts can be removed before the day; the day is off again', async () => {
      const later = addDays(sunday, 7);
      const id = (await api('hrAdmin', 'post', `/time/setup/calendars/${cal}/working-days`).send({ on: later, reason: 'Stock count Sunday' }).expect(201)).body.id;
      await api('hrAdmin', 'post', `/time/setup/working-days/${id}/remove`).expect(200);
      const setup = (await api('hrAdmin', 'get', '/time/setup').expect(200)).body;
      expect(setup.calendars.find((c: { id: string }) => c.id === cal).workingDays.map((w: { on: string }) => w.on)).toEqual([sunday]);
      expect(await inA((tx) => tx.auditLog.count({ where: { entityId: cal, action: 'holiday.working_day_removed' } }))).toBe(1);
    });
  });

  // ------------------------------------------------------------------ item 7 (B4): hourly permission
  describe('B4 hourly permission', () => {
    const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
    const taskOf = async (requestId: string) => {
      const r = await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: requestId } }));
      return (await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: r.wfRequestId!, status: 'open' } }))).id;
    };
    const sun = (on: string) => new Date(`${on}T00:00:00Z`).getUTCDay() === 0;
    // The default shift is 9:30 am to 6:30 pm with Sunday off; the people joined three days ago.
    const past = [d(-1), d(-2)].find((x) => !sun(x))!;
    const body = (over: Record<string, unknown> = {}) => ({ on: past, inMinute: 990, outMinute: 1110, reason: 'Bank visit', ...over });
    const count = () => inA((tx) => tx.attendanceRequest.count({ where: { employeeId: ids.empEmp, kind: 'permission' } }));

    it('negative: bad input, too long, a weekly off and acting outside the rules are refused with nothing saved', async () => {
      const before = await count();
      expect((await api('emp', 'post', '/time/me/permission').send(body({ outMinute: 990 })).expect(400)).body.message).toBe('Enter a To time after From.');
      expect((await api('emp', 'post', '/time/me/permission').send(body({ inMinute: 960 })).expect(400)).body.message).toBe('A permission can be at most 2 hours. Apply for leave for a longer time.');
      await api('emp', 'post', '/time/me/permission').send(body({ inMinute: 1500 })).expect(400);
      await api('emp', 'post', '/time/me/permission').send(body({ reason: '' })).expect(400);
      await api('emp', 'post', '/time/me/permission').send(body({ extra: 1 })).expect(400);
      await api('emp', 'post', '/time/me/permission').send(body({ on: 'yesterday' })).expect(400);
      // Two weeks out: the D11 tests above use the Sunday of the coming week.
      const sunday = [15, 16, 17, 18, 19, 20, 21].map((n) => d(n)).find(sun)!;
      expect((await api('emp', 'post', '/time/me/permission').send(body({ on: sunday })).expect(400)).body.message).toMatch(/weekly off/);
      expect(await count()).toBe(before);
    });

    it('goes to the manager; approved, the short day stays present and no leave is used', async () => {
      // In 9:30 am, out 4:30 pm: 6.5 hours worked, a half day on its own.
      await inA((tx) => tx.punch.createMany({ data: [
        { organizationId: org.A.id, employeeId: ids.empEmp, punchedAt: new Date(`${past}T04:00:00Z`), workOn: new Date(`${past}T00:00:00Z`), kind: 'in', accepted: true, verdict: 'no_fence' },
        { organizationId: org.A.id, employeeId: ids.empEmp, punchedAt: new Date(`${past}T11:00:00Z`), workOn: new Date(`${past}T00:00:00Z`), kind: 'out', accepted: true, verdict: 'no_fence' },
      ] }));
      const leaveBefore = await inA((tx) => tx.leaveRequest.count({ where: { employeeId: ids.empEmp } }));
      const r = (await api('emp', 'post', '/time/me/permission').send(body()).expect(201)).body;
      expect(r).toMatchObject({ status: 'pending', used: 1, limit: 2 });
      // The same time again overlaps.
      expect((await api('emp', 'post', '/time/me/permission').send(body({ inMinute: 1020, outMinute: 1080 })).expect(409)).body.message).toMatch(/already asked for permission .* from 4:30 pm to 6:30 pm/);
      const task = await taskOf(r.id);
      // Not the manager, or another company: never sees the task.
      await decide('peer', task, 'approve').expect(404);
      await decide('emp', task, 'approve').expect(404);
      await decide('empB', task, 'approve').expect(404);
      await decide('mgr', task, 'approve').expect(200);
      const day = await inA((tx) => tx.attendanceDay.findFirstOrThrow({ where: { employeeId: ids.empEmp, workOn: new Date(`${past}T00:00:00Z`) } }));
      expect(day.status).toBe('present');
      expect(await inA((tx) => tx.leaveRequest.count({ where: { employeeId: ids.empEmp } }))).toBe(leaveBefore);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'attendance.permission.submitted', entityId: r.id } }))).toBe(1);
      const me = (await api('emp', 'get', `/time/me/attendance?month=${past.slice(0, 7)}`).expect(200)).body;
      expect(me.requests.find((x: { id: string }) => x.id === r.id)).toMatchObject({ kind: 'permission', status: 'approved', inMinute: 990, outMinute: 1110 });
      expect(me.permission).toMatchObject({ limit: 2, maxMinutes: 120 });
      // Another company and a colleague see none of it.
      expect((await api('empB', 'get', `/time/me/attendance?month=${past.slice(0, 7)}`).expect(200)).body.requests).toEqual([]);
      expect((await api('peer', 'get', `/time/me/attendance?month=${past.slice(0, 7)}`).expect(200)).body.requests.map((x: { id: string }) => x.id)).not.toContain(r.id);
    });

    it('past the monthly limit it is refused with the reason; the company can change the limit', async () => {
      // A month with at least three working days in the next 30.
      const ahead = Array.from({ length: 30 }, (_, i) => d(i + 1)).filter((x) => !sun(x));
      const month = [...new Set(ahead.map((x) => x.slice(0, 7)))].find((m) => ahead.filter((x) => x.startsWith(m)).length >= 4)!;
      const days = ahead.filter((x) => x.startsWith(month));
      let used = month === past.slice(0, 7) ? 1 : 0;
      let k = 0;
      while (used < 2) { await api('emp', 'post', '/time/me/permission').send(body({ on: days[k++] })).expect(201); used++; }
      const name = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
      const before = await count();
      expect((await api('emp', 'post', '/time/me/permission').send(body({ on: days[k] })).expect(409)).body.message).toBe(`You have used all 2 permissions for ${name}. Apply for leave instead.`);
      expect(await count()).toBe(before);
      await api('emp', 'put', '/org/settings').send({ key: 'attendance.permission.monthly_limit', value: '3', scopeType: 'tenant' }).expect(403);
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.permission.monthly_limit', value: '3', scopeType: 'tenant' }).expect(200);
      await api('emp', 'post', '/time/me/permission').send(body({ on: days[k] })).expect(201);
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.permission.monthly_limit', value: '2', scopeType: 'tenant' }).expect(200);
    });
  });

  // ------------------------------------------------------------------ item 8 (D15): LOP reversal through HR corrections
  describe('D15 reverse loss of pay', () => {
    // Last month, locked for payroll; someone who worked all of it.
    const last = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    const body = (over: Record<string, unknown> = {}) => ({ employeeId: ids.lopEmp, days: [{ on: `${last}-10`, shouldBe: 'present' }, { on: `${last}-11`, shouldBe: 'half_day' }], reason: 'Was on site at the supplier both days', ...over });
    const corrections = () => inA((tx) => tx.payCorrection.count({ where: { employeeId: ids.lopEmp } }));
    beforeAll(async () => {
      ids.lopEmp = (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entityA, status: 'confirmed', reason: 'Joined', givenName: 'Lop', familyName: run, joinedOn: d(-70), workEmail: `lop@bata-${run}.test`, assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desigA, employmentTypeId: ids.permA, managerEmployeeId: null } })
          .expect(201)
      ).body.id;
      await inA((tx) => tx.payPeriod.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, periodStart: new Date(`${last}-01T00:00:00Z`), periodEnd: new Date(`${addDays(`${today.slice(0, 7)}-01`, -1)}T00:00:00Z`), stage: 'locked', lockedAt: new Date(), reason: 'Batch A test' } }));
    });

    it('negative: the wrong role, another company, bad input and an open month are refused with nothing saved', async () => {
      await api('emp', 'post', '/payroll/corrections/lop-reversal').send(body()).expect(403);
      await api('mgr', 'post', '/payroll/corrections/lop-reversal').send(body()).expect(403);
      await api('adminB', 'post', '/payroll/corrections/lop-reversal').send(body()).expect(404);
      await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ days: [{ on: `${last}-10`, shouldBe: 'unpaid' }] })).expect(400);
      await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ days: [] })).expect(400);
      await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ reason: 'short' })).expect(400);
      await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ extra: 1 })).expect(400);
      expect((await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ days: [{ on: `${last}-10`, shouldBe: 'present' }, { on: `${last}-10`, shouldBe: 'half_day' }] })).expect(400)).body.message).toBe('Each day can be listed once.');
      expect((await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ days: [{ on: `${last}-10`, shouldBe: 'present' }, { on: `${today.slice(0, 7)}-01`, shouldBe: 'present' }] })).expect(400)).body.message).toBe('Pick days of one month at a time.');
      // An open month goes to regularisation instead.
      const open = (await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ days: [{ on: `${today.slice(0, 7)}-01`, shouldBe: 'present' }] })).expect(409)).body;
      expect(open).toMatchObject({ code: 'MONTH_OPEN', message: expect.stringMatching(/is still open\. Fix the days in regularisation instead\./) });
      expect(await corrections()).toBe(0);
    });

    it('HR reverses two days of the locked month: one HR correction each for payroll to approve, audited', async () => {
      const r = (await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body()).expect(201)).body;
      expect(r).toMatchObject({ count: 2, status: 'pending' });
      const rows = await inA((tx) => tx.payCorrection.findMany({ where: { employeeId: ids.lopEmp }, orderBy: { workOn: 'asc' } }));
      expect(rows.map((x) => [x.workOn.toISOString().slice(0, 10), (x.change as { shouldBe: string }).shouldBe, x.source, x.status])).toEqual([[`${last}-10`, 'present', 'hr', 'pending'], [`${last}-11`, 'half_day', 'hr', 'pending']]);
      expect(rows.every((x) => x.wfRequestId)).toBe(true);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'payroll.lop_reversal.submitted', entityId: ids.lopEmp } }))).toBe(1);
      // The same day again is already waiting.
      await api('hrAdmin', 'post', '/payroll/corrections/lop-reversal').send(body({ days: [{ on: `${last}-10`, shouldBe: 'present' }] })).expect(409);
      expect(await corrections()).toBe(2);
      // Another company sees none of it.
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.payCorrection.count({ where: { employeeId: ids.lopEmp } }))).toBe(0);
    });
  });
});
