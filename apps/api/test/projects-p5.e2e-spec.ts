import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ProjectCostService } from '../src/projects/project-cost.service';
import { mondayOf } from '../src/time/time-rules';

// Projects P-5 end to end (PRJ-04; founder answers 1412, 1413, 1419, 1445). The nightly job turns approved hours and
// each person's cost rate into project totals (provisional on a stand-in rate, restated when the month's payroll is
// final); no session ever reads a rate; only Projects finance sees cost, revenue and margin; a project's manager sees
// totals, hidden for a month under the people limit (a setting, checked in the API); expense lines name a project
// only when the company switched it on; cost burn alerts against the cost budget.

jest.setTimeout(300_000);

describe('Projects P-5 cost and margin, project expenses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let costs: ProjectCostService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' } };
  type Who = 'admin' | 'fin' | 'boss' | 'pm' | 'e1' | 'e2';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const M1 = plus(`${today.slice(0, 7)}-01`, -1).slice(0, 7) + '-01'; // last month
  const M0 = plus(M1, -1).slice(0, 7) + '-01'; // the month before
  const week = mondayOf(plus(M1, 14)); // a week wholly inside last month
  /** A cost rate written as payroll would (the pay guard opened to the entity). */
  const rate = (employeeId: string, month: string, perHour: number) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      await tx.employeeCostRate.upsert({ where: { organizationId_employeeId_periodStart: { organizationId: org.A.id, employeeId, periodStart: day(month) } }, update: { rate: perHour }, create: { organizationId: org.A.id, legalEntityId: ids.entity!, employeeId, periodStart: day(month), employerCost: perHour * 160, standardHours: 160, rate: perHour, sourcePayslipId: randomUUID() } });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    costs = moduleRef.get(ProjectCostService);

    planId = (await prisma.plan.create({ data: { name: `prj5-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'PRJ5 Org A', slug: `prj5-a-${run}`, planId } });
    org.A = { id: created.id, slug: created.slug };
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['fin', 'panel', ['projects.view', 'projects.finance']],
      ['boss', 'panel', ['projects.view', 'projects.manage', 'projects.resource']],
      ['pm', 'panel', []],
      ['e1', 'panel', []],
      ['e2', 'panel', []],
    ];
    for (const [who, role, keys] of roster) {
      const o = org.A.id;
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prj5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@prj5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Prj5 Tech', shortName: `PRJ5-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Kochi', code: 'COK', address: {}, country: 'IN', state: 'IN-KL', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    for (const who of ['e1', 'e2'] as const)
      ids[who] = (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: plus(M0, -60), userId: users[who], workEmail: `${who}@prj5-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(want(201))
      ).body.id;
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }] }).expect(want(200));
    const project = async (code: string, extra: Record<string, unknown> = {}) => {
      const id = (await api('boss', 'post', '/projects').send({ code, name: `Project ${code}`, billingModel: 'non_billable', managerUserId: users.pm, ...extra }).expect(want(201))).body.id as string;
      await api('boss', 'post', `/projects/${id}/status`).send({ status: 'active', version: 1 }).expect(want(200));
      return id;
    };
    ids.two = await project('TWO');
    ids.solo = await project('SOLO');
    // Last month's approved week: e1 16 h and e2 8 h on TWO; e1 alone 4 h on SOLO (decided as a whole: no line status).
    await inA(async (tx) => {
      const weekLines: [Who, { projectId: string; minutes: number[] }[]][] = [
        ['e1', [{ projectId: ids.two!, minutes: [480, 480, 0, 0, 0, 0, 0] }, { projectId: ids.solo!, minutes: [0, 0, 240, 0, 0, 0, 0] }]],
        ['e2', [{ projectId: ids.two!, minutes: [0, 0, 0, 480, 0, 0, 0] }]],
      ];
      for (const [who, lines] of weekLines) {
        const total = lines.reduce((t, l) => t + l.minutes.reduce((a, b) => a + b, 0), 0);
        const s = await tx.timesheet.create({ data: { organizationId: org.A.id, employeeId: ids[who]!, weekStart: day(week), status: 'approved', totalMinutes: total } });
        for (const l of lines) await tx.timesheetLine.create({ data: { organizationId: org.A.id, timesheetId: s.id, projectId: l.projectId, minutes: l.minutes } });
      }
    });
    // e1 has only the month before's final rate (a stand-in: provisional); e2 has last month's own final rate.
    await rate(ids.e1!, M0, 500);
    await rate(ids.e2!, M1, 300);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: org.A.id } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the cost table has forced RLS with the tenant and portal policies', async () => {
    const rows = await prisma.$queryRaw<{ forced: boolean; policy: boolean; portal: boolean }[]>`
      SELECT c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'portal_none') AS portal
      FROM pg_class c WHERE c.relname = 'project_costs' AND c.relkind = 'r'`;
    expect(rows).toEqual([{ forced: true, policy: true, portal: true }]);
  });

  it('a session never reads a person’s rate (the pay guard); the nightly job writes provisional totals only', async () => {
    expect(await inA((tx) => tx.employeeCostRate.count())).toBe(0);
    expect((await costs.costSweep([org.A.id], today)).companies).toBe(1);
    const two = await inA((tx) => tx.projectCost.findFirstOrThrow({ where: { projectId: ids.two, month: day(M1) } }));
    expect(two).toMatchObject({ minutes: 1440, people: 2, costPaise: BigInt(16 * 500 * 100 + 8 * 300 * 100), basis: 'provisional', restatedFromPaise: null });
    expect(Object.keys(two)).not.toContain('rate');
    const solo = await inA((tx) => tx.projectCost.findFirstOrThrow({ where: { projectId: ids.solo, month: day(M1) } }));
    expect(solo).toMatchObject({ people: 1, costPaise: BigInt(4 * 500 * 100), basis: 'provisional' });
  });

  it('only Projects finance sees cost and margin; a PM sees totals, a one-person month hidden; others are refused; never a rate', async () => {
    const m = M1.slice(0, 7);
    const fin = (await api('fin', 'get', `/projects/costs?month=${m}`).expect(want(200))).body;
    expect(fin.finance).toBe(true);
    expect(fin.rows.map((r: { code: string }) => r.code)).toEqual(['SOLO', 'TWO']);
    expect(fin.rows.find((r: { code: string }) => r.code === 'SOLO')).toMatchObject({ hidden: false, cost: '2000.00' });
    const pm = (await api('pm', 'get', `/projects/costs?month=${m}`).expect(want(200))).body;
    expect(pm.finance).toBe(false);
    expect(pm.rows.find((r: { code: string }) => r.code === 'SOLO')).toMatchObject({ hidden: true, cost: null, expenses: null, revenue: null, margin: null });
    expect(pm.rows.find((r: { code: string }) => r.code === 'TWO')).toMatchObject({ hidden: false, cost: '10400.00', revenue: null, margin: null, restatedFrom: null });
    for (const body of [fin, pm]) expect(JSON.stringify(body)).not.toMatch(/"rate"|employerCost|standardHours/);
    await api('boss', 'get', `/projects/costs?month=${m}`).expect(403); // Projects manage without finance, not a manager
    await api('e1', 'get', `/projects/costs?month=${m}`).expect(403);
    await api('boss', 'get', `/projects/${ids.two}/cost`).expect(403);
    expect((await api('pm', 'get', `/projects/${ids.solo}/cost`).expect(want(200))).body).toMatchObject({ hiddenMonths: 1, total: '0.00', months: [] });
    await api('pm', 'get', '/projects/costs?month=2026-13').expect(400);
    // The limit is a company setting, checked in the API.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.cost.min_people', value: '1' }] }).expect(want(200));
    expect((await api('pm', 'get', `/projects/costs?month=${m}`).expect(200)).body.rows.find((r: { code: string }) => r.code === 'SOLO')).toMatchObject({ hidden: false, cost: '2000.00' });
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.cost.min_people', value: '2' }] }).expect(want(200));
  });

  it('1413: when the month’s payroll is final the provisional month is restated (audited, once)', async () => {
    await rate(ids.e1!, M1, 550); // last month's payroll final for e1
    await costs.costSweep([org.A.id], today);
    const two = await inA((tx) => tx.projectCost.findFirstOrThrow({ where: { projectId: ids.two, month: day(M1) } }));
    expect(two).toMatchObject({ basis: 'final', costPaise: BigInt(16 * 550 * 100 + 8 * 300 * 100), restatedFromPaise: BigInt(16 * 500 * 100 + 8 * 300 * 100) });
    expect((await api('fin', 'get', `/projects/costs?month=${M1.slice(0, 7)}`).expect(200)).body.rows.find((r: { code: string }) => r.code === 'TWO')).toMatchObject({ basis: 'final', cost: '11200.00', restatedFrom: '10400.00' });
    await costs.costSweep([org.A.id], today);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'projects.cost.restated' } }))).toBe(2); // TWO and SOLO, once each
  });

  it('1419: expense lines name a project only when the company switched it on; approved ones add to the cost', async () => {
    await api('admin', 'post', '/expenses/setup/from-starter').expect(want(201));
    const cats = (await api('e1', 'get', '/expenses/categories').expect(200)).body as { code: string; kind: string }[];
    const cat = cats.find((c) => !['mileage', 'per_diem'].includes(c.kind))!.code;
    const claim = (await api('e1', 'post', '/expenses/claims').send({ title: 'Client visit' }).expect(want(201))).body as { id: string; projects?: unknown };
    expect(claim.projects).toBeNull();
    const line = { categoryCode: cat, spentOn: plus(M1, 9), payMode: 'personal', amount: '1200.00', selfDeclared: true, justification: 'Taxi to the client', projectId: ids.two };
    expect((await api('e1', 'post', `/expenses/claims/${claim.id}/lines`).send(line).expect(400)).body.message).toMatch(/not linked to projects/);
    await api('boss', 'put', '/projects/settings').send({ changes: [{ key: 'projects.expenses.enabled', value: 'on' }] }).expect(403);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.expenses.enabled', value: 'on' }] }).expect(want(200));
    expect(((await api('e1', 'get', `/expenses/claims/${claim.id}`).expect(200)).body.projects as { code: string }[]).map((p) => p.code).sort()).toEqual(['SOLO', 'TWO']);
    await api('e1', 'post', `/expenses/claims/${claim.id}/lines`).send({ ...line, rebill: true }).expect(400); // no client: nothing to re-bill
    const saved = (await api('e1', 'post', `/expenses/claims/${claim.id}/lines`).send(line).expect(want(201))).body as { lines: { projectId: string; rebill: boolean }[] };
    expect(saved.lines[0]).toMatchObject({ projectId: ids.two, rebill: false });
    // Approved (as the approval flow would leave it), the line adds to the month's cost; the Expenses tab lists it.
    await inA((tx) => tx.expenseClaim.update({ where: { id: claim.id }, data: { status: 'approved' } }));
    await costs.costSweep([org.A.id], today);
    expect((await inA((tx) => tx.projectCost.findFirstOrThrow({ where: { projectId: ids.two, month: day(M1) } }))).expensesPaise).toBe(120000n);
    expect((await api('pm', 'get', `/projects/${ids.two}/expenses`).expect(want(200))).body).toEqual([expect.objectContaining({ amount: '1200.00', rebill: false, status: 'Approved' })]);
    await api('e2', 'get', `/projects/${ids.two}/expenses`).expect(404);
  });

  it('1445: cost against the cost budget raises a burn alert once per level (finance; the manager only with enough people)', async () => {
    const v = (await api('boss', 'get', `/projects/${ids.two}`).expect(200)).body.project.version;
    await api('fin', 'put', `/projects/${ids.two}`).send({ code: 'TWO', name: 'Project TWO', billingModel: 'non_billable', managerUserId: users.pm, budgetCost: 15000, version: v }).expect(403); // finance alone does not edit
    await inA((tx) => tx.timesheetProject.update({ where: { id: ids.two }, data: { budgetCost: 15000 } }));
    const first = await costs.costSweep([org.A.id], today);
    expect(first.alerts).toBe(1); // 11,200 + 1,200 of 15,000 = 83%
    expect((await costs.costSweep([org.A.id], today)).alerts).toBe(0);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'projects.cost.alert', entityId: ids.two } }))).toBe(1);
  });
});
