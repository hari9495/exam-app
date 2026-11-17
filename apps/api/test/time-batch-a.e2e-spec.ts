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

  // ------------------------------------------------------------------ C4: notify colleagues on approval
  describe('C4 notify colleagues', () => {
    const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
    const leaveTask = async (requestId: string) => {
      const wf = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: requestId } }));
      return (await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: wf.id, status: 'open' } }))).id;
    };
    const told = (userId: string) => inA((tx) => tx.userNotification.findMany({ where: { recipientUserId: userId, type: 'leave.colleague_away' } }));
    const weekday = (n: number) => { for (let i = n; i < n + 7; i++) if (new Date(`${d(i)}T00:00:00Z`).getUTCDay() !== 0) return d(i); return d(n); };
    const leaves = () => inA((tx) => tx.leaveRequest.count({ where: { employeeId: ids.empEmp } }));
    beforeAll(async () => {
      ids.EL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'EL', name: 'Earned leave', kind: 'earned', paid: true }).expect(201)).body.id;
      ids.elPolicy = (await api('hrAdmin', 'post', '/time/setup/policies').send({ name: `Staff ${run}` }).expect(201)).body.id;
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.elPolicy}/versions`).send({ validFrom: '2025-01-01', lines: [{ leaveTypeId: ids.EL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }] }).expect(201);
      await api('hrAdmin', 'post', `/time/setup/policies/${ids.elPolicy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: '2025-01-01' }).expect(201);
      await api('hrAdmin', 'post', `/time/people/${ids.empEmp}/adjust`).send({ leaveTypeId: ids.EL, days: 10, reason: 'Opening balance' }).expect(201);
    });

    it('negative: more than 10, yourself, someone of another company or not an id are refused with nothing saved', async () => {
      const before = await leaves();
      const on = weekday(40);
      const body = (notifyUserIds: unknown) => ({ leaveTypeId: ids.EL, from: on, to: on, reason: 'Family function', notifyUserIds });
      await api('emp', 'post', '/time/me/leave').send(body(Array.from({ length: 11 }, () => randomUUID()))).expect(400);
      expect((await api('emp', 'post', '/time/me/leave').send(body([users.emp])).expect(400)).body.message).toMatch(/do not need to tell yourself/);
      expect((await api('emp', 'post', '/time/me/leave').send(body([users.empB])).expect(400)).body.message).toBe('Choose active colleagues of your company to notify.');
      await api('emp', 'post', '/time/me/leave').send(body(['not-an-id'])).expect(400);
      await api('emp', 'post', '/time/me/leave').send(body([users.peer, users.peer])).expect(400);
      expect(await leaves()).toBe(before);
    });

    it('nobody is told on applying; on approval the colleagues get the dates only, never the type or reason', async () => {
      const on = weekday(45);
      const r = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on, to: on, reason: 'Secret family function', notifyUserIds: [users.peer, users.hrAdmin] }).expect(201)).body;
      expect(await told(users.peer)).toHaveLength(0);
      await decide('mgr', await leaveTask(r.id), 'approve').expect(200);
      for (const u of [users.peer, users.hrAdmin]) {
        const n = await told(u);
        expect(n).toHaveLength(1);
        expect(n[0].contextText).toMatch(/is away on /);
        expect(n[0].contextText).not.toMatch(/Earned|Secret|leave/i);
      }
      // Not named: not told; another company sees nothing.
      expect(await told(users.mgr)).toHaveLength(0);
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.userNotification.count({ where: { type: 'leave.colleague_away' } }))).toBe(0);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.colleagues_told', entityId: r.id } }))).toBe(1);
    });

    it('turned down: nobody is told', async () => {
      const on = weekday(50);
      const r = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on, to: on, notifyUserIds: [users.mgr] }).expect(201)).body;
      await decide('mgr', await leaveTask(r.id), 'reject', 'Audit week').expect(200);
      expect(await told(users.mgr)).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------ D12: cancel some days, extend (answers 2311, 2324)
  describe('D12 cancel some days and extend', () => {
    const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision });
    const taskFor = async (subjectId: string, requestType: string) => {
      const wf = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId, requestType }, orderBy: { createdAt: 'desc' } }));
      return (await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: wf.id, status: 'open' } }))).id;
    };
    const told = async () => (await inA((tx) => tx.userNotification.findMany({ where: { recipientUserId: users.peer, type: 'leave.colleague_away', entityId: ids.d12 }, orderBy: { createdAt: 'asc' } }))).map((n) => n.contextText ?? '');
    // Monday to Wednesday, two weeks out (no Sunday in between).
    const mon = (() => { for (let i = 60; i < 67; i++) if (new Date(`${d(i)}T00:00:00Z`).getUTCDay() === 1) return d(i); return d(60); })();
    const [w1, w2, w3] = [mon, addDays(mon, 1), addDays(mon, 2)];
    const changes = () => inA((tx) => tx.leaveChange.count({ where: { requestId: ids.d12 } }));
    beforeAll(async () => {
      ids.d12 = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: w1, to: w3, reason: 'Trip home', notifyUserIds: [users.peer] }).expect(201)).body.id;
      await decide('mgr', await taskFor(ids.d12, 'leave.request'), 'approve').expect(200);
    });

    it('negative: not mine, another company, a day not in the leave, every day, bad input: refused, nothing saved', async () => {
      const path = `/time/me/leave/${ids.d12}/cancel-days`;
      await api('peer', 'post', path).send({ days: [w3], reason: 'Back early' }).expect(404);
      await api('empB', 'post', path).send({ days: [w3], reason: 'Back early' }).expect(404);
      expect((await api('emp', 'post', path).send({ days: [addDays(w3, 1)], reason: 'Back early' }).expect(400)).body.message).toMatch(/is not a leave day of this request/);
      expect((await api('emp', 'post', path).send({ days: [w1, w2, w3], reason: 'Back early' }).expect(400)).body.message).toBe('That is every day of this leave. Use Ask to cancel instead.');
      await api('emp', 'post', path).send({ days: [], reason: 'Back early' }).expect(400);
      await api('emp', 'post', path).send({ days: ['tomorrow'], reason: 'Back early' }).expect(400);
      await api('emp', 'post', path).send({ days: [w3, w3], reason: 'Back early' }).expect(400);
      expect(await changes()).toBe(0);
    });

    it('the employee cancels the last day: it goes to the approver; approved, the day comes back and colleagues hear it', async () => {
      const ch = (await api('emp', 'post', `/time/me/leave/${ids.d12}/cancel-days`).send({ days: [w3], reason: 'Back early' }).expect(201)).body;
      expect(ch).toMatchObject({ status: 'pending', days: 1 });
      await api('emp', 'post', `/time/me/leave/${ids.d12}/cancel-days`).send({ days: [w2], reason: 'Back early' }).expect(409);
      const mine = (await api('emp', 'get', '/time/me/leave').expect(200)).body.requests.find((r: { id: string }) => r.id === ids.d12);
      expect(mine).toMatchObject({ changeWaiting: [w3], leaveDays: [{ on: w1 }, { on: w2 }, { on: w3 }] });
      await decide('mgr', await taskFor(ch.id, 'leave.cancel_days'), 'approve').expect(200);
      const r = await inA((tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: ids.d12 } }));
      expect({ days: Number(r.days), to: r.toOn.toISOString().slice(0, 10), status: r.status }).toEqual({ days: 2, to: w2, status: 'approved' });
      expect(await inA((tx) => tx.leaveLedgerEntry.count({ where: { requestId: ids.d12, kind: 'cancelled' } }))).toBe(1);
      const t = await told();
      expect(t).toHaveLength(2);
      expect(t[1]).toMatch(/is no longer away on /);
      expect(t[1]).not.toMatch(/Earned|Trip/);
    });

    it('HR cancels a day at once with a reason (audited); the wrong role, another company and a short reason are refused', async () => {
      const path = `/time/hr/leave/${ids.empEmp}/requests/${ids.d12}/cancel-days`;
      await api('emp', 'post', path).send({ days: [w1], reason: 'Recorded by mistake on the day' }).expect(403);
      // Another company: refused, and the leave is untouched.
      expect([403, 404]).toContain((await api('adminB', 'post', path).send({ days: [w1], reason: 'Recorded by mistake on the day' })).status);
      await api('hrAdmin', 'post', path).send({ days: [w1], reason: 'short' }).expect(400);
      const out = (await api('hrAdmin', 'post', path).send({ days: [w1], reason: 'Came in for the audit that day' }).expect(201)).body;
      expect(out).toMatchObject({ status: 'approved', days: 1 });
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.request.days_cancelled_by_hr', entityId: ids.d12 } }))).toBe(1);
      const r = await inA((tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: ids.d12 } }));
      expect([Number(r.days), r.fromOn.toISOString().slice(0, 10)]).toEqual([1, w2]);
      expect((await told()).at(-1)).toMatch(/is no longer away on /);
    });

    it('extend is a new linked request to the approver; a day before the end, not mine or another company are refused', async () => {
      await api('emp', 'post', `/time/me/leave/${ids.d12}/extend`).send({ to: w2 }).expect(400);
      await api('peer', 'post', `/time/me/leave/${ids.d12}/extend`).send({ to: addDays(w2, 2) }).expect(404);
      await api('empB', 'post', `/time/me/leave/${ids.d12}/extend`).send({ to: addDays(w2, 2) }).expect(404);
      await api('emp', 'post', `/time/me/leave/${ids.d12}/extend`).send({ to: 'later' }).expect(400);
      const x = (await api('emp', 'post', `/time/me/leave/${ids.d12}/extend`).send({ to: addDays(w2, 2) }).expect(201)).body;
      const r = await inA((tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: x.id } }));
      expect({ from: r.fromOn.toISOString().slice(0, 10), status: r.status, extendsRequestId: r.extendsRequestId, type: r.leaveTypeId }).toEqual({ from: w3, status: 'pending', extendsRequestId: ids.d12, type: ids.EL });
      await api('emp', 'post', `/time/me/leave/${x.id}/withdraw`).expect(200);
    });

    it('cancelling the whole leave tells the colleagues it is off too (answer 2324)', async () => {
      await api('emp', 'post', `/time/me/leave/${ids.d12}/cancel`).send({ reason: 'Trip called off' }).expect(200);
      await decide('mgr', await taskFor(ids.d12, 'leave.cancel'), 'approve').expect(200);
      const t = await told();
      expect(t).toHaveLength(4);
      expect(t[3]).toMatch(/is no longer away (on|from) /);
      expect(t[3]).not.toMatch(/Trip/);
    });
  });

  // ------------------------------------------------------------------ D10: balance correction grid (answer 2314)
  describe('D10 balance correction grid', () => {
    const entries = () => inA((tx) => tx.leaveLedgerEntry.count({ where: { employeeId: ids.empEmp, leaveTypeId: ids.d10 } }));
    const body = (x: Record<string, unknown> = {}) => ({ employeeId: ids.empEmp, leaveTypeId: ids.d10, from: 5, to: 7.5, reason: 'Opening balance from the old system was short', ...x });
    beforeAll(async () => {
      await inA(async (tx) => {
        // Minimum balance -2 (two days may be borrowed); 5 days today.
        ids.d10 = (await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'PL', name: 'Privilege leave', kind: 'casual', rules: { negativeLimit: 2 } } })).id;
        await tx.leaveLedgerEntry.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, leaveTypeId: ids.d10, entryOn: new Date(`${today}T00:00:00Z`), kind: 'opening', days: 5, reason: 'Opening' } });
      });
    });

    it('HR corrects a cell: the difference goes on the ledger with the reason, audited before and after; the grid shows it', async () => {
      const out = (await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body()).expect(201)).body;
      expect(out).toMatchObject({ balance: 7.5, days: 2.5 });
      const e = await inA((tx) => tx.leaveLedgerEntry.findUniqueOrThrow({ where: { id: out.id } }));
      expect({ kind: e.kind, days: Number(e.days), reason: e.reason, by: e.createdBy }).toEqual({ kind: 'adjustment', days: 2.5, reason: 'Opening balance from the old system was short', by: users.hrAdmin });
      const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'leave.balance.corrected', entityId: out.id } }));
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ employeeId: ids.empEmp, from: 5, to: 7.5, days: 2.5 });
      const grid = (await api('hrAdmin', 'get', '/time/hr/balances').expect(200)).body;
      expect(grid.people.find((p: { employeeId: string }) => p.employeeId === ids.empEmp).balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.d10)).toMatchObject({ balance: 7.5, negativeLimit: 2 });
      // Down to the minimum is allowed.
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: 7.5, to: -2 })).expect(201);
    });

    it('negative: below the minimum, a stale figure, no change, the wrong role, their own, another company and bad input: refused, nothing saved', async () => {
      const before = await entries();
      expect((await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: -2.5 })).expect(400)).body.message).toMatch(/can't go below -2 days/);
      expect((await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: 5, to: 6 })).expect(409)).body).toMatchObject({ code: 'BALANCE_CHANGED', balance: -2 });
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: -2 })).expect(400);
      await api('emp', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 1 })).expect(403);
      await api('mgr', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 1 })).expect(403);
      expect((await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ employeeId: ids.hrEmp, from: 0, to: 1 })).expect(403)).body.message).toMatch(/your own balance/);
      expect([403, 404]).toContain((await api('adminB', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 1 }))).status);
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 1, reason: '' })).expect(400);
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 'ten' })).expect(400);
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 1.333 })).expect(400);
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ employeeId: 'someone', from: -2, to: 1 })).expect(400);
      await api('hrAdmin', 'post', '/time/hr/balances/correct').send(body({ from: -2, to: 1, extra: true })).expect(400);
      expect(await entries()).toBe(before);
      // Another company sees none of it.
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.leaveLedgerEntry.count({ where: { leaveTypeId: ids.d10 } }))).toBe(0);
    });
  });

  // ------------------------------------------------------------------ A9: office or remote per punch (answer 2312)
  describe('A9 office or remote per punch', () => {
    const INSIDE = { lat: 12.9717, lng: 77.5947, accuracyM: 20 };
    const OUTSIDE = { lat: 12.9716, lng: 77.6126, accuracyM: 20 };
    const setRule = (who: Who, value: string) => api(who, 'put', '/org/settings').send({ key: 'attendance.day_place_rule', value, scopeType: 'tenant' });
    const lastPunch = (employeeId: string) => inA((tx) => tx.punch.findFirstOrThrow({ where: { employeeId }, orderBy: { createdAt: 'desc' } }));
    let on = '';

    it('each punch stores its place at punch time: inside the office is office, clocking in from home is remote, refused is unknown', async () => {
      expect((await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...INSIDE }).expect(200)).body).toMatchObject({ accepted: true });
      const office = await lastPunch(ids.empEmp);
      expect(office.workPlace).toBe('office');
      on = office.workOn.toISOString().slice(0, 10);
      expect((await api('peer', 'post', '/time/me/punch').send({ kind: 'in', wfh: true, ...OUTSIDE }).expect(200)).body).toMatchObject({ accepted: true });
      expect((await lastPunch(ids.peerEmp)).workPlace).toBe('remote');
      expect((await api('emp', 'post', '/time/me/punch').send({ kind: 'out', ...OUTSIDE }).expect(200)).body).toMatchObject({ accepted: false });
      expect((await lastPunch(ids.empEmp)).workPlace).toBe('unknown');
    });

    it('a day with both follows the company setting: office wins by default, then remote wins, then the first punch', async () => {
      // An earlier remote punch on the same day (clocked in from home in the morning, then came to the office).
      await inA((tx) => tx.punch.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, punchedAt: new Date(Date.now() - 3 * 3600_000), workOn: new Date(`${on}T00:00:00Z`), kind: 'break_end', source: 'web', accepted: true, verdict: 'field', workPlace: 'remote' } }));
      const card = async () => (await api('mgr', 'get', `/time/people/${ids.empEmp}/days/${on}`).expect(200)).body;
      const c = await card();
      expect(c.place).toBe('office');
      expect(c.punches.map((p: { place: string }) => p.place)).toEqual(['remote', 'office', 'unknown']);
      await setRule('adminA', 'remote_wins').expect(200);
      expect((await card()).place).toBe('remote');
      await setRule('adminA', 'first_punch').expect(200);
      expect((await card()).place).toBe('remote');
      // My month's list rows carry the day's place too.
      const mine = (await api('emp', 'get', `/time/me/attendance?month=${on.slice(0, 7)}`).expect(200)).body;
      expect(mine.days.find((x: { on: string }) => x.on === on)?.place).toBe('remote');
      expect(mine.punches.every((p: { place?: string }) => typeof p.place === 'string')).toBe(true);
      await setRule('adminA', 'office_wins').expect(200);
      expect((await api('mgr', 'get', `/time/people/${ids.empEmp}/attendance?month=${on.slice(0, 7)}`).expect(200)).body.days.find((x: { on: string }) => x.on === on)?.place).toBe('office');
    });

    it('negative: the wrong role cannot change the rule, a bad value is a 400, other people and another company see nothing', async () => {
      await setRule('emp', 'remote_wins').expect(403);
      await setRule('adminA', 'whoever_is_louder').expect(400);
      expect(await inA((tx) => tx.setting.findFirst({ where: { key: 'attendance.day_place_rule' } }).then((x) => x?.value))).toBe('office_wins');
      expect([403, 404]).toContain((await api('peer', 'get', `/time/people/${ids.empEmp}/days/${on}`)).status);
      expect([403, 404]).toContain((await api('empB', 'get', `/time/people/${ids.empEmp}/days/${on}`)).status);
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.punch.count({ where: { employeeId: ids.empEmp } }))).toBe(0);
    });
  });
});
