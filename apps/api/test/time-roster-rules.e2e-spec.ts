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
import { LicenceJobs } from '../src/time/licence-jobs';
import { addDays } from '../src/time/time-maths';
import { mondayOf } from '../src/time/time-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Rosters (feature sheet rules 1, 2, 4, 5, 6, 7, 8 in docs/yukthix/time-design-map.md), end to end against the real database
// (forced RLS, the app role): the staff team roster setting (TIM-05 Staff), publishing with the notice reason, rest / hours /
// weekly-off guards on publish and on swaps (TIM-08 RestBlocked), and licence requirements with expiry, overrides, renew asks
// and reminders (TIM-40); two companies kept apart.
describe('Time rosters: rules, staff view and licences', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let jobs: LicenceJobs;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'boss' | 'mgr' | 'emp' | 'peer' | 'other' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  // A whole week starting at least 8 days ahead, so nothing in it is inside the notice.
  const W = addDays(mondayOf(d(8)), 0);
  const w = (n: number) => addDays(W, n);
  const times = (start: number, end: number, breakMinutes = 30) => ({ validFrom: today, start, end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes, breakAboveMinutes: 300 });
  const email = { send: jest.fn(async (_m: { to: string; subject: string }) => ({ success: true })) };
  const setSetting = (key: string, value: string) => inA(async (tx) => {
    await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
    await tx.setting.create({ data: { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id, value } });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    jobs = moduleRef.get(LicenceJobs);

    planId = (await prisma.plan.create({ data: { name: `rr-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `RR Org ${k}`, slug: `rr-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const people: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['boss', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of people) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@rr-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@rr-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `RR Foods ${k}`, shortName: `RRF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`driver${k}`] = (await tx.designation.create({ data: { ...o, name: 'Forklift driver', code: 'FD' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // 09:30–18:30, Sunday off.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: 7 }] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', designation = ids[`desig${k}`]) =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-60), userId: users[who], workEmail: `${who}@rr-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: designation, employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.bossEmp = await hire('adminA', 'boss', null);
    ids.mgrEmp = await hire('adminA', 'mgr', ids.bossEmp);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp, 'A', ids.driverA);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.otherEmp = await hire('adminA', 'other', ids.bossEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', ids.bossEmp);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
    // Men: the night-work guard (covered elsewhere) stays out of these rules.
    await inA(async (tx) => {
      for (const e of ['empEmp', 'peerEmp', 'otherEmp']) await tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org.A.id, employeeId: ids[e] } }, update: { gender: 'male' }, create: { organizationId: org.A.id, employeeId: ids[e], gender: 'male' } });
    });
    ids.M = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'M', name: 'Morning', colour: 'orange', night: false, ...times(360, 840) }).expect(201)).body.id;
    ids.N = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'N', name: 'Night', colour: 'purple', night: true, ...times(1320, 360) }).expect(201)).body.id;
    ids.L = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'L', name: 'Long day', colour: 'red', night: false, ...times(480, 1260, 60) }).expect(201)).body.id;
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

  it('the licence tables have forced RLS and the tenant policy; overrides are append-only for the app', async () => {
    const tables = ['licence_types', 'employee_licences', 'shift_licence_requirements', 'licence_reminders', 'licence_overrides'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
    await expect(prisma.$executeRaw`DELETE FROM licence_overrides`).rejects.toThrow();
  });

  describe('TIM-05 Staff: the team roster setting (founder decision 29 Oct 2026)', () => {
    it('off by default: an employee sees only their own published week', async () => {
      const body = (await api('emp', 'get', `/time/roster/team?week=${W}`).expect(200)).body;
      expect(body.team).toBe(false);
      expect(body.people.map((p: { id: string }) => p.id)).toEqual([ids.empEmp]);
      expect(body.people[0].me).toBe(true);
      await api('emp', 'get', '/time/roster/team?week=nope').expect(400);
    });

    it('on: the team (same manager), read-only and published only; a colleague on leave is "Away"; others are not shown', async () => {
      await setSetting('roster.staff_see_team', 'on');
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: w(1), value: ids.M }] }).expect(200);
      await inA(async (tx) => {
        const type = await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'CL', name: 'Casual leave', kind: 'casual', paid: true, colour: 'blue' } as never });
        const req = await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: ids.peerEmp, leaveTypeId: type.id, fromOn: new Date(`${w(2)}T00:00:00Z`), toOn: new Date(`${w(2)}T00:00:00Z`), days: 1, status: 'approved', reason: 'Family' } as never });
        await tx.leaveRequestDay.create({ data: { organizationId: org.A.id, requestId: req.id, employeeId: ids.peerEmp, leaveOn: new Date(`${w(2)}T00:00:00Z`), part: 'full', portion: 1, countedAs: 'leave', active: true } as never });
      });
      const body = (await api('emp', 'get', `/time/roster/team?week=${W}`).expect(200)).body;
      expect(body.team).toBe(true);
      const ppl = body.people.map((p: { id: string }) => p.id);
      expect(ppl[0]).toBe(ids.empEmp);
      expect(ppl).toContain(ids.peerEmp);
      expect(ppl).not.toContain(ids.otherEmp);
      expect(ppl).not.toContain(ids.mgrEmp);
      const peer = body.people.find((p: { id: string }) => p.id === ids.peerEmp);
      // The draft is not visible to staff.
      expect(peer.cells.find((c: { on: string }) => c.on === w(1)).shift?.shiftId ?? null).not.toBe(ids.M);
      const leaveCell = peer.cells.find((c: { on: string }) => c.on === w(2));
      expect(leaveCell.leave).toBe('away');
      // Company B's person sees only company B.
      const b = (await api('empB', 'get', `/time/roster/team?week=${W}`).expect(200)).body;
      expect(b.people.map((p: { id: string }) => p.id)).toEqual([ids.empBEmp]);
      await setSetting('roster.staff_see_team', 'off');
    });
  });

  describe('rules 1, 2, 4: publishing never adds a break', () => {
    it('hours a day (HOURS_GUARD) and rest (REST_GUARD) stop the publish; nothing is published', async () => {
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: w(1), value: 'pattern' }, { employeeId: ids.empEmp, on: w(1), value: ids.L }] }).expect(200);
      const r = (await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(409)).body;
      expect(r.code).toBe('HOURS_GUARD');
      expect(await inA((tx) => tx.rosterEntry.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp, published: true } }))).toBe(0);
      // The week view shows the break before publishing.
      const cell = (await api('mgr', 'get', `/time/roster?week=${W}`).expect(200)).body.people.find((p: { id: string }) => p.id === ids.empEmp).cells.find((c: { on: string }) => c.on === w(1));
      expect(cell.conflicts.map((c: { kind: string }) => c.kind)).toEqual(expect.arrayContaining(['hours', 'spread']));
      // Night on Tue, morning on Wed: 8 h rest.
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(1), value: ids.N }, { employeeId: ids.empEmp, on: w(2), value: ids.M }] }).expect(200);
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(409)).body.code).toBe('REST_GUARD');
    });

    it('a weekly off cannot be planned away (WEEKLY_OFF_GUARD); fixed, the week publishes and the audit keeps before → after', async () => {
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(1), value: ids.M }, { employeeId: ids.empEmp, on: w(2), value: 'pattern' }, { employeeId: ids.empEmp, on: w(6), value: ids.M }] }).expect(200);
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(409)).body.code).toBe('WEEKLY_OFF_GUARD');
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(6), value: 'pattern' }] }).expect(200);
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(200)).body.published).toBeGreaterThan(0);
      const a = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'time.roster.published' }, orderBy: { createdAt: 'desc' } }));
      expect(a?.metadataJson).toContain(w(1));
      // The employee never plans their own row; another company never reaches this one.
      await api('emp', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(3), value: ids.M }] }).expect(403);
      await api('adminB', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(3), value: ids.M }] }).expect(404);
    });
  });

  describe('rule 5: a published day changes inside the notice only with a reason', () => {
    it('no reason → 400 NOTICE_REASON (nothing published); a short reason → 400; with a reason it is kept on the day', async () => {
      // Sunday is the location's weekly off: rostering it would trip the weekly-off guard (409), so a Sunday tomorrow
      // (CI at 01:15 IST on a Saturday) moves the test to Monday, still inside the 72 h notice.
      const soon = new Date(`${d(1)}T00:00:00Z`).getUTCDay() === 0 ? d(2) : d(1);
      // Tomorrow is inside the 24 h notice for a morning shift; publish tomorrow first with the default (0 h) notice.
      await setSetting('roster.change_notice_hours', '0');
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: soon, value: ids.M }] }).expect(200);
      await api('mgr', 'post', '/time/roster/publish').send({ week: soon }).expect(200);
      await setSetting('roster.change_notice_hours', '72');
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: soon, value: 'off' }] }).expect(200);
      expect((await api('mgr', 'post', '/time/roster/publish').send({ week: soon }).expect(400)).body.code).toBe('NOTICE_REASON');
      await api('mgr', 'post', '/time/roster/publish').send({ week: soon, reason: 'x' }).expect(400);
      expect(await inA((tx) => tx.rosterEntry.findFirst({ where: { organizationId: org.A.id, employeeId: ids.peerEmp, workOn: new Date(`${soon}T00:00:00Z`) } }))).toMatchObject({ isOff: false, draft: 'off' });
      await api('mgr', 'post', '/time/roster/publish').send({ week: soon, reason: 'Machine breakdown on line 2' }).expect(200);
      expect(await inA((tx) => tx.rosterEntry.findFirst({ where: { organizationId: org.A.id, employeeId: ids.peerEmp, workOn: new Date(`${soon}T00:00:00Z`) } }))).toMatchObject({ isOff: true, published: true, changeReason: 'Machine breakdown on line 2' });
      await setSetting('roster.change_notice_hours', '24');
    });
  });

  describe('TIM-08: a swap that breaks the rest rule is refused when asked (RestBlocked)', () => {
    it('night before, then the colleague morning → 409 REST_GUARD; nothing is created', async () => {
      const day = w(4);
      // emp works Night on Thursday (published), peer Morning on Friday; emp asks to take peer's Friday morning.
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: w(2), value: 'off' }, { employeeId: ids.empEmp, on: w(3), value: ids.N }, { employeeId: ids.peerEmp, on: day, value: ids.M }, { employeeId: ids.empEmp, on: day, value: 'off' }] }).expect(200);
      await api('mgr', 'post', '/time/roster/publish').send({ week: W }).expect(200);
      const r = (await api('emp', 'post', '/time/me/swaps').send({ on: day, colleagueEmployeeId: ids.peerEmp, reason: 'Wedding in the family' }).expect(409)).body;
      expect(r.code).toBe('REST_GUARD');
      expect(r.message).toMatch(/rest/);
      expect(await inA((tx) => tx.shiftSwapRequest.count({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }))).toBe(0);
    });
  });

  // Founder 2 Nov 2026 (PAY-35): an on-call rule that says "count call-out hours towards the weekly limit" makes the
  // roster's weekly-hours check count the person's call-outs; a rule that says no leaves them out.
  describe('rule 2 with call-outs (PAY-35 count towards weekly hours)', () => {
    const off = addDays(W, 14); // a week with the slot under a rule that does not count
    const on = addDays(W, 21); // a week with the slot under a rule that counts
    const weekConflict = async (week: string) =>
      ((await api('boss', 'get', `/time/roster?week=${week}`).expect(200)).body.people.find((p: { id: string }) => p.id === ids.otherEmp).cells as { conflicts?: { kind: string; message: string }[] }[]).flatMap((c) => c.conflicts ?? []).find((c) => c.kind === 'week');

    it('set-up: two on-call rules (counts / does not) and a 6 h call-out on the Monday of each week', async () => {
      await inA(async (tx) => {
        // Payroll records on-call (PAY-35); the pay guard is opened for the entity as the payroll API does.
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
        const o = { organizationId: org.A.id, legalEntityId: ids.entityA, standbyAmount: 500, calloutMinHours: 2, calloutRate: 300, multiplier: 1.5, createdBy: users.hrAdmin };
        const no = await tx.oncallRule.create({ data: { ...o, name: `Not counted ${run}`, countTowardsWeekly: false } });
        const yes = await tx.oncallRule.create({ data: { ...o, name: `Counted ${run}`, countTowardsWeekly: true } });
        const m = await tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.otherEmp } });
        const slot = { organizationId: org.A.id, legalEntityId: ids.entityA, employeeId: ids.otherEmp, employmentId: m.id, calloutHours: 6, createdBy: users.hrAdmin };
        await tx.oncallSlot.create({ data: { ...slot, ruleId: no.id, slotDate: new Date(`${off}T00:00:00Z`) } });
        await tx.oncallSlot.create({ data: { ...slot, ruleId: yes.id, slotDate: new Date(`${on}T00:00:00Z`) } });
      });
    });

    // The location's pattern alone is 51 h a week here, so the limit is set to 54 h for these weeks (back to 48 h after).
    it('the week view: counted call-outs add to the week and say so; uncounted ones add nothing', async () => {
      await setSetting('roster.max_weekly_hours', '54');
      expect(await weekConflict(off)).toBeUndefined(); // 51 h, the call-out not counted
      expect((await weekConflict(on))?.message).toMatch(/^57 h of work in the week of .* by this day, 6 h of call-outs included \(at most 54 h\)$/);
    });

    it('a change that takes the week over with counted call-outs is refused (HOURS_GUARD); with uncounted ones it publishes', async () => {
      // Monday off first (43 h, or 49 h with the counted call-out: both within 54 h), published.
      for (const week of [off, on]) {
        await api('boss', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.otherEmp, on: week, value: 'off' }] }).expect(200);
        await api('boss', 'post', '/time/roster/publish').send({ week }).expect(200);
      }
      // Monday back to the pattern: 57 h with the counted call-out is refused and nothing is published (the publish judges
      // the following week too, so this week goes first and is then set back).
      await api('boss', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.otherEmp, on, value: 'pattern' }] }).expect(200);
      const refused = (await api('boss', 'post', '/time/roster/publish').send({ week: on }).expect(409)).body;
      expect(refused.code).toBe('HOURS_GUARD');
      expect(refused.message).toMatch(/57 h of work .* 6 h of call-outs included \(at most 54 h\)/);
      expect(await inA((tx) => tx.rosterEntry.findFirst({ where: { organizationId: org.A.id, employeeId: ids.otherEmp, workOn: new Date(`${on}T00:00:00Z`) } }))).toMatchObject({ isOff: true, draft: 'pattern' });
      await api('boss', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.otherEmp, on, value: 'off' }] }).expect(200);
      // The same change where the call-out is not counted: 51 h, published.
      await api('boss', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.otherEmp, on: off, value: 'pattern' }] }).expect(200);
      await api('boss', 'post', '/time/roster/publish').send({ week: off }).expect(200);
      await setSetting('roster.max_weekly_hours', '48');
    });
  });

  describe('TIM-40 licences (rule 8)', () => {
    it('only company-wide set-up manages licences; bad input 400; another company 404', async () => {
      await api('mgr', 'get', '/time/licences').expect(403);
      await api('emp', 'post', '/time/licences/types').send({ code: 'FORK', name: 'Forklift licence', legal: true, remindDays: [60, 30, 7] }).expect(403);
      await api('hrAdmin', 'post', '/time/licences/types').send({ code: 'fork', name: 'Forklift licence', legal: true, remindDays: [60, 30, 7] }).expect(400);
      await api('hrAdmin', 'post', '/time/licences/types').send({ code: 'FORK', name: 'Forklift licence', legal: true, remindDays: [0] }).expect(400);
      await api('hrAdmin', 'post', '/time/licences/types').send({ code: 'FORK', name: 'Forklift licence', legal: true, remindDays: [30, 30] }).expect(400);
      ids.fork = (await api('hrAdmin', 'post', '/time/licences/types').send({ code: 'FORK', name: 'Forklift licence', note: 'LMV endorsement', legal: true, remindDays: [60, 30, 7] }).expect(201)).body.id;
      await api('hrAdmin', 'post', '/time/licences/types').send({ code: 'FORK', name: 'Again', legal: true, remindDays: [7] }).expect(409);
      ids.aid = (await api('hrAdmin', 'post', '/time/licences/types').send({ code: 'AID', name: 'First aid', legal: false, remindDays: [30] }).expect(201)).body.id;
      await api('adminB', 'post', '/time/licences/requirements').send({ licenceTypeId: ids.fork, kind: 'role', targetId: ids.driverA }).expect(404);
      await api('hrAdmin', 'post', '/time/licences/requirements').send({ licenceTypeId: ids.fork, kind: 'role', targetId: ids.driverA }).expect(201);
      await api('hrAdmin', 'post', '/time/licences/requirements').send({ licenceTypeId: ids.fork, kind: 'role', targetId: ids.driverA }).expect(409);
      await api('hrAdmin', 'post', '/time/licences/requirements').send({ licenceTypeId: ids.aid, kind: 'shift', targetId: ids.N, locationId: ids.locA }).expect(201);
      // Optimistic concurrency on edits.
      const t = (await api('hrAdmin', 'get', '/time/licences').expect(200)).body.types.find((x: { id: string }) => x.id === ids.fork);
      await api('hrAdmin', 'put', `/time/licences/types/${ids.fork}`).send({ name: 'Forklift licence', legal: true, active: true, remindDays: [45, 15], version: t.version }).expect(200);
      await api('hrAdmin', 'put', `/time/licences/types/${ids.fork}`).send({ name: 'Forklift', legal: true, active: true, remindDays: [45], version: t.version }).expect(409);
    });

    it('no valid licence: the draft is refused (LICENCE_GUARD), the expiry day counts, a renewal lets it through', async () => {
      const day = w(7 + 2); // the next week's Wednesday
      const r = (await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: day, value: ids.M }] }).expect(409)).body;
      expect(r.code).toBe('LICENCE_GUARD');
      await api('hrAdmin', 'post', '/time/licences/holders').send({ employeeId: ids.empEmp, licenceTypeId: ids.fork, validFrom: d(-400), expiresOn: day, number: 'TN-FL-1' }).expect(201);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: day, value: ids.M }] }).expect(200);
      expect((await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: addDays(day, 1), value: ids.M }] }).expect(409)).body.code).toBe('LICENCE_GUARD');
      await api('hrAdmin', 'post', '/time/licences/holders').send({ employeeId: ids.empEmp, licenceTypeId: ids.fork, validFrom: d(-400), expiresOn: day }).expect(409);
      await api('hrAdmin', 'post', '/time/licences/holders').send({ employeeId: ids.empEmp, licenceTypeId: ids.fork, validFrom: day, expiresOn: d(-1) }).expect(400);
      await api('hrAdmin', 'post', '/time/licences/holders').send({ employeeId: ids.empBEmp, licenceTypeId: ids.fork, validFrom: today }).expect(404);
      await api('hrAdmin', 'post', '/time/licences/holders').send({ employeeId: ids.empEmp, licenceTypeId: ids.fork, validFrom: addDays(day, 1), expiresOn: d(800) }).expect(201);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: addDays(day, 1), value: ids.M }] }).expect(200);
      // The week view flags a licence break on a day that is already drafted when the licence goes.
      const lic = (await api('hrAdmin', 'get', '/time/licences').expect(200)).body.types.find((x: { id: string }) => x.id === ids.fork);
      expect(lic.holders).toBe(1);
      expect(lic.requirements[0]).toMatchObject({ kind: 'role', target: 'Forklift driver' });
    });

    it('a legal licence has no override; a company one may be overridden with a reason, up to 90 days', async () => {
      expect((await api('hrAdmin', 'post', '/time/licences/overrides').send({ employeeId: ids.peerEmp, licenceTypeId: ids.fork, reason: 'Course booked', until: d(5) }).expect(409)).body.code).toBe('LEGAL_LICENCE');
      await api('hrAdmin', 'post', '/time/licences/overrides').send({ employeeId: ids.peerEmp, licenceTypeId: ids.aid, reason: 'x', until: d(5) }).expect(400);
      await api('hrAdmin', 'post', '/time/licences/overrides').send({ employeeId: ids.peerEmp, licenceTypeId: ids.aid, reason: 'Course booked', until: d(200) }).expect(400);
      await api('mgr', 'post', '/time/licences/overrides').send({ employeeId: ids.peerEmp, licenceTypeId: ids.aid, reason: 'Course booked', until: d(5) }).expect(403);
      const night = d(3);
      expect((await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: night, value: ids.N }] }).expect(409)).body.code).toBe('LICENCE_GUARD');
      await api('hrAdmin', 'post', '/time/licences/overrides').send({ employeeId: ids.peerEmp, licenceTypeId: ids.aid, reason: 'Renewal course booked for next week', until: d(5) }).expect(201);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: night, value: ids.N }] }).expect(200);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: night, value: 'pattern' }] }).expect(200);
    });

    it('ask to renew: once a day per person; reminders before expiry are sent once (safe to re-run)', async () => {
      const first = (await api('hrAdmin', 'post', '/time/licences/renew-asks').send({ employeeIds: [ids.empEmp, ids.empEmp], licenceTypeId: ids.fork }).expect(200)).body;
      expect(first).toEqual({ asked: 1, alreadyAskedToday: 0 });
      expect((await api('hrAdmin', 'post', '/time/licences/renew-asks').send({ employeeIds: [ids.empEmp], licenceTypeId: ids.fork }).expect(200)).body).toEqual({ asked: 0, alreadyAskedToday: 1 });
      await api('hrAdmin', 'post', '/time/licences/renew-asks').send({ employeeIds: [ids.empBEmp], licenceTypeId: ids.fork }).expect(404);
      // peer's first aid expires in 10 days: inside the 30-day lead.
      await api('hrAdmin', 'post', '/time/licences/holders').send({ employeeId: ids.peerEmp, licenceTypeId: ids.aid, validFrom: d(-300), expiresOn: d(10) }).expect(201);
      expect(await jobs.run(today, [org.A.id])).toBeGreaterThanOrEqual(1);
      expect(await jobs.run(today, [org.A.id])).toBe(0);
      expect(await inA((tx) => tx.licenceReminder.count({ where: { organizationId: org.A.id } }))).toBeGreaterThanOrEqual(1);
      const watch = (await api('hrAdmin', 'get', '/time/licences').expect(200)).body.types.find((x: { id: string }) => x.id === ids.aid).watch;
      expect(watch.map((x: { employeeId: string }) => x.employeeId)).toContain(ids.peerEmp);
    });
  });
});
