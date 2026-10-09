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
import { markSteppedUp } from './fixtures/step-up';

// Step 4 · Time and leave batch 2, end to end against the real database (forced RLS, the app role) and Redis: shifts,
// patterns and the roster (team / scope, drafts and publish), the women's night-work guard, swaps and overtime and
// timesheets through P03 (comp-off credited once), maternity eligibility with an HR override, period locks with
// step-up, the pre-flight and the database guard, the frozen payroll feed and the registers; two companies kept apart.
describe('Time and leave batch 2', () => {
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
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'hrExec' | 'boss' | 'mgr' | 'emp' | 'peer' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);
  // A month that may be locked (from the 2nd of the next month).
  const lockMonth = (today.slice(8) >= '02' ? addDays(`${today.slice(0, 7)}-01`, -1) : addDays(addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + '-01', -1)).slice(0, 7);
  const inLocked = `${lockMonth}-15`;
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string; step: { name: string }; summary: { label: string; value: string }[] }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    const stream = res as unknown as NodeJS.ReadableStream;
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => cb(null, Buffer.concat(chunks)));
  };
  const times = (start: number, end: number, validFrom = today) => ({ validFrom, start, end, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 450, breakMinutes: 30, breakAboveMinutes: 300 });

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

    planId = (await prisma.plan.create({ data: { name: `time2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Time2 Org ${k}`, slug: `time2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['hrExec', 'A', 'panel', ['leave.view', 'attendance.view']],
      ['boss', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@time2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@time2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Time2 Foods ${k}`, shortName: `T2F${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // No weekly offs at this location: every day is a working day unless a pattern says otherwise.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: `${lockMonth}-01`, userId: users[who], workEmail: `${who}@time2-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.bossEmp = await hire('adminA', 'boss', null);
    ids.mgrEmp = await hire('adminA', 'mgr', ids.bossEmp);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', ids.bossEmp);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
    await inA(async (tx) => {
      for (const [e, gender] of [['empEmp', 'female'], ['peerEmp', 'male']] as const) await tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org.A.id, employeeId: ids[e] } }, update: { gender }, create: { organizationId: org.A.id, employeeId: ids[e], gender } });
    });
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        // The lock guard refuses deletes on locked days: unlock first, then the company goes.
        await tx.periodLock.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every new table has forced RLS; frozen feed rows never change', async () => {
    const tables = ['shifts', 'shift_versions', 'shift_patterns', 'shift_pattern_assignments', 'roster_entries', 'shift_swap_requests', 'night_work_consents', 'night_work_safeguards', 'overtime_rules', 'overtime_requests', 'timesheet_projects', 'timesheets', 'timesheet_lines', 'period_locks', 'payroll_feed_rows', 'leave_eligibility_overrides'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
    await expect(prisma.$executeRaw`DELETE FROM payroll_feed_rows`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE shift_versions SET grace_minutes = 0`).rejects.toThrow();
  });

  describe('shifts and patterns (set-up, company-wide)', () => {
    it('only the set-up key changes them; company B never reaches company A', async () => {
      await api('emp', 'get', '/time/shifts/setup').expect(403);
      await api('hrExec', 'post', '/time/shifts').send({ code: 'M', name: 'Morning', colour: 'orange', night: false, ...times(360, 840) }).expect(403);
      ids.M = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'M', name: 'Morning', colour: 'orange', night: false, ...times(360, 840) }).expect(201)).body.id;
      ids.N = (await api('hrAdmin', 'post', '/time/shifts').send({ code: 'N', name: 'Night', colour: 'purple', night: true, ...times(1320, 360) }).expect(201)).body.id;
      // Past-dated times, a zero-length shift and a duplicate code are refused in plain words.
      await api('hrAdmin', 'post', '/time/shifts').send({ code: 'X', name: 'X', colour: 'blue', night: false, ...times(360, 840, d(-1)) }).expect(400);
      await api('hrAdmin', 'post', '/time/shifts').send({ code: 'Y', name: 'Y', colour: 'blue', night: false, ...times(360, 360) }).expect(400);
      await api('hrAdmin', 'post', '/time/shifts').send({ code: 'M', name: 'Again', colour: 'blue', night: false, ...times(360, 840) }).expect(409);
      // The past is needed for the tests: the versions from last month, written directly.
      await inA(async (tx) => {
        for (const s of [ids.M, ids.N]) {
          const v = await tx.shiftVersion.findFirstOrThrow({ where: { organizationId: org.A.id, shiftId: s } });
          await tx.shiftVersion.create({ data: { organizationId: org.A.id, shiftId: s, validFrom: new Date(`${lockMonth}-01T00:00:00Z`), startMinute: v.startMinute, endMinute: v.endMinute, fullDayMinutes: 450 } });
        }
      });
      ids.pattern = (await api('hrAdmin', 'post', '/time/patterns').send({ name: 'Two mornings, two nights', kind: 'cycle', cycle: [ids.M, ids.M, ids.N, ids.N, null, null] }).expect(201)).body.id;
      await api('hrAdmin', 'post', '/time/patterns').send({ name: 'Bad', kind: 'weekly', cycle: [ids.M] }).expect(400);
      await api('hrAdmin', 'post', '/time/patterns').send({ name: 'Foreign', kind: 'cycle', cycle: [randomUUID()] }).expect(400);
      await api('adminB', 'post', `/time/patterns/${ids.pattern}/assign`).send({ scopeType: 'tenant', validFrom: today, offsetDays: 0 }).expect(404);
      expect((await api('adminB', 'get', '/time/shifts/setup').expect(200)).body.shifts).toEqual([]);
    });

    it('the night-work guard stops a pattern that puts a woman on nights without consent (YX-AT-25)', async () => {
      const res = await api('hrAdmin', 'post', `/time/patterns/${ids.pattern}/assign`).send({ scopeType: 'employee', scopeId: ids.empEmp, validFrom: d(1), offsetDays: 0 }).expect(409);
      expect(res.body.message).toMatch(/No night-work consent on file/);
      // The peer (male) follows the pattern from tomorrow: two mornings, then two nights.
      await api('hrAdmin', 'post', `/time/patterns/${ids.pattern}/assign`).send({ scopeType: 'employee', scopeId: ids.peerEmp, validFrom: d(1), offsetDays: 0 }).expect(201);
      const mine = (await api('peer', 'get', `/time/me/shifts?week=${d(1)}`).expect(200)).body as { days: { on: string; shift: { name: string } | null; off: boolean }[] };
      const at = (on: string) => mine.days.find((x) => x.on === on);
      if (at(d(1))) expect(at(d(1))!.shift?.name).toBe('Morning');
      if (at(d(3))) expect(at(d(3))!.shift?.name).toBe('Night');
      if (at(d(5))) expect(at(d(5))!.off).toBe(true);
    });
  });

  describe('the roster (YX-AT-07)', () => {
    it('a manager plans their team, never themselves or people outside it; publish puts it in force', async () => {
      const week = (await api('mgr', 'get', `/time/roster?week=${d(1)}`).expect(200)).body;
      expect(week.scope).toBe('team');
      expect(week.people.map((p: { id: string }) => p.id).sort()).toEqual([ids.empEmp, ids.peerEmp].sort());
      expect((await api('emp', 'get', `/time/roster?week=${d(1)}`).expect(200)).body.people).toEqual([]);
      await api('emp', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.peerEmp, on: d(2), value: ids.M }] }).expect(404);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.mgrEmp, on: d(2), value: ids.M }] }).expect(403);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: d(-1), value: ids.M }] }).expect(400);
      // A woman on a night shift: refused without consent, then without the safeguards, then allowed.
      expect((await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: d(2), value: ids.N }] }).expect(409)).body.message).toMatch(/No night-work consent/);
      await api('hrAdmin', 'post', '/time/night/consents').send({ employeeId: ids.empEmp, locationId: ids.locA, givenOn: today, reference: 'Signed form 1' }).expect(201);
      expect((await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: d(2), value: ids.N }] }).expect(409)).body.message).toMatch(/Safeguards checklist lapsed/);
      for (const item of ['transport', 'security', 'rest_room', 'group', 'posh']) await api('hrAdmin', 'post', '/time/night/safeguards').send({ locationId: ids.locA, item, attestedOn: today, reviewDue: d(90), note: 'Checked' }).expect(201);
      await api('hrAdmin', 'post', '/time/night/safeguards').send({ locationId: ids.locA, item: 'made_up', attestedOn: today, reviewDue: d(90), note: 'x' }).expect(400);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: d(2), value: ids.N }, { employeeId: ids.empEmp, on: d(3), value: ids.M }] }).expect(200);
      // Drafts are not in force; the planner sees them with a rest conflict (night, then morning the same day).
      expect((await api('emp', 'get', `/time/me/shifts?week=${d(2)}`).expect(200)).body.days.find((x: { on: string }) => x.on === d(2)).shift.name).not.toBe('Night');
      const plan = (await api('mgr', 'get', `/time/roster?week=${d(3)}`).expect(200)).body;
      const row = plan.people.find((p: { id: string }) => p.id === ids.empEmp);
      const cell3 = row.cells.find((x: { on: string }) => x.on === d(3));
      expect(cell3.conflicts.map((c: { kind: string }) => c.kind)).toContain('rest');
      await api('mgr', 'post', '/time/roster/publish').send({ week: d(2) }).expect(200);
      expect((await api('emp', 'get', `/time/me/shifts?week=${d(2)}`).expect(200)).body.days.find((x: { on: string }) => x.on === d(2)).shift.name).toBe('Night');
      // Withdrawing consent applies from its date: the next change is refused again (no other effect).
      const consent = await inA((tx) => tx.nightWorkConsent.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }));
      await api('hrAdmin', 'post', `/time/night/consents/${consent.id}/withdraw`).send({ on: d(10) }).expect(200);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: d(11), value: ids.N }] }).expect(409);
      await api('mgr', 'put', '/time/roster/cells').send({ cells: [{ employeeId: ids.empEmp, on: d(9), value: ids.N }] }).expect(200);
    });

    it('a swap goes to the colleague, then the manager, and changes both days once (P03)', async () => {
      await api('emp', 'post', '/time/me/swaps').send({ on: d(4), colleagueEmployeeId: ids.empBEmp, reason: 'x' }).expect(404);
      const s = (await api('peer', 'post', '/time/me/swaps').send({ on: d(1), colleagueEmployeeId: ids.empEmp, reason: 'Family function in the morning' }).expect(201)).body;
      // emp (a woman with consent until d(10)) would take the peer's Morning; the peer takes her pattern / location shift.
      const ask = (await inbox('emp')).find((t) => t.title.includes('swap shifts'))!;
      expect(ask.step.name).toBe('Colleague agrees');
      await decide('mgr', ask.taskId, 'approve').expect(404);
      await decide('emp', ask.taskId, 'approve').expect(200);
      const m = (await inbox('mgr')).find((t) => t.title.includes('swap shifts'))!;
      await decide('mgr', m.taskId, 'approve').expect(200);
      expect(await inA((tx) => tx.shiftSwapRequest.findFirstOrThrow({ where: { id: s.id } }))).toMatchObject({ status: 'approved' });
      const entries = await inA((tx) => tx.rosterEntry.findMany({ where: { organizationId: org.A.id, workOn: new Date(`${d(1)}T00:00:00Z`), source: 'swap' } }));
      expect(entries).toHaveLength(2);
      expect(entries.find((e) => e.employeeId === ids.empEmp)!.shiftId).toBe(ids.M);
    });
  });

  describe('overtime (Q7) and comp-off', () => {
    const work = async (who: string, on: string, inMin: number, outMin: number) => {
      await inA((tx) =>
        tx.punch.createMany({
          data: [
            { organizationId: org.A.id, employeeId: ids[`${who}Emp`], punchedAt: instantAt(on, 'Asia/Kolkata', inMin), workOn: new Date(`${on}T00:00:00Z`), kind: 'in', accepted: true, verdict: 'no_fence' },
            { organizationId: org.A.id, employeeId: ids[`${who}Emp`], punchedAt: instantAt(on, 'Asia/Kolkata', outMin), workOn: new Date(`${on}T00:00:00Z`), kind: 'out', accepted: true, verdict: 'no_fence' },
          ],
        }),
      );
      await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => dayEngine.evaluate(tx, { organizationId: org.A.id, isSuperAdmin: false }, ids[`${who}Emp`], on, on));
    };

    it('the rule decides; below the minimum is nothing; above, the manager approves and comp-off is credited once', async () => {
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'CO', name: 'Comp-off', kind: 'comp_off', paid: true }).expect(201);
      await api('hrAdmin', 'post', '/time/ot-rules').send({ name: 'Plant OT', scopeType: 'location', scopeId: ids.locA, validFrom: today, minMinutes: 30, roundMinutes: 15, dailyCapMinutes: 60, rateNormal: 2, rateWeeklyOff: 2, rateHoliday: 2, needsApproval: true, settle: 'comp_off', compOffHalfMinutes: 60, compOffFullMinutes: 240 }).expect(201);
      await api('emp', 'post', '/time/ot-rules').send({ name: 'Mine', scopeType: 'tenant', validFrom: today, minMinutes: 0, roundMinutes: 1, rateNormal: 4, rateWeeklyOff: 4, rateHoliday: 4, needsApproval: false, settle: 'pay', compOffHalfMinutes: 60, compOffFullMinutes: 240 }).expect(403);
      // The rule is from today, so today's work is claimed: the location's 9:30–6:30 day (510 minutes expected).
      await work('emp', today, 565, 1110 + 20); // 20 minutes past the end: nothing
      expect((await api('emp', 'post', '/time/me/overtime').send({ on: today, reason: 'Stayed on' }).expect(400)).body.message).toMatch(/below the 30 minutes/);
      await work('peer', today, 570, 1110 + 90); // 90 minutes past: 90 eligible, 60 within the cap, 30 over
      const claim = (await api('peer', 'post', '/time/me/overtime').send({ on: today, reason: 'Line 2 changeover' }).expect(201)).body;
      expect(claim).toMatchObject({ eligibleMinutes: 90, payableMinutes: 60, overCapMinutes: 30, settle: 'comp_off', compOffDays: 0.5, status: 'pending' });
      await api('peer', 'post', '/time/me/overtime').send({ on: today, reason: 'Again' }).expect(409);
      await api('emp', 'post', `/time/me/overtime/${claim.id}/withdraw`).expect(404);
      const t = (await inbox('mgr')).find((x) => x.title.includes('overtime'))!;
      expect(t.summary.find((s) => s.label === 'Settled as')!.value).toBe('Comp-off: 0.5 days');
      await decide('mgr', t.taskId, 'approve').expect(200);
      const credits = await inA((tx) => tx.leaveLedgerEntry.findMany({ where: { organizationId: org.A.id, employeeId: ids.peerEmp, kind: 'comp_off' } }));
      expect(credits.map((x) => Number(x.days))).toEqual([0.5]);
      // HR overrides the cap with a reason (never their own); the manager sees the claim, HR can override it.
      await api('emp', 'post', `/time/overtime/${claim.id}/override`).send({ reason: 'Because I say so' }).expect(403);
      const review = (await api('hrAdmin', 'get', `/time/overtime?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(review.claims.find((x: { id: string }) => x.id === claim.id).canOverride).toBe(true);
      expect((await api('mgr', 'get', `/time/overtime?month=${today.slice(0, 7)}`).expect(200)).body.claims.map((x: { id: string }) => x.id)).toContain(claim.id);
      await api('hrAdmin', 'post', `/time/overtime/${claim.id}/override`).send({ reason: 'Approved by the plant head for the audit' }).expect(200);
      await api('hrAdmin', 'post', `/time/overtime/${claim.id}/override`).send({ reason: 'Approved by the plant head for the audit' }).expect(409);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.ot.overridden' } }))).toBe(1);
    });
  });

  describe('timesheets (§B7)', () => {
    it('a week goes to the project manager through P03; approved hours are fixed', async () => {
      ids.project = (await api('hrAdmin', 'post', '/time/projects').send({ code: 'AUDIT', name: 'Audit readiness', managerUserId: users.boss, billable: false, activities: ['Docs', 'Checks'] }).expect(201)).body.id;
      const week = mondayOf(today);
      const line = { projectId: ids.project, activity: 'Docs', billable: false, minutes: [480, 480, 0, 0, 0, 0, 0] };
      await api('emp', 'put', '/time/me/timesheet').send({ week: addDays(week, 1), lines: [line] }).expect(400);
      await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [{ ...line, activity: 'Golf' }] }).expect(400);
      await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(200);
      const sheet = (await api('emp', 'post', '/time/me/timesheet/submit').send({ week }).expect(200)).body;
      expect(sheet.status).toBe('pending');
      await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(409);
      const t = (await inbox('boss')).find((x) => x.title.includes('timesheet'))!;
      expect(t.step.name).toBe('Project manager');
      await decide('boss', t.taskId, 'approve').expect(200);
      expect((await api('emp', 'get', `/time/me/timesheet?week=${week}`).expect(200)).body.sheet.status).toBe('approved');
      await api('peer', 'post', `/time/me/timesheet/${sheet.id}/withdraw`).expect(404);
    });
  });

  describe('maternity eligibility (YX-LV-10, founder decision 9 Oct 2026)', () => {
    it('refuses with the plain reason; HR overrides with a reason (audited), never on their own record', async () => {
      ids.ML = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'ML', name: 'Maternity leave', kind: 'maternity', paid: true, rules: { halfDays: false, sandwich: 'always', eligibleGenders: ['female'] } }).expect(201)).body.id;
      const plan = (who: Who, extra: object = {}) => api(who, 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.ML, from: d(30), to: d(100), expectedOn: d(60), maternityCase: 'birth', ...extra }).expect(200);
      expect((await plan('peer')).body.blocks).toEqual(expect.arrayContaining([expect.stringMatching(/not available to you/)]));
      const blocks = (await plan('emp')).body.blocks as string[];
      expect(blocks).toEqual(expect.arrayContaining([expect.stringMatching(/needs at least 80 days worked in the 12 months before the expected date\. Our records show \d+/)]));
      expect((await plan('emp', { expectedOn: undefined })).body.blocks).toEqual(expect.arrayContaining([expect.stringMatching(/expected date of delivery/)]));
      expect((await plan('emp', { from: d(1), to: d(200) })).body.blocks).toEqual(expect.arrayContaining([expect.stringMatching(/at most 26 weeks/), expect.stringMatching(/8 weeks before/)]));
      await api('hrExec', 'post', `/time/people/${ids.empEmp}/eligibility-override`).send({ leaveTypeId: ids.ML, validUntil: d(30), reason: 'Joined from a group company' }).expect(403);
      await api('hrAdmin', 'post', `/time/people/${ids.hrEmp}/eligibility-override`).send({ leaveTypeId: ids.ML, validUntil: d(30), reason: 'Joined from a group company' }).expect(403);
      await api('hrAdmin', 'post', `/time/people/${ids.empBEmp}/eligibility-override`).send({ leaveTypeId: ids.ML, validUntil: d(30), reason: 'Joined from a group company' }).expect(404);
      await api('hrAdmin', 'post', `/time/people/${ids.empEmp}/eligibility-override`).send({ leaveTypeId: ids.ML, validUntil: d(30), reason: 'Days worked at the group company count' }).expect(201);
      const after = (await plan('emp')).body.blocks as string[];
      expect(after.some((b) => /80 days/.test(b))).toBe(false);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'leave.eligibility.overridden' } }))).toBe(1);
    });
  });

  describe('period locks (P08), the payroll feed and registers', () => {
    it('lock needs the key and a fresh step-up; waiting requests stop it; then locked days refuse changes, in the API and the database', async () => {
      const fix = (await api('emp', 'post', '/time/me/regularise').send({ on: inLocked, kind: 'full_day', reason: 'Was at the supplier' }).expect(201)).body;
      await api('emp', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityA, month: lockMonth }).expect(403);
      await api('hrAdmin', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityA, month: lockMonth }).expect(403); // step-up first
      await markSteppedUp(tenantPrisma, token.hrAdmin);
      await api('hrAdmin', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityB, month: lockMonth }).expect(404);
      await api('hrAdmin', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityA, month: today.slice(0, 7) }).expect(400);
      const refused = (await api('hrAdmin', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityA, month: lockMonth }).expect(409)).body;
      expect(refused.message).toMatch(/1 attendance fixes waiting/);
      await api('emp', 'post', `/time/me/regularise/${fix.id}/withdraw`).expect(200);
      const locked = (await api('hrAdmin', 'post', '/time/periods/lock').send({ legalEntityId: ids.entityA, month: lockMonth }).expect(200)).body;
      expect(locked.frozen).toBeGreaterThan(0);
      // Regularisation, leave and OT on a locked day are refused in plain words.
      expect((await api('emp', 'post', '/time/me/regularise').send({ on: inLocked, kind: 'full_day', reason: 'Late fix' }).expect(409)).body.message).toMatch(/locked for attendance and leave/);
      await api('emp', 'post', '/time/me/overtime').send({ on: inLocked, reason: 'x' }).expect(409);
      // The database refuses it too (the app role, RLS on).
      await expect(inA((tx) => tx.punch.create({ data: { organizationId: org.A.id, employeeId: ids.empEmp, punchedAt: new Date(`${inLocked}T05:00:00Z`), workOn: new Date(`${inLocked}T00:00:00Z`), kind: 'in', accepted: true, verdict: 'no_fence' } }))).rejects.toThrow(/YX_PERIOD_LOCKED/);
      await expect(inA((tx) => tx.attendanceDay.updateMany({ where: { organizationId: org.A.id, employeeId: ids.empEmp, workOn: new Date(`${inLocked}T00:00:00Z`) }, data: { status: 'present' } }))).rejects.toThrow(/YX_PERIOD_LOCKED/);
      const periods = (await api('hrAdmin', 'get', `/time/periods?year=${lockMonth.slice(0, 4)}`).expect(200)).body;
      expect(periods.entities[0].months.find((m: { month: string }) => m.month === lockMonth).stage).toBe('locked');
    });

    it('the payroll feed is frozen at the lock, read with attendance.view in scope only', async () => {
      await api('emp', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${lockMonth}`).expect(403);
      await api('adminB', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${lockMonth}`).expect(404);
      const feed = (await api('hrAdmin', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${lockMonth}`).expect(200)).body;
      expect(feed.frozen).toBe(true);
      const emp = feed.rows.find((r: { employeeId: string }) => r.employeeId === ids.empEmp);
      expect(emp.paidDays + emp.lopDays).toBeLessThanOrEqual(emp.calendarDays);
      // HR's own row is not shown to HR.
      expect(feed.rows.some((r: { employeeId: string }) => r.employeeId === ids.hrEmp)).toBe(false);
      const live = (await api('hrAdmin', 'get', `/time/payroll-feed?legalEntityId=${ids.entityA}&month=${today.slice(0, 7)}`).expect(200)).body;
      expect(live.frozen).toBe(false);
    });

    it('registers: the state format with every legal column, as PDF and XLSX, audited', async () => {
      await api('emp', 'get', `/time/registers?month=${lockMonth}`).expect(403);
      const list = (await api('hrAdmin', 'get', `/time/registers?month=${lockMonth}`).expect(200)).body;
      const loc = list.locations.find((l: { id: string }) => l.id === ids.locA);
      expect(loc).toMatchObject({ state: 'IN-TN', locked: true });
      expect(loc.formats.map((f: { type: string }) => f.type)).toEqual(['muster', 'leave']);
      const pdf = await api('hrAdmin', 'get', `/time/registers/muster/export?locationId=${ids.locA}&month=${lockMonth}&format=pdf`).buffer(true).parse(binary).expect(200);
      expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const xlsx = await api('hrAdmin', 'get', `/time/registers/leave/export?locationId=${ids.locA}&month=${lockMonth}&format=xlsx`).buffer(true).parse(binary).expect(200);
      expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
      await api('adminB', 'get', `/time/registers/muster/export?locationId=${ids.locA}&month=${lockMonth}&format=pdf`).expect(404);
      expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'time.register.exported' } }))).toBe(2);
    });

    it('unlock needs step-up and a reason; the frozen feed is superseded and changes are allowed again', async () => {
      await api('hrAdmin', 'post', '/time/periods/unlock').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'short' }).expect(400);
      await api('hrAdmin', 'post', '/time/periods/unlock').send({ legalEntityId: ids.entityA, month: lockMonth, reason: 'Wrong shift data for the plant' }).expect(200);
      expect(await inA((tx) => tx.payrollFeedRow.count({ where: { organizationId: org.A.id, supersededAt: null } }))).toBe(0);
      const fix = (await api('emp', 'post', '/time/me/regularise').send({ on: inLocked, kind: 'full_day', reason: 'Now open' }).expect(201)).body;
      await api('emp', 'post', `/time/me/regularise/${fix.id}/withdraw`).expect(200);
      const actions = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { in: ['time.period.locked', 'time.period.unlocked'] } }, select: { action: true } }));
      expect(actions.map((a) => a.action).sort()).toEqual(['time.period.locked', 'time.period.unlocked']);
    });
  });
});
