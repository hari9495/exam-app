import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';

// HIR-01 headcount plan board end to end: HR plans, edits and sends a plan; an approver decides it on the board's own
// task; an approved plan is revised (the approved lines stay until the revision is approved, line ids are kept, a line
// never drops below its requisitions); a hiring manager sees their own department's approved plan read-only without
// budgets (founder decision 11, a company setting); an employee is refused; another company sees nothing; nothing is
// changed while acting for someone else; bad input is refused.

describe('HIR-01 headcount plan board', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let billingPlanId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'fin' | 'mgr' | 'emp' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const board = async (who: Who, fy = 2026) => (await api(who, 'get', `/hiring/plans?fy=${fy}`).expect(200)).body as Plan[];
  type Line = { id: string; designation: string; count: number; budget: number | null; committed: number; filled: number; committedBudget: number };
  type Plan = { id: string; department: string; status: string; version: number; revisionNo: number; note: string | null; lines: Line[]; revision: { status: string; lines: { id: string | null; count: number }[] } | null; approval: { kind: string; myTaskId: string | null; steps: { name: string; state: string; approvers: string[] }[]; submittedBy: string | null } | null };
  const planOf = async (who: Who, id: string) => (await board(who)).find((p) => p.id === id)!;
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') =>
    request(server()).post(`/api/v1/workflow/approvals/tasks/${taskId}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision, ...(decision === 'reject' ? { reason: 'Too many for this quarter' } : {}) }).expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    billingPlanId = (await prisma.plan.create({ data: { name: `hir01-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR01 Org ${k}`, slug: `hir01-${k.toLowerCase()}-${run}`, planId: billingPlanId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', ['ats.headcount.manage']],
      ['fin', 'A', 'panel', ['ats.headcount.manage']],
      ['mgr', 'A', 'panel', ['ats.requisition.raise']],
      ['emp', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir01-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir01-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      for (const [k, name, code] of [['eng', 'Engineering', 'ENG'], ['ops', 'Operations', 'OPS']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.qa = (await tx.designation.create({ data: { ...x, name: 'QA Engineer', code: 'QAE' } })).id;
      ids.swe = (await tx.designation.create({ data: { ...x, name: 'Software Engineer', code: 'SWE' } })).id;
      // The hiring manager heads Engineering (decision 11: their own department).
      const person = await tx.person.create({ data: { ...x, givenName: 'Divya' } });
      const emp = await tx.employee.create({ data: { ...x, personId: person.id, givenName: 'Divya', userId: users.mgr } });
      await tx.department.update({ where: { id: ids.eng }, data: { headEmployeeId: emp.id, headSince: new Date('2026-04-01T00:00:00Z') } });
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
    await app.close();
  });

  it('HR plans, edits and sends a plan; the approver approves it from the board task', async () => {
    const p = (await api('hr', 'post', '/hiring/plans').send({ departmentId: ids.eng, fyStart: 2026, lines: [{ designationId: ids.qa, count: 2, budget: 1_600_000 }] }).expect(201)).body as Plan;
    ids.engPlan = p.id;
    const edited = (await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, note: 'Two QA for the new product', lines: [{ designationId: ids.qa, count: 4, budget: 3_200_000 }], version: p.version }).expect(200)).body as Plan;
    expect(edited).toMatchObject({ status: 'draft', revisionNo: 1, revision: null, approval: null, lines: [{ designation: 'QA Engineer', count: 4, budget: 3_200_000 }] });
    // A stale version is refused.
    await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ designationId: ids.qa, count: 3 }], version: p.version }).expect(409);
    await api('hr', 'post', `/hiring/plans/${p.id}/submit`).send({ version: edited.version }).expect(200);
    // The sender sees the route without a task of their own; the approver sees their task on the board.
    const mine = await planOf('hr', p.id);
    expect(mine).toMatchObject({ status: 'submitted', approval: { kind: 'plan', myTaskId: null } });
    expect(mine.approval!.steps[0].approvers).toContain(`fin ${run}`);
    await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ designationId: ids.qa, count: 3 }], version: mine.version }).expect(409);
    const theirs = await planOf('fin', p.id);
    expect(theirs.approval!.myTaskId).toEqual(expect.any(String));
    await decide('fin', theirs.approval!.myTaskId!, 'approve');
    const after = await planOf('hr', p.id);
    expect(after).toMatchObject({ status: 'approved', revisionNo: 1, approval: null });
    ids.qaLine = after.lines[0].id;
  });

  it('an approved plan is revised; sent back once, then approved; line ids are kept and the version goes up', async () => {
    const p = await planOf('hr', ids.engPlan);
    // Department and year stay; lines must be this plan's or new.
    await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.ops, fyStart: 2026, lines: [{ designationId: ids.qa, count: 4 }], version: p.version }).expect(400);
    await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ id: randomUUID(), designationId: ids.qa, count: 4 }], version: p.version }).expect(400);
    await api('hr', 'post', `/hiring/plans/${p.id}/submit`).send({ version: p.version }).expect(409);
    const rev = (await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ id: ids.qaLine, designationId: ids.qa, count: 5, budget: 4_000_000 }, { designationId: ids.swe, count: 2, budget: 2_400_000 }], version: p.version }).expect(200)).body as Plan;
    expect(rev).toMatchObject({ status: 'approved', revision: { status: 'draft' }, lines: [{ id: ids.qaLine, count: 4 }] });
    await api('hr', 'post', `/hiring/plans/${p.id}/submit`).send({ version: rev.version }).expect(200);
    const waiting = await planOf('fin', p.id);
    expect(waiting).toMatchObject({ status: 'approved', revision: { status: 'submitted' }, approval: { kind: 'revision' } });
    const req = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: p.id, status: 'pending' } }));
    expect(req.title).toMatch(/revision v2: Engineering FY 2026–27/);
    // While it waits, nothing changes it, and requisitions still draw on the approved line.
    await api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ id: ids.qaLine, designationId: ids.qa, count: 6 }], version: waiting.version }).expect(409);
    await api('hr', 'post', `/hiring/plans/${p.id}/submit`).send({ version: waiting.version }).expect(409);
    await decide('fin', waiting.approval!.myTaskId!, 'reject');
    const back = await planOf('hr', p.id);
    expect(back).toMatchObject({ status: 'approved', revisionNo: 1, revision: { status: 'rejected' }, approval: { kind: 'revision', status: 'rejected', reason: 'Too many for this quarter', myTaskId: null }, lines: [{ count: 4 }] });
    await api('hr', 'post', `/hiring/plans/${p.id}/submit`).send({ version: back.version }).expect(200);
    await decide('fin', (await planOf('fin', p.id)).approval!.myTaskId!, 'approve');
    const done = await planOf('hr', p.id);
    expect(done).toMatchObject({ status: 'approved', revisionNo: 2, revision: null, approval: null });
    expect(done.lines.map((l) => [l.designation, l.count, l.budget]).sort()).toEqual([['QA Engineer', 5, 4_000_000], ['Software Engineer', 2, 2_400_000]]);
    expect(done.lines.find((l) => l.designation === 'QA Engineer')!.id).toBe(ids.qaLine);
  });

  it('a line never drops below its requisitions, is not removed and keeps its designation while in use', async () => {
    const r = (await api('mgr', 'post', '/jobs/requisitions').send({ title: 'QA Engineer', requisitionReason: 'new', headcountPlanLineId: ids.qaLine, outsidePlan: false, headcount: 3, budgetAmount: 900_000 }).expect(201)).body;
    expect(r.id).toEqual(expect.any(String));
    const p = await planOf('hr', ids.engPlan);
    expect(p.lines.find((l) => l.id === ids.qaLine)!.committed).toBe(3);
    const swe = p.lines.find((l) => l.designation === 'Software Engineer')!;
    const put = (lines: object[]) => api('hr', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines, version: p.version });
    expect((await put([{ id: ids.qaLine, designationId: ids.qa, count: 2 }, { id: swe.id, designationId: ids.swe, count: 2 }]).expect(409)).body.message).toMatch(/fewer positions/);
    expect((await put([{ id: swe.id, designationId: ids.swe, count: 2 }]).expect(409)).body.message).toMatch(/stays in the plan/);
    await put([{ id: ids.qaLine, designationId: ids.swe, count: 5 }, { id: swe.id, designationId: ids.swe, count: 2 }]).expect(409);
    // Removing the unused line and keeping the used one at its requisitions is fine.
    await put([{ id: ids.qaLine, designationId: ids.qa, count: 3 }]).expect(200);
  });

  it('a hiring manager sees their own department’s approved plan only, read-only, without budgets (decision 11)', async () => {
    // Operations has a draft plan; Engineering an approved one with a revision draft.
    const ops = (await api('hr', 'post', '/hiring/plans').send({ departmentId: ids.ops, fyStart: 2026, lines: [{ designationId: ids.swe, count: 1, budget: 800_000 }] }).expect(201)).body as Plan;
    const seen = await board('mgr');
    expect(seen.map((p) => p.department)).toEqual(['Engineering']);
    expect(seen[0]).toMatchObject({ note: null, revision: null, approval: null });
    expect(seen[0].lines.every((l) => l.budget === null && l.committedBudget === 0)).toBe(true);
    expect(await board('mgr', 2027)).toEqual([]);
    // Read-only.
    await api('mgr', 'post', '/hiring/plans').send({ departmentId: ids.eng, fyStart: 2027, lines: [{ designationId: ids.qa, count: 1 }] }).expect(403);
    await api('mgr', 'put', `/hiring/plans/${ids.engPlan}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ designationId: ids.qa, count: 9 }], version: 1 }).expect(403);
    await api('mgr', 'post', `/hiring/plans/${ops.id}/submit`).send({ version: ops.version }).expect(403);
    // The company may show the plan to HR only.
    await api('adminA', 'put', '/org/settings').send({ key: 'ats.headcount_plan.manager_view', scopeType: 'tenant', value: 'off' }).expect(200);
    expect((await api('mgr', 'get', '/hiring/plans?fy=2026').expect(403)).body).toMatchObject({ code: 'HEADCOUNT_PLAN_HR_ONLY', message: expect.stringMatching(/HR only/) });
    await api('adminA', 'put', '/org/settings').send({ key: 'ats.headcount_plan.manager_view', scopeType: 'tenant', value: 'own_department' }).expect(200);
    await api('adminA', 'put', '/org/settings').send({ key: 'ats.headcount_plan.manager_view', scopeType: 'tenant', value: 'everyone' }).expect(400);
  });

  it('an employee is refused; another company sees and changes nothing', async () => {
    // No hiring key: a plain 403, never the company's "HR only" code (the web shows no access, not the setting message).
    const refused = (await api('emp', 'get', '/hiring/plans').expect(403)).body;
    expect(refused.code).toBeUndefined();
    expect(refused.message).toMatch(/ats\.headcount\.manage, ats\.requisition\.raise/);
    await api('emp', 'post', '/hiring/plans').send({ departmentId: ids.eng, fyStart: 2027, lines: [{ designationId: ids.qa, count: 1 }] }).expect(403);
    expect(await board('adminB')).toEqual([]);
    const p = await planOf('hr', ids.engPlan);
    await api('adminB', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ designationId: ids.qa, count: 1 }], version: p.version }).expect(404);
    await api('adminB', 'post', `/hiring/plans/${p.id}/submit`).send({ version: p.version }).expect(404);
    expect((await planOf('hr', p.id)).version).toBe(p.version);
  });

  it('nothing is changed while acting for someone else; reading is fine', async () => {
    // An impersonation runs on the person's role grants (not their login profile): give HR the key as a grant too.
    await inA(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: users.hr } });
      await tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hr, permissionProfileId: u.permissionProfileId!, scopeType: 'tenant', validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Headcount planning' } });
    });
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.hr}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    const p = await planOf('acting', ids.engPlan);
    expect((await api('acting', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.eng, fyStart: 2026, lines: [{ id: ids.qaLine, designationId: ids.qa, count: 9 }], version: p.version }).expect(403)).body.message).toMatch(/acting for someone else/);
    await api('acting', 'post', '/hiring/plans').send({ departmentId: ids.eng, fyStart: 2028, lines: [{ designationId: ids.qa, count: 1 }] }).expect(403);
    await api('acting', 'post', `/hiring/plans/${p.id}/submit`).send({ version: p.version }).expect(403);
  });

  it('bad input is refused', async () => {
    const send = (body: object) => api('hr', 'post', '/hiring/plans').send({ departmentId: ids.eng, fyStart: 2029, lines: [{ designationId: ids.qa, count: 1 }], ...body });
    await send({ lines: [] }).expect(400);
    await send({ lines: [{ designationId: ids.qa, count: 0 }] }).expect(400);
    await send({ lines: [{ designationId: ids.qa, count: 1, budget: -1 }] }).expect(400);
    await send({ lines: [{ designationId: 'not-a-uuid', count: 1 }] }).expect(400);
    await send({ fyStart: 1999 }).expect(400);
    await send({ departmentId: randomUUID() }).expect(400);
    await send({ note: 'x'.repeat(1001) }).expect(400);
    await send({ extra: true }).expect(400);
    await api('hr', 'put', '/hiring/plans/not-a-uuid').send({}).expect(400);
  });
});
