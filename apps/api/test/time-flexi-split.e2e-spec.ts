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
import { mondayOf } from '../src/time/time-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-06 flexi and split shifts (founder answers 2 Nov 2026), end to end against the real database (forced RLS, the app
// role): both types are company settings, off by default; set-up checks (core hours inside the shift, parts in order,
// the gap at least the company minimum); the day engine (late from core start, each part on its own, one part missing is
// a half day, a night split across midnight); overtime beyond both parts; the payroll feed; the roster's rest and
// spread-over over the whole day; the muster's late mark; the wrong role and another company.
describe('Time flexi and split shifts', () => {
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
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'mgr' | 'emp';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  // Past working days, all in last month (one payroll-feed month): 5th to 8th, and the last day (overtime, see below).
  const lastMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const P = (day: number) => `${lastMonth}-${String(day).padStart(2, '0')}`;
  // A whole week at least 8 days ahead (outside the change notice).
  const W = mondayOf(d(8));
  const w = (n: number) => addDays(W, n);
  const times = (start: number, end: number, extra: Record<string, unknown> = {}) => ({ validFrom: today, start, end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 0, breakAboveMinutes: 300, ...extra });
  const setting = (who: 'adminA' | 'adminB', key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' }).expect(200);
  const punch = (on: string, kind: 'in' | 'out', hhmm: string, nextDay = false) =>
    inA((tx) => tx.punch.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, punchedAt: instantAt(nextDay ? addDays(on, 1) : on, 'Asia/Kolkata', Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))), workOn: new Date(`${on}T00:00:00Z`), kind, source: 'web', accepted: true, verdict: 'inside' } }));
  const rostered = (on: string, shiftId: string) => inA((tx) => tx.rosterEntry.upsert({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${on}T00:00:00Z`) } }, update: { shiftId, isOff: false, published: true, draft: null }, create: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${on}T00:00:00Z`), shiftId, published: true } }));
  const evaluate = (on: string) => inA((tx) => dayEngine.evaluate(tx, { organizationId: org.A.id, isSuperAdmin: false }, ids.empEmp, on, on));
  const dayOf = (on: string) => inA((tx) => tx.attendanceDay.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${on}T00:00:00Z`) } } }));
  const email = { send: jest.fn(async () => ({ success: true })) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    dayEngine = moduleRef.get(DayEngine);

    planId = (await prisma.plan.create({ data: { name: `fs-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `FS Org ${k}`, slug: `fs-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const people: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of people) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@fs-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@fs-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `FS Foods ${k}`, shortName: `FSF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Canteen', code: 'CAN', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Cook', code: 'CK' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: 7 }] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-90), userId: users[who], workEmail: `${who}@fs-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', null);
    await inA((tx) => tx.employeePersonalDetails.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, gender: 'male' } }));
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

  const FLEXI = { kind: 'flexi', ...times(480, 1200, { coreStart: 660, coreEnd: 960, fullDayMinutes: 480, breakMinutes: 30, otAfterMinutes: 540 }) };
  const SPLIT = { kind: 'split', ...times(420, 1260, { firstEnd: 660, secondStart: 1020 }) };

  it('off by default: flexi and split are refused; a fixed shift is made as before', async () => {
    expect((await api('hrAdmin', 'post', '/time/shifts').send({ code: 'FX', name: 'Flexi day', colour: 'teal', night: false, ...FLEXI }).expect(400)).body).toMatchObject({ code: 'SHIFT_TYPE_OFF', message: expect.stringMatching(/Flexi shifts are turned off/) });
    expect((await api('hrAdmin', 'post', '/time/shifts').send({ code: 'SP', name: 'Canteen split', colour: 'green', night: false, ...SPLIT }).expect(400)).body.code).toBe('SHIFT_TYPE_OFF');
    ids.G = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'G', name: 'General', colour: 'blue', night: false, ...times(540, 1050, { breakMinutes: 30 }) }).expect(201)).body.id;
    const setup = (await api('hrAdmin', 'get', '/time/shifts/setup').expect(200)).body;
    expect(setup.types).toEqual({ flexi: false, split: false, minGapMinutes: 60, flexiLate: 'core_start', flexiShort: 'shift_hours' });
    expect(setup.shifts.find((s: { id: string }) => s.id === ids.G)).toMatchObject({ kind: 'fixed', versions: [expect.objectContaining({ coreStart: null, firstEnd: null })] });
    // A type the API does not know is bad input.
    await api('hrAdmin', 'post', '/time/shifts').send({ code: 'X', name: 'X', colour: 'blue', night: false, kind: 'rotating', ...times(540, 1050) }).expect(400);
  });

  it('the wrong role is refused: an employee and a manager cannot set up shifts', async () => {
    await setting('adminA', 'attendance.shift_types.flexi', 'on');
    await api('emp', 'post', '/time/shifts').send({ code: 'FX', name: 'Flexi day', colour: 'teal', night: false, ...FLEXI }).expect(403);
    await api('mgr', 'post', '/time/shifts').send({ code: 'FX', name: 'Flexi day', colour: 'teal', night: false, ...FLEXI }).expect(403);
    await api('emp', 'get', '/time/shifts/setup').expect(403);
    // Only a settings manager turns a type on.
    await api('emp', 'put', '/org/settings').send({ key: 'attendance.shift_types.split', value: 'on', scopeType: 'tenant' }).expect(403);
  });

  it('flexi on: core hours are needed and sit inside the shift; saved with an audit of its type', async () => {
    const body = (b: Record<string, unknown>) => ({ code: 'FX', name: 'Flexi day', colour: 'teal', night: false, ...FLEXI, ...b });
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body({ coreStart: undefined, coreEnd: undefined })).expect(400)).body.message).toMatch(/Give the core hours/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body({ coreStart: 420 })).expect(400)).body.message).toMatch(/inside the shift/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body({ coreStart: 960, coreEnd: 660 })).expect(400)).body.message).toMatch(/inside the shift/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body({ coreEnd: 1500 })).expect(400)).body.message).toEqual(expect.arrayContaining([expect.stringMatching(/coreEnd/)]));
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body({ kind: 'fixed' })).expect(400)).body.message).toMatch(/only for flexi/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send({ code: 'SP', name: 'Canteen split', colour: 'green', night: false, ...SPLIT }).expect(400)).body.code).toBe('SHIFT_TYPE_OFF');
    ids.FX = (await api('hrAdmin', 'post', '/time/shifts').send(body({})).expect(201)).body.id;
    const row = (await api('hrAdmin', 'get', '/time/shifts/setup').expect(200)).body.shifts.find((s: { id: string }) => s.id === ids.FX);
    expect(row).toMatchObject({ kind: 'flexi', versions: [expect.objectContaining({ start: 480, end: 1200, coreStart: 660, coreEnd: 960, otAfterMinutes: 540 })] });
    const a = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'time.shift.created', entityId: ids.FX } }));
    expect(a?.metadataJson).toContain('"kind":"flexi"');
    expect(a?.metadataJson).toContain('"coreStart":"11:00"');
    // New times from a date keep the type and are checked the same way.
    expect((await api('hrAdmin', 'post', `/time/shifts/${ids.FX}/versions`).send({ ...times(480, 1200, { coreStart: 1260, coreEnd: 1300 }), validFrom: d(5) }).expect(400)).body.message).toMatch(/inside the shift/);
    await api('hrAdmin', 'post', `/time/shifts/${ids.FX}/versions`).send({ ...times(480, 1200, { coreStart: 630, coreEnd: 960, fullDayMinutes: 480 }), validFrom: d(5) }).expect(201);
    expect((await api('hrAdmin', 'post', `/time/shifts/${ids.G}/versions`).send({ ...times(540, 1050, { coreStart: 600, coreEnd: 900 }), validFrom: d(5) }).expect(400)).body.message).toMatch(/only for flexi/);
  });

  it('split on: the parts must not overlap; the gap is at least the company minimum; a night split crosses midnight', async () => {
    await setting('adminA', 'attendance.shift_types.split', 'on');
    const body = (code: string, b: Record<string, unknown>) => ({ code, name: `Split ${code}`, colour: 'green', night: false, ...SPLIT, ...b });
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body('SP', { firstEnd: undefined })).expect(400)).body.message).toMatch(/both parts/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body('SP', { firstEnd: 900, secondStart: 600 })).expect(400)).body.message).toMatch(/overlap/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body('SP', { breakMinutes: 30 })).expect(400)).body.message).toMatch(/no break rule/);
    expect((await api('hrAdmin', 'post', '/time/shifts').send(body('SP', { secondStart: 690 })).expect(400)).body.message).toBe('The gap between the parts is 30 min. Make it at least 1 h (company setting), or use a fixed shift.');
    ids.SP = (await api('hrAdmin', 'post', '/time/shifts').send(body('SP', {})).expect(201)).body.id;
    // 08:00–12:00 and 14:00–18:00: inside the 10.5 h spread-over.
    ids.SQ = (await api('hrAdmin', 'post', '/time/shifts').send(body('SQ', { start: 480, end: 1080, firstEnd: 720, secondStart: 840 })).expect(201)).body.id;
    // 20:00–00:00 and 02:00–06:00 (next day).
    ids.SN = (await api('hrAdmin', 'post', '/time/shifts').send({ ...body('SN', { start: 1200, end: 360, firstEnd: 0, secondStart: 120 }), night: true }).expect(201)).body.id;
    // The company may allow a shorter gap.
    await setting('adminA', 'attendance.split.min_gap_minutes', '30');
    await api('hrAdmin', 'post', '/time/shifts').send(body('ST', { secondStart: 690 })).expect(201);
    const setup = (await api('hrAdmin', 'get', '/time/shifts/setup').expect(200)).body;
    expect(setup.types).toMatchObject({ flexi: true, split: true, minGapMinutes: 30 });
    expect(setup.shifts.find((s: { id: string }) => s.id === ids.SN)).toMatchObject({ kind: 'split', versions: [expect.objectContaining({ start: 1200, end: 360, firstEnd: 0, secondStart: 120 })] });
  });

  it('another company is untouched: its types stay off and it never reaches these shifts', async () => {
    const b = (await api('adminB', 'get', '/time/shifts/setup').expect(200)).body;
    expect(b.types).toMatchObject({ flexi: false, split: false, minGapMinutes: 60 });
    expect(b.shifts.map((s: { id: string }) => s.id)).not.toContain(ids.SP);
    await api('adminB', 'post', `/time/shifts/${ids.SP}/versions`).send({ ...times(420, 1260, { firstEnd: 660, secondStart: 1020 }), validFrom: d(5) }).expect(404);
    expect((await api('adminB', 'post', '/time/shifts').send({ code: 'SP', name: 'Split', colour: 'green', night: false, ...SPLIT }).expect(400)).body.code).toBe('SHIFT_TYPE_OFF');
  });

  describe('the day engine, overtime and the payroll feed', () => {
    beforeAll(async () => {
      // Versions are append-only for the app: a copy of each shift's first version from long ago covers the past days below.
      const PAST = new Date('2025-01-01T00:00:00Z');
      await inA(async (tx) => {
        for (const v of await tx.shiftVersion.findMany({ where: { organizationId: org.A.id, validFrom: new Date(`${today}T00:00:00Z`) } })) {
          const { id: _id, createdAt: _at, ...copy } = v;
          await tx.shiftVersion.create({ data: { ...copy, validFrom: PAST } });
        }
        // An overtime rule in force on those days.
        await tx.overtimeRule.create({ data: { organizationId: org.A.id, name: 'Staff OT', scopeType: 'tenant', scopeId: org.A.id, validFrom: PAST, minMinutes: 30, roundMinutes: 15, rateNormal: 2, rateWeeklyOff: 2, rateHoliday: 2, needsApproval: true, settle: 'pay', compOffHalfMinutes: 60, compOffFullMinutes: 240 } as never });
      });
    });

    it('split: both parts present with the gap not worked; one part missing is a half day; late per part', async () => {
      await rostered(P(5), ids.SP);
      await punch(P(5), 'in', '06:58');
      await punch(P(5), 'out', '11:00');
      await punch(P(5), 'in', '17:20');
      await punch(P(5), 'out', '21:30');
      await rostered(P(6), ids.SP);
      await punch(P(6), 'in', '07:00');
      await punch(P(6), 'out', '11:00');
      await evaluate(P(5));
      await evaluate(P(6));
      expect(await dayOf(P(5))).toMatchObject({ status: 'present', workedMinutes: 492, lateMinutes: 10, shiftId: ids.SP });
      expect(await dayOf(P(6))).toMatchObject({ status: 'half_day', workedMinutes: 240 });
    });

    it('night split across midnight belongs to the day it started; flexi is late from core start', async () => {
      await rostered(P(7), ids.SN);
      await punch(P(7), 'in', '19:58');
      await punch(P(7), 'out', '00:00', true);
      await punch(P(7), 'in', '02:00', true);
      await punch(P(7), 'out', '06:05', true);
      await rostered(P(8), ids.FX);
      await punch(P(8), 'in', '11:25');
      await punch(P(8), 'out', '20:00');
      await evaluate(P(7));
      await evaluate(P(8));
      expect(await dayOf(P(7))).toMatchObject({ status: 'present', lateMinutes: 0, workedMinutes: 487 });
      expect(await dayOf(P(8))).toMatchObject({ status: 'present', lateMinutes: 15, workedMinutes: 485 });
      // The company's "never late" for flexi.
      await setting('adminA', 'attendance.flexi.late_from', 'never');
      await evaluate(P(8));
      expect((await dayOf(P(8)))?.lateMinutes).toBe(0);
      await setting('adminA', 'attendance.flexi.late_from', 'core_start');
      await evaluate(P(8));
    });

    it('overtime counts beyond both parts of a split (the gap is not hours)', async () => {
      // Overtime is claimable for the last 31 days only (/time/me/overtime), so the day is last month's last day: always
      // inside that window and still in the payroll-feed month (the 9th dropped out of the window after the 9th).
      const S = addDays(`${today.slice(0, 7)}-01`, -1);
      await rostered(S, ids.SP);
      await punch(S, 'in', '07:00');
      await punch(S, 'out', '11:00');
      await punch(S, 'in', '17:00');
      await punch(S, 'out', '22:00');
      await evaluate(S);
      expect((await dayOf(S))?.workedMinutes).toBe(540);
      const open = (await api('emp', 'get', '/time/me/overtime').expect(200)).body.open as { on: string; scheduledMinutes: number; eligibleMinutes: number }[];
      expect(open.find((x) => x.on === S)).toMatchObject({ scheduledMinutes: 480, eligibleMinutes: 60 });
      // Present on both parts without extra time: no overtime to claim.
      expect(open.find((x) => x.on === P(5))).toBeUndefined();
    });

    it('the payroll feed pays the half day as half and the rest in full', async () => {
      const rows = (await api('hrAdmin', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${lastMonth}`).expect(200)).body.rows as { employeeId: string; paidDays: number; lopDays: number }[];
      expect(rows.find((r) => r.employeeId === ids.empEmp)).toMatchObject({ paidDays: 4.5, lopDays: 0.5 });
    });
  });

  describe('the roster and the muster', () => {
    it('daily hours count both parts; the spread-over and rest count the whole day', async () => {
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(1), value: ids.SP }] }).expect(200);
      const cellOf = async (on: string) => (await api('mgr', 'get', `/time/roster?week=${W}`).expect(200)).body.people.find((p: { id: string }) => p.id === ids.empEmp).cells.find((c: { on: string }) => c.on === on);
      const kinds = (await cellOf(w(1))).conflicts.map((c: { kind: string }) => c.kind);
      expect(kinds).toContain('spread');
      expect(kinds).not.toContain('hours');
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(409)).body.code).toBe('HOURS_GUARD');
      // The night split ends at 06:00; a 09:00 start the next day leaves 3 h of rest.
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(1), value: ids.SN }, { employeeId: ids.empEmp, on: w(2), value: ids.G }] }).expect(200);
      expect((await cellOf(w(2))).conflicts.map((c: { kind: string }) => c.kind)).toContain('rest');
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(409)).body.code).toBe('REST_GUARD');
      // A split inside the spread-over publishes.
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(1), value: ids.SQ }, { employeeId: ids.empEmp, on: w(2), value: 'pattern' }] }).expect(200);
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(200)).body.published).toBeGreaterThan(0);
    });

    it("the muster's late mark on a flexi day counts from core start", async () => {
      await rostered(today, ids.FX);
      await punch(today, 'in', '11:25');
      const me = (await api('mgr', 'get', '/time/today').expect(200)).body.people.find((p: { id: string }) => p.id === ids.empEmp);
      expect(me).toMatchObject({ status: 'late', detail: 'Late by 25 min' });
      await setting('adminA', 'attendance.flexi.late_from', 'never');
      expect((await api('mgr', 'get', '/time/today').expect(200)).body.people.find((p: { id: string }) => p.id === ids.empEmp).status).toBe('in');
    });
  });
});
