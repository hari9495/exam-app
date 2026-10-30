import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { LeaveV2Service } from '../src/time/leave-v2.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Time design gaps made live (30 Oct 2026), end to end against the real database (forced RLS, the app role):
// Extra · My attendance today OutsideNetwork / ChoseWfh / ShiftNotStarted, Extra · Attendance calendar Manager · one
// person, TIM-17 Manager, TIM-19 Manager, TIM-31 IpError and TIM-39 Suspend. Each: the positive path and the wrong
// role, another company, out of scope (a manager opening someone outside the team gets 404), bad input and a repeat.
describe('Time gaps made live', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let leaveV2: LeaveV2Service;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'mgr' | 'emp' | 'peer' | 'mgr2' | 'outsider' | 'blocked' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const ZONE = 'Asia/Kolkata';
  const today = DateTime.now().setZone(ZONE).toISODate()!;
  const month = today.slice(0, 7);
  const d = (n: number) => addDays(today, n);
  const setting = (key: string, value: string) => api('adminA', 'put', '/org/settings').send({ key, value, scopeType: 'tenant' }).expect(200);
  const login = (who: Who) => request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[who === 'adminB' || who === 'empB' ? 'B' : 'A'].slug, email: `${who}@gaps-${run}.test`, password: PASSWORD });
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });

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
    leaveV2 = moduleRef.get(LeaveV2Service);

    planId = (await prisma.plan.create({ data: { name: `gaps-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Gaps Org ${k}`, slug: `gaps-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['mgr2', 'A', 'panel', null],
      ['outsider', 'A', 'panel', null],
      ['blocked', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@gaps-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await login(who).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Gaps Foods ${k}`, shortName: `GF${k}-${run}`, isDefault: true } })).id;
        // Office networks only (no geofence), so the network decides; supertest calls from 127.0.0.1, never on 10.20.4.x.
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai office', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['10.20.4.0/24'] } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day: 12:00 am to 11:59 pm, so check-in is open whenever the suite runs.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 0, shiftEnd: 1439, weeklyOffs: [] } });
      });
    }
    // A second office on the test machine's own network: someone there is "inside" before any punch.
    ids.locIn = (await inA((tx) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, name: 'Lab', code: 'LAB', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['127.0.0.0/8', '::1/128'] } }))).id;
    await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locIn, validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 0, shiftEnd: 1439, weeklyOffs: [] } }));
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', locationId = ids[`loc${k}`]) =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: `${addDays(`${month}-01`, -1).slice(0, 7)}-01`, userId: users[who], workEmail: `${who}@gaps-${run}.test`, assignment: { locationId, departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .then((r) => {
            if (r.status !== 201) throw new Error(`hire ${who}: ${r.status} ${JSON.stringify(r.body)}`);
            return r;
          })
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp, 'A', ids.locIn);
    // A site whose shift starts 2.5 hours from now (rules are append-only, so it is set once here): mgr2 works there.
    const nowMin = DateTime.now().setZone(ZONE).hour * 60 + DateTime.now().setZone(ZONE).minute;
    ids.locLate = (await inA((tx) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, name: 'Late site', code: 'LTE', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['10.20.4.0/24'] } }))).id;
    if (nowMin + 180 <= 1439) {
      ids.lateStart = String(nowMin + 150);
      await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locLate, validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: nowMin + 150, shiftEnd: nowMin + 180, weeklyOffs: [] } }));
    } else await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.locLate, validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 0, shiftEnd: 1439, weeklyOffs: [] } }));
    ids.mgr2Emp = await hire('adminA', 'mgr2', null, 'A', ids.locLate);
    ids.outsiderEmp = await hire('adminA', 'outsider', ids.mgr2Emp);
    ids.blockedEmp = await hire('adminA', 'blocked', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hr', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');

    ids.CL = (await api('hr', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'casual', paid: true }).expect(201)).body.id;
    ids.policy = (await api('hr', 'post', '/time/setup/policies').send({ name: 'Staff' }).expect(201)).body.id;
    await api('hr', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: '2025-01-01', lines: [{ leaveTypeId: ids.CL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }] }).expect(201);
    await api('hr', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: '2025-01-01' }).expect(201);
    for (const e of [ids.empEmp, ids.peerEmp, ids.outsiderEmp]) await api('hr', 'post', `/time/people/${e}/adjust`).send({ leaveTypeId: ids.CL, days: 10, reason: 'Opening balance' }).expect(201);
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

  // ------------------------------------------------------------------------------------------ TIM-31 IpError

  describe('TIM-31 IpError: office networks', () => {
    it('HR saves good ranges; a bad range is refused by line; wrong role 403, another company 404, bad input 400', async () => {
      const bad = await api('hr', 'post', `/time/setup/locations/${ids.locA}/networks`).send({ ipRanges: ['10.20.4.0/24', '10.20.300.0/24'] }).expect(400);
      expect(bad.body.message).toBe('Line 2: 10.20.300.0/24 is not a valid range. Each part must be 0–255, e.g. 10.20.4.0/24.');
      const ok = await api('hr', 'post', `/time/setup/locations/${ids.locA}/networks`).send({ ipRanges: [' 10.20.4.0/24', '', '10.20.5.0/24', '10.20.4.0/24'] }).expect(200);
      expect(ok.body.ipRanges).toEqual(['10.20.4.0/24', '10.20.5.0/24']);
      expect((await inA((tx) => tx.location.findFirstOrThrow({ where: { id: ids.locA } }))).ipRanges).toEqual(['10.20.4.0/24', '10.20.5.0/24']);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'org.location.networks_changed', entityId: ids.locA } }))).toBe(1);
      await api('mgr', 'post', `/time/setup/locations/${ids.locA}/networks`).send({ ipRanges: [] }).expect(403);
      await api('adminB', 'post', `/time/setup/locations/${ids.locA}/networks`).send({ ipRanges: [] }).expect(404);
      await api('hr', 'post', `/time/setup/locations/${ids.locA}/networks`).send({ ipRanges: '10.20.4.0/24' }).expect(400);
      await api('hr', 'post', `/time/setup/locations/not-a-uuid/networks`).send({ ipRanges: [] }).expect(400);
    });
  });

  // ------------------------------------------------------------------------------------------ Extra · today

  describe('My attendance today: OutsideNetwork, ChoseWfh, ShiftNotStarted', () => {
    it('OutsideNetwork: off the office network the server says so before any punch; on it, inside', async () => {
      const me = (await api('emp', 'get', `/time/me/attendance?month=${month}`).expect(200)).body;
      expect(me).toMatchObject({ network: 'outside', wfhSameDay: true, wfhPendingToday: false, shift: { opensBefore: null } });
      expect(me.manager).toBe(`mgr ${run}`);
      expect((await api('peer', 'get', `/time/me/attendance?month=${month}`).expect(200)).body.network).toBe('inside');
      // The punch itself is still refused and logged (YX-AT-23).
      const refused = (await api('emp', 'post', '/time/me/punch').send({ kind: 'in' }).expect(200)).body;
      expect(refused).toMatchObject({ accepted: false, verdict: 'no_location' });
    });

    it('ChoseWfh: clocking in as WFH raises the request with the punch; not approved, the punches stop counting', async () => {
      await api('emp', 'post', '/time/me/punch').send({ kind: 'out', wfh: true }).expect(400);
      const p = (await api('emp', 'post', '/time/me/punch').send({ kind: 'in', wfh: true }).expect(200)).body;
      expect(p).toMatchObject({ accepted: true, verdict: 'field' });
      const me = (await api('emp', 'get', `/time/me/attendance?month=${month}`).expect(200)).body;
      expect(me.wfhPendingToday).toBe(true);
      expect(me.wfh.used).toBe(1);
      // A repeat raises no second request; the next punch counts as WFH too.
      await api('emp', 'post', '/time/me/punch').send({ kind: 'in', wfh: true }).expect(200);
      expect(await inA((tx) => tx.attendanceRequest.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, kind: 'wfh' } }))).toBe(1);
      const dayOf = () => inA((tx) => tx.attendanceDay.findFirst({ where: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${today}T00:00:00Z`) } }));
      expect((await dayOf())?.firstIn).not.toBeNull();
      const task = ((await api('mgr', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string }[]).find((t) => t.title.includes('work from home'))!;
      expect(task).toBeDefined();
      // Out of scope: another manager cannot decide it.
      expect((await decide('mgr2', task.taskId, 'reject', 'No')).status).toBeGreaterThanOrEqual(400);
      await decide('mgr', task.taskId, 'reject', 'Please come in today').expect(200);
      // The punches stay as recorded (append-only); the day no longer counts them.
      expect(await inA((tx) => tx.punch.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, verdict: 'field', accepted: true } }))).toBeGreaterThan(0);
      expect((await dayOf())?.firstIn ?? null).toBeNull();
      // Not approved, the next punch from outside is refused again.
      expect((await api('emp', 'post', '/time/me/punch').send({ kind: 'out' }).expect(200)).body).toMatchObject({ accepted: false, verdict: 'no_location' });
    });

    it('ChoseWfh: the company can turn it off; then clocking in as WFH is refused', async () => {
      await setting('attendance.wfh_same_day', 'off');
      const me = (await api('outsider', 'get', `/time/me/attendance?month=${month}`).expect(200)).body;
      expect(me.wfhSameDay).toBe(false);
      expect((await api('outsider', 'post', '/time/me/punch').send({ kind: 'in', wfh: true }).expect(400)).body.message).toBe('Your company asks for work from home ahead. Request it, then clock in once it is approved.');
      await setting('attendance.wfh_same_day', 'on');
    });

    it('ShiftNotStarted: check-in opens the set time before the shift; earlier is refused with when it opens', async () => {
      if (!ids.lateStart) return; // near midnight the late shift would cross into tomorrow; other runs cover the rule
      await setting('attendance.check_in_opens_minutes', '60');
      expect((await api('mgr2', 'get', `/time/me/attendance?month=${month}`).expect(200)).body.shift.opensBefore).toBe(60);
      const early = await api('mgr2', 'post', '/time/me/punch').send({ kind: 'in' }).expect(409);
      expect(early.body.message).toMatch(/^Your .+ shift starts at \d{1,2}:\d{2} (am|pm)\. Check-in opens at \d{1,2}:\d{2} (am|pm)\.$/);
      await setting('attendance.check_in_opens_minutes', '180');
      // Inside the window the place decides (outside the office network here), so it gets as far as the network check.
      expect((await api('mgr2', 'post', '/time/me/punch').send({ kind: 'in' }).expect(200)).body.verdict).toBe('no_location');
      await setting('attendance.check_in_opens_minutes', 'any');
    });
  });

  // ------------------------------------------------------------------------------------------ Manager · one person

  describe('Attendance calendar, Manager · one person', () => {
    it("a manager opens their own team's month; someone outside the team, another company or a peer gets 404", async () => {
      const body = (await api('mgr', 'get', `/time/people/${ids.empEmp}/attendance?month=${month}`).expect(200)).body;
      expect(body.employee).toMatchObject({ id: ids.empEmp, name: `emp ${run}`, role: 'Analyst', location: 'Chennai office' });
      expect(Array.isArray(body.days)).toBe(true);
      expect(body).toMatchObject({ month, today, locked: [] });
      await api('mgr', 'get', `/time/people/${ids.outsiderEmp}/attendance?month=${month}`).expect(404);
      await api('mgr', 'get', `/time/people/${ids.empBEmp}/attendance?month=${month}`).expect(404);
      await api('peer', 'get', `/time/people/${ids.empEmp}/attendance?month=${month}`).expect(404);
      await api('hr', 'get', `/time/people/${ids.outsiderEmp}/attendance?month=${month}`).expect(200);
      await api('mgr', 'get', `/time/people/${ids.empEmp}/attendance?month=2026-13`).expect(400);
    });
  });

  // ------------------------------------------------------------------------------------------ TIM-17 / TIM-19 Manager

  describe('TIM-17 Manager and TIM-19 Manager: my team only', () => {
    it("lists my team's leave waiting for me with who else is off; the detail adds availability, balance after and my task", async () => {
      const peerReq = (await api('peer', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(10), to: d(11), reason: 'Family function' }).expect(201)).body;
      const empReq = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(11), to: d(12), reason: 'Travel home' }).expect(201)).body;
      ids.outReq = (await api('outsider', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(11), to: d(11), reason: 'Errand' }).expect(201)).body.id;
      ids.empReq = empReq.id;
      const home = (await api('mgr', 'get', '/time/team/leave-home').expect(200)).body;
      const ids2 = home.waiting.map((w: { id: string }) => w.id);
      expect(ids2).toEqual(expect.arrayContaining([empReq.id, peerReq.id]));
      expect(ids2).not.toContain(ids.outReq);
      const row = home.waiting.find((w: { id: string }) => w.id === empReq.id);
      expect(row).toMatchObject({ name: `emp ${run}`, type: 'Casual leave', days: 2 });
      expect(row.others).toEqual([{ name: `peer ${run}`, type: 'Casual leave' }]);
      expect(home.otherWaiting).toBe(0);
      // Another manager sees only theirs; an employee has nothing waiting; another company sees nothing of A.
      expect((await api('mgr2', 'get', '/time/team/leave-home').expect(200)).body.waiting.map((w: { id: string }) => w.id)).toEqual([ids.outReq]);
      expect((await api('emp', 'get', '/time/team/leave-home').expect(200)).body.waiting).toEqual([]);
      expect((await api('empB', 'get', '/time/team/leave-home').expect(200)).body.waiting).toEqual([]);

      const detail = (await api('mgr', 'get', `/time/requests/${empReq.id}`).expect(200)).body;
      expect(detail.team).toMatchObject({ taskId: row.taskId, others: [{ name: `peer ${run}`, type: 'Casual leave' }] });
      expect(typeof detail.team.balanceAfter).toBe('number');
      expect((await api('emp', 'get', `/time/requests/${empReq.id}`).expect(200)).body.team).toBeNull();
      // Out of scope: someone outside my team, and another company.
      await api('mgr', 'get', `/time/requests/${ids.outReq}`).expect(404);
      await api('empB', 'get', `/time/requests/${empReq.id}`).expect(404);
      await api('peer', 'get', `/time/requests/${empReq.id}`).expect(404);
    });

    it('Approve decides my task once; a repeat is refused; someone else cannot decide it', async () => {
      const row = (await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.find((w: { id: string }) => w.id === ids.empReq);
      expect((await decide('mgr2', row.taskId, 'approve')).status).toBeGreaterThanOrEqual(400);
      expect((await decide('emp', row.taskId, 'approve')).status).toBeGreaterThanOrEqual(400);
      await decide('mgr', row.taskId, 'approve').expect(200);
      expect((await decide('mgr', row.taskId, 'approve')).status).toBeGreaterThanOrEqual(400);
      expect((await api('mgr', 'get', `/time/requests/${ids.empReq}`).expect(200)).body).toMatchObject({ status: 'approved', team: { taskId: null } });
      expect((await api('mgr', 'get', '/time/team/leave-home').expect(200)).body.waiting.map((w: { id: string }) => w.id)).not.toContain(ids.empReq);
    });
  });

  // ------------------------------------------------------------------------------------------ TIM-39 Suspend

  describe('TIM-39 Suspend: the access pause runs on the block dates', () => {
    it('pauses access on the first day (sessions end, sign-in refused), once; an HR exception sticks; access is back after the block', async () => {
      await setting('leave.block_leave.required', 'yes');
      const plan = await inA((tx) => tx.blockLeavePlan.create({ data: { organizationId: org.A.id, employeeId: ids.blockedEmp, yearStart: new Date(`${today.slice(0, 4)}-01-01T00:00:00Z`), fromOn: new Date(`${today}T00:00:00Z`), toOn: new Date(`${d(4)}T00:00:00Z`), accessPause: 'scheduled' } }));
      expect(await leaveV2.applyAccessPauses(org.A.id)).toBe(1);
      expect((await inA((tx) => tx.user.findFirstOrThrow({ where: { id: users.blocked } }))).status).toBe('paused');
      await login('blocked').expect(401);
      await api('blocked', 'get', `/time/me/attendance?month=${month}`).expect(401);
      // Safe to re-run: nothing more to do.
      expect(await leaveV2.applyAccessPauses(org.A.id)).toBe(0);
      // Once started, HR cannot cancel or schedule it again here.
      expect((await api('hr', 'post', `/time/hr/block-leave/${ids.blockedEmp}/pause`).send({ pause: false }).expect(409)).body.message).toBe('Access is already paused for this block. It comes back after the last day.');
      // HR turns access back on as an exception: the next run leaves it on.
      await inA((tx) => tx.user.update({ where: { id: users.blocked }, data: { status: 'active' } }));
      expect(await leaveV2.applyAccessPauses(org.A.id)).toBe(0);
      expect((await inA((tx) => tx.user.findFirstOrThrow({ where: { id: users.blocked } }))).status).toBe('active');
      // The block ended yesterday: access is restored (when paused) and the pause cleared.
      await inA((tx) => tx.user.update({ where: { id: users.blocked }, data: { status: 'paused' } }));
      await inA((tx) => tx.blockLeavePlan.update({ where: { id: plan.id }, data: { fromOn: new Date(`${d(-5)}T00:00:00Z`), toOn: new Date(`${d(-1)}T00:00:00Z`) } }));
      expect(await leaveV2.applyAccessPauses(org.A.id)).toBe(1);
      expect((await inA((tx) => tx.user.findFirstOrThrow({ where: { id: users.blocked } }))).status).toBe('active');
      expect((await inA((tx) => tx.blockLeavePlan.findFirstOrThrow({ where: { id: plan.id } }))).accessPause).toBe('none');
      await login('blocked').expect(200);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: { in: ['leave.block.access_paused', 'leave.block.access_restored'] }, entityId: ids.blockedEmp } }))).toBe(2);
      // Another company's job run touches nothing of A.
      expect(await leaveV2.applyAccessPauses(org.B.id)).toBe(0);
    });
  });
});
