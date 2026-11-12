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
import { addDays, instantAt } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-35 Open shifts and bids, TIM-38 Standby and call-out, end to end against the real database (forced RLS, the app
// role): offer / list / award / cancel by the planner, claim / bid / withdraw by the person (first come under a row lock,
// the fair order, the guard re-checked at award), standby slots, call-outs (paid minimum, idempotent), and moving the
// next shift (rule 5); the wrong role, another company, out of scope, bad input, repeats, conflicts, acting for someone.
describe('TIM-35 open shifts and TIM-38 standby', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'boss' | 'mgr' | 'emp' | 'peer' | 'mate' | 'other' | 'empB' | 'acting' | 'actingEmp';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  // The first Saturday at least two days away: Saturdays and Sundays are weekly offs at the test location.
  const sat = [2, 3, 4, 5, 6, 7, 8].map(d).find((x) => new Date(`${x}T00:00:00Z`).getUTCDay() === 6)!;
  const times = (start: number, end: number) => ({ validFrom: today, start, end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300 });
  const at = (minutesFromNow: number) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();
  const publish = (employee: string, on: string, shiftId: string | null) =>
    inA((tx) => {
      const data = { shiftId, isOff: shiftId === null, published: true, draft: null, source: 'manual' };
      return tx.rosterEntry.upsert({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: employee, workOn: new Date(`${on}T00:00:00Z`) } }, create: { organizationId: org.A.id, employeeId: employee, workOn: new Date(`${on}T00:00:00Z`), ...data }, update: data });
    });
  const entry = (employee: string, on: string) => inA((tx) => tx.rosterEntry.findUnique({ where: { organizationId_employeeId_workOn: { organizationId: org.A.id, employeeId: employee, workOn: new Date(`${on}T00:00:00Z`) } } }));
  const offer = (who: Who, body: Record<string, unknown>) => api(who, 'post', '/time/open-shifts').send({ locationId: ids.locA, shiftId: ids.M, ...body });
  type Row = { id: string; version: number; status: string; bids: { employeeId: string; status: string; eligible: boolean; rank: number | null; won30: number; why: string | null }[] };
  const row = async (id: string) => ((await api('mgr', 'get', '/time/open-shifts?show=all').expect(200)).body.rows as Row[]).find((r) => r.id === id)!;

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

    planId = (await prisma.plan.create({ data: { name: `rosterx-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `RosterX Org ${k}`, slug: `rosterx-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const people: [Exclude<Who, 'acting' | 'actingEmp'>, 'A' | 'B', string, readonly string[] | null][] = [
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
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@rosterx-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@rosterx-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `RosterX Foods ${k}`, shortName: `RXF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // General 9:30 am – 6 pm on weekdays; Saturday and Sunday are weekly offs.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1080, weeklyOffs: [{ weekday: 6 }, { weekday: 7 }] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-60), userId: users[who], workEmail: `${who}@rosterx-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
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
    // Company A: 60 h a week, no weekly-off minimum, 72 h notice (so the moves below are always inside it). Since S-2
    // (answer 1324) the API refuses the first two (past the Factories Act limits), so they are stored directly: this suite
    // tests the roster moves, not the limits.
    await api('adminA', 'put', '/org/settings').send({ key: 'roster.change_notice_hours', scopeType: 'tenant', value: '72' }).expect(200);
    await inA(async (tx) => {
      for (const [key, value] of [['roster.max_weekly_hours', '60'], ['roster.min_weekly_offs', '0']]) await tx.setting.create({ data: { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id, value } });
    });
    ids.M = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'M', name: 'Morning', colour: 'orange', night: false, ...times(360, 840) }).expect(201)).body.id;
    ids.N = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'N', name: 'Night', colour: 'purple', night: true, ...times(1320, 360) }).expect(201)).body.id;
    await inA(async (tx) => {
      ids.forklift = (await tx.licenceType.create({ data: { organizationId: org.A.id, code: `FL${run}`.slice(0, 20), name: 'Forklift', legal: true } })).id;
    });
    token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.mgr}`).expect(200)).body.accessToken;
    token.actingEmp = (await api('adminA', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken;
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

  it('the four tables have forced RLS; the app role can never change or delete a call-out', async () => {
    const tables = ['open_shifts', 'open_shift_bids', 'standby_slots', 'call_outs'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
    await expect(prisma.$executeRaw`UPDATE call_outs SET paid_minutes = paid_minutes`).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM call_outs`).rejects.toThrow();
  });

  describe('TIM-35 · offering', () => {
    it('only a planner offers, at a location where they plan someone; another company never reaches it', async () => {
      await api('emp', 'get', '/time/open-shifts').expect(403);
      await api('hrExec', 'get', '/time/open-shifts').expect(403);
      await offer('emp', { on: sat }).expect(404);
      await offer('hrExec', { on: sat }).expect(404);
      await offer('adminB', { on: sat }).expect(404);
      await offer('acting', { on: sat }).expect(403);
      const list = (await api('mgr', 'get', '/time/open-shifts').expect(200)).body;
      expect(list.locations).toEqual([{ id: ids.locA, name: 'Hosur', rule: 'manager_picks' }]);
      expect(list.shifts.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(['Morning', 'Night']));
    });

    it('bad input is refused in plain words', async () => {
      expect((await offer('mgr', { on: d(-1) }).expect(400)).body.message).toMatch(/from today on/);
      expect((await offer('mgr', { on: d(121) }).expect(400)).body.message).toMatch(/within the next 120 days/);
      await offer('mgr', { on: sat, rule: 'lottery' }).expect(400);
      await offer('mgr', { on: 'tomorrow' }).expect(400);
      expect((await offer('mgr', { on: sat, closesAt: instantAt(sat, 'Asia/Kolkata', 420).toISOString() }).expect(400)).body.message).toMatch(/no later than the shift starts/);
      await offer('mgr', { on: sat, shiftId: randomUUID() }).expect(404);
      await offer('mgr', { on: sat, licenceTypeId: randomUUID() }).expect(404);
    });
  });

  describe('TIM-35 · first come', () => {
    it('the first eligible claim wins and writes the published roster; a second claim gets 409; a rest break refuses with its code', async () => {
      ids.osFirst = (await offer('mgr', { on: sat, rule: 'first_come', note: 'Line 2 short' }).expect(201)).body.id;
      // The peer works Friday night (10 pm – 6 am): Saturday 6 am leaves no rest.
      await publish(ids.peerEmp, addDays(sat, -1), ids.N);
      const rest = (await api('peer', 'post', `/time/me/open-shifts/${ids.osFirst}/claim`).expect(409)).body;
      expect(rest.code).toBe('REST_GUARD');
      expect((await api('peer', 'get', '/time/me/open-shifts').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.osFirst)).toBeUndefined();
      expect((await api('emp', 'get', '/time/me/open-shifts').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.osFirst)).toMatchObject({ eligible: true, myBid: null, rule: 'first_come' });
      await api('actingEmp', 'post', `/time/me/open-shifts/${ids.osFirst}/claim`).expect(403);
      expect((await api('emp', 'post', `/time/me/open-shifts/${ids.osFirst}/claim`).expect(200)).body.status).toBe('won');
      expect(await entry(ids.empEmp, sat)).toMatchObject({ shiftId: ids.M, published: true, source: 'open', draft: null });
      expect((await api('mate', 'post', `/time/me/open-shifts/${ids.osFirst}/claim`).expect(409)).body.code).toBe('TAKEN');
      expect((await api('emp', 'get', '/time/me/open-shifts').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.osFirst)).toMatchObject({ myBid: 'won', status: 'awarded' });
      await api('empB', 'post', `/time/me/open-shifts/${ids.osFirst}/claim`).expect(404);
      expect((await api('empB', 'get', '/time/me/open-shifts').expect(200)).body.rows).toEqual([]);
    });

    it('a licence is needed when the open shift asks for one', async () => {
      ids.osLic = (await offer('mgr', { on: sat, rule: 'first_come', licenceTypeId: ids.forklift }).expect(201)).body.id;
      expect((await api('mate', 'post', `/time/me/open-shifts/${ids.osLic}/claim`).expect(409)).body.code).toBe('LICENCE_GUARD');
      // The one who already won Saturday is already working that day.
      expect((await api('emp', 'post', `/time/me/open-shifts/${ids.osLic}/claim`).expect(409)).body.code).toBe('ALREADY_WORKING');
      await inA((tx) => tx.employeeLicence.create({ data: { organizationId: org.A.id, employeeId: ids.mateEmp, licenceTypeId: ids.forklift, validFrom: new Date(`${d(-10)}T00:00:00Z`) } }));
      expect((await api('mate', 'post', `/time/me/open-shifts/${ids.osLic}/claim`).expect(200)).body.status).toBe('won');
    });

    it('two claims at the same moment: exactly one wins', async () => {
      const os = (await offer('mgr', { on: addDays(sat, 1), rule: 'first_come' }).expect(201)).body.id;
      const res = await Promise.all([api('other', 'post', `/time/me/open-shifts/${os}/claim`), api('hrAdmin', 'post', `/time/me/open-shifts/${os}/claim`)]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      const won = await inA((tx) => tx.openShift.findFirst({ where: { id: os } }));
      expect(won).toMatchObject({ status: 'awarded' });
    });
  });

  describe('TIM-35 · manager picks', () => {
    const next = () => addDays(sat, 7);
    it('people bid (a repeat is the same bid), the list ranks the eligible in the fair order, a bid can be withdrawn once', async () => {
      ids.osPick = (await offer('mgr', { on: next(), closesAt: instantAt(next(), 'Asia/Kolkata', 300).toISOString() }).expect(201)).body.id;
      for (const who of ['emp', 'mate', 'peer', 'other'] as const) expect((await api(who, 'post', `/time/me/open-shifts/${ids.osPick}/claim`).expect(200)).body.status).toBe('waiting');
      expect((await api('emp', 'post', `/time/me/open-shifts/${ids.osPick}/claim`).expect(200)).body.status).toBe('waiting');
      const r = await row(ids.osPick);
      expect(r.bids).toHaveLength(4);
      const by = (e: string) => r.bids.find((b) => b.employeeId === e)!;
      // The peer won nothing in the last 30 days; emp and mate each won Saturday; other is someone else's team.
      expect(by(ids.peerEmp)).toMatchObject({ eligible: true, rank: 1, won30: 0 });
      expect(by(ids.empEmp)).toMatchObject({ eligible: true, won30: 1 });
      expect(by(ids.otherEmp)).toMatchObject({ eligible: false, why: 'Planned by another manager' });
      await api('peer', 'post', `/time/me/open-shifts/${ids.osPick}/withdraw`).expect(200);
      expect((await api('peer', 'post', `/time/me/open-shifts/${ids.osPick}/withdraw`).expect(409)).body.code).toBe('ALREADY_DONE');
      await api('empB', 'post', `/time/me/open-shifts/${ids.osPick}/withdraw`).expect(404);
    });

    it('the award checks reach, version and the rules again, then writes the roster and tells the others they lost', async () => {
      const r = await row(ids.osPick);
      await api('acting', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp, version: r.version }).expect(403);
      await api('hrExec', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp, version: r.version }).expect(404);
      await api('adminB', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp, version: r.version }).expect(404);
      await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.otherEmp, version: r.version }).expect(404);
      await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.mgrEmp, version: r.version }).expect(403);
      await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp }).expect(400);
      expect((await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp, version: r.version + 5 }).expect(409)).body.code).toBe('STALE');
      // The roster changed since mate bid: a Friday night now leaves no rest before Saturday 6 am.
      await publish(ids.mateEmp, addDays(next(), -1), ids.N);
      expect((await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.mateEmp, version: r.version }).expect(409)).body.code).toBe('REST_GUARD');
      await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.peerEmp, version: r.version }).expect(404);
      await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp, version: r.version }).expect(200);
      expect(await entry(ids.empEmp, next())).toMatchObject({ shiftId: ids.M, published: true, source: 'open' });
      const after = await row(ids.osPick);
      expect(after.status).toBe('awarded');
      expect(after.bids.find((b) => b.employeeId === ids.mateEmp)!.status).toBe('lost');
      expect(after.bids.find((b) => b.employeeId === ids.empEmp)!.status).toBe('won');
      expect((await api('mgr', 'post', `/time/open-shifts/${ids.osPick}/award`).send({ employeeId: ids.empEmp, version: after.version }).expect(409)).body.code).toBe('ALREADY_DONE');
      const audits = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, entityId: ids.osPick } }));
      expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['time.open_shift.offered', 'time.open_shift.awarded']));
    });

    it('no bid after the close; leave makes a person ineligible; cancel needs the current version, once', async () => {
      const late = (await offer('mgr', { on: next(), closesAt: instantAt(next(), 'Asia/Kolkata', 300).toISOString() }).expect(201)).body.id;
      await inA((tx) => tx.openShift.update({ where: { id: late }, data: { closesAt: new Date(Date.now() - 60_000) } }));
      expect((await api('peer', 'post', `/time/me/open-shifts/${late}/claim`).expect(409)).body.code).toBe('CLOSED');
      const far = addDays(sat, 14);
      await inA(async (tx) => {
        const t = await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'CL', name: 'Casual', kind: 'casual' } });
        const lr = await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: ids.peerEmp, leaveTypeId: t.id, fromOn: new Date(`${far}T00:00:00Z`), toOn: new Date(`${far}T00:00:00Z`), days: 1, status: 'approved' } });
        await tx.leaveRequestDay.create({ data: { organizationId: org.A.id, requestId: lr.id, employeeId: ids.peerEmp, leaveOn: new Date(`${far}T00:00:00Z`), part: 'full', portion: 1, countedAs: 'leave' } });
      });
      const onLeave = (await offer('mgr', { on: far }).expect(201)).body.id;
      expect((await api('peer', 'post', `/time/me/open-shifts/${onLeave}/claim`).expect(409)).body.code).toBe('ON_LEAVE');
      const v = (await row(late)).version;
      expect((await api('mgr', 'post', `/time/open-shifts/${late}/cancel`).send({ version: v + 1 }).expect(409)).body.code).toBe('STALE');
      await api('emp', 'post', `/time/open-shifts/${late}/cancel`).send({ version: v }).expect(404);
      await api('mgr', 'post', `/time/open-shifts/${late}/cancel`).send({ version: v, reason: 'Covered by overtime' }).expect(200);
      expect((await api('mgr', 'post', `/time/open-shifts/${late}/cancel`).send({ version: v + 1 }).expect(409)).body.code).toBe('ALREADY_DONE');
      expect((await api('peer', 'post', `/time/me/open-shifts/${late}/claim`).expect(409)).body.code).toBe('CANCELLED');
    });
  });

  describe('TIM-38 · standby slots', () => {
    it('only a planner sets slots for their people: at most 24 h, end after start, still to come, no overlap', async () => {
      const slot = (who: Who, employeeId: string, s: number, e: number) => api(who, 'post', '/time/standby/slots').send({ employeeId, startsAt: at(s), endsAt: at(e) });
      await api('emp', 'get', '/time/standby').expect(403);
      await slot('emp', ids.peerEmp, 60, 120).expect(404);
      await slot('mgr', ids.mgrEmp, 60, 120).expect(403);
      await slot('mgr', ids.otherEmp, 60, 120).expect(404);
      await slot('adminB', ids.empEmp, 60, 120).expect(404);
      await slot('acting', ids.empEmp, 60, 120).expect(403);
      expect((await slot('mgr', ids.empEmp, 120, 60).expect(400)).body.message).toMatch(/after the start/);
      expect((await slot('mgr', ids.empEmp, 0, 24 * 60 + 1).expect(400)).body.message).toMatch(/at most 24 hours/);
      expect((await slot('mgr', ids.empEmp, -300, -60).expect(400)).body.message).toMatch(/still to come/);
      await api('mgr', 'post', '/time/standby/slots').send({ employeeId: ids.empEmp, startsAt: 'yesterday', endsAt: at(60) }).expect(400);
      ids.slotEmp = (await slot('mgr', ids.empEmp, -400, 600).expect(201)).body.id;
      expect((await slot('mgr', ids.empEmp, 300, 720).expect(409)).body.code).toBe('OVERLAP');
      const future = (await slot('mgr', ids.peerEmp, 48 * 60, 60 * 60).expect(201)).body.id;
      await api('mgr', 'post', `/time/standby/slots/${future}/cancel`).expect(200);
      expect((await api('mgr', 'post', `/time/standby/slots/${future}/cancel`).expect(409)).body.code).toBe('ALREADY_DONE');
      expect((await api('mgr', 'post', `/time/standby/slots/${ids.slotEmp}/cancel`).expect(409)).body.code).toBe('TOO_LATE');
      await api('adminB', 'post', `/time/standby/slots/${ids.slotEmp}/cancel`).expect(404);
    });

    it('a call-out is paid the minimum, a repeat makes no second one, and the rest before the next shift is shown', async () => {
      const ref = randomUUID();
      const body = { employeeId: ids.empEmp, startedAt: at(-120), endedAt: at(-105), reason: 'Compressor trip, Line 2', clientRef: ref };
      const first = (await api('mgr', 'post', '/time/standby/call-outs').send(body).expect(201)).body;
      expect(first).toMatchObject({ workedMinutes: 15, paidMinutes: 120, minimumApplied: true, repeat: false, minRestMinutes: 660 });
      if (first.next) expect(first.restMinutes).toBe(Math.floor((Date.parse(first.next.startsAt) - Date.parse(first.endedAt)) / 60_000));
      const again = (await api('mgr', 'post', '/time/standby/call-outs').send(body).expect(201)).body;
      expect(again).toMatchObject({ id: first.id, repeat: true });
      expect(await inA((tx) => tx.callOut.count({ where: { organizationId: org.A.id, clientRef: ref } }))).toBe(1);
      // A long one is paid what was worked.
      expect((await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, startedAt: at(-390), endedAt: at(-250), clientRef: randomUUID() }).expect(201)).body).toMatchObject({ workedMinutes: 140, paidMinutes: 140, minimumApplied: false });
      expect((await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, clientRef: randomUUID() }).expect(409)).body.code).toBe('OVERLAP');
      expect((await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, employeeId: ids.peerEmp, clientRef: randomUUID() }).expect(409)).body.code).toBe('NO_STANDBY');
      expect((await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, endedAt: at(60), clientRef: randomUUID() }).expect(400)).body.message).toMatch(/after it ends/);
      await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, startedAt: at(-100), endedAt: at(-110), clientRef: randomUUID() }).expect(400);
      await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, reason: '' }).expect(400);
      await api('mgr', 'post', '/time/standby/call-outs').send({ ...body, clientRef: 'again' }).expect(400);
      await api('emp', 'post', '/time/standby/call-outs').send({ ...body, clientRef: randomUUID() }).expect(403);
      await api('emp', 'post', '/time/standby/call-outs').send({ ...body, employeeId: ids.peerEmp, clientRef: randomUUID() }).expect(404);
      await api('adminB', 'post', '/time/standby/call-outs').send({ ...body, clientRef: randomUUID() }).expect(404);
      await api('acting', 'post', '/time/standby/call-outs').send({ ...body, clientRef: randomUUID() }).expect(403);
      const week = (await api('mgr', 'get', `/time/standby?week=${new Date(Date.now() + 210 * 60_000).toISOString().slice(0, 10)}`).expect(200)).body;
      const logged = week.callOuts.find((c: { id: string }) => c.id === first.id);
      expect(logged).toMatchObject({ paidMinutes: 120, workedMinutes: 15 });
      expect(week.minimumHours).toBe(2);
      expect(week.planned.map((p: { employeeId: string }) => p.employeeId)).toEqual(expect.arrayContaining([ids.empEmp, ids.peerEmp, ids.mateEmp]));
      expect(week.planned.map((p: { employeeId: string }) => p.employeeId)).not.toContain(ids.mgrEmp);
    });

    it('moving the next shift: the guard first, a reason inside the notice, then a published change the person is told about', async () => {
      await publish(ids.empEmp, d(2), ids.M);
      await publish(ids.empEmp, d(3), ids.M);
      const move = (who: Who, body: Record<string, unknown>) => api(who, 'post', '/time/standby/move').send({ employeeId: ids.empEmp, on: d(2), ...body });
      // A night on d(2) ends at 6 am on d(3), when the morning starts: no rest.
      expect((await move('mgr', { shiftId: ids.N, reason: 'Rest after call-out' }).expect(409)).body.code).toBe('REST_GUARD');
      expect((await move('mgr', { shiftId: null }).expect(400)).body.code).toBe('NOTICE_REASON');
      expect((await move('mgr', { shiftId: ids.M, reason: 'x' }).expect(400)).body.message).toMatch(/already the shift/);
      await move('mgr', { on: d(-1), shiftId: null, reason: 'x' }).expect(400);
      await move('hrExec', { shiftId: null, reason: 'x' }).expect(404);
      await move('adminB', { shiftId: null, reason: 'x' }).expect(404);
      await move('acting', { shiftId: null, reason: 'x' }).expect(403);
      await api('mgr', 'post', '/time/standby/move').send({ employeeId: ids.mgrEmp, on: d(2), shiftId: null, reason: 'x' }).expect(403);
      await move('mgr', { shiftId: 'night' }).expect(400);
      await move('mgr', { shiftId: null, reason: 'Rest after the night call-out' }).expect(200);
      expect(await entry(ids.empEmp, d(2))).toMatchObject({ shiftId: null, isOff: true, published: true, source: 'callout', changeReason: 'Rest after the night call-out' });
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'time.roster.moved_after_call_out', entityId: ids.empEmp } }));
      expect(JSON.parse(audit?.metadataJson ?? '{}')).toMatchObject({ before: 'Morning 06:00–14:00', after: 'off', late: true });
    });
  });
});
