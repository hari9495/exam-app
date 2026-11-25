import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { mondayOf } from '../src/time/time-rules';

// Projects P-3 end to end (PRJ-08, founder answers 1409, 1410): company mapping rules turn work-tool items into
// suggested lines by priority; a rule never maps to a closed project or one the person is not allocated to; only
// Projects managers and System Admins change rules; another company's rules never apply; with pre-fill off (the
// default) nothing is mapped. Bad input 400, stale 409, acting for someone else 403. The dev-fake work tools give
// every person the same items: Monday's calendar event "FSSAI-AUDIT line checks".

jest.setTimeout(240_000);

describe('Projects P-3 mapping rules', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'boss' | 'fin' | 'emp' | 'peer' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const week = mondayOf(today);
  const rule = (over: Record<string, unknown> = {}) => ({ source: 'calendar', pattern: 'FSSAI-*', projectId: ids.aaa, priority: 1, ...over });
  /** Monday's calendar line in my suggestions. */
  const monday = async (who: Who) => {
    const lines = (await api(who, 'get', `/time/tools/suggestions?week=${week}`).expect(want(200))).body.lines as { provider: string; date: string; projectId: string | null; activity: string | null; ruleId: string | null }[];
    return lines.find((l) => l.provider === 'calendar' && l.date === week)!;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `prj3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PRJ3 Org ${k}`, slug: `prj3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['boss', 'A', 'panel', ['projects.view', 'projects.manage']],
      ['fin', 'A', 'panel', ['projects.view', 'projects.finance', 'projects.resource']],
      ['emp', 'A', 'panel', []],
      ['peer', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await inOrg(k, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(k, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prj3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@prj3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.boss}`).expect(200)).body.accessToken;
    await inOrg('A', async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Prj3 Foods', shortName: `PRJ3-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    for (const who of ['boss', 'emp', 'peer'] as const) {
      ids[`${who}Emp`] = (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: new Date(Date.parse(`${week}T00:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10), userId: users[who], workEmail: `${who}@prj3-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(want(201))
      ).body.id;
    }
    // Projects on in both companies; pre-fill stays at its default (off).
    for (const who of ['admin', 'adminB'] as const) await api(who, 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }] }).expect(want(200));
    const project = async (code: string, allocate: boolean) => {
      const id = (await api('boss', 'post', '/projects').send({ code, name: `Project ${code}`, billingModel: 'non_billable', managerUserId: users.boss }).expect(want(201))).body.id as string;
      await api('boss', 'post', `/projects/${id}/status`).send({ status: 'active', version: 1 }).expect(want(200));
      if (allocate) await api('boss', 'post', `/projects/${id}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent: 30 }).expect(want(201));
      return id;
    };
    ids.aaa = await project('AAA', true);
    ids.bbb = await project('BBB', true);
    ids.ccc = await project('CCC', false);
    ids.task = (await api('boss', 'post', `/projects/${ids.bbb}/tasks`).send({ name: 'Audit prep', billable: false }).expect(want(201))).body.id;
    // Company B: its own project and a catch-all rule that must never reach company A.
    await inOrg('B', async (tx) => {
      ids.bProject = (await tx.timesheetProject.create({ data: { organizationId: org.B.id, code: 'BEE', name: 'Company B project' } })).id;
    });
    ids.bRule = (await api('adminB', 'post', '/projects/mapping-rules').send({ source: 'calendar', pattern: '*FSSAI*', projectId: ids.bProject, priority: 1 }).expect(want(201))).body.id;
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

  it('the rules table has forced RLS with the tenant and portal policies', async () => {
    const rows = await prisma.$queryRaw<{ forced: boolean; policy: boolean; portal: boolean }[]>`
      SELECT c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'portal_none') AS portal
      FROM pg_class c WHERE c.relname = 'project_mapping_rules' AND c.relkind = 'r'`;
    expect(rows).toEqual([{ forced: true, policy: true, portal: true }]);
  });

  it('only Projects managers and System Admins see and change rules; acting for someone else never', async () => {
    for (const who of ['emp', 'fin'] as const) {
      await api(who, 'get', '/projects/mapping-rules').expect(403);
      await api(who, 'post', '/projects/mapping-rules').send(rule()).expect(403);
      await api(who, 'post', '/projects/mapping-rules/test').expect(403);
    }
    await api('acting', 'post', '/projects/mapping-rules').send(rule()).expect(403);
    const asBoss = (await api('boss', 'get', '/projects/mapping-rules').expect(want(200))).body;
    expect(asBoss).toMatchObject({ canEdit: true, canSwitchPrefill: false, prefillOn: false, rules: [] });
    expect((await api('admin', 'get', '/projects/mapping-rules').expect(want(200))).body.canSwitchPrefill).toBe(true);
  });

  it('bad rules are refused: closed project, another company’s project, a task of another project, empty or wild patterns', async () => {
    await api('boss', 'post', '/projects/mapping-rules').send(rule({ projectId: ids.bProject })).expect(400);
    await api('boss', 'post', '/projects/mapping-rules').send(rule({ taskId: ids.task })).expect(400); // the task is BBB's
    for (const bad of [{ pattern: '***' }, { pattern: 'a*b*c*d*e*f*' }, { pattern: '' }, { source: 'jira' }, { priority: 0 }, { priority: 1000 }, { pattern: '<b>' }, { extra: 1 }]) await api('boss', 'post', '/projects/mapping-rules').send(rule(bad)).expect(400);
    expect(await inOrg('A', (tx) => tx.projectMappingRule.count())).toBe(0);
  });

  it('with pre-fill off (the default) nothing is mapped: no suggestions and the test returns nothing', async () => {
    ids.r1 = (await api('boss', 'post', '/projects/mapping-rules').send(rule()).expect(want(201))).body.id;
    await api('emp', 'get', `/time/tools/suggestions?week=${week}`).expect(403);
    expect((await api('boss', 'post', '/projects/mapping-rules/test').expect(want(200))).body).toMatchObject({ prefillOn: false, items: [] });
    // Only the System Admin switches pre-fill on (it reads people's own tools, 1409).
    await api('boss', 'put', '/projects/settings').send({ changes: [{ key: 'timesheet.tool_suggestions', value: 'on' }] }).expect(403);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'timesheet.tool_suggestions', value: 'on' }] }).expect(want(200));
    for (const who of ['emp', 'peer', 'boss'] as const) await api(who, 'post', '/time/tools/calendar/connect').expect(want(200));
  });

  it('priority decides between two matching rules; a task goes with the rule; another company’s rules never apply', async () => {
    // r1: FSSAI-* → AAA (priority 1). r2: *line checks* → BBB, task Audit prep (priority 2).
    ids.r2 = (await api('boss', 'post', '/projects/mapping-rules').send(rule({ pattern: '*line checks*', projectId: ids.bbb, taskId: ids.task, priority: 2 })).expect(want(201))).body.id;
    expect(await monday('emp')).toMatchObject({ projectId: ids.aaa, ruleId: ids.r1, activity: null });
    await api('boss', 'put', `/projects/mapping-rules/${ids.r1}`).send({ ...rule(), priority: 3, version: 1 }).expect(want(200));
    await api('boss', 'put', `/projects/mapping-rules/${ids.r1}`).send({ ...rule(), priority: 4, version: 1 }).expect(409);
    expect(await monday('emp')).toMatchObject({ projectId: ids.bbb, ruleId: ids.r2, activity: 'Audit prep' });
    expect((await api('boss', 'get', '/projects/mapping-rules').expect(200)).body.rules.map((r: { id: string }) => r.id)).toEqual([ids.r2, ids.r1]);
    // Company B's catch-all never shows, and B cannot reach A's rules.
    expect(((await api('adminB', 'get', '/projects/mapping-rules').expect(want(200))).body.rules as { id: string }[]).map((r) => r.id)).toEqual([ids.bRule]);
    await api('adminB', 'put', `/projects/mapping-rules/${ids.r1}`).send({ source: 'calendar', pattern: '*', projectId: ids.bProject, priority: 1, version: 2 }).expect(404);
    await api('adminB', 'post', `/projects/mapping-rules/${ids.r1}/remove`).send({ version: 2 }).expect(404);
  });

  it('a rule never maps to a project the person is not allocated to, nor to a closed project', async () => {
    // CCC at priority 1: emp is not allocated to it, so the next rule applies; peer is allocated to nothing.
    ids.r3 = (await api('boss', 'post', '/projects/mapping-rules').send(rule({ pattern: 'FSSAI*', projectId: ids.ccc, priority: 1 })).expect(want(201))).body.id;
    expect(await monday('emp')).toMatchObject({ projectId: ids.bbb, ruleId: ids.r2 });
    expect(await monday('peer')).toMatchObject({ projectId: null, ruleId: null });
    // Close BBB: its rule stops applying (shown as not applying) and AAA's takes over.
    const v = (await api('boss', 'get', `/projects/${ids.bbb}`).expect(200)).body.project.version;
    await api('boss', 'post', `/projects/${ids.bbb}/status`).send({ status: 'closed', version: v }).expect(want(200));
    expect(await monday('emp')).toMatchObject({ projectId: ids.aaa, ruleId: ids.r1 });
    expect((await api('boss', 'get', '/projects/mapping-rules').expect(200)).body.rules.find((r: { id: string }) => r.id === ids.r2).problem).toMatch(/BBB is not active/);
    await api('boss', 'post', '/projects/mapping-rules').send(rule({ projectId: ids.bbb, priority: 9 })).expect(400);
    // With the booking rule off, the unallocated project's rule applies again.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.booking.allocated_only', value: 'off' }] }).expect(want(200));
    expect(await monday('peer')).toMatchObject({ projectId: ids.ccc, ruleId: ids.r3 });
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.booking.allocated_only', value: 'on' }] }).expect(want(200));
  });

  it("the test runs the saved rules over the editor's own last week; switched-off and removed rules stop applying (audited)", async () => {
    const t = (await api('boss', 'post', '/projects/mapping-rules/test').expect(want(200))).body;
    expect(t).toMatchObject({ prefillOn: true, connected: true });
    expect(t.items.find((i: { source: string; text: string }) => i.source === 'calendar' && i.text === 'FSSAI-AUDIT')).toMatchObject({ ruleId: ids.r3, project: 'CCC' });
    await api('boss', 'put', `/projects/mapping-rules/${ids.r3}`).send({ ...rule({ pattern: 'FSSAI*', projectId: ids.ccc, priority: 1 }), enabled: false, version: 1 }).expect(want(200));
    await api('boss', 'post', `/projects/mapping-rules/${ids.r1}/remove`).send({ version: 1 }).expect(409);
    await api('boss', 'post', `/projects/mapping-rules/${ids.r1}/remove`).send({ version: 2 }).expect(want(200));
    const after = (await api('boss', 'post', '/projects/mapping-rules/test').expect(200)).body.items.find((i: { source: string; text: string }) => i.source === 'calendar' && i.text === 'FSSAI-AUDIT');
    expect(after.ruleId).toBeNull();
    expect(await inOrg('A', (tx) => tx.auditLog.count({ where: { action: { startsWith: 'projects.mapping_rule.' } } }))).toBe(6); // 3 added, 2 changed, 1 removed
    // Pre-fill off again: nothing is mapped for anyone.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'timesheet.tool_suggestions', value: 'off' }] }).expect(want(200));
    await api('emp', 'get', `/time/tools/suggestions?week=${week}`).expect(403);
  });

  it('answer 1444: new projects start on the company billing model (time and material); a client only for billable ones', async () => {
    const base = { code: 'DEF1', name: 'Default model', managerUserId: users.boss };
    expect((await api('boss', 'get', '/projects/choices').expect(want(200))).body.defaultBillingModel).toBe('time_material');
    expect((await api('boss', 'get', '/projects/settings').expect(200)).body.values['projects.default_billing_model']).toBe('time_material');
    // Left out: time and material, so a client is needed.
    expect((await api('boss', 'post', '/projects').send(base).expect(400)).body.message).toMatch(/needs a client/);
    // Only a System Admin changes it; only the four models.
    await api('boss', 'put', '/projects/settings').send({ changes: [{ key: 'projects.default_billing_model', value: 'non_billable' }] }).expect(403);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.default_billing_model', value: 'barter' }] }).expect(400);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.default_billing_model', value: 'non_billable' }] }).expect(want(200));
    expect((await api('boss', 'get', '/projects/choices').expect(200)).body.defaultBillingModel).toBe('non_billable');
    const id = (await api('boss', 'post', '/projects').send(base).expect(want(201))).body.id;
    expect((await api('boss', 'get', `/projects/${id}`).expect(200)).body.project.billingModel).toBe('non_billable');
    // An explicit model still wins: fixed fee without a client is refused even with the default non-billable.
    await api('boss', 'post', '/projects').send({ ...base, code: 'DEF2', billingModel: 'fixed_fee' }).expect(400);
    // A change that leaves the model out keeps the project's own, whatever the company default says now.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.default_billing_model', value: 'fixed_fee' }] }).expect(want(200));
    await api('boss', 'put', `/projects/${id}`).send({ ...base, name: 'Renamed', version: 1 }).expect(want(200));
    expect((await api('boss', 'get', `/projects/${id}`).expect(200)).body.project.billingModel).toBe('non_billable');
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.default_billing_model', value: 'time_material' }] }).expect(want(200));
  });
});
