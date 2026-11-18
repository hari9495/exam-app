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
import { DayEngine } from '../src/time/day-engine.service';
import { addDays, instantAt } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Time ops (29 Oct 2026), end to end against the real database (forced RLS, the app role): the Today board (TIM-01),
// exceptions and HR resolve (TIM-04 / TIM-03 HrFix / TIM-02 bulk), overtime decisions on the review page through the
// one approvals engine (TIM-09), freeze / send / approve the lock with the company's lock flow (TIM-02 / TIM-11), late
// requests to a locked month (TIM-07), reports (TIM-16), industrial action (TIM-37), presence (TIM-36) and the device
// backfill (TIM-10). Every action: the positive path and the wrong role, another company, out of scope, bad input, a
// repeat, a conflict, a locked period and acting for someone else.
describe('Time ops: attendance, overtime, periods', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let dayEngine: DayEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'payroll' | 'both' | 'mgr' | 'emp' | 'peer' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const as = (t: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${t}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const lockMonth = (today.slice(8) >= '02' ? addDays(`${thisMonth}-01`, -1) : addDays(addDays(`${thisMonth}-01`, -1).slice(0, 7) + '-01', -1)).slice(0, 7);
  const L = (day: number) => `${lockMonth}-${String(day).padStart(2, '0')}`;
  const ZONE = 'Asia/Kolkata';
  const at = (on: string, hhmm: string) => instantAt(on, ZONE, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
  const punch = (employeeId: string, on: string, kind: 'in' | 'out', hhmm: string) => inA((tx) => tx.punch.create({ data: { organizationId: org.A.id, employeeId, punchedAt: at(on, hhmm), workOn: new Date(`${on}T00:00:00Z`), kind, source: 'web', accepted: true, verdict: 'inside' } }));
  const evaluate = (employeeId: string, from: string, to = from) => inA((tx) => dayEngine.evaluate(tx, { organizationId: org.A.id, isSuperAdmin: false }, employeeId, from, to));
  const dayOf = (employeeId: string, on: string) => inA((tx) => tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId, workOn: new Date(`${on}T00:00:00Z`) } } }));
  const setting = (key: string, value: string) => inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } }));
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string }[];

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
    dayEngine = moduleRef.get(DayEngine);

    planId = (await prisma.plan.create({ data: { name: `timeops-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `TimeOps Org ${k}`, slug: `timeops-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['payroll', 'A', 'panel', ['payroll.period.view', 'payroll.correction.approve', 'attendance.lock.approve']],
      ['both', 'A', 'panel', ['attendance.view', 'attendance.lock', 'attendance.lock.approve']],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@timeops-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@timeops-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `TimeOps Foods ${k}`, shortName: `TOF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day is a working day (no weekly offs): 9:30 to 18:30, 10 minutes' grace, 30 minutes' break.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, code: string, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: `${lockMonth}-01`, userId: users[who], workEmail: `${who}@timeops-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null, `TO1-${run}`);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp, `TO2-${run}`);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp, `TO3-${run}`);
    ids.hrEmp = await hire('adminA', 'hrAdmin', null, `TO4-${run}`);
    ids.empBEmp = await hire('adminB', 'empB', null, `TOB-${run}`, 'B');
    // The overtime rule in force since the locked month: 30 minutes' minimum, 15-minute steps, half a day of comp-off from 60 minutes.
    await inA((tx) => tx.overtimeRule.create({ data: { organizationId: org.A.id, name: 'Factory OT', scopeType: 'tenant', scopeId: org.A.id, validFrom: new Date(`${lockMonth}-01T00:00:00Z`), compOffHalfMinutes: 60, compOffFullMinutes: 120 } }));
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every new table has forced RLS; resolutions and presence states are never changed (presence states are removed only on withdrawal)', async () => {
    const tables = ['attendance_resolutions', 'industrial_action_events', 'late_mark_waivers', 'presence_consents', 'presence_signals'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
    await expect(prisma.$executeRaw`UPDATE attendance_resolutions SET reason = 'x'`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE presence_signals SET state = 'idle'`).rejects.toThrow();
    // Batch C item 6: a waiver is never deleted (undone instead).
    await expect(prisma.$executeRaw`DELETE FROM late_mark_waivers`).rejects.toThrow();
  });

  it('my pages for a sign-in with no employee record say so with a code, not a retryable error', async () => {
    for (const path of [`/time/me/attendance?month=${thisMonth}`, `/time/me/presence?month=${thisMonth}`, '/time/me/overtime', '/time/me/leave']) {
      const r = await api('hrExec', 'get', path).expect(404);
      expect(r.body.code).toBe('NO_EMPLOYEE_RECORD');
    }
  });

  describe('TIM-01 Today board', () => {
    it('a manager sees their team (not themselves), HR their scope, an employee no one, company B nothing', async () => {
      await punch(ids.empEmp, today, 'in', '10:00');
      const mgr = (await api('mgr', 'get', '/time/today').expect(200)).body;
      expect(mgr.scope).toBe('team');
      expect(mgr.people.map((p: { id: string }) => p.id).sort()).toEqual([ids.empEmp, ids.peerEmp].sort());
      const e = mgr.people.find((p: { id: string }) => p.id === ids.empEmp);
      expect(e).toMatchObject({ status: 'late', inAt: '10:00', onSite: true, nudged: false });
      expect(mgr.people.find((p: { id: string }) => p.id === ids.peerEmp).status).toBe('not_in');
      expect((await api('emp', 'get', '/time/today').expect(200)).body.people).toEqual([]);
      const hr = (await api('hrExec', 'get', `/time/today?legalEntityId=${ids.entityA}`).expect(200)).body;
      expect(hr.scope).toBe('company');
      expect(hr.people.length).toBeGreaterThanOrEqual(4);
      expect((await api('adminB', 'get', '/time/today').expect(200)).body.people.map((p: { id: string }) => p.id)).not.toContain(ids.empEmp);
      await api('mgr', 'get', '/time/today?legalEntityId=not-a-uuid').expect(400);
    });

    it('a nudge shows on the board, once a day', async () => {
      await api('mgr', 'post', `/time/people/${ids.peerEmp}/nudge`).expect(200);
      await api('mgr', 'post', `/time/people/${ids.peerEmp}/nudge`).expect(409);
      expect((await api('mgr', 'get', '/time/today').expect(200)).body.people.find((p: { id: string }) => p.id === ids.peerEmp).nudged).toBe(true);
    });
  });

  describe('TIM-04 exceptions and the HR resolve', () => {
    beforeAll(async () => {
      // A missing check-out on the 10th (blocks payroll), and a fix the employee asks for on the 11th.
      await punch(ids.empEmp, L(10), 'in', '09:30');
      await evaluate(ids.empEmp, L(1), L(20));
      await evaluate(ids.peerEmp, L(1), L(20));
      await evaluate(ids.hrEmp, L(1), L(20));
      await evaluate(ids.mgrEmp, L(1), L(20));
    });

    it('HR and the manager see the open day; the employee and company B do not', async () => {
      const hr = (await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}`).expect(200)).body;
      expect(hr.canResolve).toBe(true);
      const row = hr.rows.find((r: { id: string }) => r.id === `${ids.empEmp}|${L(10)}`);
      expect(row).toMatchObject({ kind: 'Missing check-out', status: 'Open', blocking: true });
      expect(row.detail).toMatch(/Checked in 09:30/);
      const mgr = (await api('mgr', 'get', `/time/exceptions?month=${lockMonth}`).expect(200)).body;
      expect(mgr.canResolve).toBe(false);
      expect(mgr.rows.some((r: { id: string }) => r.id === `${ids.empEmp}|${L(10)}`)).toBe(true);
      expect(mgr.rows.some((r: { employeeId: string }) => r.employeeId === ids.mgrEmp)).toBe(false);
      expect((await api('emp', 'get', `/time/exceptions?month=${lockMonth}`).expect(200)).body.rows).toEqual([]);
      expect((await api('adminB', 'get', `/time/exceptions?month=${lockMonth}`).expect(200)).body.rows.some((r: { employeeId: string }) => r.employeeId === ids.empEmp)).toBe(false);
      await api('hrAdmin', 'get', '/time/exceptions?month=2026-13').expect(400);
      // The server pages and filters: one row a page, a kind filter, a search, bad paging refused.
      const one = (await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}&pageSize=25&page=1&kind=Missing%20check-out`).expect(200)).body;
      expect(one).toMatchObject({ page: 1, pageSize: 25 });
      expect(one.rows.every((r: { kind: string }) => r.kind === 'Missing check-out')).toBe(true);
      expect(one.total).toBeGreaterThanOrEqual(1);
      const far = (await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}&page=999`).expect(200)).body;
      expect(far.rows).toEqual([]);
      expect(far.total).toBe(0);
      expect((await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}&search=nobody-${run}`).expect(200)).body.rows).toEqual([]);
      await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}&pageSize=7`).expect(400);
      await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}&status=Done`).expect(400);
    });

    it('refuses the wrong role, bad input, today, another company, one\'s own day and a day with a fix waiting', async () => {
      const body = { days: [{ employeeId: ids.empEmp, on: L(10) }], how: 'present', inMinute: 570, outMinute: 1110, reason: 'Gate register shows 18:30' };
      await api('hrExec', 'post', '/time/exceptions/resolve').send(body).expect(403);
      await api('mgr', 'post', '/time/exceptions/resolve').send(body).expect(403);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, outMinute: undefined }).expect(400);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, outMinute: 570 }).expect(400);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, how: 'absent' }).expect(400);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, reason: '' }).expect(400);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, days: [body.days[0], body.days[0]] }).expect(400);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, extra: 1 }).expect(400);
      expect((await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, days: [{ employeeId: ids.empEmp, on: today }] }).expect(400)).body.message).toMatch(/not over yet/);
      await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, days: [{ employeeId: ids.empBEmp, on: L(10) }] }).expect(404);
      // Company B's admin holds no HR key here; company A's HR never reaches B's people (404 above).
      await api('adminB', 'post', '/time/exceptions/resolve').send(body).expect(403);
      expect((await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, days: [{ employeeId: ids.hrEmp, on: L(10) }] }).expect(403)).body.message).toMatch(/your own/);
      await api('emp', 'post', '/time/me/regularise').send({ on: L(11), kind: 'full_day', reason: 'Client visit all day' }).expect(201);
      expect((await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ ...body, days: [{ employeeId: ids.empEmp, on: L(11) }] }).expect(409)).body.message).toMatch(/Approve or reject that request first/);
      const pending = (await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}`).expect(200)).body.rows.find((r: { id: string }) => r.id === `${ids.empEmp}|${L(11)}`);
      expect(pending).toMatchObject({ status: 'Request pending' });
    });

    it('acting for someone else is refused', async () => {
      const res = await api('adminA', 'post', `/auth/impersonate/${users.hrAdmin}`);
      if (res.status !== 200) return void expect([401, 403]).toContain(res.status);
      await as(res.body.accessToken, 'post', '/time/exceptions/resolve').send({ days: [{ employeeId: ids.empEmp, on: L(10) }], how: 'absent', reason: 'Acting for HR' }).expect(403);
    });

    it('HR resolves with times: the day is worked out from them, audited, and a repeat is the same resolution', async () => {
      const body = { days: [{ employeeId: ids.empEmp, on: L(10) }], how: 'present', inMinute: 570, outMinute: 1110, reason: 'Gate register shows 18:30' };
      const r = (await api('hrAdmin', 'post', '/time/exceptions/resolve').send(body).expect(200)).body;
      expect(r).toMatchObject({ resolved: 1, days: [{ from: 'missing_out', to: 'present' }] });
      expect(await dayOf(ids.empEmp, L(10))).toMatchObject({ status: 'present', regularised: true, workedMinutes: 510 });
      expect((await api('hrAdmin', 'post', '/time/exceptions/resolve').send(body).expect(200)).body).toMatchObject({ resolved: 0, unchanged: 1 });
      expect(await inA((tx) => tx.attendanceResolution.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }))).toBe(1);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'attendance.resolved', entityId: ids.empEmp } }))).toBe(1);
      const row = (await api('hrAdmin', 'get', `/time/exceptions?month=${lockMonth}`).expect(200)).body.rows.find((x: { id: string }) => x.id === `${ids.empEmp}|${L(10)}`);
      expect(row).toMatchObject({ status: 'Resolved', resolution: { how: 'present', reason: 'Gate register shows 18:30' } });
      // A weekly-off kind of day has nothing to resolve: a leave day is refused in plain words.
      await inA((tx) => tx.attendanceDay.update({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: ids.peerEmp, workOn: new Date(`${L(15)}T00:00:00Z`) } }, data: { status: 'holiday' } }));
      expect((await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ days: [{ employeeId: ids.peerEmp, on: L(15) }], how: 'absent', reason: 'Never came' }).expect(409)).body.message).toMatch(/holiday/);
      await evaluate(ids.peerEmp, L(15));
    });

    it('TIM-02 bulk: HR marks people present with a reason; days already worked stay', async () => {
      await api('mgr', 'post', '/time/muster/mark-present').send({ employeeIds: [ids.empEmp], on: L(12), reason: 'Reader down' }).expect(403);
      await api('hrAdmin', 'post', '/time/muster/mark-present').send({ employeeIds: [ids.empEmp, ids.empEmp], on: L(12), reason: 'Reader down' }).expect(400);
      const r = (await api('hrAdmin', 'post', '/time/muster/mark-present').send({ employeeIds: [ids.empEmp, ids.peerEmp], on: L(12), reason: 'Biometric reader at gate 2 was down' }).expect(200)).body;
      expect(r.resolved).toBe(2);
      expect((await dayOf(ids.peerEmp, L(12)))!.status).toBe('present');
      expect((await api('hrAdmin', 'post', '/time/muster/mark-present').send({ employeeIds: [ids.empEmp, ids.peerEmp], on: L(12), reason: 'Again' }).expect(200)).body).toMatchObject({ resolved: 0, unchanged: 2 });
    });

    it('TIM-03 day card: HR may resolve a past day (never today); a manager reads it; overtime and late marks show', async () => {
      const hr = (await api('hrAdmin', 'get', `/time/people/${ids.empEmp}/days/${L(10)}`).expect(200)).body;
      expect(hr.hrFix).toEqual({ ok: true, why: null });
      expect(hr.resolution).toMatchObject({ how: 'present', inMinute: 570 });
      expect(hr.lateMarks).toMatchObject({ free: 3 });
      expect((await api('hrAdmin', 'get', `/time/people/${ids.empEmp}/days/${today}`).expect(200)).body.hrFix).toMatchObject({ ok: false });
      expect((await api('mgr', 'get', `/time/people/${ids.empEmp}/days/${L(10)}`).expect(200)).body.hrFix).toBeNull();
      await api('hrAdmin', 'get', `/time/people/${ids.hrEmp}/days/${L(10)}`).expect(200);
      expect((await api('hrAdmin', 'get', `/time/people/${ids.hrEmp}/days/${L(10)}`).expect(200)).body.hrFix).toBeNull();
      await api('adminB', 'get', `/time/people/${ids.empEmp}/days/${L(10)}`).expect(404);
    });
  });

  describe('TIM-09 overtime decisions on the review page (one approvals engine)', () => {
    let first: string;
    let second: string;
    beforeAll(async () => {
      for (const [day, out] of [[13, '20:00'], [14, '20:00']] as const) {
        await punch(ids.empEmp, L(day), 'in', '09:30');
        await punch(ids.empEmp, L(day), 'out', out);
      }
      await evaluate(ids.empEmp, L(13), L(14));
      first = (await api('emp', 'post', '/time/me/overtime').send({ on: L(13), reason: 'Line changeover' }).expect(201)).body.id;
      second = (await api('emp', 'post', '/time/me/overtime').send({ on: L(14), reason: 'Audit prep' }).expect(201)).body.id;
    });

    it('the manager sees their task on each claim; others cannot decide it', async () => {
      const review = (await api('mgr', 'get', `/time/overtime?month=${lockMonth}`).expect(200)).body;
      const c = review.claims.find((x: { id: string }) => x.id === first);
      expect(c.taskId).toBeTruthy();
      expect(c.canCompOff).toBe(false);
      expect((await api('hrExec', 'get', `/time/overtime?month=${lockMonth}`).expect(200)).body.claims.find((x: { id: string }) => x.id === first).taskId).toBeNull();
      await api('peer', 'post', `/time/overtime/${first}/decide`).send({ decision: 'approve' }).expect(404);
      await api('hrAdmin', 'post', `/time/overtime/${first}/decide`).send({ decision: 'approve' }).expect(404);
      await api('adminB', 'post', `/time/overtime/${first}/decide`).send({ decision: 'approve' }).expect(404);
      await api('mgr', 'post', `/time/overtime/${first}/decide`).send({ decision: 'reject' }).expect(400);
      await api('mgr', 'post', `/time/overtime/${first}/decide`).send({ decision: 'maybe' }).expect(400);
      expect((await api('mgr', 'post', `/time/overtime/${first}/decide`).send({ decision: 'comp_off' }).expect(409)).body.message).toMatch(/comp-off leave type/);
      expect((await inA((tx) => tx.overtimeRequest.findFirstOrThrow({ where: { id: first } }))).settle).toBe('pay');
    });

    it('approve as pay; comp-off credits the leave ledger once; a decided claim is not decided again', async () => {
      expect((await api('mgr', 'post', `/time/overtime/${first}/decide`).send({ decision: 'approve' }).expect(200)).body.status).toBe('approved');
      expect((await inA((tx) => tx.overtimeRequest.findFirstOrThrow({ where: { id: first } }))).status).toBe('approved');
      await api('mgr', 'post', `/time/overtime/${first}/decide`).send({ decision: 'approve' }).expect(404);
      ids.compOff = (await inA((tx) => tx.leaveType.create({ data: { organizationId: org.A.id, code: 'CO', name: 'Comp-off', kind: 'comp_off' } }))).id;
      expect((await api('mgr', 'get', `/time/overtime?month=${lockMonth}`).expect(200)).body.claims.find((x: { id: string }) => x.id === second).canCompOff).toBe(true);
      await api('mgr', 'post', `/time/overtime/${second}/decide`).send({ decision: 'comp_off', reason: 'Staff prefers time off' }).expect(200);
      const r = await inA((tx) => tx.overtimeRequest.findFirstOrThrow({ where: { id: second } }));
      expect(r).toMatchObject({ status: 'approved', settle: 'comp_off' });
      expect(await inA((tx) => tx.leaveLedgerEntry.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, periodKey: `ot:${second}` } }))).toBe(1);
      // The approvals inbox shows nothing left for these claims: one engine.
      expect((await inbox('mgr')).some((t) => /overtime/.test(t.title))).toBe(false);
    });
  });

  // Batch C item 6 (answers 2505, 2506): attendance.lock waives late-mark penalties before the lock; the mark stays.
  describe('late-mark penalty waivers', () => {
    const upsertLate = (employeeId: string, on: string, lateMinutes: number) =>
      inA((tx) => tx.attendanceDay.upsert({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId, workOn: new Date(`${on}T00:00:00Z`) } }, create: { organizationId: org.A.id, employeeId, workOn: new Date(`${on}T00:00:00Z`), mode: 'punch', status: 'present', lateMinutes, workedMinutes: 480 }, update: { status: 'present', lateMinutes } }));
    const feedLop = async (employeeId: string) => ((await api('hrAdmin', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${lockMonth}`).expect(200)).body.rows as { employeeId: string; lopDays: number }[]).find((r) => r.employeeId === employeeId)!.lopDays;

    it('lists the late marks; refuses the wrong role, another company, bad input; waives with one reason; the feed drops the penalty; undo brings it back', async () => {
      await upsertLate(ids.empEmp, L(5), 20);
      await upsertLate(ids.empEmp, L(6), 15);
      // Free 1 late mark, then a full day of pay each (the company settings).
      await setting('attendance.late_marks_free', '1');
      await setting('attendance.late_mark_penalty', '1');
      const q = `/time/periods/late-marks?legalEntityId=${ids.entityA}&month=${lockMonth}`;
      await api('mgr', 'get', q).expect(403);
      await api('hrExec', 'get', q).expect(403);
      await api('adminB', 'get', q).expect(404);
      const list = (await api('hrAdmin', 'get', q).expect(200)).body;
      expect(list.unlocked).toBe(true);
      expect(list.rows.filter((r: { employeeId: string }) => r.employeeId === ids.empEmp).map((r: { on: string; waiver: unknown }) => [r.on, r.waiver])).toEqual([[L(5), null], [L(6), null]]);
      const before = await feedLop(ids.empEmp);
      const body = { legalEntityId: ids.entityA, month: lockMonth };
      const reason = 'Bus breakdown on the highway';
      await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(5) }], reason: 'Too short' }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [], reason }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: `${thisMonth}-01` }], reason }).expect(400);
      await api('hrExec', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(5) }], reason }).expect(403);
      await api('adminB', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(5) }], reason }).expect(404);
      const out = (await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(5) }, { employeeId: ids.empEmp, on: L(7) }], reason }).expect(200)).body;
      expect(out.waived).toHaveLength(1);
      expect(out.skipped).toEqual([{ employeeId: ids.empEmp, on: L(7), message: 'There is no late mark on this day.' }]);
      // A repeat is said, not waived twice.
      expect((await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(5) }], reason }).expect(200)).body.skipped[0].message).toBe('Already waived.');
      expect(await feedLop(ids.empEmp)).toBe(before - 1);
      // The mark stays on the day, shown as waived; it no longer counts.
      const card = (await api('hrAdmin', 'get', `/time/people/${ids.empEmp}/days/${L(5)}`).expect(200)).body;
      expect(card.day.lateMinutes).toBe(20);
      expect(card.lateWaived).toMatchObject({ reason });
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.late_mark.waived' } }))).toBe(1);
      // Undo: a reason too; the penalty is back.
      const w = (await api('hrAdmin', 'get', q).expect(200)).body.rows.find((r: { on: string; employeeId: string }) => r.on === L(5) && r.employeeId === ids.empEmp).waiver;
      await api('hrAdmin', 'post', '/time/periods/late-marks/undo').send({ ...body, waiverIds: [w.id], reason: 'short' }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/late-marks/undo').send({ ...body, waiverIds: [w.id], reason: 'Transport did not confirm it' }).expect(200);
      await api('hrAdmin', 'post', '/time/periods/late-marks/undo').send({ ...body, waiverIds: [w.id], reason: 'Transport did not confirm it' }).expect(404);
      expect(await feedLop(ids.empEmp)).toBe(before);
      // Waived again for the lock below (kept after the lock).
      await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(6) }], reason: 'Heavy rain closed the gate' }).expect(200);
      await inA((tx) => tx.setting.deleteMany({ where: { organizationId: org.A.id, key: { in: ['attendance.late_marks_free', 'attendance.late_mark_penalty'] } } }));
    });
  });

  describe('TIM-02 / TIM-11 freeze, send and the lock (attendance.lock_flow)', () => {
    it('freeze: waiting requests first; the wrong role, another company, acting for someone else are refused', async () => {
      const body = { legalEntityId: ids.entityA, month: lockMonth };
      await api('hrExec', 'post', '/time/periods/freeze').send(body).expect(403);
      await api('payroll', 'post', '/time/periods/freeze').send(body).expect(403);
      await api('adminB', 'post', '/time/periods/freeze').send(body).expect(404);
      await api('hrAdmin', 'post', '/time/periods/freeze').send({ ...body, month: 'May' }).expect(400);
      expect((await api('hrAdmin', 'post', '/time/periods/freeze').send({ ...body, month: thisMonth }).expect(400)).body.message).toMatch(/can be frozen from/);
      expect((await api('hrAdmin', 'post', '/time/periods/freeze').send(body).expect(409)).body.code).toBe('FREEZE_PENDING');
      const fix = await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.empEmp, status: 'pending' } }));
      await api('emp', 'post', `/time/me/regularise/${fix.id}/withdraw`).expect(200);
      // The muster shows the stage and what the viewer may do.
      const before = (await api('hrAdmin', 'get', `/time/muster?month=${lockMonth}`).expect(200)).body;
      expect(before.period).toMatchObject({ stage: 'open', flow: 'one_step', canLock: true, lockable: true });
      expect(before.canMarkPresent).toBe(true);
      expect((await api('mgr', 'get', `/time/muster?month=${lockMonth}`).expect(200)).body.canMarkPresent).toBe(false);
      expect((await api('hrAdmin', 'post', '/time/periods/freeze').send(body).expect(200)).body.stage).toBe('frozen');
      await api('hrAdmin', 'post', '/time/periods/freeze').send(body).expect(409);
    });

    it('a frozen month refuses changes: punches in the database, resolves on the API; a late request goes the correction route', async () => {
      await expect(punch(ids.peerEmp, L(16), 'in', '09:30')).rejects.toThrow();
      expect((await api('hrAdmin', 'post', '/time/exceptions/resolve').send({ days: [{ employeeId: ids.peerEmp, on: L(16) }], how: 'absent', reason: 'No show' }).expect(409)).body.code).toBe('PERIOD_LOCKED');
      expect((await api('hrAdmin', 'get', `/time/people/${ids.peerEmp}/days/${L(16)}`).expect(200)).body.hrFix).toMatchObject({ ok: false });
      const me = (await api('emp', 'get', `/time/me/attendance?month=${lockMonth}`).expect(200)).body;
      expect(me.locked).toContain(L(16));
      expect(me.lateRequestMaxDays).toBe(60);
      await api('emp', 'post', '/time/me/regularise').send({ on: L(16), kind: 'full_day', reason: 'Was on site all day' }).expect(409);
      expect((await api('emp', 'post', '/payroll/me/late-corrections').send({ on: L(16), kind: 'attendance', shouldBe: 'present', reason: 'I was at the client site all day' }).expect(201)).body.stage).toBe('frozen');
    });

    it('unfreeze needs a reason; payroll can\'t; then two-step: HR sends, someone else in payroll approves with the second step', async () => {
      const body = { legalEntityId: ids.entityA, month: lockMonth };
      // Founder decision 7a: opening a month again asks for the authenticator code first, like Lock.
      expect([401, 403]).toContain((await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body, reason: 'Reopen for a missed fix' })).status);
      await markSteppedUp(tenantPrisma, token.hrAdmin);
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body, reason: 'short' }).expect(400);
      await api('payroll', 'post', '/time/periods/unfreeze').send({ ...body, reason: 'Reopen for a missed fix' }).expect(403);
      expect((await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body, reason: 'Reopen for a missed fix' }).expect(200)).body.stage).toBe('open');
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ ...body, reason: 'Reopen for a missed fix' }).expect(409);
      // One-step company: send and approve are refused.
      await api('hrAdmin', 'post', '/time/periods/send').send(body).expect(409);
      await setting('attendance.lock_flow', 'two_step');
      await markSteppedUp(tenantPrisma, token.hrAdmin);
      expect((await api('hrAdmin', 'post', '/time/periods/lock').send(body).expect(409)).body.code).toBe('LOCK_TWO_STEP');
      await markSteppedUp(tenantPrisma, token.payroll);
      expect((await api('payroll', 'post', '/time/periods/approve-lock').send(body).expect(409)).body.message).toMatch(/not sent/);
      await api('payroll', 'post', '/time/periods/send').send(body).expect(403);
      // The sender and the approver are never the same person.
      const sent = (await api('both', 'post', '/time/periods/send').send(body).expect(200)).body;
      expect(sent).toMatchObject({ stage: 'frozen', repeat: false });
      expect((await api('hrAdmin', 'post', '/time/periods/send').send(body).expect(200)).body.repeat).toBe(true);
      await markSteppedUp(tenantPrisma, token.both);
      expect((await api('both', 'post', '/time/periods/approve-lock').send(body).expect(403)).body.message).toMatch(/someone else/);
      const list = (await api('payroll', 'get', `/time/periods?year=${lockMonth.slice(0, 4)}`).expect(200)).body;
      const e = list.entities.find((x: { id: string }) => x.id === ids.entityA);
      expect(e).toMatchObject({ flow: 'two_step', canLock: false, canApprove: true });
      expect(e.months.find((m: { month: string }) => m.month === lockMonth)).toMatchObject({ stage: 'frozen', sentBy: `both ${run}` });
      await api('payroll', 'get', `/time/periods/preflight?legalEntityId=${ids.entityA}&month=${lockMonth}`).expect(200);
      await api('hrExec', 'get', `/time/periods?year=${lockMonth.slice(0, 4)}`).expect(403);
      const fresh = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `payroll@timeops-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
      expect([401, 403]).toContain((await as(fresh, 'post', '/time/periods/approve-lock').send(body)).status);
      const locked = (await api('payroll', 'post', '/time/periods/approve-lock').send(body).expect(200)).body;
      expect(locked).toMatchObject({ stage: 'locked' });
      expect(locked.frozen).toBeGreaterThan(0);
      await api('payroll', 'post', '/time/periods/approve-lock').send(body).expect(409);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.period.locked' } }))).toBe(1);
    });

    it('a locked month: unfreeze is refused; a late request still goes to payroll', async () => {
      await api('hrAdmin', 'post', '/time/periods/unfreeze').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Reopen for a missed fix' }).expect(409);
      // Batch C item 6: after the lock, waivers are neither added nor undone; the list says it is locked.
      const body = { legalEntityId: ids.entityA, month: lockMonth };
      expect((await api('hrAdmin', 'get', `/time/periods/late-marks?legalEntityId=${ids.entityA}&month=${lockMonth}`).expect(200)).body.unlocked).toBe(false);
      await api('hrAdmin', 'post', '/time/periods/late-marks/waive').send({ ...body, items: [{ employeeId: ids.empEmp, on: L(5) }], reason: 'Bus breakdown on the highway' }).expect(409);
      const kept = await inA((tx) => tx.lateMarkWaiver.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.empEmp, undoneAt: null } }));
      await api('hrAdmin', 'post', '/time/periods/late-marks/undo').send({ ...body, waiverIds: [kept.id], reason: 'Transport did not confirm it' }).expect(409);
      await api('peer', 'post', '/payroll/me/late-corrections').send({ on: L(17), kind: 'attendance', shouldBe: 'present', reason: 'I was at the client site all day' }).expect(201);
    });
  });

  describe('TIM-16 reports', () => {
    it('a manager gets their team; HR its scope; the night register is HR only', async () => {
      const mgr = (await api('mgr', 'get', `/time/reports/attendance?month=${lockMonth}`).expect(200)).body;
      expect(mgr.scope).toBe('team');
      expect(mgr.rows.map((r: { id: string }) => r.id).sort()).toEqual([ids.empEmp, ids.peerEmp].sort());
      const e = mgr.rows.find((r: { id: string }) => r.id === ids.empEmp);
      expect(e.otMinutes).toBe(90);
      expect(e.early).toBe(0);
      expect((await api('hrExec', 'get', `/time/reports/attendance?month=${lockMonth}&legalEntityId=${ids.entityA}`).expect(200)).body).toMatchObject({ scope: 'company', stage: 'locked' });
      expect((await api('emp', 'get', `/time/reports/attendance?month=${lockMonth}`).expect(200)).body.rows).toEqual([]);
      await api('mgr', 'get', `/time/reports/night?month=${lockMonth}`).expect(403);
      expect((await api('hrExec', 'get', `/time/reports/night?month=${lockMonth}`).expect(200)).body.rows).toEqual([]);
      await api('hrExec', 'get', '/time/reports/attendance?month=bad').expect(400);
    });
  });

  describe('TIM-37 industrial action', () => {
    const to = addDays(today, 2);
    it('HR records a strike for the place; its days are marked; the feed holds pay until legality is set', async () => {
      const body = { kind: 'strike', locationId: ids.locA, departmentId: ids.deptA, from: today, to, legality: 'undetermined', notice: 'Union notice dated today' };
      await api('hrExec', 'post', '/time/industrial-actions').send(body).expect(403);
      await api('adminB', 'post', '/time/industrial-actions').send(body).expect(404);
      await api('hrAdmin', 'post', '/time/industrial-actions').send({ ...body, to: addDays(today, -1) }).expect(400);
      await api('hrAdmin', 'post', '/time/industrial-actions').send({ ...body, kind: 'riot' }).expect(400);
      expect((await api('hrAdmin', 'post', '/time/industrial-actions').send({ ...body, from: L(5), to: L(6) }).expect(409)).body.code).toBe('PERIOD_LOCKED');
      const opts = (await api('hrAdmin', 'get', '/time/industrial-actions/options').expect(200)).body;
      expect(opts.locations.find((l: { id: string }) => l.id === ids.locA).departments[0].people).toBeGreaterThanOrEqual(4);
      const e = (await api('hrAdmin', 'post', '/time/industrial-actions').send(body).expect(201)).body;
      ids.event = e.id;
      expect(e).toMatchObject({ kind: 'strike', legality: 'undetermined', status: 'active', version: 1 });
      expect(e.workers).toBeGreaterThanOrEqual(4);
      await api('hrAdmin', 'post', '/time/industrial-actions').send(body).expect(409);
      // The peer has not checked in today: the day is a strike day. The employee who checked in worked.
      expect((await dayOf(ids.peerEmp, today))!.status).toBe('strike');
      expect((await dayOf(ids.empEmp, today))!.status).not.toBe('strike');
      const feed = (await api('hrAdmin', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${thisMonth}`).expect(200)).body;
      expect(feed.rows.find((r: { employeeId: string }) => r.employeeId === ids.peerEmp).heldDays).toBe(1);
      await api('adminB', 'get', `/time/industrial-actions/${e.id}`).expect(404);
      expect((await api('hrAdmin', 'get', '/time/industrial-actions').expect(200)).body.events).toHaveLength(1);
    });

    it('legality and dates are version-checked; cancelling puts the days back', async () => {
      await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/legality`).send({ legality: 'undetermined', version: 1 }).expect(400);
      await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/legality`).send({ legality: 'legal', version: 9 }).expect(409);
      expect((await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/legality`).send({ legality: 'legal', version: 1 }).expect(200)).body).toMatchObject({ legality: 'legal', version: 2 });
      const feed = (await api('hrAdmin', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${thisMonth}`).expect(200)).body;
      expect(feed.rows.find((r: { employeeId: string }) => r.employeeId === ids.peerEmp).heldDays).toBe(0);
      await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/dates`).send({ from: addDays(today, -1), to, version: 2 }).expect(400);
      expect((await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/dates`).send({ from: today, to: addDays(today, 3), version: 2 }).expect(200)).body.to).toBe(addDays(today, 3));
      await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/cancel`).send({ version: 2 }).expect(409);
      expect((await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/cancel`).send({ version: 3 }).expect(200)).body.status).toBe('cancelled');
      expect((await dayOf(ids.peerEmp, today))!.status).not.toBe('strike');
      await api('hrAdmin', 'post', `/time/industrial-actions/${ids.event}/legality`).send({ legality: 'illegal', version: 4 }).expect(409);
    });
  });

  describe('TIM-36 presence on a work-from-home day', () => {
    it('only with the company switch and the person\'s consent; the person sees times, the manager only the total', async () => {
      expect((await api('peer', 'post', '/time/me/presence/consent').send({ action: 'give' }).expect(409)).body.message).toMatch(/not turned on/);
      await setting('attendance.presence', 'on');
      await api('peer', 'post', '/time/me/presence/consent').send({ action: 'maybe' }).expect(400);
      const now = Date.now();
      const midnight = instantAt(today, ZONE, 0).getTime();
      const signals = [{ at: new Date(Math.max(midnight + 60_000, now - 3 * 3_600_000)).toISOString(), state: 'active' }, { at: new Date(now).toISOString(), state: 'offline' }];
      await api('peer', 'post', '/time/me/presence/signals').send({ signals }).expect(403);
      expect((await api('peer', 'post', '/time/me/presence/consent').send({ action: 'give' }).expect(200)).body.repeat).toBe(false);
      expect((await api('peer', 'post', '/time/me/presence/consent').send({ action: 'give' }).expect(200)).body.repeat).toBe(true);
      await api('peer', 'post', '/time/me/presence/signals').send({ signals: [{ at: new Date(now - 2 * 86_400_000).toISOString(), state: 'active' }] }).expect(400);
      await api('peer', 'post', '/time/me/presence/signals').send({ signals: [{ at: 'yesterday', state: 'active' }] }).expect(400);
      await inA((tx) => tx.attendanceRequest.create({ data: { organizationId: org.A.id, employeeId: ids.peerEmp, workOn: new Date(`${today}T00:00:00Z`), kind: 'wfh', status: 'approved', reason: 'Plumber visit', decidedAt: new Date() } }));
      expect((await api('peer', 'post', '/time/me/presence/signals').send({ signals }).expect(200)).body.recorded).toBe(2);
      expect((await api('peer', 'post', '/time/me/presence/signals').send({ signals }).expect(200)).body).toMatchObject({ recorded: 0, ignored: 2 });
      const mine = (await api('peer', 'get', `/time/me/presence?month=${thisMonth}`).expect(200)).body;
      expect(mine.consent).toBeTruthy();
      const day = mine.days.find((d: { on: string }) => d.on === today);
      expect(day).toMatchObject({ byPresence: true });
      expect(day.first).toBeTruthy();
      const team = (await api('mgr', 'get', `/time/presence?month=${thisMonth}`).expect(200)).body;
      const t = team.days.find((d: { employeeId: string }) => d.employeeId === ids.peerEmp);
      expect(t).toMatchObject({ first: null, last: null });
      expect(t.activeMinutes).toBeGreaterThan(0);
      expect((await api('adminB', 'get', `/time/presence?month=${thisMonth}`).expect(200)).body.days).toEqual([]);
      await api('peer', 'post', '/time/me/presence/consent').send({ action: 'withdraw' }).expect(200);
      await api('peer', 'post', '/time/me/presence/consent').send({ action: 'withdraw' }).expect(409);
      await api('peer', 'post', '/time/me/presence/signals').send({ signals }).expect(403);
    });
  });

  describe('TIM-10 device backfill', () => {
    it('preview shows what changes (open days worked out and rolled back, locked days as corrections); apply needs the second step and the reviewed count', async () => {
      await api('hrAdmin', 'post', '/payroll/device-batches')
        .send({
          legalEntityId: ids.entityA,
          deviceRef: 'GATE-1',
          punches: [
            { employeeCode: `TO2-${run}`, at: at(today, '18:30').toISOString(), kind: 'out' },
            { employeeCode: `TO3-${run}`, at: at(L(18), '09:30').toISOString(), kind: 'in' },
            { employeeCode: `TO3-${run}`, at: at(L(18), '18:30').toISOString(), kind: 'out' },
          ],
        })
        .expect(201);
      expect((await api('hrAdmin', 'get', `/time/device-batches?legalEntityId=${ids.entityA}`).expect(200)).body.batches[0]).toMatchObject({ deviceRef: 'GATE-1', punches: 3, people: 2 });
      // No entity picked: every entity the person may lock, each batch naming its entity; no attendance.lock: 403.
      expect((await api('hrAdmin', 'get', '/time/device-batches').expect(200)).body.batches[0]).toMatchObject({ deviceRef: 'GATE-1', legalEntityId: ids.entityA, entityName: `TimeOps Foods A` });
      await api('mgr', 'get', '/time/device-batches').expect(403);
      await api('hrAdmin', 'get', `/time/device-batches?legalEntityId=${ids.entityB}`).expect(404);
      await api('hrExec', 'get', `/time/device-batches/preview?legalEntityId=${ids.entityA}&deviceRef=GATE-1`).expect(403);
      await api('adminB', 'get', `/time/device-batches/preview?legalEntityId=${ids.entityA}&deviceRef=GATE-1`).expect(404);
      await api('hrAdmin', 'get', `/time/device-batches/preview?legalEntityId=${ids.entityA}&deviceRef=NOPE`).expect(404);
      const before = await dayOf(ids.empEmp, today);
      const p = (await api('hrAdmin', 'get', `/time/device-batches/preview?legalEntityId=${ids.entityA}&deviceRef=GATE-1`).expect(200)).body;
      expect(p).toMatchObject({ punches: 3, people: 2, personDays: 2, corrections: 1 });
      expect(p.changes.find((x: { employeeId: string }) => x.employeeId === ids.empEmp)).toMatchObject({ open: true, after: { lastOut: '18:30' } });
      expect(p.changes.find((x: { employeeId: string }) => x.employeeId === ids.peerEmp)).toMatchObject({ open: false, after: null });
      // The preview wrote nothing.
      expect(await dayOf(ids.empEmp, today)).toMatchObject({ status: before!.status, lastOut: before!.lastOut });
      const body = { legalEntityId: ids.entityA, deviceRef: 'GATE-1', reason: 'Gate 1 kiosk was offline; punches synced late', punches: 3 };
      const fresh = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `hrAdmin@timeops-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
      expect([401, 403]).toContain((await as(fresh, 'post', '/time/device-backfills').send(body)).status);
      await api('hrAdmin', 'post', '/time/device-backfills').send({ ...body, punches: 2 }).expect(409);
      await api('hrAdmin', 'post', '/time/device-backfills').send({ ...body, reason: 'short' }).expect(400);
      const done = (await api('hrAdmin', 'post', '/time/device-backfills').send(body).expect(201)).body;
      expect(done).toMatchObject({ punches: 3, personDays: 2, openDays: 1, corrections: 1 });
      expect((await dayOf(ids.empEmp, today))!.lastOut).toBeTruthy();
      expect(await inA((tx) => tx.payCorrection.count({ where: { organizationId: org.A.id, employeeId: ids.peerEmp, source: 'device_backfill' } }))).toBe(1);
      await api('hrAdmin', 'post', '/time/device-backfills').send(body).expect(404);
    });
  });
});
