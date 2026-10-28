import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays } from '../src/time/time-maths';
import { mondayOf } from '../src/time/time-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-41 hybrid office days and TIM-43 timesheet suggestions, end to end against the real database (forced RLS, the app
// role): planning this and next week (anchor, holiday, leave, past and started days refused), the manager's team and
// reach (404 outside it and for another company), weekly compliance from office evidence, "no rule", reminders once a
// day, the HR policy read; work-tool connections (one live per tool, audited disconnect) and suggestions that never
// write the timesheet, only when the company turned them on; acting for someone else refused.
describe('Time · hybrid office days and timesheet suggestions (TIM-41 / TIM-43)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrExec' | 'mgr' | 'emp' | 'peer' | 'nor' | 'other' | 'empB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const thisWeek = mondayOf(today);
  const nw = addDays(thisWeek, 7);
  const lastWeek = addDays(thisWeek, -7);
  const setting = (key: string, value: string, scopeType = 'tenant', scopeId?: string) => api('adminA', 'put', '/org/settings').send({ key, scopeType, ...(scopeId ? { scopeId } : {}), value }).expect(200);
  const plan = (who: Who, days: { on: string; place: string }[], employeeId?: string) => api(who, 'put', '/time/hybrid/plan').send({ ...(employeeId ? { employeeId } : {}), days });
  const auditCount = (action: string) => inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action } }));

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

    planId = (await prisma.plan.create({ data: { name: `hybrid-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Hybrid Org ${k}`, slug: `hybrid-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrExec', 'A', 'panel', ['attendance.view']],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['nor', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hybrid-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hybrid-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Hybrid Foods ${k}`, shortName: `HF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata', geoLat: 13.0, geoLng: 80.25, geoRadiusM: 200 } })).id;
        for (const [key, name, code] of [['dept', 'Quality', 'QA'], ['dept2', 'Stores', 'ST']]) {
          const deptId = randomUUID();
          ids[`${key}${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name, code, path: `/${deptId}/` } })).id;
        }
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'QA engineer', code: 'QE' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Mon–Fri working days; Saturday and Sunday off.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2025-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: 6 }, { weekday: 7 }] } });
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A', dept = 'dept') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(today, -60), userId: users[who], workEmail: `${who}@hybrid-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`${dept}${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.norEmp = await hire('adminA', 'nor', ids.mgrEmp, 'A', 'dept2');
    ids.otherEmp = await hire('adminA', 'other', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
    // Next week: a holiday on Thursday; the employee on leave on Friday.
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const cal = await tx.holidayCalendar.create({ data: { ...o, name: 'Chennai 2026', locationId: ids.locA } });
      await tx.holiday.create({ data: { ...o, calendarId: cal.id, holidayOn: new Date(`${addDays(nw, 3)}T00:00:00Z`), name: 'Founders Day' } });
      const lt = await tx.leaveType.create({ data: { ...o, code: 'CL', name: 'Casual leave', kind: 'casual' } });
      const req = await tx.leaveRequest.create({ data: { ...o, employeeId: ids.empEmp, leaveTypeId: lt.id, fromOn: new Date(`${addDays(nw, 4)}T00:00:00Z`), toOn: new Date(`${addDays(nw, 4)}T00:00:00Z`), days: 1, status: 'approved' } });
      await tx.leaveRequestDay.create({ data: { ...o, requestId: req.id, employeeId: ids.empEmp, leaveOn: new Date(`${addDays(nw, 4)}T00:00:00Z`), part: 'full', portion: 1, countedAs: 'leave' } });
    });
    // The policy: 3 office days with Wednesday as anchor; the Stores department has no rule.
    await setting('hybrid.office_days', '3');
    await setting('hybrid.anchor_days', 'wed');
    await setting('hybrid.office_days', '0', 'department', ids.dept2A);
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

  it('hybrid_plan_days and tool_connections have forced RLS with the tenant policy', async () => {
    const tables = ['hybrid_plan_days', 'tool_connections'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
  });

  describe('TIM-41 · plan my office days', () => {
    it('my week: the rule, anchor Wednesday, the holiday and leave days closed', async () => {
      const me = (await api('emp', 'get', `/time/hybrid/me?week=${nw}`).expect(200)).body;
      expect(me.rule).toEqual({ officeDays: 3, anchors: [2], evidence: ['geofence', 'network', 'kiosk'] });
      expect(me.days.map((d: { on: string }) => d.on)).toEqual([0, 1, 2, 3, 4].map((k) => addDays(nw, k)));
      expect(me.days[2]).toMatchObject({ anchor: true, place: 'office', closed: null });
      expect(me.days[3]).toMatchObject({ closed: 'holiday', note: 'Founders Day' });
      expect(me.days[4]).toMatchObject({ closed: 'leave' });
      expect(me.can).toEqual({ team: false, compliance: false, policy: false });
      expect((await api('mgr', 'get', '/time/hybrid/me').expect(200)).body.can).toEqual({ team: true, compliance: true, policy: false });
      expect((await api('adminA', 'get', '/time/hybrid/me').expect(200)).body).toMatchObject({ employee: null, can: { policy: true } });
      await api('emp', 'get', `/time/hybrid/me?week=${lastWeek}`).expect(400);
      await api('emp', 'get', '/time/hybrid/me?week=31-12-2026').expect(400);
    });

    it('plans open days; a repeat is idempotent (one audit row)', async () => {
      const days = [{ on: nw, place: 'office' }, { on: addDays(nw, 1), place: 'home' }, { on: addDays(nw, 2), place: 'office' }];
      expect((await plan('emp', days).expect(200)).body).toMatchObject({ employeeId: ids.empEmp, changed: 3 });
      const audits = await auditCount('time.hybrid.planned');
      expect((await plan('emp', days).expect(200)).body.changed).toBe(0);
      expect(await auditCount('time.hybrid.planned')).toBe(audits);
      const me = (await api('emp', 'get', `/time/hybrid/me?week=${nw}`).expect(200)).body;
      expect(me.days.slice(0, 3).map((d: { place: string }) => d.place)).toEqual(['office', 'home', 'office']);
      // The colleague with the same manager sees who is in.
      await plan('peer', [{ on: nw, place: 'office' }]).expect(200);
      const peer = (await api('peer', 'get', `/time/hybrid/me?week=${nw}`).expect(200)).body;
      expect(peer.colleagues[0].names).toEqual([`emp ${run}`]);
    });

    it('refuses: past or started days, holiday, leave, weekend, anchor as home, other weeks, repeats in one call, bad input', async () => {
      expect((await plan('emp', [{ on: thisWeek, place: 'office' }]).expect(400)).body.message).toMatch(/over|started/);
      expect((await plan('emp', [{ on: addDays(nw, 3), place: 'office' }]).expect(400)).body.message).toMatch(/holiday/);
      expect((await plan('emp', [{ on: addDays(nw, 4), place: 'office' }]).expect(400)).body.message).toMatch(/on leave/);
      expect((await plan('emp', [{ on: addDays(nw, 5), place: 'office' }]).expect(400)).body.message).toMatch(/Saturday/);
      expect((await plan('emp', [{ on: addDays(nw, 2), place: 'home' }]).expect(400)).body.message).toBe('Wednesday is an anchor day: everyone is in the office.');
      await plan('emp', [{ on: addDays(nw, 7), place: 'office' }]).expect(400);
      await plan('emp', [{ on: nw, place: 'office' }, { on: nw, place: 'home' }]).expect(400);
      await plan('emp', [{ on: nw, place: 'garden' }]).expect(400);
      await plan('emp', [{ on: '2026/11/02', place: 'office' }]).expect(400);
      await plan('emp', []).expect(400);
      await api('emp', 'put', '/time/hybrid/plan').send({ days: [{ on: nw, place: 'office' }], extra: 1 }).expect(400);
      // Nothing of the refused calls was stored.
      const rows = await inA((tx) => tx.hybridPlanDay.findMany({ where: { organizationId: org.A.id, employeeId: ids.empEmp } }));
      expect(rows).toHaveLength(3);
    });

    it("someone else's plan: 404 for a colleague, another company or out of the manager's reach; the manager plans the team", async () => {
      await plan('emp', [{ on: nw, place: 'office' }], ids.peerEmp).expect(404);
      await plan('adminB', [{ on: nw, place: 'office' }], ids.empEmp).expect(404);
      await plan('mgr', [{ on: nw, place: 'office' }], ids.otherEmp).expect(404);
      await plan('mgr', [{ on: addDays(nw, 1), place: 'office' }], ids.empEmp).expect(200);
      const last = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'time.hybrid.planned', entityId: ids.empEmp }, orderBy: { createdAt: 'desc' } }));
      expect(JSON.parse(last?.metadataJson ?? "{}")).toMatchObject({ by: 'team', days: [{ on: addDays(nw, 1), from: 'home', to: 'office' }] });
    });

    it('no rule (office days 0): the page says so and planning is refused', async () => {
      const me = (await api('nor', 'get', `/time/hybrid/me?week=${nw}`).expect(200)).body;
      expect(me.rule.officeDays).toBe(0);
      expect((await plan('nor', [{ on: nw, place: 'office' }]).expect(409)).body.message).toMatch(/no office-day rule/);
    });

    it('acting for someone else is refused', async () => {
      token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken;
      await plan('acting', [{ on: nw, place: 'home' }]).expect(403);
      await api('acting', 'post', '/time/hybrid/remind').send({ employeeId: ids.peerEmp, week: nw }).expect(403);
      await api('acting', 'post', '/time/tools/calendar/connect').expect(403);
    });
  });

  describe('TIM-41 · the team plan and compliance', () => {
    it('the manager sees their own team only; others are refused', async () => {
      const team = (await api('mgr', 'get', `/time/hybrid/team?week=${nw}`).expect(200)).body;
      expect(team.people.map((p: { employeeId: string }) => p.employeeId).sort()).toEqual([ids.empEmp, ids.peerEmp, ids.norEmp].sort());
      expect(team.people.find((p: { employeeId: string }) => p.employeeId === ids.empEmp).days[1].place).toBe('office');
      await api('emp', 'get', '/time/hybrid/team').expect(403);
      await api('mgr', 'get', `/time/hybrid/team?week=${lastWeek}`).expect(400);
    });

    it('compliance counts office evidence (geofence, network, kiosk), flags planned days without it, and "no rule"', async () => {
      await inA(async (tx) => {
        const o = { organizationId: org.A.id };
        const at = (on: string) => ({ punchedAt: new Date(`${on}T04:00:00Z`), workOn: new Date(`${on}T00:00:00Z`) });
        await tx.hybridPlanDay.createMany({ data: [0, 1, 3].map((k) => ({ ...o, employeeId: ids.empEmp, workOn: new Date(`${addDays(lastWeek, k)}T00:00:00Z`), place: 'office' })) });
        await tx.hybridPlanDay.createMany({ data: [0, 1].map((k) => ({ ...o, employeeId: ids.peerEmp, workOn: new Date(`${addDays(lastWeek, k)}T00:00:00Z`), place: 'office' })) });
        await tx.punch.createMany({
          data: [
            { ...o, employeeId: ids.empEmp, ...at(addDays(lastWeek, 0)), kind: 'in', source: 'web', accepted: true, verdict: 'inside' },
            { ...o, employeeId: ids.empEmp, ...at(addDays(lastWeek, 1)), kind: 'in', source: 'web', accepted: true, verdict: 'network' },
            { ...o, employeeId: ids.empEmp, ...at(addDays(lastWeek, 2)), kind: 'in', source: 'kiosk', accepted: true, verdict: 'inside' },
            // From home, and a refused punch: not evidence.
            { ...o, employeeId: ids.peerEmp, ...at(addDays(lastWeek, 0)), kind: 'in', source: 'web', accepted: true, verdict: 'field' },
            { ...o, employeeId: ids.peerEmp, ...at(addDays(lastWeek, 1)), kind: 'in', source: 'web', accepted: false, refusal: 'Outside the office', verdict: 'outside' },
            { ...o, employeeId: ids.peerEmp, ...at(addDays(lastWeek, 2)), kind: 'in', source: 'web', accepted: true, verdict: 'inside' },
          ],
        });
      });
      const res = (await api('mgr', 'get', '/time/hybrid/compliance').expect(200)).body;
      expect(res.week).toBe(lastWeek);
      const row = (id: string) => res.people.find((p: { employeeId: string }) => p.employeeId === id);
      expect(row(ids.empEmp)).toMatchObject({ target: 3, planned: 4, office: 3, met: true, short: 0, missed: [addDays(lastWeek, 3)] });
      expect(row(ids.peerEmp)).toMatchObject({ target: 3, office: 1, met: false, short: 2, missed: [addDays(lastWeek, 0), addDays(lastWeek, 1)] });
      expect(row(ids.norEmp)).toMatchObject({ noRule: true, met: false });
      expect(row(ids.otherEmp)).toBeUndefined();
      // Kiosk check-ins no longer count once HR drops "kiosk" from the evidence.
      await setting('hybrid.evidence', 'geofence,network');
      expect((await api('mgr', 'get', '/time/hybrid/compliance').expect(200)).body.people.find((p: { employeeId: string }) => p.employeeId === ids.empEmp)).toMatchObject({ office: 2, met: false, short: 1 });
      await setting('hybrid.evidence', 'geofence,network,kiosk');
    });

    it('HR with attendance.view sees everyone in scope; an employee and another company are refused', async () => {
      const hr = (await api('hrExec', 'get', `/time/hybrid/compliance?week=${lastWeek}`).expect(200)).body;
      expect(hr.people.map((p: { employeeId: string }) => p.employeeId)).toEqual(expect.arrayContaining([ids.empEmp, ids.otherEmp, ids.mgrEmp]));
      await api('emp', 'get', '/time/hybrid/compliance').expect(403);
      expect((await api('adminB', 'get', '/time/hybrid/compliance').expect(200)).body.people.map((p: { employeeId: string }) => p.employeeId)).toEqual([ids.empBEmp]);
      await api('mgr', 'get', `/time/hybrid/compliance?week=${nw}`).expect(400);
    });

    it('reminders: the manager reminds a team member once a day; self, out of reach and no rule are refused', async () => {
      expect((await api('mgr', 'post', '/time/hybrid/remind').send({ employeeId: ids.peerEmp, week: nw }).expect(200)).body).toMatchObject({ sent: true, week: nw });
      expect((await api('mgr', 'post', '/time/hybrid/remind').send({ employeeId: ids.peerEmp, week: nw }).expect(409)).body.message).toMatch(/already reminded today/);
      await api('emp', 'post', '/time/hybrid/remind').send({ employeeId: ids.peerEmp, week: nw }).expect(404);
      await api('mgr', 'post', '/time/hybrid/remind').send({ employeeId: ids.otherEmp, week: nw }).expect(404);
      await api('mgr', 'post', '/time/hybrid/remind').send({ employeeId: ids.norEmp, week: nw }).expect(409);
      await api('mgr', 'post', '/time/hybrid/remind').send({ employeeId: ids.empEmp, week: lastWeek }).expect(400);
      await api('adminB', 'post', '/time/hybrid/remind').send({ employeeId: ids.empEmp, week: nw }).expect(404);
      const bell = await inA((tx) => tx.userNotification.count({ where: { organizationId: org.A.id, recipientUserId: users.peer, linkPath: '/yx/time/hybrid' } }));
      expect(bell).toBe(1);
    });

    it('the policy read: HR (org.settings.manage) only; groups with their own values and what applies', async () => {
      await api('hrExec', 'get', '/time/hybrid/policy').expect(403);
      await api('emp', 'get', '/time/hybrid/policy').expect(403);
      const p = (await api('adminA', 'get', '/time/hybrid/policy').expect(200)).body;
      expect(p.groups[0]).toMatchObject({ scopeType: 'tenant', own: { officeDays: '3', anchors: 'wed' }, applies: { officeDays: 3, anchors: [2] } });
      expect(p.groups.find((g: { scopeId: string }) => g.scopeId === ids.dept2A)).toMatchObject({ own: { officeDays: '0' }, applies: { officeDays: 0, anchors: [2] } });
      expect(p.groups.find((g: { scopeId: string }) => g.scopeId === ids.locA)).toMatchObject({ own: { officeDays: null }, applies: { officeDays: 3 } });
      // Company B sees only its own groups and the defaults.
      const b = (await api('adminB', 'get', '/time/hybrid/policy').expect(200)).body;
      expect(b.groups[0].applies.officeDays).toBe(0);
      expect(b.groups.some((g: { scopeId: string }) => g.scopeId === ids.locA)).toBe(false);
    });
  });

  describe('TIM-43 · timesheet suggestions from my tools', () => {
    it('off by default: tools say not set up, connect and suggestions answer 403 in plain words', async () => {
      expect((await api('emp', 'get', '/time/tools').expect(200)).body).toMatchObject({ enabled: false });
      expect((await api('emp', 'post', '/time/tools/calendar/connect').expect(403)).body.message).toMatch(/not set up/);
      await api('emp', 'get', `/time/tools/suggestions?week=${thisWeek}`).expect(403);
    });

    it('turned on: connect twice keeps one live connection; unknown tools are refused', async () => {
      await setting('timesheet.tool_suggestions', 'on', 'legal_entity', ids.entityA);
      await inA((tx) => tx.timesheetProject.create({ data: { organizationId: org.A.id, code: 'FSSAI-AUDIT', name: 'FSSAI audit readiness', activities: ['Documentation', 'Line checks'] } }));
      const first = (await api('emp', 'post', '/time/tools/calendar/connect').expect(200)).body;
      expect(first).toMatchObject({ provider: 'calendar', repeat: false });
      expect((await api('emp', 'post', '/time/tools/calendar/connect').expect(200)).body).toMatchObject({ repeat: true });
      await api('emp', 'post', '/time/tools/issues/connect').expect(200);
      await api('emp', 'post', '/time/tools/slack/connect').expect(400);
      const live = await inA((tx) => tx.toolConnection.count({ where: { organizationId: org.A.id, userId: users.emp, status: 'connected' } }));
      expect(live).toBe(2);
      const tools = (await api('emp', 'get', '/time/tools').expect(200)).body;
      expect(tools.enabled).toBe(true);
      expect(tools.tools.filter((t: { connected: boolean }) => t.connected).map((t: { provider: string }) => t.provider)).toEqual(['calendar', 'issues']);
      // Another person's tools are their own.
      expect((await api('peer', 'get', '/time/tools').expect(200)).body.tools.every((t: { connected: boolean }) => !t.connected)).toBe(true);
    });

    it('suggestions map onto active projects ("choose a project" when unknown) and never write the timesheet', async () => {
      const res = (await api('emp', 'get', `/time/tools/suggestions?week=${lastWeek}`).expect(200)).body;
      expect(res.upTo).toBe(addDays(lastWeek, 6));
      const fssai = res.lines.find((l: { date: string; provider: string }) => l.provider === 'calendar' && l.date === lastWeek);
      expect(fssai).toMatchObject({ minutes: 120, activity: 'Line checks', kind: 'rule' });
      expect(fssai.projectId).toEqual(expect.any(String));
      expect(res.lines.find((l: { projectHint: string }) => l.projectHint === 'Client workshop')).toMatchObject({ projectId: null });
      expect(res.lines.some((l: { provider: string }) => l.provider === 'code')).toBe(false);
      expect(await inA((tx) => tx.timesheet.count({ where: { organizationId: org.A.id } }))).toBe(0);
      expect(await inA((tx) => tx.timesheetLine.count({ where: { organizationId: org.A.id } }))).toBe(0);
      await api('emp', 'get', `/time/tools/suggestions?week=${addDays(lastWeek, 1)}`).expect(400);
      await api('emp', 'get', `/time/tools/suggestions?week=${nw}`).expect(400);
      await api('emp', 'get', '/time/tools/suggestions').expect(400);
      // Another company's switch is its own: company B is still off.
      await api('empB', 'get', `/time/tools/suggestions?week=${lastWeek}`).expect(403);
    });

    it('disconnect is audited and stops the suggestions of that tool; a repeat does nothing', async () => {
      const before = await auditCount('time.tools.disconnected');
      expect((await api('emp', 'post', '/time/tools/calendar/disconnect').expect(200)).body).toMatchObject({ repeat: false });
      expect((await api('emp', 'post', '/time/tools/calendar/disconnect').expect(200)).body).toMatchObject({ repeat: true });
      expect(await auditCount('time.tools.disconnected')).toBe(before + 1);
      const res = (await api('emp', 'get', `/time/tools/suggestions?week=${lastWeek}`).expect(200)).body;
      expect(res.lines.every((l: { provider: string }) => l.provider === 'issues')).toBe(true);
      // Connecting again makes a new live connection; the revoked one stays as a record.
      await api('emp', 'post', '/time/tools/calendar/connect').expect(200);
      expect(await inA((tx) => tx.toolConnection.count({ where: { organizationId: org.A.id, userId: users.emp, provider: 'calendar' } }))).toBe(2);
      // Turned off later: disconnecting still works, suggestions stop.
      await setting('timesheet.tool_suggestions', 'off', 'legal_entity', ids.entityA);
      await api('emp', 'get', `/time/tools/suggestions?week=${lastWeek}`).expect(403);
      await api('emp', 'post', '/time/tools/issues/disconnect').expect(200);
    });
  });
});
