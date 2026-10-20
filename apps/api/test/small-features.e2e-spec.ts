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

// Small features (19 Oct 2026), end to end against the real database (forced RLS, the app role): break punches with the
// location check and break time off the worked time (the muster too); work from home through the approvals workflow;
// "Show pay on Home"; Nudge. Each new endpoint is checked for another person's data, another company and no permission.
describe('Small features: breaks, work from home, pay on Home, nudge', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let dayEngine: DayEngine;
  const sent: { to: string; subject: string; html: string }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'mgr' | 'emp' | 'peer' | 'quiet' | 'other' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  // The test location's only weekly off is the weekday two days from today.
  const offWeekday = ((new Date(`${d(2)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const INSIDE = { lat: 12.9717, lng: 77.5947, accuracyM: 20 };
  const OUTSIDE = { lat: 12.9716, lng: 77.6126, accuracyM: 20 };
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string; summary: { label: string; value: string }[] }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(decision === 'reject' ? { reason: 'Not this week' } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (sent.push(m), { success: true })) })
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

    planId = (await prisma.plan.create({ data: { name: `small-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Small Org ${k}`, slug: `small-${k.toLowerCase()}-${run}`, planId } });
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
      ['quiet', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@small-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@small-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Small Foods ${k}`, shortName: `SF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        await tx.locationFence.create({ data: { ...o, locationId: ids[`loc${k}`], name: 'Main point', lat: 12.9716, lng: 77.5946, radiusM: 150 } });
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Ops', code: 'OPS', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // The location's day (9:30 to 18:30, 30 minutes' break above 5 hours) for the last month and from today.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date(`${d(-30)}T00:00:00Z`), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: offWeekday }] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-10), userId: users[who], workEmail: `${who}@small-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.hrEmp = await hire('adminA', 'hrAdmin', null);
    ids.mgrEmp = await hire('adminA', 'mgr', ids.hrEmp);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.quietEmp = await hire('adminA', 'quiet', ids.mgrEmp);
    ids.otherEmp = await hire('adminA', 'other', ids.hrEmp);
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

  describe('breaks on the attendance clock', () => {
    const punch = (who: Who, kind: string, at: object = INSIDE) => api(who, 'post', '/time/me/punch').send({ kind, ...at });

    it('Start break / End break follow the check-in, with the same location check, each one kept', async () => {
      expect((await punch('peer', 'break_start').expect(409)).body.message).toBe('Check in before you start a break.');
      expect((await punch('peer', 'break_end').expect(409)).body.message).toBe('You are not on a break.');
      await punch('peer', 'in').expect(200);
      // Outside the geofence: refused, said in plain words, and logged.
      const refused = (await punch('peer', 'break_start', OUTSIDE).expect(200)).body;
      expect(refused).toMatchObject({ accepted: false, kind: 'break_start' });
      expect(refused.message).toBe('Outside Bengaluru, 1.9 km away');
      expect((await punch('peer', 'break_start').expect(200)).body).toMatchObject({ accepted: true, kind: 'break_start', message: 'Break started. Inside Bengaluru' });
      expect((await punch('peer', 'break_start').expect(200)).body).toMatchObject({ duplicate: true, message: 'Break already started' });
      let me = (await api('peer', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me).toMatchObject({ next: 'out', onBreak: true });
      expect(me.punches.map((p: { kind: string; accepted: boolean }) => `${p.kind}:${p.accepted}`)).toEqual(['in:true', 'break_start:false', 'break_start:true']);
      expect((await punch('peer', 'break_end').expect(200)).body).toMatchObject({ accepted: true, message: 'Break ended. Inside Bengaluru' });
      me = (await api('peer', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me).toMatchObject({ next: 'out', onBreak: false });
      // Another person's punches stay theirs; the other company sees none.
      expect((await api('emp', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body.punches).toEqual([]);
      await api('empB', 'get', `/time/people/${ids.peerEmp}/days/${today}`).expect(404);
      await api('emp', 'get', `/time/people/${ids.peerEmp}/days/${today}`).expect(404);
      const card = (await api('mgr', 'get', `/time/people/${ids.peerEmp}/days/${today}`).expect(200)).body;
      expect(card.punches.filter((p: { accepted: boolean }) => p.accepted).map((p: { kind: string }) => p.kind)).toEqual(['in', 'break_start', 'break_end']);
    });

    it('break time is not worked time: the day and the muster take off the larger of the breaks and the rule', async () => {
      const on = d(-1);
      const at = (hhmm: string) => instantAt(on, 'Asia/Kolkata', Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));
      const p = (employeeId: string, kind: string, hhmm: string) => ({ organizationId: org.A.id, employeeId, punchedAt: at(hhmm), workOn: new Date(`${on}T00:00:00Z`), kind, accepted: true, verdict: 'inside' });
      await inA((tx) =>
        tx.punch.createMany({
          data: [
            // 9:30 to 18:30 with a 45-minute break: 495.
            p(ids.empEmp, 'in', '09:30'), p(ids.empEmp, 'break_start', '13:00'), p(ids.empEmp, 'break_end', '13:45'), p(ids.empEmp, 'out', '18:30'),
            // A break never ended: it ends at check-out (17:30 to 18:30), so 540 - 60 = 480.
            p(ids.otherEmp, 'in', '09:30'), p(ids.otherEmp, 'break_start', '17:30'), p(ids.otherEmp, 'out', '18:30'),
          ],
        }),
      );
      const c = { organizationId: org.A.id, isSuperAdmin: false };
      for (const e of [ids.empEmp, ids.otherEmp]) await tenantPrisma.forTenant(c, (tx) => dayEngine.evaluate(tx, c, e, on, on));
      const muster = (await api('hrAdmin', 'get', `/time/muster?month=${on.slice(0, 7)}`).expect(200)).body as { people: { id: string; days: { on: string; workedMinutes: number; status: string }[] }[] };
      const day = (id: string) => muster.people.find((x) => x.id === id)!.days.find((x) => x.on === on)!;
      expect(day(ids.empEmp)).toMatchObject({ workedMinutes: 495, status: 'present' });
      expect(day(ids.otherEmp)).toMatchObject({ workedMinutes: 480, status: 'present' });
      const mine = (await api('emp', 'get', `/time/me/attendance?month=${on.slice(0, 7)}`).expect(200)).body;
      expect(mine.days.find((x: { on: string }) => x.on === on)).toMatchObject({ workedMinutes: 495 });
    });
  });

  describe('request work from home', () => {
    it('checks the day: today or later, a working day, one request a day', async () => {
      expect((await api('emp', 'post', '/time/me/wfh').send({ on: d(-1), reason: 'Plumber' }).expect(400)).body.message).toBe('Pick today or a later date.');
      expect((await api('emp', 'post', '/time/me/wfh').send({ on: d(2), reason: 'Plumber' }).expect(400)).body.message).toMatch(/is your weekly off\.$/);
      await api('emp', 'post', '/time/me/wfh').send({ on: today, reason: '' }).expect(400);
    });

    it('goes to the manager only; the person sees it in My requests; no one else can see or touch it', async () => {
      const r = (await api('emp', 'post', '/time/me/wfh').send({ on: today, reason: 'Plumber visit at home in the morning' }).expect(201)).body;
      expect(r).toMatchObject({ status: 'pending', hrStep: false });
      ids.wfh = r.id;
      await api('emp', 'post', '/time/me/wfh').send({ on: today, reason: 'Again' }).expect(409);
      const mine = (await api('emp', 'get', '/workflow/approvals/mine').expect(200)).body as { title: string; status: string }[];
      expect(mine.find((x) => x.title.includes('work from home'))).toMatchObject({ status: 'pending' });
      const me = (await api('emp', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me.wfh).toEqual({ limit: 4, used: 1 });
      expect(me.requests).toEqual([expect.objectContaining({ id: r.id, kind: 'wfh', status: 'pending' })]);
      // Only the manager is asked: not a teammate, not HR (under the limit), never the other company.
      for (const who of ['peer', 'hrAdmin', 'other', 'adminB', 'empB'] as const) expect((await inbox(who)).some((t) => t.title.includes('work from home'))).toBe(false);
      // Nobody else can withdraw it.
      await api('peer', 'post', `/time/me/regularise/${r.id}/withdraw`).expect(404);
      await api('empB', 'post', `/time/me/regularise/${r.id}/withdraw`).expect(404);
      const task = (await inbox('mgr')).find((t) => t.title.includes('work from home'))!;
      expect(task.title).toMatch(/^emp .*: work from home on /);
      expect(task.summary.find((s) => s.label === 'Work from home this month')!.value).toBe('Day 1 of 4 without HR');
      // The person cannot decide their own request; the teammate has no task to decide (not found, nothing given away).
      await decide('emp', task.taskId, 'approve').expect(404);
      await decide('peer', task.taskId, 'approve').expect(404);
      await decide('empB', task.taskId, 'approve').expect(404);
      await decide('mgr', task.taskId, 'approve').expect(200);
      expect(await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: r.id } }))).toMatchObject({ status: 'approved' });
    });

    it('on an approved day: counted present, and web check-in from outside the geofence is recorded, not refused', async () => {
      let me = (await api('emp', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me.wfhToday).toBe(true);
      expect(me.days.find((x: { on: string }) => x.on === today)).toMatchObject({ status: 'present' });
      const p = (await api('emp', 'post', '/time/me/punch').send({ kind: 'in', ...OUTSIDE }).expect(200)).body;
      expect(p).toMatchObject({ accepted: true, verdict: 'field', message: 'Checked in. Working from home today, location recorded' });
      // A teammate on an office day is still refused outside.
      expect((await api('other', 'post', '/time/me/punch').send({ kind: 'in', ...OUTSIDE }).expect(200)).body).toMatchObject({ accepted: false });
      me = (await api('emp', 'get', `/time/me/attendance?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(me.days.find((x: { on: string }) => x.on === today)).toMatchObject({ status: 'present' });
      // The manager's muster says present too.
      const muster = (await api('mgr', 'get', `/time/muster?month=${today.slice(0, 7)}`).expect(200)).body as { people: { id: string; days: { on: string; status: string }[] }[] };
      expect(muster.people.find((x) => x.id === ids.empEmp)!.days.find((x) => x.on === today)).toMatchObject({ status: 'present' });
    });

    it('beyond the monthly limit HR approves too', async () => {
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.wfh_monthly_limit', scopeType: 'tenant', value: '0' }).expect(200);
      const r = (await api('peer', 'post', '/time/me/wfh').send({ on: d(1), reason: 'Internet engineer visit' }).expect(201)).body;
      expect(r).toMatchObject({ status: 'pending', hrStep: true });
      const task = (await inbox('mgr')).find((t) => t.title.startsWith('peer ') && t.title.includes('work from home'))!;
      await decide('mgr', task.taskId, 'approve').expect(200);
      expect((await inbox('hrAdmin')).some((t) => t.title.startsWith('peer ') && t.title.includes('work from home'))).toBe(true);
      // Withdrawn by the person while HR still has it.
      expect((await api('peer', 'post', `/time/me/regularise/${r.id}/withdraw`).expect(200)).body).toEqual({ id: r.id, status: 'withdrawn' });
    });
  });

  describe('show pay on Home', () => {
    const paid = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
      inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        return fn(tx);
      });
    /** An approved regular payslip on a run for the month, published or not, as payroll would leave it. */
    const slip = (employeeId: string, month: string, net: string, published: boolean) =>
      paid(async (tx) => {
        const x = { organizationId: org.A.id, legalEntityId: ids.entityA };
        ids.group ??= (await tx.payGroup.create({ data: { ...x, name: 'Monthly' } })).id;
        const start = new Date(`${month}-01T00:00:00Z`);
        ids[`run${month}`] ??= (await tx.payrollRun.create({ data: { ...x, payGroupId: ids.group, periodStart: start, periodEnd: start, status: 'paid', preparedBy: users.adminA, publishedAt: published ? new Date() : null } })).id;
        const employmentId = (await tx.employeeAssignment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId } })).employmentId;
        await tx.payslip.create({ data: { ...x, runId: ids[`run${month}`], employmentId, employeeId, periodStart: start, calcVersion: 1, gross: net, deductions: '0', net, employerCost: net, ruleVersions: {}, snapshotHash: 'a'.repeat(64), resultHash: 'b'.repeat(64), status: 'approved' } });
      });

    it('is off by default; only a settings manager turns it on', async () => {
      await slip(ids.empEmp, '2026-08', '84900.00', true);
      await slip(ids.empEmp, '2026-09', '86420.00', true);
      await slip(ids.peerEmp, '2026-09', '99999.00', true);
      // Not published yet: never shown.
      await slip(ids.empEmp, '2026-10', '70000.00', false);
      expect((await api('emp', 'get', '/payroll/me/home-pay').expect(200)).body).toEqual({ shown: false });
      await api('emp', 'put', '/org/settings').send({ key: 'home.pay_on_employee_home', scopeType: 'tenant', value: 'on' }).expect(403);
      await api('adminA', 'put', '/org/settings').send({ key: 'home.pay_on_employee_home', scopeType: 'tenant', value: 'maybe' }).expect(400);
      await api('adminA', 'put', '/org/settings').send({ key: 'home.pay_on_employee_home', scopeType: 'tenant', value: 'on' }).expect(200);
    });

    it("on: each person's own latest published net pay and the month before, never anyone else's", async () => {
      expect((await api('emp', 'get', '/payroll/me/home-pay').expect(200)).body).toEqual({ shown: true, latest: { id: expect.any(String), month: '2026-09', net: '86420.00' }, previous: { month: '2026-08', net: '84900.00' } });
      expect((await api('peer', 'get', '/payroll/me/home-pay').expect(200)).body).toMatchObject({ shown: true, latest: { month: '2026-09', net: '99999.00' }, previous: null });
      // The manager sees only their own (none), not their team's.
      expect((await api('mgr', 'get', '/payroll/me/home-pay').expect(200)).body).toEqual({ shown: true, latest: null, previous: null });
    });

    it('another company: its own setting (off), and never this company’s pay', async () => {
      expect((await api('empB', 'get', '/payroll/me/home-pay').expect(200)).body).toEqual({ shown: false });
      await api('adminB', 'put', '/org/settings').send({ key: 'home.pay_on_employee_home', scopeType: 'tenant', value: 'on' }).expect(200);
      expect((await api('empB', 'get', '/payroll/me/home-pay').expect(200)).body).toEqual({ shown: true, latest: null, previous: null });
    });
  });

  describe('nudge', () => {
    const nudge = (who: Who, employeeId: string) => api(who, 'post', `/time/people/${employeeId}/nudge`);
    const bell = async (who: Who) => (await api(who, 'get', '/notifications').expect(200)).body as { type: string; contextText: string | null; linkPath: string }[];

    it('a manager reminds someone in their team who has not checked in: a notification and an email naming the item', async () => {
      const before = sent.length;
      expect((await nudge('mgr', ids.quietEmp).expect(200)).body).toEqual({ sent: true, to: `quiet ${run}`, item: 'check_in', on: today });
      const n = (await bell('quiet')).filter((x) => x.type === 'nudge.reminder');
      expect(n).toHaveLength(1);
      const day = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      expect(n[0].contextText).toBe(`mgr ${run} reminded you to check in today (${day}).`);
      expect(n[0].linkPath).toBe('/yx/time/attendance');
      const mail = sent.slice(before).filter((m) => m.to === `quiet@small-${run}.test`);
      expect(mail).toHaveLength(1);
      expect(mail[0].subject).toBe('Reminder: check in today');
      expect(mail[0].html).toContain(`mgr ${run} reminded you to check in today`);
    });

    it('once a day per person and item, whoever sends it', async () => {
      expect((await nudge('mgr', ids.quietEmp).expect(409)).body.message).toBe(`quiet ${run} was already reminded today. You can remind them again tomorrow.`);
      // HR sees everyone, but the person was already reminded today.
      await nudge('hrAdmin', ids.quietEmp).expect(409);
      expect((await bell('quiet')).filter((x) => x.type === 'nudge.reminder')).toHaveLength(1);
    });

    it('only for people the nudger can see, never themselves, and only while it is still waiting', async () => {
      // A teammate, someone outside the manager's team, the other company: not found (nothing given away).
      await nudge('peer', ids.quietEmp).expect(404);
      await nudge('mgr', ids.otherEmp).expect(404);
      await nudge('empB', ids.quietEmp).expect(404);
      await nudge('adminB', ids.quietEmp).expect(404);
      await nudge('mgr', ids.empBEmp).expect(404);
      await nudge('mgr', ids.mgrEmp).expect(400);
      // Already checked in today: nothing to remind.
      expect((await nudge('mgr', ids.empEmp).expect(409)).body.message).toBe(`emp ${run} has already checked in today.`);
    });

    it("HR reaches anyone in scope; the email follows the person's notification preferences", async () => {
      await api('other', 'patch', '/notifications/preferences').send({ type: 'nudge.reminder', emailEnabled: false }).expect(200);
      const before = sent.length;
      await nudge('hrAdmin', ids.otherEmp).expect(200);
      expect((await bell('other')).filter((x) => x.type === 'nudge.reminder')).toHaveLength(1);
      expect(sent.slice(before).filter((m) => m.to === `other@small-${run}.test`)).toHaveLength(0);
    });
  });
});
