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
import { mondayOf } from '../src/time/time-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-34 Auto-roster end to end against the real database (forced RLS, the app role): demand set / read, generate fills
// only empty days as drafts and meets the demand in the fair order, never over a draft or a published day, skips leave,
// rest, weekly off, licence and night work with the reason, explains unfilled slots, one run per location week (409),
// a safe re-run, publish afterwards; the wrong role, another company, out of scope, bad input, acting for someone.
describe('TIM-34 auto-roster', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'boss' | 'mgr' | 'emp' | 'peer' | 'mate' | 'other' | 'empB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  // Next week, Monday to Sunday: every day is still to come.
  const W = addDays(mondayOf(today), 7);
  const day = (k: number) => addDays(W, k);
  const times = (start: number, end: number) => ({ validFrom: today, start, end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300 });
  const asD = (on: string) => new Date(`${on}T00:00:00Z`);
  const entry = (employee: string, on: string) => inA((tx) => tx.rosterEntry.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: employee, workOn: asD(on) } } }));
  const generate = (who: Who, body: Record<string, unknown> = {}) => api(who, 'post', '/time/auto-roster/generate').send({ locationId: ids.locA, week: W, ...body });
  const demand = (who: Who, rows: unknown[], locationId = ids.locA) => api(who, 'put', '/time/auto-roster/demand').send({ locationId, rows });
  type SlotOut = { on: string; code: string; need: number; had: number; got: number; placed: { employeeId: string }[]; skipped: { employeeId: string; kind: string; why: string }[]; reasons: { kind: string; count: number }[] };
  const slotOf = (r: { slots: SlotOut[] }, k: number, code: string) => r.slots.find((s) => s.on === day(k) && s.code === code)!;
  const skip = (s: SlotOut, e: string) => s.skipped.find((x) => x.employeeId === e);

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

    planId = (await prisma.plan.create({ data: { name: `autor-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `AutoR Org ${k}`, slug: `autor-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const people: [Exclude<Who, 'acting'>, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['boss', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['mate', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of people) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@autor-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@autor-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `AutoR Foods ${k}`, shortName: `ARF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // General 9:30 am – 6 pm on weekdays (8 h worked); Saturday and Sunday are weekly offs.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1080, weeklyOffs: [{ weekday: 6 }, { weekday: 7 }] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(today, -60), userId: users[who], workEmail: `${who}@autor-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.bossEmp = await hire('adminA', 'boss', null);
    ids.mgrEmp = await hire('adminA', 'mgr', ids.bossEmp);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.mateEmp = await hire('adminA', 'mate', ids.mgrEmp);
    ids.otherEmp = await hire('adminA', 'other', ids.bossEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', ids.bossEmp);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
    // Company A: at least two days off a week (so a weekend shift breaks the weekly-off rule).
    await api('adminA', 'put', '/org/settings').send({ key: 'roster.min_weekly_offs', scopeType: 'tenant', value: '2' }).expect(200);
    ids.M = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'M', name: 'Morning', colour: 'orange', night: false, ...times(360, 840) }).expect(201)).body.id;
    ids.F = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'F', name: 'Forklift', colour: 'teal', night: false, ...times(600, 1080) }).expect(201)).body.id;
    ids.N = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'N', name: 'Night', colour: 'purple', night: true, ...times(1320, 360) }).expect(201)).body.id;
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.forklift = (await tx.licenceType.create({ data: { ...o, code: `FL${run}`.slice(0, 20), name: 'Forklift', legal: true } })).id;
      await tx.shiftLicenceRequirement.create({ data: { ...o, shiftId: ids.F, licenceTypeId: ids.forklift } });
      // emp's forklift licence expired yesterday; emp is recorded female with no night-work consent.
      await tx.employeeLicence.create({ data: { ...o, employeeId: ids.empEmp, licenceTypeId: ids.forklift, validFrom: asD(addDays(today, -400)), expiresOn: asD(addDays(today, -1)) } });
      await tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org.A.id, employeeId: ids.empEmp } }, update: { gender: 'female' }, create: { ...o, employeeId: ids.empEmp, gender: 'female' } });
      // peer is on approved leave on Monday.
      const t = await tx.leaveType.create({ data: { ...o, code: 'CL', name: 'Casual', kind: 'casual' } });
      const lr = await tx.leaveRequest.create({ data: { ...o, employeeId: ids.peerEmp, leaveTypeId: t.id, fromOn: asD(day(0)), toOn: asD(day(0)), days: 1, status: 'approved' } });
      await tx.leaveRequestDay.create({ data: { ...o, requestId: lr.id, employeeId: ids.peerEmp, leaveOn: asD(day(0)), part: 'full', portion: 1, countedAs: 'leave' } });
      // Already chosen: emp's Tuesday is a draft day off, mate's Tuesday a published morning, peer's Wednesday a published night.
      await tx.rosterEntry.create({ data: { ...o, employeeId: ids.empEmp, workOn: asD(day(1)), draft: 'off' } });
      await tx.rosterEntry.create({ data: { ...o, employeeId: ids.mateEmp, workOn: asD(day(1)), shiftId: ids.M, published: true } });
      await tx.rosterEntry.create({ data: { ...o, employeeId: ids.peerEmp, workOn: asD(day(2)), shiftId: ids.N, published: true } });
    });
    token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.mgr}`).expect(200)).body.accessToken;
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

  it('both tables have forced RLS with the tenant policy', async () => {
    const tables = ['roster_demands', 'auto_roster_runs'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
  });

  describe('demand', () => {
    it('only a planner reads it; not set up at first; another company and unplanned locations are not found', async () => {
      await api('emp', 'get', '/time/auto-roster').expect(403);
      await api('hrExec', 'get', '/time/auto-roster').expect(403);
      await api('adminB', 'get', `/time/auto-roster?locationId=${ids.locA}`).expect(404);
      await api('mgr', 'get', `/time/auto-roster?locationId=${randomUUID()}`).expect(404);
      await api('mgr', 'get', '/time/auto-roster?week=soon').expect(400);
      const o = (await api('mgr', 'get', `/time/auto-roster?week=${W}`).expect(200)).body;
      expect(o).toMatchObject({ week: W, location: { id: ids.locA, name: 'Hosur' }, demand: [], run: null, people: { count: 3, used: 3 }, maxPeople: 200 });
      expect(o.shifts.map((s: { code: string }) => s.code)).toEqual(['M', 'F', 'N']);
      // The manager never plans their own row or someone else's team.
      expect(o.draft.map((p: { id: string }) => p.id).sort()).toEqual([ids.empEmp, ids.peerEmp, ids.mateEmp].sort());
      expect(o.draft.find((p: { id: string }) => p.id === ids.mateEmp).days[1]).toBe('M');
      expect(o.draft.find((p: { id: string }) => p.id === ids.empEmp).days[1]).toBe('OFF');
    });

    it('generate before any demand says to set it first', async () => {
      expect((await generate('mgr').expect(409)).body.code).toBe('NO_DEMAND');
    });

    it('bad input, the wrong role, another company and acting for someone are refused', async () => {
      await demand('mgr', [{ shiftId: ids.M, weekday: 8, need: 1 }]).expect(400);
      await demand('mgr', [{ shiftId: ids.M, weekday: 0, need: 1 }]).expect(400);
      await demand('mgr', [{ shiftId: ids.M, weekday: 1, need: 501 }]).expect(400);
      await demand('mgr', [{ shiftId: ids.M, weekday: 1, need: -1 }]).expect(400);
      await demand('mgr', [{ shiftId: ids.M, weekday: 1, need: 1.5 }]).expect(400);
      await demand('mgr', [{ shiftId: 'morning', weekday: 1, need: 1 }]).expect(400);
      await api('mgr', 'put', '/time/auto-roster/demand').send({ locationId: 'hosur', rows: [] }).expect(400);
      expect((await demand('mgr', [{ shiftId: ids.M, weekday: 1, need: 1 }, { shiftId: ids.M, weekday: 1, need: 2 }]).expect(400)).body.message).toMatch(/once/);
      expect((await demand('mgr', [{ shiftId: randomUUID(), weekday: 1, need: 1 }]).expect(400)).body.message).toMatch(/shift in use/);
      await demand('emp', [{ shiftId: ids.M, weekday: 1, need: 1 }]).expect(404);
      await demand('hrExec', [{ shiftId: ids.M, weekday: 1, need: 1 }]).expect(404);
      await demand('adminB', [{ shiftId: ids.M, weekday: 1, need: 1 }]).expect(404);
      await demand('acting', [{ shiftId: ids.M, weekday: 1, need: 1 }]).expect(403);
    });

    it('a planner sets it (need 0 removes a cell), read back and audited before → after', async () => {
      const rows = [
        { shiftId: ids.M, weekday: 1, need: 3 },
        { shiftId: ids.M, weekday: 2, need: 2 },
        { shiftId: ids.F, weekday: 3, need: 1 },
        { shiftId: ids.M, weekday: 4, need: 3 },
        { shiftId: ids.N, weekday: 6, need: 1 },
        { shiftId: ids.M, weekday: 7, need: 4 },
      ];
      expect((await demand('mgr', rows).expect(200)).body).toEqual({ changed: 6 });
      expect((await demand('mgr', [{ shiftId: ids.M, weekday: 7, need: 0 }, { shiftId: ids.M, weekday: 1, need: 3 }]).expect(200)).body).toEqual({ changed: 1 });
      const o = (await api('mgr', 'get', `/time/auto-roster?locationId=${ids.locA}&week=${W}`).expect(200)).body;
      expect(o.demand).toHaveLength(5);
      expect(o.demand).toEqual(expect.arrayContaining([{ shiftId: ids.M, weekday: 1, need: 3 }, { shiftId: ids.N, weekday: 6, need: 1 }]));
      const audits = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'time.auto_roster.demand_set' }, orderBy: { createdAt: 'asc' } }));
      expect(audits).toHaveLength(2);
      expect(JSON.parse(audits[1].metadataJson ?? '{}').changes).toEqual([{ shiftId: ids.M, weekday: 7, before: 4, after: 0 }]);
    });
  });

  describe('generate', () => {
    it('bad input and the wrong people are refused', async () => {
      await generate('mgr', { week: 'soon' }).expect(400);
      await generate('mgr', { locationId: 'hosur' }).expect(400);
      expect((await generate('mgr', { week: addDays(mondayOf(today), -14) }).expect(400)).body.message).toMatch(/passed/);
      expect((await generate('mgr', { week: addDays(today, 140) }).expect(400)).body.message).toMatch(/120 days/);
      await generate('emp').expect(404);
      await generate('hrExec').expect(404);
      await generate('adminB').expect(404);
      await generate('acting').expect(403);
      await generate('mgr', { locationId: randomUUID() }).expect(404);
    });

    it('fills only empty days as drafts, in the fair order, meeting the demand and explaining what stays short', async () => {
      const res = (await generate('mgr').expect(200)).body;
      expect(res.status).toBe('done');
      const r = res.result;
      expect(r).toMatchObject({ week: W, people: 3, capped: null, placed: 5, coverage: { required: 10, filled: 6, unfilled: 4, shortSlots: 4 } });
      // Monday: emp and mate placed; peer is on leave.
      const mon = slotOf(r, 0, 'M');
      expect(mon.placed.map((p) => p.employeeId).sort()).toEqual([ids.empEmp, ids.mateEmp].sort());
      expect(skip(mon, ids.peerEmp)).toMatchObject({ kind: 'leave' });
      // Tuesday: mate's published morning counts; emp's draft day off and mate's published day are never touched; peer fills.
      expect(slotOf(r, 1, 'M')).toMatchObject({ need: 2, had: 1, got: 2, skipped: [] });
      expect(slotOf(r, 1, 'M').placed.map((p) => p.employeeId)).toEqual([ids.peerEmp]);
      // Wednesday forklift: no valid licence (emp's expired), and peer's published night.
      const wed = slotOf(r, 2, 'F');
      expect(wed.got).toBe(0);
      expect(skip(wed, ids.empEmp)).toMatchObject({ kind: 'licence' });
      expect(skip(wed, ids.empEmp)!.why).toMatch(/Forklift/);
      expect(skip(wed, ids.mateEmp)).toMatchObject({ kind: 'licence' });
      expect(skip(wed, ids.peerEmp)).toMatchObject({ kind: 'planned' });
      expect(wed.reasons).toEqual([{ kind: 'licence', label: 'No valid licence', count: 2 }, { kind: 'planned', label: 'Already planned that day', count: 1 }]);
      // Thursday: peer's Wednesday night ends at 6 am, when the morning starts.
      const thu = slotOf(r, 3, 'M');
      expect(thu.got).toBe(2);
      expect(skip(thu, ids.peerEmp)).toMatchObject({ kind: 'rest' });
      // Saturday night: emp has no night-work consent; mate and peer would lose their second day off.
      const sat = slotOf(r, 5, 'N');
      expect(sat.got).toBe(0);
      expect(skip(sat, ids.empEmp)).toMatchObject({ kind: 'night' });
      expect(skip(sat, ids.mateEmp)).toMatchObject({ kind: 'weekly_off' });
      expect(skip(sat, ids.peerEmp)).toMatchObject({ kind: 'weekly_off' });
      // Never the manager's own row or someone outside their team.
      const everyone = r.slots.flatMap((s: SlotOut) => [...s.placed, ...s.skipped].map((x) => x.employeeId));
      expect(everyone).not.toContain(ids.mgrEmp);
      expect(everyone).not.toContain(ids.otherEmp);

      expect(await entry(ids.empEmp, day(0))).toMatchObject({ draft: ids.M, published: false, source: 'auto' });
      expect(await entry(ids.empEmp, day(1))).toMatchObject({ draft: 'off', published: false, source: 'manual' });
      expect(await entry(ids.mateEmp, day(1))).toMatchObject({ draft: null, published: true, shiftId: ids.M });
      expect(await entry(ids.peerEmp, day(2))).toMatchObject({ draft: null, published: true, shiftId: ids.N });
      expect(await entry(ids.peerEmp, day(0))).toBeNull();
      expect(await entry(ids.otherEmp, day(0))).toBeNull();

      const o = (await api('mgr', 'get', `/time/auto-roster?week=${W}`).expect(200)).body;
      expect(o.run).toMatchObject({ id: res.id, status: 'done', error: null });
      expect(o.run.result.placed).toBe(5);
      expect(o.draft.find((p: { id: string }) => p.id === ids.empEmp).days.slice(0, 4)).toEqual(['M', 'OFF', null, 'M']);
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'time.auto_roster.generated', entityId: res.id } }));
      expect(JSON.parse(audit?.metadataJson ?? '{}')).toMatchObject({ placed: 5, week: W });
      // Another week has no run yet.
      expect((await api('mgr', 'get', `/time/auto-roster?week=${addDays(W, 7)}`).expect(200)).body.run).toBeNull();
    });

    it('one run per location week: a second Generate while one runs gets 409', async () => {
      const running = await inA((tx) => tx.autoRosterRun.create({ data: { organizationId: org.A.id, locationId: ids.locA, week: asD(W) } }));
      expect((await generate('mgr').expect(409)).body.code).toBe('RUNNING');
      expect((await api('mgr', 'get', `/time/auto-roster?week=${W}`).expect(200)).body.run).toMatchObject({ id: running.id, status: 'running' });
      await inA((tx) => tx.autoRosterRun.update({ where: { id: running.id }, data: { status: 'failed', error: 'test', finishedAt: new Date() } }));
    });

    it('a re-run is safe: it fills only what is still empty (a run left running too long counts as stopped)', async () => {
      await inA((tx) => tx.employeeLicence.create({ data: { organizationId: org.A.id, employeeId: ids.mateEmp, licenceTypeId: ids.forklift, validFrom: asD(addDays(today, -10)) } }));
      const stale = await inA((tx) => tx.autoRosterRun.create({ data: { organizationId: org.A.id, locationId: ids.locA, week: asD(W), startedAt: new Date(Date.now() - 11 * 60_000) } }));
      const r = (await generate('mgr').expect(200)).body.result;
      expect(r.placed).toBe(1);
      expect(slotOf(r, 2, 'F').placed.map((p: { employeeId: string }) => p.employeeId)).toEqual([ids.mateEmp]);
      expect(slotOf(r, 0, 'M')).toMatchObject({ had: 2, got: 2, placed: [] });
      expect(r.coverage).toMatchObject({ required: 10, filled: 7 });
      expect(await entry(ids.mateEmp, day(2))).toMatchObject({ draft: ids.F, source: 'auto' });
      expect(await entry(ids.empEmp, day(0))).toMatchObject({ draft: ids.M });
      expect(await inA((tx) => tx.autoRosterRun.findUnique({ where: { id: stale.id } }))).toMatchObject({ status: 'failed', error: expect.stringMatching(/Stopped/) });
      expect(await inA((tx) => tx.autoRosterRun.count({ where: { organizationId: org.A.id, status: 'running' } }))).toBe(0);
    });

    it('the planner publishes through the normal publish, which checks the rules again', async () => {
      const res = (await api('mgr', 'post', '/time/roster/publish').send({ week: W, reason: 'Auto-roster for next week' }).expect(200)).body;
      expect(res.published).toBeGreaterThanOrEqual(7);
      expect(await entry(ids.mateEmp, day(2))).toMatchObject({ published: true, shiftId: ids.F, draft: null });
      expect(await entry(ids.empEmp, day(0))).toMatchObject({ published: true, shiftId: ids.M, draft: null });
      const o = (await api('mgr', 'get', `/time/auto-roster?week=${W}`).expect(200)).body;
      expect(o.drafts).toBe(0);
    });
  });
});
