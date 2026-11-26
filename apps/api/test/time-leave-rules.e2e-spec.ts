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
import { LeaveService } from '../src/time/leave.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Time leave rules and on duty (Nov 2026), end to end against the real database (forced RLS, the app role): TIM-27 type
// rules (monthly limit, cash-in terms, statutory lock), TIM-29 year end once per policy with pay-outs and the leave-year
// change, TIM-07 on duty with send back. Each: the positive path, the wrong role, another company, bad input, a repeat.
describe('Time leave rules and on duty', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let leave: LeaveService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'mgr' | 'emp' | 'emp2' | 'mgr2' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const ZONE = 'Asia/Kolkata';
  const today = DateTime.now().setZone(ZONE).toISODate()!;
  const d = (n: number) => addDays(today, n);
  const asDate = (on: string) => new Date(`${on}T00:00:00Z`);
  const Y = Number(today.slice(0, 4));
  const lastYearEnd = `${Y - 1}-12-31`;
  // A month two ahead, so every day of it is still to come.
  const M = DateTime.fromISO(today).plus({ months: 2 }).toFormat('yyyy-MM');
  const login = (who: Who) => request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[who === 'adminB' || who === 'empB' ? 'B' : 'A'].slug, email: `${who}@lr-${run}.test`, password: PASSWORD });
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject' | 'send_back', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  const taskOf = async (requestId: string) => {
    const r = await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: requestId } }));
    return (await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: r.wfRequestId!, status: 'open' } }))).id;
  };
  // Kind "other": no state floor raises the carry cap or the credit, so the numbers stay the policy's own.
  const typeBody = (over: Record<string, unknown> = {}, rules: Record<string, unknown> = {}) => ({ code: 'EL', name: 'Earned leave', kind: 'other', paid: true, ...over, rules: { halfDays: true, ...rules } });

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

    planId = (await prisma.plan.create({ data: { name: `lr-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `LR Org ${k}`, slug: `lr-${k.toLowerCase()}-${run}`, planId } });
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
      ['emp2', 'A', 'panel', null],
      ['mgr2', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@lr-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await login(who).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `LR Foods ${k}`, shortName: `LR${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai office', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['10.20.4.0/24'] } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day (no weekly offs), 9:30 am to 6:30 pm.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2024-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const joined = `${Y - 1}-01-01`;
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before this year (test data)', givenName: who, familyName: run, joinedOn: joined, userId: users[who], workEmail: `${who}@lr-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .then((r) => {
            if (r.status !== 201) throw new Error(`hire ${who}: ${r.status} ${JSON.stringify(r.body)}`);
            return r;
          })
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.mgr2Emp = await hire('adminA', 'mgr2', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.emp2Emp = await hire('adminA', 'emp2', ids.mgr2Emp);
    ids.hrEmp = await hire('adminA', 'hr', null);
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

  // ------------------------------------------------------------------------------------------ TIM-27 type rules

  describe('TIM-27 leave type rules', () => {
    it('saves the monthly limit and cash-in terms; refuses bad values, the wrong role and another company', async () => {
      await api('hr', 'post', '/time/setup/types').send(typeBody({}, { maxDaysPerMonth: 0 })).expect(400);
      expect((await api('hr', 'post', '/time/setup/types').send(typeBody({}, { maxDaysPerMonth: 3, maxDays: 4 })).expect(400)).body.message).toMatch(/monthly limit of 3/);
      expect((await api('hr', 'post', '/time/setup/types').send(typeBody({}, { encashMaxDays: 2 })).expect(400)).body.message).toMatch(/Can be cashed in/);
      await api('hr', 'post', '/time/setup/types').send(typeBody({}, { encashable: true, encashDivisor: 31 })).expect(400);
      await api('hr', 'post', '/time/setup/types').send(typeBody({}, { noticePeriod: 'half_paid' })).expect(400);
      await api('emp', 'post', '/time/setup/types').send(typeBody({}, { maxDaysPerMonth: 3 })).expect(403);
      ids.EL = (await api('hr', 'post', '/time/setup/types').send(typeBody({}, { maxDaysPerMonth: 3, encashable: true, encashMaxDays: 2, encashMinLeft: 0, encashDivisor: 30, encashAtExit: false, longAbsence: 'continue', noticePeriod: 'blocked' })).expect(201)).body.id;
      const t = (await api('hr', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === ids.EL);
      expect(t.rules).toMatchObject({ maxDaysPerMonth: 3, encashMaxDays: 2, encashMinLeft: 0, encashDivisor: 30, encashAtExit: false, longAbsence: 'continue', noticePeriod: 'blocked' });
      expect(t.statutory).toBeNull();
      // Another company never sees or changes it.
      await api('adminB', 'put', `/time/setup/types/${ids.EL}`).send(typeBody({}, { maxDaysPerMonth: 5 })).expect(404);
      expect((await api('adminB', 'get', '/time/setup').expect(200)).body.types.map((x: { id: string }) => x.id)).not.toContain(ids.EL);
      const audit = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'leave.type.created', entityId: ids.EL } }));
      expect(JSON.parse(audit.metadataJson ?? '{}').rules.maxDaysPerMonth).toBe(3);

      ids.policy = (await api('hr', 'post', '/time/setup/policies').send({ name: 'Staff' }).expect(201)).body.id;
      await api('hr', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: `${Y - 1}-01-01`, lines: [{ leaveTypeId: ids.EL, annualDays: 0, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 5 }] }).expect(201);
      await api('hr', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: `${Y - 1}-01-01` }).expect(201);
      for (const e of [ids.empEmp, ids.emp2Emp]) await api('hr', 'post', `/time/people/${e}/adjust`).send({ leaveTypeId: ids.EL, days: 20, reason: 'Opening balance' }).expect(201);
    });

    it('most days in a month: enforced on apply, half days exact, the limit itself allowed', async () => {
      const on = (day: number) => `${M}-${String(day).padStart(2, '0')}`;
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on(5), to: on(6), reason: 'Family' }).expect(201);
      // 2 + 2 = 4 > 3: refused with the month named and what is left.
      const over = await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.EL, from: on(10), to: on(11) }).expect(200);
      expect(over.body.blocks.join(' ')).toMatch(new RegExp(`at most 3 days in a month\\. You already have 2 days in ${DateTime.fromISO(`${M}-01`).toFormat('MMMM yyyy')}, so up to 1 day more`));
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on(10), to: on(11), reason: 'Family' }).expect(400);
      // A half day (2.5), then another half day reaches exactly 3; one more half is over.
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on(12), to: on(12), fromHalf: 'second', reason: 'Bank' }).expect(201);
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on(13), to: on(13), fromHalf: 'second', reason: 'Bank' }).expect(201);
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: on(14), to: on(14), fromHalf: 'second', reason: 'Bank' }).expect(400);
      // The next month is separate; someone else's days never count.
      const next = DateTime.fromISO(`${M}-01`).plus({ months: 1 }).toFormat('yyyy-MM');
      expect((await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.EL, from: `${next}-02`, to: `${next}-04` }).expect(200)).body.blocks).toEqual([]);
      expect((await api('emp2', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.EL, from: on(10), to: on(12) }).expect(200)).body.blocks).toEqual([]);
    });

    it('cash-in uses the type limit (2 days, nothing must stay) over the company default (7 / 7)', async () => {
      await api('adminA', 'put', '/org/settings').send({ key: 'leave.encashment.window', value: 'any_month', scopeType: 'tenant' }).expect(200);
      const e = (await api('emp2', 'get', '/time/me/encashment').expect(200)).body;
      expect(e.types.find((t: { leaveTypeId: string }) => t.leaveTypeId === ids.EL)).toMatchObject({ maxPerYear: 2, minLeft: 0, divisor: 30, max: 2 });
      expect((await api('emp2', 'post', '/time/me/encashment').send({ leaveTypeId: ids.EL, days: 2.5 }).expect(400)).body.message).toMatch(/up to 2 days \(0 days must stay; 2 days a year\)/);
    });

    it('T2-A (D8): only on some weekdays, at most N requests a month, days between two requests; bad values refused', async () => {
      const EL_RULES = { maxDaysPerMonth: 3, encashable: true, encashMaxDays: 2, encashMinLeft: 0, encashDivisor: 30, encashAtExit: false, longAbsence: 'continue', noticePeriod: 'blocked' };
      for (const bad of [{ maxRequestsPerMonth: 0 }, { maxRequestsPerMonth: 1.5 }, { minGapDays: 91 }, { allowedWeekdays: [7] }, { allowedWeekdays: [] }])
        await api('hr', 'put', `/time/setup/types/${ids.EL}`).send(typeBody({}, { ...EL_RULES, ...bad })).expect(400);
      await api('hr', 'put', `/time/setup/types/${ids.EL}`).send(typeBody({}, { ...EL_RULES, maxRequestsPerMonth: 1, minGapDays: 10, allowedWeekdays: [1, 1, 3] })).expect(200);
      expect((await api('hr', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === ids.EL).rules).toMatchObject({ maxRequestsPerMonth: 1, minGapDays: 10, allowedWeekdays: [1, 3] });
      // Two months ahead of the month the monthly-days test used, so its days do not count.
      const N = DateTime.fromISO(`${M}-01`).plus({ months: 2 });
      let monday = N;
      while (monday.weekday !== 1) monday = monday.plus({ days: 1 });
      const d = (x: DateTime) => x.toISODate()!;
      const preview = async (who: 'emp' | 'emp2', from: DateTime, to = from) => ((await api(who, 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.EL, from: d(from), to: d(to) }).expect(200)).body.blocks as string[]).join(' ');
      // A Tuesday is not allowed; Monday and Wednesday are.
      expect(await preview('emp', monday.plus({ days: 1 }))).toMatch(/can be taken only on Monday and Wednesday/);
      expect(await preview('emp', monday)).toBe('');
      const id = (await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: d(monday), to: d(monday), reason: 'Family' }).expect(201)).body.id as string;
      // Once a month: another Monday of the same month is refused; 10 days must pass after the first one.
      const twoWeeks = monday.plus({ days: 14 });
      expect(await preview('emp', twoWeeks)).toMatch(new RegExp(`at most once a month\\. You already have 1 request starting in ${monday.toFormat('MMMM yyyy')}`));
      const wednesday = monday.plus({ days: 9 });
      const gapBlocks = await preview('emp', wednesday);
      expect(gapBlocks).toMatch(/needs 10 days between two requests/);
      // Someone else's requests never count.
      expect(await preview('emp2', monday.plus({ days: 7 }))).toBe('');
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.EL, from: d(twoWeeks), to: d(twoWeeks), reason: 'Family' }).expect(400);
      // Withdrawn requests no longer count. (The type now has requests, so its rules stay; the later tests do not depend on them.)
      await api('emp', 'post', `/time/me/leave/${id}/withdraw`).send({}).expect((r) => expect([200, 201]).toContain(r.status));
      expect(await preview('emp', twoWeeks)).toBe('');
    });

    it('statutory maternity: locked at the legal minimum with a plain reason; more than the law is fine', async () => {
      const ml = (rules: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({ code: 'ML', name: 'Maternity leave', kind: 'maternity', paid: true, ...over, rules: { eligibleGenders: ['female'], ...rules } });
      expect((await api('hr', 'post', '/time/setup/types').send(ml({ maxDays: 181 })).expect(400)).body.message).toBe("Maternity leave can be up to 26 weeks by law (Maternity Benefit Act 1961). The most days in one request can't be below 182.");
      expect((await api('hr', 'post', '/time/setup/types').send(ml({}, { paid: false })).expect(400)).body.message).toMatch(/paid by law/);
      expect((await api('hr', 'post', '/time/setup/types').send(ml({ paySteps: [{ days: 84, percent: 100 }, { days: 98, percent: 50 }] })).expect(400)).body.message).toMatch(/paid in full/);
      expect((await api('hr', 'post', '/time/setup/types').send(ml({ noticeDays: 30, noticeMode: 'block' })).expect(400)).body.message).toMatch(/short notice/);
      ids.ML = (await api('hr', 'post', '/time/setup/types').send(ml({ maxDays: 182 })).expect(201)).body.id;
      await api('hr', 'put', `/time/setup/types/${ids.ML}`).send(ml({ maxDays: 200 })).expect(200);
      expect((await api('hr', 'put', `/time/setup/types/${ids.ML}`).send(ml({ maxDays: 181 })).expect(400)).body.message).toMatch(/can't be below 182/);
      expect((await api('hr', 'put', `/time/setup/types/${ids.ML}`).send(ml({}, { active: false })).expect(400)).body.message).toMatch(/stays in use/);
      const t = (await api('hr', 'get', '/time/setup').expect(200)).body;
      expect(t.types.find((x: { id: string }) => x.id === ids.ML).statutory).toEqual({ law: 'Maternity Benefit Act 1961', days: 182, paidInFull: true });
      expect(t.maternity).toMatchObject({ maternityWeeks: 26, maternityWeeksThirdChild: 12 });
      // Paternity: no state rule is seeded, so it stays a company choice.
      await api('hr', 'post', '/time/setup/types').send({ code: 'PL', name: 'Paternity leave', kind: 'paternity', paid: false, rules: { maxDays: 5 } }).expect(201);
    });
  });

  // ------------------------------------------------------------------------------------------ TIM-29 year end

  describe('answer 2477: dated leave type versions and who can take it', () => {
    const on = (day: number) => `${M}-${String(day).padStart(2, '0')}`;
    const body = (over: Record<string, unknown> = {}, rules: Record<string, unknown> = {}) => ({ code: 'CL', name: 'Casual leave', kind: 'other', paid: true, ...over, rules: { halfDays: true, ...rules } });

    it('a change dated ahead waits as a version; leave follows the version in force on its first day; past ones never change', async () => {
      ids.CL = (await api('hr', 'post', '/time/setup/types').send(body()).expect(201)).body.id;
      // Negatives first: the wrong role, another company, a date in the past, bad eligibility; nothing saved.
      await api('emp', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({}, { minMonthsWorked: 120 }), validFrom: on(1) }).expect(403);
      await api('adminB', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({}, { minMonthsWorked: 120 }), validFrom: on(1) }).expect(404);
      expect((await api('hr', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({}, { minMonthsWorked: 120 }), validFrom: d(-1) }).expect(400)).body.message).toMatch(/today or a later date/);
      await api('hr', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({}, { minMonthsWorked: 0 }), validFrom: on(1) }).expect(400);
      await api('hr', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({}, { eligibleEmploymentTypes: ['not-a-type'] }), validFrom: on(1) }).expect(400);
      await api('hr', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({}, { probation: 'sometimes' }), validFrom: on(1) }).expect(400);
      expect(await inA((tx) => tx.leaveTypeVersion.count({ where: { leaveTypeId: ids.CL } }))).toBe(1);
      // From the 1st of month M: 120 months of work first, and unpaid.
      expect((await api('hr', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({ paid: false }, { minMonthsWorked: 120 }), validFrom: on(1) }).expect(200)).body).toEqual({ id: ids.CL, validFrom: on(1) });
      const t = (await api('hr', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === ids.CL);
      expect(t.paid).toBe(true);
      expect(t.versions.map((v: { validFrom: string; paid: boolean }) => [v.validFrom, v.paid])).toEqual([[on(1), false], ['2000-01-01', true]]);
      const blocks = async (from: string) => (await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.CL, from, to: from }).expect(200)).body.blocks as string[];
      expect((await blocks(d(3))).join(' ')).not.toMatch(/months of work/);
      expect((await blocks(on(2))).join(' ')).toMatch(/Casual leave can be taken after 120 months of work, from /);
      // The waiting version can be replaced on its date; a version in force never changes (the database refuses).
      await api('hr', 'put', `/time/setup/types/${ids.CL}`).send({ ...body({ paid: false }, { minMonthsWorked: 119 }), validFrom: on(1) }).expect(200);
      expect(await inA((tx) => tx.leaveTypeVersion.count({ where: { leaveTypeId: ids.CL } }))).toBe(2);
      await expect(inA((tx) => tx.leaveTypeVersion.updateMany({ where: { leaveTypeId: ids.CL, validFrom: asDate('2000-01-01') }, data: { paid: false } }))).rejects.toThrow(/YX_VERSION_IN_FORCE/);
      const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'leave.type.changed', entityId: ids.CL }, orderBy: { createdAt: 'desc' } }));
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ validFrom: on(1), to: { paid: false } });
      // Another company sees no versions of A.
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.leaveTypeVersion.count({ where: { leaveTypeId: ids.CL } }))).toBe(0);
    });

    it('a change from today applies at once; only some employment types may take it, refused with the rule named', async () => {
      const contract = await inA((tx) => tx.employmentType.create({ data: { organizationId: org.A.id, name: 'Contract', code: `CON-${run}`.slice(0, 20), category: 'fixed_term' } }));
      await api('hr', 'put', `/time/setup/types/${ids.CL}`).send(body({}, { eligibleEmploymentTypes: [contract.id] })).expect(200);
      expect((await api('hr', 'get', '/time/setup').expect(200)).body.types.find((x: { id: string }) => x.id === ids.CL).rules.eligibleEmploymentTypes).toEqual([contract.id]);
      expect((await api('emp', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.CL, from: d(3), to: d(3) }).expect(200)).body.blocks.join(' ')).toMatch(/Casual leave is not available to Permanent employees/);
      await api('emp', 'post', '/time/me/leave').send({ leaveTypeId: ids.CL, from: d(3), to: d(3), reason: 'Family function' }).expect(400);
      // A second change on the same day is refused: it applies from tomorrow or later.
      expect((await api('hr', 'put', `/time/setup/types/${ids.CL}`).send(body({}, { eligibleEmploymentTypes: null })).expect(409)).body.message).toMatch(/from tomorrow or later/);
    });
  });

  describe('TIM-29 year end: carry, pay out, lapse; once per policy', () => {
    it('previews and posts; a second post is refused; the wrong role and another company get nothing', async () => {
      // 12 days at last year end (cap 5, cash-in 2 a year): 5 carried, 2 paid out, 5 lapse.
      await inA((tx) => tx.leaveLedgerEntry.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, leaveTypeId: ids.EL, entryOn: asDate(`${Y - 1}-06-30`), kind: 'adjustment', days: 12, reason: 'Last year' } }));
      const p = (await api('hr', 'get', `/time/setup/year-end?yearEnd=${lastYearEnd}`).expect(200)).body;
      expect(p.rows.find((r: { employeeId: string }) => r.employeeId === ids.empEmp)).toMatchObject({ balance: 12, carry: 5, encash: 2, lapse: 5, policyId: ids.policy });
      expect(p.posted).toBeNull();
      await api('emp', 'get', `/time/setup/year-end?yearEnd=${lastYearEnd}`).expect(403);
      expect((await api('adminB', 'get', `/time/setup/year-end?yearEnd=${lastYearEnd}`).expect(200)).body.rows).toEqual([]);
      await api('emp', 'post', '/time/setup/year-end').send({ yearEnd: lastYearEnd }).expect(403);
      await api('hr', 'post', '/time/setup/year-end').send({ yearEnd: 'not-a-date' }).expect(400);
      await api('hr', 'post', '/time/setup/year-end').send({ yearEnd: lastYearEnd }).expect(202);
      // The worker's job, run here (safe to run twice: entries are keyed).
      await leave.yearEndPost(org.A.id, lastYearEnd, users.hr);
      await leave.yearEndPost(org.A.id, lastYearEnd, users.hr);
      const ledger = await inA((tx) => tx.leaveLedgerEntry.findMany({ where: { employeeId: ids.empEmp, leaveTypeId: ids.EL, entryOn: asDate(lastYearEnd) }, orderBy: { kind: 'asc' } }));
      expect(ledger.map((x) => [x.kind, Number(x.days)])).toEqual([['encashed', -2], ['lapse', -5]]);
      expect(await inA((tx) => tx.leaveYearRun.count({ where: { yearEnd: asDate(lastYearEnd) } }))).toBe(1);
      const again = await api('hr', 'post', '/time/setup/year-end').send({ yearEnd: lastYearEnd }).expect(409);
      expect(again.body).toMatchObject({ code: 'YEAR_END_POSTED' });
      expect(again.body.message).toMatch(/already posted by hr/);
      expect((await api('hr', 'get', `/time/setup/year-end?yearEnd=${lastYearEnd}`).expect(200)).body.posted).toMatchObject({ policies: 1 });
      // The queued job may also have run (when the worker is up): entries stay once either way.
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.year_end.posted' } }))).toBeGreaterThanOrEqual(2);
      // Another company may post its own year end for the same date.
      await api('adminB', 'post', '/time/setup/year-end').send({ yearEnd: lastYearEnd }).expect(202);
    });
  });

  // ------------------------------------------------------------------------------------------ TIM-29 leave-year change

  describe('TIM-29 Transition: change the leave year of a legal entity', () => {
    it('previews the short year and schedules it once; refuses the same month, bad input, the wrong role, another company', async () => {
      const q = (who: Who, entity: string, month: number | string) => api(who, 'get', `/time/setup/year-change?legalEntityId=${entity}&newStartMonth=${month}`);
      const p = (await q('hr', ids.entityA, 4).expect(200)).body;
      expect(p).toMatchObject({ fromOn: `${Y + 1}-01-01`, shortEnd: `${Y + 1}-03-31`, months: 3, oldStartMonth: 1, newStartMonth: 4, problem: null, scheduled: null });
      expect(p.rows.find((r: { employeeId: string }) => r.employeeId === ids.emp2Emp)).toMatchObject({ type: 'Earned leave', credit: 0 });
      expect((await q('hr', ids.entityA, 1).expect(200)).body.problem).toBe('The leave year already starts in that month.');
      await q('hr', ids.entityA, 13).expect(400);
      await q('hr', 'nope', 4).expect(400);
      await q('emp', ids.entityA, 4).expect(403);
      await q('adminB', ids.entityA, 4).expect(404);
      await api('hr', 'post', '/time/setup/year-change').send({ legalEntityId: ids.entityA, newStartMonth: 1 }).expect(400);
      await api('emp', 'post', '/time/setup/year-change').send({ legalEntityId: ids.entityA, newStartMonth: 4 }).expect(403);
      const s = (await api('hr', 'post', '/time/setup/year-change').send({ legalEntityId: ids.entityA, newStartMonth: 4 }).expect(201)).body;
      expect(s).toMatchObject({ fromOn: `${Y + 1}-01-01`, shortEnd: `${Y + 1}-03-31`, months: 3 });
      const again = await api('hr', 'post', '/time/setup/year-change').send({ legalEntityId: ids.entityA, newStartMonth: 7 }).expect(409);
      expect(again.body).toMatchObject({ code: 'YEAR_CHANGE_SCHEDULED' });
      expect((await q('hr', ids.entityA, 4).expect(200)).body.scheduled).toMatchObject({ fromOn: `${Y + 1}-01-01`, newStartMonth: 4, shortEnd: `${Y + 1}-03-31` });
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.year_change.scheduled', entityId: ids.entityA } }))).toBe(1);
      // The database never lets the app change or remove it.
      await expect(inA((tx) => tx.leaveYearChange.updateMany({ where: { legalEntityId: ids.entityA }, data: { newStartMonth: 7 } }))).rejects.toThrow();
      // Leave of today is still the calendar year.
      expect((await api('emp', 'get', '/time/me/leave').expect(200)).body.year).toMatchObject({ start: `${Y}-01-01`, end: `${Y}-12-31` });
    });
  });

  // ------------------------------------------------------------------------------------------ TIM-07 on duty

  describe('TIM-07 OnDuty: a day on duty away from the office', () => {
    const body = (over: Record<string, unknown> = {}) => ({ on: d(-1), inMinute: 510, outMinute: 1080, place: 'Hosur plant', reason: 'Supplier audit', ...over });
    it('refuses bad input and the window; sends to the manager; another manager or company cannot decide', async () => {
      await api('emp', 'post', '/time/me/on-duty').send(body({ outMinute: 510 })).expect(400);
      expect((await api('emp', 'post', '/time/me/on-duty').send(body({ outMinute: 530 })).expect(400)).body.message).toMatch(/at least 30 minutes/);
      expect((await api('emp', 'post', '/time/me/on-duty').send(body({ on: d(31) })).expect(400)).body.message).toBe('Pick a date in the next 30 days.');
      expect((await api('emp', 'post', '/time/me/on-duty').send(body({ on: d(-61) })).expect(400)).body.message).toMatch(/last 60 days/);
      await api('emp', 'post', '/time/me/on-duty').send(body({ place: 'X' })).expect(400);
      await api('emp', 'post', '/time/me/on-duty').send(body({ inMinute: 1500 })).expect(400);
      await api('emp', 'post', '/time/me/on-duty').send(body({ extra: 1 })).expect(400);
      ids.od = (await api('emp', 'post', '/time/me/on-duty').send(body()).expect(201)).body.id;
      // The same time again overlaps: refused.
      expect((await api('emp', 'post', '/time/me/on-duty').send(body({ inMinute: 900, outMinute: 1000 })).expect(409)).body.message).toMatch(/already asked for on duty .* from 8:30 am to 6:00 pm/);
      ids.odTask = await taskOf(ids.od);
      await decide('mgr2', ids.odTask, 'approve').expect(404);
      await decide('empB', ids.odTask, 'approve').expect(404);
      await decide('emp', ids.odTask, 'approve').expect(404);
      const r = await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: ids.od } }));
      expect(r).toMatchObject({ kind: 'on_duty', place: 'Hosur plant', inMinute: 510, outMinute: 1080, status: 'pending' });
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'attendance.on_duty.submitted', entityId: ids.od } }))).toBe(1);
    });

    it('send back for changes, then sent again; approved counts as present and shows on the day card', async () => {
      expect((await decide('mgr', ids.odTask, 'send_back').expect(400)).body.message).toBe('Say what to change, so the person who asked knows.');
      expect((await decide('mgr', ids.odTask, 'send_back', 'Add the plant gate time').expect(200)).body.status).toBe('sent_back');
      await decide('mgr', ids.odTask, 'approve').expect(409);
      const mine = (await api('emp', 'get', `/time/me/attendance?month=${d(-1).slice(0, 7)}`).expect(200)).body;
      expect(mine.requests.find((x: { id: string }) => x.id === ids.od)).toMatchObject({ status: 'sent_back', kind: 'on_duty', place: 'Hosur plant', sentBack: 'Add the plant gate time' });
      // Only the employee, only once.
      await api('emp2', 'post', '/time/me/on-duty').send(body({ resendOf: ids.od })).expect(404);
      ids.od2 = (await api('emp', 'post', '/time/me/on-duty').send(body({ inMinute: 480, resendOf: ids.od })).expect(201)).body.id;
      expect((await api('emp', 'post', '/time/me/on-duty').send(body({ inMinute: 480, resendOf: ids.od })).expect(409)).body.message).toBe('You already sent this request again.');
      expect((await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: ids.od } }))).status).toBe('resent');
      await decide('mgr', await taskOf(ids.od2), 'approve').expect(200);
      const day = await inA((tx) => tx.attendanceDay.findFirstOrThrow({ where: { employeeId: ids.empEmp, workOn: asDate(d(-1)) } }));
      expect(day.status).toBe('present');
      for (const who of ['emp', 'mgr', 'hr'] as const) {
        const card = (await api(who, 'get', `/time/people/${ids.empEmp}/days/${d(-1)}`).expect(200)).body;
        expect(card.onDuty).toMatchObject({ place: 'Hosur plant', inMinute: 480, outMinute: 1080, status: 'approved' });
        expect(card.day.status).toBe('present');
      }
      for (const who of ['emp2', 'mgr2', 'empB'] as const) await api(who, 'get', `/time/people/${ids.empEmp}/days/${d(-1)}`).expect(404);
    });

    it('withdraw: a pending one and one sent back; never someone else’s', async () => {
      const a = (await api('emp', 'post', '/time/me/on-duty').send(body({ on: d(2) })).expect(201)).body.id;
      await api('emp2', 'post', `/time/me/regularise/${a}/withdraw`).expect(404);
      expect((await api('emp', 'post', `/time/me/regularise/${a}/withdraw`).expect(200)).body.status).toBe('withdrawn');
      await api('emp', 'post', `/time/me/regularise/${a}/withdraw`).expect(409);
      const b = (await api('emp', 'post', '/time/me/on-duty').send(body({ on: d(3) })).expect(201)).body.id;
      await decide('mgr', await taskOf(b), 'send_back', 'Wrong day?').expect(200);
      expect((await api('emp', 'post', `/time/me/regularise/${b}/withdraw`).expect(200)).body.status).toBe('withdrawn');
    });

    it('the company can turn send back off for on duty', async () => {
      await api('adminA', 'put', '/org/settings').send({ key: 'attendance.on_duty.send_back', value: 'off', scopeType: 'tenant' }).expect(200);
      const c = (await api('emp', 'post', '/time/me/on-duty').send(body({ on: d(4) })).expect(201)).body.id;
      await decide('mgr', await taskOf(c), 'send_back', 'Change it').expect(400);
      await decide('mgr', await taskOf(c), 'reject', 'Not needed').expect(200);
      expect((await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: c } }))).status).toBe('rejected');
    });
  });
});
