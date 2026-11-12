import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ProjectsService } from '../src/projects/projects.service';
import { mondayOf } from '../src/time/time-rules';

// Projects P-1 end to end (founder answers 1401 to 1405, 1412, 1420): Projects is off until a System Admin switches it
// on; one project list with Time (no duplicates); projects.manage creates and edits, the project's manager runs the
// team, tasks and milestones, nobody else edits; only allocated people book time (setting, default on); burn alerts
// fire once per level at the company's thresholds; fee and cost are for Projects finance only; another company never
// sees a project (404); acting for someone else 403; bad input 400; stale writes 409.

jest.setTimeout(240_000);

describe('Projects P-1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let projects: ProjectsService;
  let notify: jest.SpyInstance;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'boss' | 'fin' | 'pm' | 'emp' | 'peer' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const week = mondayOf(today);
  const settings = (who: Who, changes: { key: string; value: string }[]) => api(who, 'put', '/projects/settings').send({ changes });
  const project = (over: Record<string, unknown> = {}) => ({ code: 'APOLLO', name: 'Apollo rollout', managerUserId: users.pm, billingModel: 'non_billable', startOn: week, budgetHours: 20, ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    projects = moduleRef.get(ProjectsService);
    notify = jest.spyOn(moduleRef.get(NotificationsService), 'notifySystem');

    planId = (await prisma.plan.create({ data: { name: `prj1-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PRJ1 Org ${k}`, slug: `prj1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['boss', 'A', 'panel', ['projects.view', 'projects.manage']],
      ['fin', 'A', 'panel', ['projects.view', 'projects.finance']],
      ['pm', 'A', 'panel', []],
      ['emp', 'A', 'panel', []],
      ['peer', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prj1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@prj1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.boss}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Prj Foods', shortName: `PRJ-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    for (const who of ['pm', 'emp', 'peer'] as const) {
      ids[`${who}Emp`] = (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(week, -60), userId: users[who], workEmail: `${who}@prj1-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(want(201))
      ).body.id;
    }
    // Time's simple project from before Projects (answer 1402): it must carry over, not be listed twice.
    ids.old = (await inA((tx) => tx.timesheetProject.create({ data: { organizationId: org.A.id, code: 'OLDAUDIT', name: 'Audit readiness', activities: ['Docs', 'Checks'] } }))).id;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the new tables have forced RLS with the tenant and portal policies', async () => {
    const tables = ['project_allocations', 'project_tasks', 'project_milestones'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean; portal: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'portal_none') AS portal
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true, portal: true });
  });

  it('Projects is off by default: its pages refuse and the menu hides it; only a System Admin switches it on (audited)', async () => {
    expect((await api('boss', 'get', '/projects/status').expect(200)).body).toMatchObject({ enabled: false, canOpen: false });
    expect((await api('boss', 'get', '/projects').expect(403)).body.code).toBe('PROJECTS_OFF');
    // Walk 12 Nov: someone with no Projects key is told they have no access, not that Projects is off.
    expect((await api('emp', 'get', '/projects').expect(403)).body.code).toBeUndefined();
    await api('boss', 'post', '/projects').send(project()).expect(403);
    // Settings 3.11: Projects managers read it, nobody else; the defaults are the founder's (1401, 1404, 1405).
    expect((await api('boss', 'get', '/projects/settings').expect(want(200))).body).toMatchObject({ canEdit: false, values: { 'projects.enabled': 'off', 'projects.booking.allocated_only': 'on', 'projects.burn.warn_pct': '80', 'projects.burn.over_pct': '100' } });
    await api('emp', 'get', '/projects/settings').expect(403);
    await settings('boss', [{ key: 'projects.enabled', value: 'on' }]).expect(403);
    await settings('acting', [{ key: 'projects.enabled', value: 'on' }]).expect(403);
    for (const bad of [[{ key: 'projects.enabled', value: 'yes' }], [{ key: 'staffing.desk.enabled', value: 'on' }], [{ key: 'projects.burn.warn_pct', value: '90' }, { key: 'projects.burn.over_pct', value: '90' }], []])
      await settings('admin', bad).expect(400);
    expect((await settings('admin', [{ key: 'projects.enabled', value: 'on' }]).expect(want(200))).body.canEdit).toBe(true);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'org.setting.changed', actorUserId: users.admin } }))).toBe(1);
    expect((await api('boss', 'get', '/projects/status').expect(200)).body).toMatchObject({ enabled: true, canOpen: true });
    expect((await api('emp', 'get', '/projects/status').expect(200)).body).toMatchObject({ enabled: true, canOpen: false });
    expect((await api('adminB', 'get', '/projects/status').expect(200)).body.enabled).toBe(false);
  });

  it("Time's old projects carry over as projects (one list, no duplicates); the old Time editor is gone", async () => {
    const rows = (await api('boss', 'get', '/projects').expect(want(200))).body.rows as { id: string; code: string; status: string; billingModel: string }[];
    expect(rows.filter((r) => r.code === 'OLDAUDIT')).toEqual([expect.objectContaining({ id: ids.old, status: 'active', billingModel: 'non_billable' })]);
    await api('boss', 'post', '/time/projects').send({ code: 'X', name: 'X' }).expect(404);
    await api('boss', 'post', '/projects').send(project({ code: 'OLDAUDIT' })).expect(409);
  });

  it('projects.manage creates and edits; fee and cost are Projects finance only; nobody else edits; bad input 400, stale 409', async () => {
    for (const who of ['pm', 'emp', 'fin'] as const) await api(who, 'post', '/projects').send(project()).expect(403);
    await api('acting', 'post', '/projects').send(project()).expect(403);
    await api('boss', 'post', '/projects').send(project({ fee: 100000 })).expect(403);
    for (const bad of [{ code: 'lower' }, { name: '' }, { billingModel: 'barter' }, { budgetHours: -1 }, { startOn: '2026-02-30' }, { extra: 1 }]) await api('boss', 'post', '/projects').send(project(bad)).expect(400);
    // A billable project needs a client (answer 1403).
    expect((await api('boss', 'post', '/projects').send(project({ code: 'BILL', billingModel: 'time_material' })).expect(400)).body.message).toMatch(/needs a client/);
    ids.p = (await api('boss', 'post', '/projects').send(project()).expect(want(201))).body.id;
    await api('boss', 'post', `/projects/${ids.p}/status`).send({ status: 'active', version: 1 }).expect(want(200));
    await api('boss', 'post', `/projects/${ids.p}/status`).send({ status: 'on_hold', version: 1 }).expect(409);
    // The manager runs it but does not edit its details; others neither.
    await api('pm', 'put', `/projects/${ids.p}`).send({ ...project({ name: 'Renamed' }), version: 2 }).expect(403);
    await api('emp', 'put', `/projects/${ids.p}`).send({ ...project({ name: 'Renamed' }), version: 2 }).expect(403);
    // Someone with no key who does not run it never sees it: 404, not 403.
    await api('emp', 'get', `/projects/${ids.p}`).expect(404);
    await api('emp', 'post', `/projects/${ids.p}/tasks`).send({ name: 'Build', billable: false }).expect(404);
    await api('fin', 'post', `/projects/${ids.p}/tasks`).send({ name: 'Build', billable: false }).expect(403);
    // Finance sees fee and cost; others never get them.
    await api('fin', 'put', `/projects/${ids.p}`).send({ ...project(), fee: 500000, budgetCost: 300000, version: 2 }).expect(403);
    await api('boss', 'put', `/projects/${ids.p}`).send({ ...project({ name: 'Apollo rollout phase 1' }), version: 2 }).expect(want(200));
    const asBoss = (await api('boss', 'get', `/projects/${ids.p}`).expect(200)).body;
    expect(asBoss.project).not.toHaveProperty('fee');
    expect(asBoss.project.name).toBe('Apollo rollout phase 1');
    expect((await api('fin', 'get', `/projects/${ids.p}`).expect(200)).body.project).toHaveProperty('fee');
    // The manager: their own project in the list, with no key.
    expect(((await api('pm', 'get', '/projects').expect(want(200))).body.rows as { id: string }[]).map((r) => r.id)).toEqual([ids.p]);
    await api('pm', 'post', `/projects/${ids.p}/tasks`).send({ name: 'Build', billable: false, budgetHours: 16 }).expect(want(201));
    await api('pm', 'post', `/projects/${ids.p}/milestones`).send({ name: 'Go-live', pct: 50, dueOn: addDays(week, 30) }).expect(400); // fixed fee only
  });

  it('a company never sees another company’s projects', async () => {
    await settings('adminB', [{ key: 'projects.enabled', value: 'on' }]).expect(want(200));
    expect((await api('adminB', 'get', '/projects').expect(want(200))).body.rows).toEqual([]);
    await api('adminB', 'get', `/projects/${ids.p}`).expect(404);
    await api('adminB', 'put', `/projects/${ids.p}`).send({ ...project(), version: 3 }).expect(404);
    await api('adminB', 'post', `/projects/${ids.p}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent: 50 }).expect(404);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.timesheetProject.count({ where: { id: ids.p } }))).toBe(0);
  });

  it('only allocated people book time (1404, default on); overlapping allocations are refused; the company can switch it off', async () => {
    await api('emp', 'post', `/projects/${ids.p}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent: 50 }).expect(404);
    await api('fin', 'post', `/projects/${ids.p}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent: 50 }).expect(403);
    const line = { projectId: ids.p, activity: 'Build', billable: false, minutes: [480, 480, 0, 0, 0, 0, 0] };
    expect((await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(400)).body.message).toMatch(/not allocated to APOLLO/);
    await api('pm', 'post', `/projects/${ids.p}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent: 50, tentative: true }).expect(want(201));
    // Tentative does not count.
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(400);
    const a = (await api('pm', 'get', `/projects/${ids.p}`).expect(200)).body.allocations[0];
    await api('pm', 'put', `/projects/${ids.p}/allocations/${a.id}`).send({ fromOn: week, percent: 50, tentative: false, version: a.version }).expect(want(200));
    await api('pm', 'post', `/projects/${ids.p}/allocations`).send({ employeeId: ids.empEmp, fromOn: addDays(week, 3), percent: 20 }).expect(409);
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(want(200));
    // The person not allocated still cannot; with the rule off, they can.
    await api('peer', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(400);
    await settings('admin', [{ key: 'projects.booking.allocated_only', value: 'off' }]).expect(want(200));
    await api('peer', 'put', '/time/me/timesheet').send({ week, lines: [{ ...line, minutes: [60, 0, 0, 0, 0, 0, 0] }] }).expect(want(200));
    await settings('admin', [{ key: 'projects.booking.allocated_only', value: 'on' }]).expect(want(200));
  });

  it('burn alerts fire once per level at the thresholds (80% then 100%) to the manager and Projects finance', async () => {
    // The timesheet note (1731 to 1736) has its own suite (timesheet-note); this week goes without notes.
    await settings('admin', [{ key: 'timesheet.note.required', value: 'off' }]).expect(want(200));
    await api('emp', 'post', '/time/me/timesheet/submit').send({ week }).expect(want(200)); // 16 h of 20 h = 80%
    notify.mockClear();
    expect(await projects.burnSweep([org.A.id])).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([users.pm, users.fin]), 'projects.burn', expect.objectContaining({ entityId: ids.p, linkPath: `/yx/projects/${ids.p}` }), expect.objectContaining({ subject: 'Budget burn 80%: APOLLO' }));
    expect(notify.mock.calls[0]![1]).not.toContain(users.emp);
    expect(await projects.burnSweep([org.A.id])).toBe(0); // once per level
    const v = (await api('boss', 'get', `/projects/${ids.p}`).expect(200)).body.project.version;
    await api('boss', 'put', `/projects/${ids.p}`).send({ ...project({ name: 'Apollo rollout phase 1', budgetHours: 16 }), version: v }).expect(want(200));
    notify.mockClear();
    expect(await projects.burnSweep([org.A.id])).toBe(1);
    expect(notify.mock.calls[0]![4]).toMatchObject({ subject: 'Budget burn 100%: APOLLO' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'projects.burn.alert', entityId: ids.p } }))).toBe(2);
    // Under the first threshold: no alert (another project, 1 h of 20 h).
    expect(await projects.burnSweep([org.A.id])).toBe(0);
  });

  it('a closed project takes no new time or team changes; reopening allows them again', async () => {
    const v = (await api('boss', 'get', `/projects/${ids.p}`).expect(200)).body.project.version;
    await api('boss', 'post', `/projects/${ids.p}/status`).send({ status: 'draft', version: v }).expect(400);
    await api('boss', 'post', `/projects/${ids.p}/status`).send({ status: 'closed', version: v }).expect(want(200));
    await api('pm', 'post', `/projects/${ids.p}/tasks`).send({ name: 'Late', billable: false }).expect(409);
    const next = addDays(week, 7);
    if (next <= addDays(today, 7)) await api('emp', 'put', '/time/me/timesheet').send({ week: next, lines: [{ projectId: ids.p, activity: 'Build', billable: false, minutes: [60, 0, 0, 0, 0, 0, 0] }] }).expect(400);
    await api('boss', 'post', `/projects/${ids.p}/status`).send({ status: 'active', version: v + 1 }).expect(want(200));
  });
});
