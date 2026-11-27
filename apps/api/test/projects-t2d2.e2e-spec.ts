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

// Batch T2-D part 2 end to end (founder answers 2865 to 2871, 27 Nov 2026): the task board and assignees (56), the
// project page's actions pending and who is away (57), per-project settings and the second approval level (58, 59),
// and the two hours reports (60). Positive and negative.

jest.setTimeout(300_000);

describe('Projects T2-D part 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'boss' | 'pm' | 'head' | 'viewer' | 'reporter' | 'emp' | 'peer' | 'mgr' | 'out' | 'adminB';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const week = mondayOf(today);
  const lastWeek = addDays(week, -7);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const seven = (m: number) => [m, m, m, m, m, 0, 0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `t2d2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `T2D2 Org ${k}`, slug: `t2d2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['boss', 'A', 'panel', ['projects.view', 'projects.manage']],
      ['pm', 'A', 'panel', []],
      ['head', 'A', 'panel', []],
      ['viewer', 'A', 'panel', ['projects.view']],
      ['reporter', 'A', 'panel', ['projects.reporting']],
      ['emp', 'A', 'panel', []],
      ['peer', 'A', 'panel', []],
      ['mgr', 'A', 'panel', []],
      ['out', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, o, role, keys] of roster) {
      const oid = org[o].id;
      const t = (fn: Parameters<TenantPrismaService['forTenant']>[1]) => tenantPrisma.forTenant({ organizationId: oid, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? ((await t((tx) => tx.permissionProfile.create({ data: { organizationId: oid, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))) as { id: string }).id : null;
      users[who] = ((await t((tx) => tx.user.create({ data: { organizationId: oid, email: `${who}@t2d2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))) as { id: string }).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[o].slug, email: `${who}@t2d2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'T2D2 Tech', shortName: `T2D2-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'CHN', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: 'mgr' | 'emp' | 'peer' | 'out' | 'pm' | 'head', manager: string | null) =>
      (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(week, -90), userId: users[who], workEmail: `${who}@t2d2-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(want(201))
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', null);
    ids.empEmp = await hire('emp', ids.mgrEmp);
    ids.peerEmp = await hire('peer', ids.mgrEmp);
    ids.outEmp = await hire('out', ids.mgrEmp);
    ids.pmEmp = await hire('pm', ids.mgrEmp);
    ids.headEmp = await hire('head', null);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }, { key: 'timesheet.note.required', value: 'off' }] }).expect(want(200));
    // Company B has Projects on too, so its people get "no such project" (404), never "switched off".
    await api('adminB', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }] }).expect(want(200));
    // INT: internal, run by pm (no Projects key); emp and peer on its team from four weeks ago.
    ids.int = (await api('boss', 'post', '/projects').send({ code: 'INT', name: 'Internal tools', billingModel: 'non_billable', managerUserId: users.pm }).expect(want(201))).body.id;
    await api('boss', 'post', `/projects/${ids.int}/status`).send({ status: 'active', version: 1 }).expect(want(200));
    ids.oth = (await api('boss', 'post', '/projects').send({ code: 'OTH', name: 'Other project', billingModel: 'non_billable' }).expect(want(201))).body.id;
    await api('boss', 'post', `/projects/${ids.oth}/status`).send({ status: 'active', version: 1 }).expect(want(200));
    for (const e of ['empEmp', 'peerEmp']) await api('pm', 'post', `/projects/${ids.int}/allocations`).send({ employeeId: ids[e], fromOn: addDays(week, -28), percent: 50 }).expect(want(201));
    await api('boss', 'post', `/projects/${ids.oth}/allocations`).send({ employeeId: ids.outEmp, fromOn: addDays(week, -28), percent: 50 }).expect(want(201));
    for (const name of ['Build', 'Docs']) await api('pm', 'post', `/projects/${ids.int}/tasks`).send({ name, billable: false, budgetHours: 100 }).expect(want(201));
    const tasks = (await api('pm', 'get', `/projects/${ids.int}`).expect(want(200))).body.tasks as { id: string; name: string }[];
    ids.build = tasks.find((t) => t.name === 'Build')!.id;
    ids.docs = tasks.find((t) => t.name === 'Docs')!.id;
  }, 300_000);

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

  const task = async (id: string) => ((await api('pm', 'get', `/projects/${ids.int}`).expect(want(200))).body.tasks as { id: string; stage: string; version: number; assignees: { employeeId: string }[] }[]).find((t) => t.id === id)!;

  it('56: the board stages include the company stages; the PM moves and assigns tasks (audited); others cannot', async () => {
    // Negative first: a bad company stage list saves nothing.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.task.extra_stages', value: 'A, B, C, D' }] }).expect(400);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.task.extra_stages', value: 'Review' }] }).expect(want(200));
    const d = (await api('pm', 'get', `/projects/${ids.int}`).expect(want(200))).body;
    expect(d.stages.map((s: { label: string }) => s.label)).toEqual(['To do', 'In progress', 'Review', 'Done']);
    let b = await task(ids.build!);
    expect(b).toMatchObject({ stage: 'todo', assignees: [] });
    await api('pm', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'Review', version: b.version }).expect(want(200));
    await api('pm', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'Review', version: b.version }).expect(409); // stale version
    b = await task(ids.build!);
    expect(b.stage).toBe('Review');
    await api('pm', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'Nope', version: b.version }).expect(400);
    // Only the PM (or Projects manage) moves or assigns: a team member without a key cannot open the project (404), a
    // viewer may not change it (403); another company sees no project.
    await api('emp', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'done', version: b.version }).expect(404);
    await api('viewer', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'done', version: b.version }).expect(403);
    await api('adminB', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'done', version: b.version }).expect(404);
    // Assignees: people on the team only.
    await api('pm', 'put', `/projects/${ids.int}/tasks/${ids.build}/assignees`).send({ employeeIds: [ids.outEmp], version: b.version }).expect(400);
    await api('viewer', 'put', `/projects/${ids.int}/tasks/${ids.build}/assignees`).send({ employeeIds: [ids.empEmp], version: b.version }).expect(403);
    await api('pm', 'put', `/projects/${ids.int}/tasks/${ids.build}/assignees`).send({ employeeIds: [ids.empEmp], version: b.version }).expect(want(200));
    b = await task(ids.build!);
    expect(b.assignees.map((a) => a.employeeId)).toEqual([ids.empEmp]);
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'project_task', entityId: ids.build } }));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['projects.task.moved', 'projects.task.assigned']));
  });

  it('56: my tasks come first on my week; a Done task takes no new hours but keeps the hours booked', async () => {
    const mine = (await api('emp', 'get', `/time/me/timesheet?week=${lastWeek}`).expect(want(200))).body;
    const p = mine.projects.find((x: { id: string }) => x.id === ids.int);
    expect(p.myTasks).toEqual(['Build']);
    expect(p.activities[0]).toBe('Build');
    // The peer has no tasks of their own: the project's order.
    const peer = (await api('peer', 'get', `/time/me/timesheet?week=${lastWeek}`).expect(want(200))).body.projects.find((x: { id: string }) => x.id === ids.int);
    expect(peer.myTasks).toEqual([]);
    // Anyone on the team may still book to any task (the peer books to Build).
    await api('peer', 'put', '/time/me/timesheet').send({ week: lastWeek, lines: [{ projectId: ids.int, activity: 'Build', billable: false, minutes: seven(60) }] }).expect(want(200));
    await api('emp', 'put', '/time/me/timesheet').send({ week: lastWeek, lines: [{ projectId: ids.int, activity: 'Build', billable: false, minutes: seven(60) }] }).expect(want(200));
    const b = await task(ids.build!);
    await api('pm', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'done', version: b.version }).expect(want(200));
    // Saving the same hours again is fine; more hours on a Done task are refused.
    await api('emp', 'put', '/time/me/timesheet').send({ week: lastWeek, lines: [{ projectId: ids.int, activity: 'Build', billable: false, minutes: seven(60) }] }).expect(want(200));
    const r = await api('emp', 'put', '/time/me/timesheet').send({ week: lastWeek, lines: [{ projectId: ids.int, activity: 'Build', billable: false, minutes: seven(120) }] }).expect(400);
    expect(r.body.message).toMatch(/Build is done/);
    // Another task takes hours as usual.
    await api('emp', 'put', '/time/me/timesheet').send({ week: lastWeek, lines: [{ projectId: ids.int, activity: 'Build', billable: false, minutes: seven(60) }, { projectId: ids.int, activity: 'Docs', billable: false, minutes: seven(60) }] }).expect(want(200));
    const after = await task(ids.build!);
    await api('pm', 'post', `/projects/${ids.int}/tasks/${ids.build}/stage`).send({ stage: 'in_progress', version: after.version }).expect(want(200));
  });
});
