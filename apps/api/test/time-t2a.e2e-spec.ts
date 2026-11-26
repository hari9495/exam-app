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

// T2-A (Nov 2026), end to end against the real database (forced RLS, the app role): the manager's overview cards
// (answer 2759), peers away (2760) and comp-off credited from the roster (2757). Each: the positive path, the wrong
// person, another company, a repeat.
describe('T2-A: overview cards, peers away, comp-off from the roster', () => {
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
  type Who = 'adminA' | 'adminB' | 'hr' | 'mgr' | 'emp' | 'peer' | 'newbie' | 'mgr2' | 'emp2' | 'rost' | 'empB';
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
  const login = (who: Who) => request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[who === 'adminB' || who === 'empB' ? 'B' : 'A'].slug, email: `${who}@t2a-${run}.test`, password: PASSWORD });
  const approve = async (who: Who, leaveRequestId: string) => {
    const r = await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: leaveRequestId } }));
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: r.wfRequestId!, status: 'open' } }));
    await api(who, 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect((x) => expect([200, 201]).toContain(x.status));
  };
  const applyLeave = async (who: Who, type: string, from: string, to = from) =>
    (await api(who, 'post', '/time/me/leave').send({ leaveTypeId: ids[type], from, to, reason: 'Family' }).expect((r) => expect(r.status).toBe(201))).body.id as string;
  const nameOf = (who: Who) => `${who} ${run}`;

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

    planId = (await prisma.plan.create({ data: { name: `t2a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `T2A Org ${k}`, slug: `t2a-${k.toLowerCase()}-${run}`, planId } });
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
      ['newbie', 'A', 'panel', null],
      ['mgr2', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['rost', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@t2a-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await login(who).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `T2A Foods ${k}`, shortName: `T2A${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai office', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day, so leave today always counts whatever weekday the suite runs on.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2024-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    // The plant: Saturday and Sunday are weekly offs (the roster comp-off tests).
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.plant = (await tx.location.create({ data: { ...o, legalEntityId: ids.entityA, name: 'Pune plant', code: 'PNQ', address: {}, country: 'IN', state: 'IN-MH', timezone: ZONE } })).id;
      await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids.plant, validFrom: new Date('2024-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: 6 }, { weekday: 7 }] } });
      ids.shift = (await tx.shift.create({ data: { ...o, code: 'G', name: 'General' } })).id;
      await tx.shiftVersion.create({ data: { ...o, shiftId: ids.shift, validFrom: new Date('2020-01-01T00:00:00Z'), startMinute: 570, endMinute: 1110 } });
    });
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', joined = `${Y - 1}-01-01`, location = ids[`loc${k}`]) =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before this year (test data)', givenName: who, familyName: run, joinedOn: joined, userId: users[who], workEmail: `${who}@t2a-${run}.test`, assignment: { locationId: location, departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .then((r) => {
            if (r.status !== 201) throw new Error(`hire ${who}: ${r.status} ${JSON.stringify(r.body)}`);
            return r;
          })
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.mgr2Emp = await hire('adminA', 'mgr2', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.newbieEmp = await hire('adminA', 'newbie', ids.mgrEmp, 'A', d(-10));
    ids.emp2Emp = await hire('adminA', 'emp2', ids.mgr2Emp);
    ids.rostEmp = await hire('adminA', 'rost', ids.mgr2Emp, 'A', `${Y - 1}-01-01`, ids.plant);
    ids.hrEmp = await hire('adminA', 'hr', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');

    // Casual and sick leave with a balance for the people who apply.
    ids.CL = (await api('hr', 'post', '/time/setup/types').send({ code: 'CL', name: 'Casual leave', kind: 'other', paid: true, rules: { halfDays: true } }).expect(201)).body.id;
    ids.SL = (await api('hr', 'post', '/time/setup/types').send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true, rules: { halfDays: true } }).expect(201)).body.id;
    ids.policy = (await api('hr', 'post', '/time/setup/policies').send({ name: 'Staff' }).expect(201)).body.id;
    await api('hr', 'post', `/time/setup/policies/${ids.policy}/versions`).send({ validFrom: `${Y - 1}-01-01`, lines: [ids.CL, ids.SL].map((leaveTypeId) => ({ leaveTypeId, annualDays: 0, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 5 })) }).expect(201);
    await api('hr', 'post', `/time/setup/policies/${ids.policy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entityA, validFrom: `${Y - 1}-01-01` }).expect(201);
    for (const e of [ids.empEmp, ids.peerEmp, ids.emp2Emp]) for (const t of [ids.CL, ids.SL]) await api('hr', 'post', `/time/people/${e}/adjust`).send({ leaveTypeId: t, days: 10, reason: 'Opening balance' }).expect(201);
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

  // ------------------------------------------------------------------------------------------ answer 2759

  describe('answer 2759: the manager overview cards', () => {
    type Person = { employeeId: string; name: string };
    const cards = async (who: Who) => (await api(who, 'get', '/time/team/leave-home').expect(200)).body;
    const names = (xs: Person[]) => xs.map((x) => x.employeeId);

    it('"No leave in 90 days": the team with no approved leave, never someone who joined inside the window', async () => {
      const c = (await cards('mgr')).cards;
      expect(c.noLeave.days).toBe(90);
      expect(names(c.noLeave.people).sort()).toEqual([ids.empEmp, ids.peerEmp].sort());
      expect(c.noLeave.count).toBe(2);
      expect(names(c.noLeave.people)).not.toContain(ids.newbieEmp);
      expect(names(c.noLeave.people)).not.toContain(ids.mgrEmp);
      // Another manager's team never shows.
      expect(names(c.noLeave.people)).not.toContain(ids.emp2Emp);
      expect(c.unplanned).toEqual({ count: 0, people: [] });
    });

    it('"Unplanned": leave applied on or after its first day, in this month; names only; sick shows as "Leave"', async () => {
      ids.empToday = await applyLeave('emp', 'CL', today);
      ids.peerToday = await applyLeave('peer', 'SL', today);
      ids.emp2Today = await applyLeave('emp2', 'CL', today);
      let home = await cards('mgr');
      expect(names(home.cards.unplanned.people).sort()).toEqual([ids.empEmp, ids.peerEmp].sort());
      expect(home.cards.unplanned.people[0]).toEqual({ employeeId: expect.any(String), name: expect.any(String), requests: 1 });
      // Away this week: the casual leave by its name, the sick leave only as "Leave".
      const away = new Map(home.away.map((x: { employeeId: string; type: string }) => [x.employeeId, x.type]));
      expect(away.get(ids.empEmp)).toBe('Casual leave');
      expect(away.get(ids.peerEmp)).toBe('Leave');
      expect(JSON.stringify(home.away)).not.toMatch(/Sick/);
      // The approval itself still names the type to the person deciding it.
      expect(home.waiting.find((x: { id: string }) => x.id === ids.peerToday).type).toBe('Sick leave');
      // Negative: a request sent before its first day is planned; it leaves the card.
      await inA((tx) => tx.leaveRequest.update({ where: { id: ids.peerToday }, data: { createdAt: new Date(`${d(-3)}T06:00:00Z`) } }));
      home = await cards('mgr');
      expect(names(home.cards.unplanned.people)).toEqual([ids.empEmp]);
      // The other manager sees only their own team.
      expect(names((await cards('mgr2')).cards.unplanned.people)).toEqual([ids.emp2Emp]);
    });

    it('approved leave takes a person off "No leave"; pending does not; the window is the company setting', async () => {
      await approve('mgr', ids.empToday);
      let c = (await cards('mgr')).cards;
      expect(names(c.noLeave.people)).toEqual([ids.peerEmp]);
      // Only the listed values; HR's setting changes the window.
      await api('adminA', 'put', '/org/settings').send({ key: 'leave.overview.no_leave_days', value: '45', scopeType: 'tenant' }).expect(400);
      await api('emp', 'put', '/org/settings').send({ key: 'leave.overview.no_leave_days', value: '30', scopeType: 'tenant' }).expect(403);
      await api('adminA', 'put', '/org/settings').send({ key: 'leave.overview.no_leave_days', value: '30', scopeType: 'tenant' }).expect(200);
      c = (await cards('mgr')).cards;
      expect(c.noLeave.days).toBe(30);
      expect(names(c.noLeave.people)).toEqual([ids.peerEmp]);
    });

    it('negative: someone with no team gets empty cards; another company sees none of these people', async () => {
      const mine = (await cards('emp')).cards;
      expect(mine).toEqual({ unplanned: { count: 0, people: [] }, noLeave: { days: 30, count: 0, people: [] } });
      const other = await cards('adminB');
      expect(JSON.stringify(other)).not.toContain(run.slice(0, 8) + '"');
      for (const id of [ids.empEmp, ids.peerEmp, ids.emp2Emp]) expect(JSON.stringify(other)).not.toContain(id);
      await request(server()).get('/api/v1/time/team/leave-home').expect(401);
    });
  });

  // ------------------------------------------------------------------------------------------ answer 2760

  describe('answer 2760: peers away', () => {
    it('my peers (the same manager today) away on approved leave in the next two weeks; "away" only', async () => {
      ids.peerLater = await applyLeave('peer', 'CL', d(5), d(6));
      await approve('mgr', ids.peerLater);
      const r = (await api('emp', 'get', '/time/me/peers-away').expect(200)).body;
      expect(r).toMatchObject({ from: today, to: d(13), peers: 2 });
      expect(r.days).toEqual([
        { on: d(5), names: [nameOf('peer')] },
        { on: d(6), names: [nameOf('peer')] },
      ]);
      // No leave type, part of the day or times anywhere; the pending sick leave today is not shown.
      expect(JSON.stringify(r)).not.toMatch(/Casual|Sick|half|type/i);
      expect(r.days.map((x: { on: string }) => x.on)).not.toContain(today);
      // The other peer sees the same; I am never in my own list.
      const newbie = (await api('newbie', 'get', '/time/me/peers-away').expect(200)).body;
      expect(newbie.peers).toBe(2);
      expect(JSON.stringify((await api('peer', 'get', '/time/me/peers-away').expect(200)).body)).not.toContain(nameOf('peer'));
    });

    it('negative: another team, no manager, another company and no sign-in never see them', async () => {
      const other = (await api('emp2', 'get', '/time/me/peers-away').expect(200)).body;
      expect(other.peers).toBe(1); // rost, the other person under mgr2
      expect(JSON.stringify(other)).not.toContain(nameOf('peer'));
      expect((await api('mgr', 'get', '/time/me/peers-away').expect(200)).body).toEqual({ from: today, to: d(13), peers: 0, days: [] });
      expect((await api('empB', 'get', '/time/me/peers-away').expect(200)).body).toMatchObject({ peers: 0, days: [] });
      await request(server()).get('/api/v1/time/me/peers-away').expect(401);
    });

    it('a cancelled leave leaves the list', async () => {
      await api('peer', 'post', `/time/me/leave/${ids.peerLater}/cancel`).send({ reason: 'Plans changed' }).expect((x) => expect([200, 201]).toContain(x.status));
      const r = await inA((tx) => tx.leaveRequest.findFirstOrThrow({ where: { id: ids.peerLater } }));
      // Cancelling approved leave may need the manager; either way the days are no longer "approved and active".
      if (r.status === 'cancel_pending') {
        const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: r.cancelWfRequestId!, status: 'open' } }));
        await api('mgr', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect((x) => expect([200, 201]).toContain(x.status));
      }
      expect((await api('emp', 'get', '/time/me/peers-away').expect(200)).body.days).toEqual([]);
    });
  });

  // ------------------------------------------------------------------------------------------ answer 2757

  describe('answer 2757: comp-off credited from the roster (job)', () => {
    // The last Saturday and Sunday before today, and the weeks before them, all inside the 30-day claim window.
    let sunday = DateTime.fromISO(today).minus({ days: 1 });
    while (sunday.weekday !== 7) sunday = sunday.minus({ days: 1 });
    const sun = (weeksBack: number) => sunday.minus({ weeks: weeksBack }).toISODate()!;
    const sat = (weeksBack: number) => sunday.minus({ weeks: weeksBack, days: 1 }).toISODate()!;
    const monday = sunday.minus({ days: 6 }).toISODate()!;
    const credits = () => inA((tx) => tx.leaveLedgerEntry.findMany({ where: { employeeId: ids.rostEmp, kind: 'comp_off' }, orderBy: { entryOn: 'asc' } }));

    beforeAll(async () => {
      await inA(async (tx) => {
        const o = { organizationId: org.A.id, employeeId: ids.rostEmp };
        const rostered = async (on: string, worked: number, published = true) => {
          await tx.rosterEntry.create({ data: { ...o, workOn: asDate(on), shiftId: ids.shift, published } });
          await tx.attendanceDay.create({ data: { ...o, workOn: asDate(on), mode: 'punch', status: 'present', workedMinutes: worked } });
        };
        await rostered(sun(0), 500); // a full day
        await rostered(sun(1), 300); // a half day
        await rostered(sun(2), 120); // too little
        await rostered(sun(3), 500); // already credited by hand below
        await rostered(sat(0), 500, false); // not published
        await rostered(monday, 500); // an ordinary working day
        // Worked a Saturday with no roster at all: the claim stays the way.
        await tx.attendanceDay.create({ data: { ...o, workOn: asDate(sat(1)), mode: 'punch', status: 'present', workedMinutes: 500 } });
      });
    });

    it('off by default: nothing is credited', async () => {
      expect(await leaveV2.creditRosteredCompOff(org.A.id)).toBe(0);
      expect(await credits()).toEqual([]);
    });

    it('on, but no comp-off leave type: nothing is credited', async () => {
      await api('emp', 'put', '/org/settings').send({ key: 'leave.comp_off.auto_from_roster', value: 'on', scopeType: 'tenant' }).expect(403);
      await api('adminA', 'put', '/org/settings').send({ key: 'leave.comp_off.auto_from_roster', value: 'maybe', scopeType: 'tenant' }).expect(400);
      await api('adminA', 'put', '/org/settings').send({ key: 'leave.comp_off.auto_from_roster', value: 'on', scopeType: 'tenant' }).expect(200);
      expect(await leaveV2.creditRosteredCompOff(org.A.id)).toBe(0);
    });

    it('on: a rostered weekly off worked gives a full or half day; the others nothing; a repeat adds nothing', async () => {
      ids.CO = (await api('hr', 'post', '/time/setup/types').send({ code: 'CO', name: 'Comp-off', kind: 'comp_off', paid: true }).expect(201)).body.id;
      await inA((tx) => tx.leaveLedgerEntry.create({ data: { organizationId: org.A.id, employeeId: ids.rostEmp, leaveTypeId: ids.CO, entryOn: asDate(sun(3)), kind: 'comp_off', days: 1, periodKey: `ot:${sun(3)}`, reason: 'Comp-off from approved overtime' } }));
      expect(await leaveV2.creditRosteredCompOff(org.A.id)).toBe(2);
      const got = (await credits()).filter((x) => x.periodKey?.startsWith('roster:')).map((x) => [x.entryOn.toISOString().slice(0, 10), Number(x.days)]);
      expect(got).toEqual([
        [sun(1), 0.5],
        [sun(0), 1],
      ]);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'leave.comp_off.rostered' } }))).toBe(1);
      // Safe to run again (the hourly accrual job): the day is now credited.
      expect(await leaveV2.creditRosteredCompOff(org.A.id)).toBe(0);
      expect((await credits()).length).toBe(3);
      // Nobody else got anything; another company is untouched.
      expect(await inA((tx) => tx.leaveLedgerEntry.count({ where: { kind: 'comp_off', employeeId: { not: ids.rostEmp } } }))).toBe(0);
      expect(await leaveV2.creditRosteredCompOff(org.B.id)).toBe(0);
    });
  });
});
