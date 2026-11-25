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

// Founder decisions 1, 2 and 3 (29 Oct 2026), end to end against the real database (forced RLS, the app role):
// recording a long absence (check first, then record) and company block dates by leave type with the people already
// on leave listed; notice per leave type with a company default (sick leave 0) and HR applying for someone; the leave
// liability report reading pay from Payroll, money only for people who may see pay. For each action the positive path
// and the negatives: wrong role, another company, bad input, a repeat, a conflict, acting on someone's behalf.
describe('Leave decisions (29 Oct 2026)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminA2' | 'adminB' | 'hrPay' | 'hrNoPay' | 'hrExec' | 'mgr' | 'emp' | 'peer' | 'joiner' | 'empB' | 'payroll' | 'liabOnly' | 'hrAdjust' | 'hrScoped';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  // The location's only weekly off is the weekday two days from today, so today is a working day.
  const offWeekday = ((new Date(`${d(2)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const fyStart = today.slice(5) >= '04-01' ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  const isOff = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1 === offWeekday;
  /** The first working day on or after today + n. */
  const work = (n: number) => (isOff(d(n)) ? d(n + 1) : d(n));
  const preview = (who: Who, leaveTypeId: string, from: string, to = from) => api(who, 'post', '/time/me/leave/preview').send({ leaveTypeId, from, to }).expect(200);
  const setting = (key: string, value: string) => api('adminA', 'put', '/org/settings').send({ key, value, scopeType: 'tenant' }).expect(200);
  // Answer 1325 (Settings S-3): payroll.* keys wait for a second person; it applies only once another admin approves.
  const payrollSetting = async (key: string, value: string) => {
    const r = (await setting(key, value)).body as { pending?: boolean; id: string };
    expect(r.pending).toBe(true);
    await api('adminA2', 'post', `/org/settings/requests/${r.id}/approve`).send({}).expect(200);
  };
  const report = (who: Who, extra = '') => api(who, 'get', `/time/hr/leave-report?report=liability${extra}`);
  type LiabRow = { employeeId: string; days: number; dailyPay?: number | null; amount?: number | null; noPay?: boolean };

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

    planId = (await prisma.plan.create({ data: { name: `leavedec-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `LeaveDec Org ${k}`, slug: `leavedec-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const hrAdmin = ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions.filter((k) => k !== 'employee.salary.view');
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      // Answer 1325: a payroll setting change waits for a second person; adminA2 approves adminA's.
      ['adminA2', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrPay', 'A', 'panel', [...hrAdmin, 'employee.salary.view']],
      ['hrNoPay', 'A', 'panel', hrAdmin],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['joiner', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
      // Founder answer A: the Payroll Admin template (leave.liability.view + pay) and the key alone (no pay).
      ['payroll', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'payroll_admin')!.permissions],
      ['liabOnly', 'A', 'panel', ['leave.liability.view']],
      // Founder answer B: may apply for someone (leave.balance.adjust) but not approve leave.
      ['hrAdjust', 'A', 'panel', ['leave.view', 'leave.balance.adjust']],
      // Adjust balance on the HR leave home: the keys only through a role grant on a department (set in the test).
      ['hrScoped', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@leavedec-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@leavedec-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Decision Foods ${k}`, shortName: `DF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', geoLat: 12.9716, geoLng: 77.5946, geoRadiusM: 150 } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Cash', code: 'CSH', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Cashier', code: 'CA' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', joinedOn = fyStart) =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn, userId: users[who], workEmail: `${who}@leavedec-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.hrNoPayEmp = await hire('adminA', 'hrNoPay', ids.mgrEmp);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');

    // Earned leave uses the company default notice (no number of its own), casual its own 2 days, sick nothing.
    ids.EL = (await api('hrNoPay', 'post', '/time/setup/types').send({ code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, rules: { encashable: true } }).expect(201)).body.id;
    ids.CL = (await api('hrNoPay', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'casual', paid: true, rules: { noticeDays: 2 } }).expect(201)).body.id;
    ids.SL = (await api('hrNoPay', 'post', '/time/setup/types').send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true }).expect(201)).body.id;
    ids.ML = (await api('hrNoPay', 'post', '/time/setup/types').send({ code: 'ML', name: 'Maternity leave', kind: 'maternity', paid: true }).expect(201)).body.id;
    ids.BCL = (await api('adminB', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'casual', paid: true }).expect(201)).body.id;
    ids.policy = (await api('hrNoPay', 'post', '/time/setup/policies').send({ name: 'Staff' }).expect(201)).body.id;
    await api('hrNoPay', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: '2025-01-01', lines: [{ leaveTypeId: ids.EL, annualDays: 18, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 30 }, { leaveTypeId: ids.CL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }, { leaveTypeId: ids.SL, annualDays: 12, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 0 }] }).expect(201);
    await api('hrNoPay', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: '2025-01-01' }).expect(201);
    await api('hrNoPay', 'post', `/time/setup/locations/${ids.locA}/rule`).send({ validFrom: today, shiftStart: 570, shiftEnd: 1110, graceMinutes: 10, weeklyOffs: [{ weekday: offWeekday }], checkIn: 'restricted' }).expect(201);
    for (const e of [ids.empEmp, ids.peerEmp]) await api('hrNoPay', 'post', `/time/people/${e}/adjust`).send({ leaveTypeId: ids.EL, days: 10, reason: 'Opening balance' }).expect(201);
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

  // ------------------------------------------------------------------------------------------ decision 2: notice

  describe('notice per leave type (decision 2)', () => {
    it('a type without its own notice uses the company default; sick leave asks for none; the message says the next date', async () => {
      expect((await preview('emp', ids.EL, work(1))).body.blocks).toEqual([]);
      await setting('leave.notice_days.default', '5');
      const el = (await preview('emp', ids.EL, work(1))).body;
      expect(el).toMatchObject({ shortNotice: true, noticeDays: 5 });
      expect(el.blocks).toContain(`Earned leave needs 5 days' notice. Pick a date on or after ${fmt(d(5))}, or ask your manager.`);
      const sl = (await preview('emp', ids.SL, work(1))).body;
      expect(sl).toMatchObject({ shortNotice: false, noticeDays: 0 });
      expect(sl.blocks.join(' ')).not.toMatch(/notice/);
      expect((await preview('emp', ids.CL, work(1))).body.blocks.join(' ')).toMatch(/Casual leave needs 2 days' notice\. Pick a date on or after/);
      expect((await preview('emp', ids.EL, work(6))).body.shortNotice).toBe(false);
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: work(1), to: work(1) }).expect(400);
    });

    it('the leave type editor keeps "company default" (no number) and refuses out-of-range notice', async () => {
      const body = { code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, rules: { encashable: true, noticeDays: null } };
      await api('hrNoPay', 'put', `/time/setup/types/${ids.EL}`).send(body).expect(200);
      expect((await api('hrNoPay', 'put', `/time/setup/types/${ids.EL}`).send({ ...body, rules: { noticeDays: 91 } }).expect(400)).body.message).toBe('Notice is 0 to 90 days.');
      await api('hrExec', 'put', `/time/setup/types/${ids.EL}`).send(body).expect(403);
      const t = (await api('hrNoPay', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === ids.EL);
      expect(t.rules.noticeDays).toBeNull();
    });

    it('HR applying for someone skips the notice by default, and it is recorded on the request and in the audit log', async () => {
      const res = (await api('hrNoPay', 'post', `/time/hr/leave/${ids.empEmp}`).send({ leaveTypeId: ids.EL, from: work(1), to: work(1), reason: 'Called in: family emergency' }).expect(201)).body;
      ids.onBehalf = res.id;
      const r = await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: res.id } }));
      expect(r).toMatchObject({ employeeId: ids.empEmp, raisedBy: users.hrNoPay, status: 'pending' });
      const log = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'leave.request.submitted', entityId: res.id } }));
      expect(JSON.parse(String(log.metadataJson))).toMatchObject({ raisedFor: true, noticeSkipped: 5 });
      const task = (await api('mgr', 'get', '/workflow/approvals/inbox').expect(200)).body.find((x: { title: string }) => x.title.includes('Earned leave'));
      expect(task.summary).toContainEqual({ label: 'Notice', value: "Applied by HR: 5 days' notice not needed" });
    });

    it('a repeat is refused (the same day), and the company can make notice apply to HR too', async () => {
      expect((await api('hrNoPay', 'post', `/time/hr/leave/${ids.empEmp}`).send({ leaveTypeId: ids.EL, from: work(1), to: work(1) }).expect(400)).body.message).toMatch(/already has leave/);
      await setting('leave.notice.on_behalf', 'apply');
      expect((await api('hrNoPay', 'post', `/time/hr/leave/${ids.peerEmp}`).send({ leaveTypeId: ids.EL, from: work(1), to: work(1) }).expect(400)).body.message).toMatch(/Earned leave needs 5 days' notice/);
      await setting('leave.notice.on_behalf', 'skip');
    });

    it('wrong role, own record, another company, bad input and acting for someone else are refused', async () => {
      const body = { leaveTypeId: ids.SL, from: work(3), to: work(3) };
      await api('hrExec', 'post', `/time/hr/leave/${ids.peerEmp}`).send(body).expect(403);
      await api('emp', 'post', `/time/hr/leave/${ids.peerEmp}`).send(body).expect(403);
      await api('mgr', 'post', `/time/hr/leave/${ids.peerEmp}`).send(body).expect(403);
      await api('hrNoPay', 'post', `/time/hr/leave/${ids.hrNoPayEmp}`).send(body).expect(403);
      await api('hrNoPay', 'post', `/time/hr/leave/${ids.empBEmp}`).send(body).expect(404);
      await api('hrNoPay', 'post', `/time/hr/leave/${ids.peerEmp}`).send({ ...body, to: d(-30) }).expect(400);
      await api('hrNoPay', 'post', `/time/hr/leave/${ids.peerEmp}`).send({ ...body, leaveTypeId: 'nope' }).expect(400);
      await api('hrNoPay', 'post', '/time/hr/leave/not-a-uuid').send(body).expect(400);
    });
  });

  // ------------------------------------------------------------------------------------------ decision 1: long absence

  describe('record a long absence (decision 1)', () => {
    const body = () => ({ employeeId: ids.peerEmp, kind: 'sabbatical', from: d(60), to: d(150), note: 'Sabbatical for higher studies' });
    const check = (who: Who, q: { employeeId: string; from: string; to: string }) => api(who, 'get', `/time/hr/long-absences/check?employeeId=${q.employeeId}&from=${q.from}&to=${q.to}`);

    it('the check shows the effect (no leave earned by default, back the day after) and nothing in the way', async () => {
      expect((await check('hrNoPay', body()).expect(200)).body).toEqual({ name: `peer ${run}`, accrues: false, comesBackOn: d(151), leave: [], problems: [] });
    });

    it('leave already asked for on those dates is listed and recording is refused (never cancelled silently)', async () => {
      const q = { employeeId: ids.empEmp, from: d(0), to: d(30) };
      const c = (await check('hrNoPay', q).expect(200)).body;
      expect(c.leave).toEqual([expect.objectContaining({ id: ids.onBehalf, type: 'Earned leave', status: 'pending' })]);
      expect(c.problems[0]).toMatch(/already has leave on these dates: Earned leave .* \(waiting\)\. Withdraw or cancel it first/);
      expect((await api('hrNoPay', 'post', '/time/hr/long-absences').send({ ...q, kind: 'lwp', note: 'Long unpaid leave for family care' }).expect(409)).body.message).toMatch(/already has leave/);
      expect((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: ids.onBehalf } }))).status).toBe('pending');
    });

    it('a joiner before the joining day, and someone on notice past the last working day, are refused with the date', async () => {
      ids.joinerEmp = await hireLate();
      expect((await api('hrNoPay', 'post', '/time/hr/long-absences').send({ ...body(), employeeId: ids.joinerEmp, from: d(10), to: d(40) }).expect(400)).body.message).toMatch(/has no job on/);
      const a = await inA((tx) => tx.employeeAssignment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.peerEmp } }));
      const person = await inA((tx) => tx.employee.findFirstOrThrow({ where: { organizationId: org.A.id, id: ids.peerEmp } }));
      ids.exit = await inA(async (tx) => (await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: a.employmentId, employeeId: ids.peerEmp, personId: person.personId, exitType: 'resignation', initiatedBy: 'employee', submittedOn: new Date(`${today}T00:00:00Z`), noticePeriod: '30d', standardLwd: new Date(`${d(200)}T00:00:00Z`), status: 'accepted', acceptedAt: new Date(), approvedLwd: new Date(`${d(200)}T00:00:00Z`) } })).id);
      expect((await api('hrNoPay', 'post', '/time/hr/long-absences').send({ ...body(), to: d(220) }).expect(400)).body.message).toBe(`peer ${run} is on notice. The last working day is ${fmt(d(200))}, so end the absence on or before it.`);
    });

    it('records it (audited); a repeat or an overlap is a conflict', async () => {
      const a = (await api('hrNoPay', 'post', '/time/hr/long-absences').send(body()).expect(201)).body;
      expect(a).toMatchObject({ kind: 'sabbatical', from: d(60), to: d(150), accrues: false });
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.long_absence.recorded', entityId: a.id } }))).toBe(1);
      expect((await api('hrNoPay', 'post', '/time/hr/long-absences').send(body()).expect(409)).body.message).toMatch(/overlap .*sabbatical/);
      expect((await check('hrNoPay', { ...body(), from: d(100), to: d(180) }).expect(200)).body.problems[0]).toMatch(/extend that absence instead/);
    });

    it('wrong role, own record, another company, bad input and acting for someone else are refused', async () => {
      await api('hrExec', 'post', '/time/hr/long-absences').send(body()).expect(403);
      await check('hrExec', body()).expect(403);
      await check('emp', body()).expect(403);
      await check('hrNoPay', { ...body(), employeeId: ids.hrNoPayEmp }).expect(403);
      await check('hrNoPay', { ...body(), employeeId: ids.empBEmp }).expect(404);
      // Another company's admin holds no HR adjust key here: refused before any lookup.
      await check('adminB', body()).expect(403);
      await check('hrNoPay', { ...body(), to: d(50) }).expect(400);
      await check('hrNoPay', { ...body(), from: 'soon' }).expect(400);
      await api('hrNoPay', 'post', '/time/hr/long-absences').send({ ...body(), kind: 'holiday' }).expect(400);
    });
  });

  // ------------------------------------------------------------------------------------------ decision 1: block dates

  describe('company block dates by leave type (decision 1)', () => {
    const add = (who: Who, extra: Record<string, unknown>) => api(who, 'post', '/time/setup/block-dates').send({ from: work(20), to: work(20), reason: 'Stock count', scopeType: 'tenant', ...extra });

    it('lists the leave types with the default (planned leave only, sick never; maternity can never be stopped)', async () => {
      const l = (await api('hrNoPay', 'get', '/time/setup/block-dates').expect(200)).body;
      expect(l.types).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: ids.EL, stoppedByDefault: true, canStop: true }),
        expect.objectContaining({ id: ids.SL, stoppedByDefault: false, canStop: true }),
        expect.objectContaining({ id: ids.ML, stoppedByDefault: false, canStop: false }),
      ]));
      expect(l.entities).toEqual([{ id: ids.entityA, name: `Decision Foods A` }]);
      expect(l.locations).toEqual([{ id: ids.locA, name: 'Bengaluru' }]);
    });

    it('with no types picked it stops earned leave, not sick leave; with sick leave picked it stops only that', async () => {
      const def = (await add('hrNoPay', {}).expect(201)).body;
      expect((await preview('emp', ids.EL, work(20))).body.blocks.join(' ')).toMatch(/company block date \(Stock count\)\. Earned leave can't be taken on it/);
      expect((await preview('emp', ids.SL, work(20))).body.blockDates).toEqual([]);
      await api('hrNoPay', 'post', `/time/setup/block-dates/${def.id}/remove`).expect(200);
      const sick = (await add('hrNoPay', { leaveTypeIds: [ids.SL], reason: 'Plant shutdown drill' }).expect(201)).body;
      expect((await preview('emp', ids.SL, work(20))).body.blocks.join(' ')).toMatch(/Sick leave can't be taken on it/);
      expect((await preview('emp', ids.EL, work(20))).body.blockDates).toEqual([]);
      await api('hrNoPay', 'post', `/time/setup/block-dates/${sick.id}/remove`).expect(200);
    });

    it('lists the people already on leave then and leaves their leave alone', async () => {
      const r = (await api('peer', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: work(25), to: work(25) }).expect(201)).body;
      const b = (await add('hrNoPay', { from: work(25), to: work(25), reason: 'Year-end audit' }).expect(201)).body;
      expect(b.affected).toEqual([expect.objectContaining({ id: r.id, name: `peer ${run}`, type: 'Earned leave', status: 'pending' })]);
      const listed = (await api('hrNoPay', 'get', '/time/setup/block-dates').expect(200)).body.dates.find((x: { id: string }) => x.id === b.id);
      expect(listed).toMatchObject({ reason: 'Year-end audit', scopeName: null, leaveTypeIds: [], affected: [expect.objectContaining({ id: r.id })] });
      expect((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: r.id } }))).status).toBe('pending');
      const log = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'leave.block_date.added', entityId: b.id } }));
      expect(JSON.parse(String(log.metadataJson))).toMatchObject({ affected: 1, leaveTypes: [] });
      expect((await add('hrNoPay', { from: work(25), to: work(25), reason: 'Year-end audit' }).expect(409)).body.message).toBe('These block dates are already there.');
    });

    it('maternity leave, another company\'s type, a wrong role and bad input are refused', async () => {
      expect((await add('hrNoPay', { leaveTypeIds: [ids.EL, ids.ML] }).expect(400)).body.message).toMatch(/Maternity leave can't be blocked/);
      await add('hrNoPay', { leaveTypeIds: [ids.BCL] }).expect(400);
      await add('hrNoPay', { leaveTypeIds: ['x'] }).expect(400);
      await add('hrNoPay', { scopeType: 'location', scopeId: ids.locB }).expect(400);
      await add('hrExec', {}).expect(403);
      await add('emp', {}).expect(403);
      expect((await api('adminB', 'get', '/time/setup/block-dates').expect(200)).body.dates).toEqual([]);
    });
  });

  // ------------------------------------------------------------------------------------------ decision 3: liability

  describe('leave liability reads pay from Payroll (decision 3)', () => {
    beforeAll(async () => {
      // Arjun-like pay: basic 26,000 (a gratuity wage) + HRA 10,000 a month, set by Payroll behind the pay guard.
      await inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        const o = { organizationId: org.A.id };
        const basic = await tx.payComponent.create({ data: { ...o, code: 'basic', name: 'Basic', kind: 'earning', gratuityWage: true } });
        const hra = await tx.payComponent.create({ data: { ...o, code: 'hra', name: 'HRA', kind: 'earning' } });
        const m = await tx.employment.findFirstOrThrow({ where: { ...o, employeeId: ids.empEmp } });
        // Dated facts come from an approved employee change (YX-HIS-01): the hire's own change stands in for Payroll's.
        const changeId = (await tx.employeeAssignment.findFirstOrThrow({ where: { ...o, employeeId: ids.empEmp } })).changeId;
        await tx.compensation.create({ data: { ...o, employmentId: m.id, validFrom: new Date('2025-01-01T00:00:00Z'), currency: 'INR', annualCtc: 432000, changeId } });
        const pkg = await tx.compensationPackage.create({ data: { ...o, legalEntityId: ids.entityA, employeeId: ids.empEmp, employmentId: m.id, changeId, entryMode: 'fixed', annualCtc: 432000, monthlyGross: 36000, minWageCheck: {} } });
        for (const [c, n] of [[basic.id, 26000], [hra.id, 10000]] as const) await tx.compensationLine.create({ data: { ...o, legalEntityId: ids.entityA, employeeId: ids.empEmp, packageId: pkg.id, componentId: c, monthly: n, annual: n * 12 } });
      });
    });
    const rowOf = (body: { rows: LiabRow[] }, id: string) => body.rows.find((r) => r.employeeId === id)!;

    it('someone who may see pay gets days x daily pay ((Basic + DA) ÷ 26 by default) and "No pay set" for people without pay', async () => {
      const b = (await report('hrPay').expect(200)).body;
      expect(b).toMatchObject({ report: 'liability', money: true, dailyPayRule: { basis: 'basic_da', divisor: '26' }, types: [expect.objectContaining({ id: ids.EL })] });
      const emp = rowOf(b, ids.empEmp);
      expect(emp.days).toBeGreaterThan(0);
      expect(emp).toMatchObject({ dailyPay: 1000, amount: Math.round(emp.days * 1000 * 100) / 100, noPay: false });
      expect(rowOf(b, ids.peerEmp)).toMatchObject({ dailyPay: null, amount: null, noPay: true });
      expect(b.totalDays).toBeGreaterThanOrEqual(emp.days);
    });

    it('the company settings change the daily pay (÷ 30, gross)', async () => {
      await setting('leave.liability.divisor', '30');
      expect(rowOf((await report('hrPay').expect(200)).body, ids.empEmp).dailyPay).toBe(866.67);
      await payrollSetting('payroll.leave_encashment_basis', 'gross');
      expect(rowOf((await report('hrPay').expect(200)).body, ids.empEmp).dailyPay).toBe(1200);
      await payrollSetting('payroll.leave_encashment_basis', 'basic_da');
      await setting('leave.liability.divisor', '26');
    });

    it('HR without pay access gets days only: the API never sends the money fields', async () => {
      const res = await report('hrNoPay').expect(200);
      expect(res.body.money).toBe(false);
      expect(res.body.dailyPayRule).toBeUndefined();
      expect(rowOf(res.body, ids.empEmp).days).toBeGreaterThan(0);
      expect(res.text).not.toMatch(/"amount"|"dailyPay"|"noPay"|26000\b/);
      const csv = (await api('hrNoPay', 'get', '/time/hr/leave-report/export?report=liability').expect(200)).text;
      expect(csv.split('\r\n')[0]).not.toMatch(/Daily pay|Amount/);
    });

    it('the export carries the money for pay viewers, with "No pay set", and is audited', async () => {
      const csv = (await api('hrPay', 'get', '/time/hr/leave-report/export?report=liability').expect(200)).text;
      expect(csv.split('\r\n')[0]).toMatch(/"Daily pay","Amount"/);
      expect(csv).toMatch(/"No pay set","No pay set"/);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.report.exported', actorUserId: users.hrPay } }))).toBe(1);
    });

    it('Payroll (leave.liability.view, not leave.view) gets the liability with money, and its export (founder answer A)', async () => {
      const tpl = ROLE_TEMPLATES.find((t) => t.key === 'payroll_admin')!.permissions;
      expect(tpl).toContain('leave.liability.view');
      expect(tpl).not.toContain('leave.view');
      expect(tpl).toContain('employee.salary.view');
      const b = (await report('payroll').expect(200)).body;
      expect(b).toMatchObject({ report: 'liability', money: true });
      expect(rowOf(b, ids.empEmp)).toMatchObject({ dailyPay: 1000, noPay: false });
      expect(rowOf(b, ids.peerEmp)).toMatchObject({ noPay: true });
      const csv = (await api('payroll', 'get', '/time/hr/leave-report/export?report=liability').expect(200)).text;
      expect(csv.split('\r\n')[0]).toMatch(/"Daily pay","Amount"/);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.report.exported', actorUserId: users.payroll } }))).toBe(1);
    });

    it('the key alone, without pay access, gets the days only', async () => {
      const res = await report('liabOnly').expect(200);
      expect(res.body.money).toBe(false);
      expect(rowOf(res.body, ids.empEmp).days).toBeGreaterThan(0);
      expect(res.text).not.toMatch(/"amount"|"dailyPay"|"noPay"/);
    });

    it('Payroll is refused every other report and its export (403), the leave home and the leave cards', async () => {
      for (const who of ['payroll', 'liabOnly'] as const) {
        for (const r of ['balances', 'taken', 'ledger', 'lop', 'negative']) {
          expect((await api(who, 'get', `/time/hr/leave-report?report=${r}`).expect(403)).body.message).toBe('You can open the leave liability report only.');
          await api(who, 'get', `/time/hr/leave-report/export?report=${r}`).expect(403);
        }
        await api(who, 'get', '/time/hr/leave-home').expect(403);
        await api(who, 'get', '/time/hr/balances').expect(403);
      }
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.report.exported', actorUserId: users.liabOnly } }))).toBe(0);
    });

    it("another company's entity, location or department in the filters is 404 (Payroll and HR alike)", async () => {
      for (const who of ['payroll', 'hrPay'] as const) {
        await report(who, `&entityId=${ids.entityB}`).expect(404);
        await report(who, `&locationId=${ids.locB}`).expect(404);
        await report(who, `&departmentId=${ids.deptB}`).expect(404);
        await api(who, 'get', `/time/hr/leave-report/export?report=liability&entityId=${ids.entityB}`).expect(404);
      }
      expect(rowOf((await report('payroll', `&entityId=${ids.entityA}`).expect(200)).body, ids.empEmp).days).toBeGreaterThan(0);
      await report('payroll', '&entityId=not-a-uuid').expect(400);
    });

    it('people without leave.view, another company and a bad report name are refused', async () => {
      await report('emp').expect(403);
      await report('mgr').expect(403);
      expect((await report('adminB').expect(200)).body.rows.map((r: LiabRow) => r.employeeId)).not.toContain(ids.empEmp);
      await api('hrPay', 'get', '/time/hr/leave-report?report=money').expect(400);
    });
  });

  // ------------------------------------------------------------------------------------------ answer B: apply for someone

  describe('Apply for someone, the dialog (founder answer B)', () => {
    beforeAll(async () => {
      await api('hrNoPay', 'post', `/time/people/${ids.empEmp}/adjust`).send({ leaveTypeId: ids.SL, days: 5, reason: 'Opening balance' }).expect(201);
    });
    const form = (who: Who, id: string) => api(who, 'get', `/time/hr/leave/${id}`);
    const pre = (who: Who, id: string, body: Record<string, unknown>) => api(who, 'post', `/time/hr/leave/${id}/preview`).send(body);
    const applyFor = (who: Who, id: string, body: Record<string, unknown>) => api(who, 'post', `/time/hr/leave/${id}`).send(body);
    // The server's short date in these messages ("30 Oct"), as fmt() in leave.service.
    const dm = (iso: string) => fmt(iso).slice(0, -5);
    /** 201, or the refusal message in the failure (so a wrong date shows why). */
    const created = async (r: Promise<{ status: number; body: { message?: string } & Record<string, unknown> }>) => {
      const res = await r;
      if (res.status !== 201) throw new Error(`${res.status}: ${JSON.stringify(res.body)}`);
      return res.body as { id: string; status: string };
    };

    it("the form gives the person, only their leave types with balances, and the normal approval chain by default", async () => {
      const f = (await form('hrNoPay', ids.empEmp).expect(200)).body;
      expect(f).toMatchObject({ employee: { id: ids.empEmp, name: `emp ${run}` }, approval: 'chain' });
      expect(f.balances.map((b: { leaveTypeId: string }) => b.leaveTypeId)).toEqual(expect.arrayContaining([ids.EL, ids.CL, ids.SL]));
      expect(f.balances.map((b: { leaveTypeId: string }) => b.leaveTypeId)).not.toContain(ids.BCL);
    });

    it('the preview is the server summary with the notice skipped and the approval route', async () => {
      await setting('leave.notice_days.default', '5');
      const p = (await pre('hrNoPay', ids.empEmp, { leaveTypeId: ids.EL, from: work(8), to: work(8) }).expect(200)).body;
      expect(p).toMatchObject({ total: 1, noticeSkipped: false, approval: 'chain', blocks: [] });
      const short = (await pre('hrNoPay', ids.peerEmp, { leaveTypeId: ids.EL, from: work(2), to: work(2) }).expect(200)).body;
      expect(short).toMatchObject({ noticeSkipped: true, shortNotice: false, blocks: [] });
      expect(typeof short.balanceAfter).toBe('number');
    });

    it('refusals are plain English and name the person: overlap, balance, block date, notice when the company applies it', async () => {
      expect((await pre('hrNoPay', ids.empEmp, { leaveTypeId: ids.EL, from: work(1), to: work(1) }).expect(200)).body.blocks).toContain(`emp ${run} already has leave on ${dm(work(1))}.`);
      expect((await applyFor('hrNoPay', ids.empEmp, { leaveTypeId: ids.EL, from: work(1), to: work(1) }).expect(400)).body.message).toBe(`emp ${run} already has leave on ${dm(work(1))}.`);
      expect((await applyFor('hrNoPay', ids.empEmp, { leaveTypeId: ids.CL, from: work(40), to: d(75) }).expect(400)).body.message).toMatch(/^Not enough Casual leave: \d+(\.\d+)? available, \d+(\.\d+)? asked\.$/);
      expect((await applyFor('hrNoPay', ids.empEmp, { leaveTypeId: ids.EL, from: work(25), to: work(25) }).expect(400)).body.message).toMatch(/is a company block date \(Year-end audit\)\. Earned leave can't be taken on it/);
      await setting('leave.notice.on_behalf', 'apply');
      expect((await applyFor('hrNoPay', ids.empEmp, { leaveTypeId: ids.EL, from: work(2), to: work(2) }).expect(400)).body.message).toBe(`Earned leave needs 5 days' notice. Pick a date on or after ${fmt(d(5))}.`);
      await setting('leave.notice.on_behalf', 'skip');
      expect(await inA((tx) => tx.leaveRequest.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }))).toBe(1);
    });

    it('by default it goes to the manager with an "Applied by HR" note', async () => {
      const r = await created(applyFor('hrNoPay', ids.empEmp, { leaveTypeId: ids.SL, from: work(33), to: work(33), reason: 'Called in sick' }));
      expect(r.status).toBe('pending');
      const task = (await api('mgr', 'get', '/workflow/approvals/inbox').expect(200)).body.find((x: { title: string }) => x.title.includes('Sick leave'));
      expect(task.summary).toContainEqual({ label: 'Applied by', value: 'HR, on their behalf' });
    });

    it('the company setting "approved" approves it at once only when the HR person may approve leave (audited)', async () => {
      await setting('leave.on_behalf.approval', 'approved');
      expect((await form('hrNoPay', ids.empEmp).expect(200)).body.approval).toBe('approved');
      expect((await form('hrAdjust', ids.empEmp).expect(200)).body.approval).toBe('chain');
      const now = await created(applyFor('hrNoPay', ids.empEmp, { leaveTypeId: ids.SL, from: work(36), to: work(36) }));
      expect(now.status).toBe('approved');
      expect(await inA((tx) => tx.leaveLedgerEntry.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, kind: 'taken' } }))).toBeGreaterThan(0);
      const log = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'leave.request.submitted', entityId: now.id } }));
      expect(JSON.parse(String(log.metadataJson))).toMatchObject({ raisedFor: true, approvedAtOnce: true });
      const chain = await created(applyFor('hrAdjust', ids.empEmp, { leaveTypeId: ids.SL, from: work(38), to: work(38) }));
      expect(chain.status).toBe('pending');
      await setting('leave.on_behalf.approval', 'chain');
      await api('adminA', 'put', '/org/settings').send({ key: 'leave.on_behalf.approval', value: 'sometimes', scopeType: 'tenant' }).expect(400);
    });

    it('wrong role, own record, another company, bad input and Payroll are refused on the form and the preview', async () => {
      const body = { leaveTypeId: ids.SL, from: work(3), to: work(3) };
      for (const who of ['hrExec', 'emp', 'mgr', 'payroll', 'liabOnly'] as const) {
        await form(who, ids.peerEmp).expect(403);
        await pre(who, ids.peerEmp, body).expect(403);
      }
      await form('hrNoPay', ids.hrNoPayEmp).expect(403);
      await pre('hrNoPay', ids.hrNoPayEmp, body).expect(403);
      await form('hrNoPay', ids.empBEmp).expect(404);
      await pre('hrNoPay', ids.empBEmp, body).expect(404);
      await form('hrNoPay', randomUUID()).expect(404);
      await form('hrNoPay', 'nope').expect(400);
      await pre('hrNoPay', ids.peerEmp, { ...body, from: 'soon' }).expect(400);
      await pre('hrNoPay', ids.peerEmp, { ...body, leaveTypeId: ids.BCL }).expect(404);
    });
  });

  describe('Adjust balance from the HR leave home (founder-approved)', () => {
    it("a department grant reaches only its people: outside it the person's balances and the post are refused; inside they work", async () => {
      const profileId = (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `adjust-grant-${run}`, permissionsJson: JSON.stringify(['leave.view', 'leave.balance.adjust']) } }))).id;
      const empty = randomUUID();
      await inA((tx) => tx.department.create({ data: { organizationId: org.A.id, id: empty, name: 'Bakery', code: 'BAK', path: `/${empty}/` } }));
      const grant = (departmentId: string) => inA((tx) => tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrScoped, permissionProfileId: profileId, scopeType: 'department_subtree', departmentId, validFrom: new Date(`${d(-30)}T00:00:00Z`), status: 'active', reason: 'Bakery HR' } }));
      const body = { leaveTypeId: ids.EL, days: 1, reason: 'Correction' };
      // No grant at all: the endpoint key is missing.
      await api('hrScoped', 'post', `/time/people/${ids.peerEmp}/adjust`).send(body).expect(403);
      await grant(empty);
      await api('hrScoped', 'get', `/time/people/${ids.peerEmp}/balances`).expect(404);
      await api('hrScoped', 'post', `/time/people/${ids.peerEmp}/adjust`).send(body).expect(404);
      await grant(ids.deptA);
      const el = (await api('hrScoped', 'get', `/time/people/${ids.peerEmp}/balances`).expect(200)).body.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.EL);
      await api('hrScoped', 'post', `/time/people/${ids.peerEmp}/adjust`).send(body).expect(201);
      expect((await api('hrScoped', 'get', `/time/people/${ids.peerEmp}/balances`).expect(200)).body.balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === ids.EL).balance).toBe(el.balance + 1);
      // Another company's person is not found, even with the key company-wide.
      await api('hrAdjust', 'post', `/time/people/${ids.empBEmp}/adjust`).send(body).expect(404);
    });
  });

  // Home's "Needs your action" (PLT-02, 5 Nov 2026): the inbox says which rows get one-click Approve; Approve is the
  // inbox's own decide call with every check; the "others off" count comes from the approver's own team only.
  describe('Home one-click Approve and row notes (5 Nov 2026)', () => {
    type Row = { taskId: string; requestId: string; type: string; title: string; person: string; onBehalfOf: string | null; quickApprove?: boolean; note?: string | null; decideAt: string | null };
    const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as Row[];
    const decide = (who: Who, taskId: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision: 'approve' });
    let empReq: string;
    let peerReq: string;

    beforeAll(async () => {
      empReq = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: work(50), to: work(50) }).expect(201)).body.id;
      peerReq = (await api('peer', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: work(50), to: work(50) }).expect(201)).body.id;
    });
    const wfOf = async (leaveId: string) => (await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: leaveId } }))).wfRequestId!;

    it('leave rows are marked for one-click Approve, with no type note; the title still carries the name for the API', async () => {
      const wf = await wfOf(empReq);
      const mine = (await inbox('mgr')).find((r) => r.requestId === wf)!;
      expect(mine).toMatchObject({ type: 'Leave', quickApprove: true, note: null, decideAt: null, person: `emp ${run}` });
      expect(mine.title.startsWith(`emp ${run}: Earned leave`)).toBe(true);
    });

    it('the team count for the note is the approver’s own team only: a teammate off the same day counts, nobody else is named', async () => {
      const home = (await api('mgr', 'get', '/time/team/leave-home').expect(200)).body as { waiting: { taskId: string; employeeId: string; others: { name: string }[] }[] };
      const wf = await wfOf(empReq);
      const task = (await inbox('mgr')).find((r) => r.requestId === wf)!;
      const row = home.waiting.find((w) => w.taskId === task.taskId)!;
      expect(row.others.map((o) => o.name)).toContain(`peer ${run}`);
      const team = new Set([`emp ${run}`, `peer ${run}`, `hrNoPay ${run}`]);
      expect(row.others.every((o) => team.has(o.name))).toBe(true);
      // Someone outside any team (no direct reports) and another company get no rows at all.
      expect(((await api('hrPay', 'get', '/time/team/leave-home').expect(200)).body as { waiting: unknown[] }).waiting).toEqual([]);
      expect(((await api('empB', 'get', '/time/team/leave-home').expect(200)).body as { waiting: unknown[] }).waiting).toEqual([]);
      expect(await inbox('adminB')).toEqual([]);
    });

    it('acting for the approver cannot approve; another company and the requester cannot either; the row stays', async () => {
      const wf = await wfOf(empReq);
      const task = (await inbox('mgr')).find((r) => r.requestId === wf)!;
      const acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.mgr}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
      expect((await request(server()).post(`/api/v1/workflow/approvals/tasks/${task.taskId}/decide`).set('Authorization', `Bearer ${acting}`).send({ decision: 'approve' }).expect(403)).body.message).toBe('Not available while acting for someone else');
      await decide('adminB', task.taskId).expect(404);
      await decide('emp', task.taskId).expect(404);
      expect((await inbox('mgr')).some((r) => r.taskId === task.taskId)).toBe(true);
    });

    it('the manager approves their own row once; a second press is refused and nothing changes twice', async () => {
      const wf = await wfOf(empReq);
      const task = (await inbox('mgr')).find((r) => r.requestId === wf)!;
      await decide('mgr', task.taskId).expect(200);
      await decide('mgr', task.taskId).expect(409);
      expect(await inA((tx) => tx.wfAction.count({ where: { requestId: wf, action: 'approved' } }))).toBe(1);
      expect((await inbox('mgr')).some((r) => r.taskId === task.taskId)).toBe(false);
    });

    it('a delegate sees the row for one-click Approve (on behalf of the manager) but no team note; approving twice is refused', async () => {
      const del = (await api('mgr', 'post', '/workflow/delegations').send({ delegateUserId: users.hrPay, startsOn: today, endsOn: d(3) }).expect(201)).body as { id: string };
      const wf = await wfOf(peerReq);
      const row = (await inbox('hrPay')).find((r) => r.requestId === wf)!;
      expect(row).toMatchObject({ quickApprove: true, onBehalfOf: `mgr ${run}` });
      // The delegate has no team, so the leave home holds nothing for them and Home shows no "others off" note.
      expect(((await api('hrPay', 'get', '/time/team/leave-home').expect(200)).body as { waiting: unknown[] }).waiting).toEqual([]);
      await decide('hrPay', row.taskId).expect(200);
      expect((await decide('hrPay', row.taskId).expect(409)).body.message).toBe('This approval is already closed.');
      expect((await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: peerReq } }))).status).toBe('approved');
      await api('mgr', 'post', `/workflow/delegations/${del.id}/revoke`).expect(200);
    });
  });

  /** A person joining in 20 days (not employed before). */
  async function hireLate() {
    return (
      await api('adminA', 'post', '/people/employees')
        .send({ legalEntityId: ids.entityA, status: 'confirmed', reason: 'Joined', givenName: 'joiner', familyName: run, joinedOn: d(20), userId: users.joiner, workEmail: `joiner@leavedec-${run}.test`, assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desigA, employmentTypeId: ids.permA, managerEmployeeId: ids.mgrEmp } })
        .expect(201)
    ).body.id as string;
  }
});
