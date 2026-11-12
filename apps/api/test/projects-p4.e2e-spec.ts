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

// Projects P-4 end to end (PRJ-03, PRJ-07; founder answers 1411, 1417, 1418, 1541, 1547). Resource requests are filled
// only by Projects resource or manage, only with someone who has the free capacity (bench first); capacity hides
// per-person figures from a PM's team under the company's limit; the one bench shows allocation; the Timesheets tab
// and PRJ-02 flag a week an hour or more away from attendance; "client approves the hours" needs the staffing desk.

jest.setTimeout(300_000);

describe('Projects P-4 capacity, bench and requests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' } };
  type Who = 'admin' | 'boss' | 'res' | 'pm' | 'am' | 'e1' | 'e2' | 'e3' | 'acting';
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
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const ask = (who: Who, over: Record<string, unknown> = {}) => api(who, 'post', '/projects/requests').send({ projectId: ids.nrp, role: 'Java developer', percent: 50, fromOn: week, toOn: addDays(week, 27), ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `prj4-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'PRJ4 Org A', slug: `prj4-a-${run}`, planId } });
    org.A = { id: created.id, slug: created.slug };
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['boss', 'panel', ['projects.view', 'projects.manage']],
      ['res', 'panel', ['projects.view', 'projects.resource']],
      ['pm', 'panel', []],
      ['am', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['e1', 'panel', []],
      ['e2', 'panel', []],
      ['e3', 'panel', []],
    ];
    for (const [who, role, keys] of roster) {
      const o = org.A.id;
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prj4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@prj4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.res}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Prj4 Tech', shortName: `PRJ4-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Pune', code: 'PNQ', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    for (const who of ['e1', 'e2', 'e3'] as const)
      ids[who] = (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(week, -90), userId: users[who], workEmail: `${who}@prj4-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(want(201))
      ).body.id;
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }] }).expect(want(200));
    const project = async (code: string, managerUserId: string) => {
      const id = (await api('boss', 'post', '/projects').send({ code, name: `Project ${code}`, billingModel: 'non_billable', managerUserId }).expect(want(201))).body.id as string;
      await api('boss', 'post', `/projects/${id}/status`).send({ status: 'active', version: 1 }).expect(want(200));
      return id;
    };
    ids.nrp = await project('NRP', users.pm!);
    ids.oth = await project('OTH', users.boss!);
    // e1 is fully allocated elsewhere; e3 half on NRP; e2 is free (and on the staffing bench).
    await api('boss', 'post', `/projects/${ids.oth}/allocations`).send({ employeeId: ids.e1, fromOn: addDays(week, -30), percent: 100 }).expect(want(201));
    await api('pm', 'post', `/projects/${ids.nrp}/allocations`).send({ employeeId: ids.e3, fromOn: addDays(week, -30), percent: 50 }).expect(want(201));
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

  it('the requests table has forced RLS with the tenant and portal policies', async () => {
    const rows = await prisma.$queryRaw<{ forced: boolean; policy: boolean; portal: boolean }[]>`
      SELECT c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy,
        EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'portal_none') AS portal
      FROM pg_class c WHERE c.relname = 'project_resource_requests' AND c.relkind = 'r'`;
    expect(rows).toEqual([{ forced: true, policy: true, portal: true }]);
  });

  it("a project's manager raises requests for their own projects only; bad input is refused", async () => {
    await ask('pm', { projectId: ids.oth }).expect(403);
    await ask('e1').expect(403);
    for (const bad of [{ percent: 0 }, { percent: 101 }, { role: '' }, { toOn: addDays(week, -1) }, { fromOn: '2026-02-30' }, { extra: 1 }]) await ask('pm', bad).expect(400);
    ids.q50 = (await ask('pm').expect(want(201))).body.id;
    ids.q100 = (await ask('pm', { percent: 100, role: 'Lead' }).expect(want(201))).body.id;
    const list = (await api('pm', 'get', '/projects/requests').expect(want(200))).body;
    expect(list.can).toEqual({ raise: true, fill: false });
    expect(list.rows).toHaveLength(2);
    await api('e1', 'get', '/projects/requests').expect(403);
  });

  it('only Projects resource or manage see matches and fill; a request is filled only by someone with the free capacity, bench first', async () => {
    await inA((tx) => tx.staffingBench.create({ data: { organizationId: org.A.id, employeeId: ids.e2!, sinceOn: day(addDays(week, -10)) } }));
    await api('pm', 'get', `/projects/requests/${ids.q50}/matches`).expect(403);
    await api('acting', 'get', `/projects/requests/${ids.q50}/matches`).expect(403);
    const m50 = (await api('res', 'get', `/projects/requests/${ids.q50}/matches`).expect(want(200))).body.matches as { employeeId: string; free: number; onBench: boolean }[];
    expect(m50[0]).toMatchObject({ employeeId: ids.e2, free: 100, onBench: true });
    expect(m50.find((x) => x.employeeId === ids.e3)).toMatchObject({ free: 50 });
    expect(m50.find((x) => x.employeeId === ids.e1)).toBeUndefined(); // fully allocated
    const m100 = (await api('res', 'get', `/projects/requests/${ids.q100}/matches`).expect(200)).body.matches as { employeeId: string }[];
    expect(m100.map((x) => x.employeeId)).not.toContain(ids.e3);
    // Non-resource staff can't allocate.
    await api('pm', 'post', `/projects/requests/${ids.q50}/fill`).send({ employeeId: ids.e2, version: 1 }).expect(403);
    await api('e1', 'post', `/projects/requests/${ids.q50}/fill`).send({ employeeId: ids.e2, version: 1 }).expect(403);
    // No free capacity: refused, nothing allocated.
    expect((await api('res', 'post', `/projects/requests/${ids.q50}/fill`).send({ employeeId: ids.e1, version: 1 }).expect(400)).body.message).toMatch(/0% free/);
    await api('res', 'post', `/projects/requests/${ids.q100}/fill`).send({ employeeId: ids.e3, version: 1 }).expect(400);
    await api('res', 'post', `/projects/requests/${ids.q50}/fill`).send({ employeeId: ids.e2, version: 2 }).expect(409);
    await api('res', 'post', `/projects/requests/${ids.q50}/fill`).send({ employeeId: ids.e2, version: 1 }).expect(want(200));
    await api('res', 'post', `/projects/requests/${ids.q50}/fill`).send({ employeeId: ids.e2, version: 2 }).expect(409);
    const a = await inA((tx) => tx.projectAllocation.findFirstOrThrow({ where: { projectId: ids.nrp, employeeId: ids.e2 } }));
    expect(a).toMatchObject({ percent: 50, tentative: false, role: 'Java developer' });
    expect((await api('pm', 'get', '/projects/requests').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.q50)).toMatchObject({ status: 'filled', person: `e2 ${run}` });
    // Withdraw: the person who asked; never someone else without manage.
    await api('res', 'post', `/projects/requests/${ids.q100}/withdraw`).send({ version: 1 }).expect(403);
    await api('pm', 'post', `/projects/requests/${ids.q100}/withdraw`).send({ version: 1 }).expect(want(200));
  });

  it('1417: the one bench shows each person’s allocation (partly allocated)', async () => {
    await api('am', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }).expect(want(200));
    const rows = (await api('am', 'get', '/staffing/bench').expect(want(200))).body.rows as { employeeId: string; allocatedPct: number }[];
    expect(rows.find((r) => r.employeeId === ids.e2)).toMatchObject({ allocatedPct: 50 });
  });

  it('1411: capacity hides per-person figures from a PM’s team under the limit; HR always sees them; the limit is a setting', async () => {
    const pmView = (await api('pm', 'get', '/projects/capacity').expect(want(200))).body;
    expect(pmView).toMatchObject({ suppressed: true, teamSize: 2, limit: 5, target: 75, people: [], team: null });
    const hr = (await api('res', 'get', '/projects/capacity').expect(want(200))).body;
    expect(hr.suppressed).toBe(false);
    expect(hr.people.map((p: { employeeId: string }) => p.employeeId).sort()).toEqual([ids.e1, ids.e2, ids.e3].sort());
    const e1 = hr.people.find((p: { employeeId: string }) => p.employeeId === ids.e1);
    expect(e1.weeks).toHaveLength(6);
    expect(e1.weeks[1].allocated).toBe(40);
    await api('e1', 'get', '/projects/capacity').expect(403);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.small_team.limit', value: '2' }, { key: 'projects.utilisation.target_pct', value: '80' }] }).expect(want(200));
    const after = (await api('pm', 'get', '/projects/capacity').expect(200)).body;
    expect(after).toMatchObject({ suppressed: false, target: 80 });
    expect(after.people).toHaveLength(2);
  });

  it('1541: the Timesheets tab and PRJ-02 flag a week an hour or more from attendance (pay unchanged)', async () => {
    await api('e3', 'put', '/time/me/timesheet').send({ week, lines: [{ projectId: ids.nrp, activity: null, billable: false, minutes: [540, 540, 480, 480, 480, 0, 0] }] }).expect(want(200));
    await api('e3', 'post', '/time/me/timesheet/submit').send({ week }).expect(want(200));
    await inA((tx) => tx.attendanceDay.createMany({ data: [0, 1, 2, 3, 4].map((k) => ({ organizationId: org.A.id, employeeId: ids.e3!, workOn: day(addDays(week, k)), mode: 'punch', status: 'present', workedMinutes: 480 })) }));
    const tab = (await api('pm', 'get', `/projects/${ids.nrp}/timesheets?week=${week}`).expect(want(200))).body;
    expect(tab.rows.find((r: { employeeId: string }) => r.employeeId === ids.e3)).toMatchObject({ bookedHours: 42, status: 'pending', mismatch: 'Timesheet 42 h vs attendance 40 h worked' });
    expect(tab.rows.find((r: { employeeId: string }) => r.employeeId === ids.e2)).toMatchObject({ status: 'missing', mismatch: null });
    await api('e1', 'get', `/projects/${ids.nrp}/timesheets?week=${week}`).expect(404);
    await api('pm', 'get', `/projects/${ids.nrp}/timesheets?week=${addDays(week, 1)}`).expect(400);
    const card = (await api('pm', 'get', '/time/line-approvals').expect(want(200))).body.groups[0].items[0];
    expect(card.mismatch).toBe('Timesheet 42 h vs attendance 40 h worked');
  });

  it('1547: "the client approves the hours" is offered only when the staffing desk is on', async () => {
    expect((await api('boss', 'get', '/projects/choices').expect(want(200))).body.staffingDesk).toBe(true);
    await api('am', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'off' }] }).expect(want(200));
    expect((await api('boss', 'get', '/projects/choices').expect(200)).body.staffingDesk).toBe(false);
  });
});
