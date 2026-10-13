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

// Recruitment batch AT2 end to end (M10-BUILD-DESIGN §5; founder D3, D5): a department's headcount plan is approved
// through P03 by someone other than its author; requisitions run on P03 with the company's existing requisition chain
// as the route; outside the plan or over the line the extra step is added; the plan mode decides what is required;
// committed openings are counted from the jobs (closing a job releases them); a P03 request can be withdrawn.

describe('Recruitment batch AT2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrPlan' | 'fin' | 'rec' | 'approver';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const tasksOf = (who: Who) => inA((tx) => tx.wfTask.findMany({ where: { assigneeUserId: users[who], status: 'open' } }));
  const decide = async (who: Who, decision: 'approve' | 'reject' = 'approve') => {
    const [t] = await tasksOf(who);
    expect(t).toBeDefined();
    await request(server()).post(`/api/v1/workflow/approvals/tasks/${t.id}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision, ...(decision === 'reject' ? { reason: 'Not this quarter' } : {}) }).expect(200);
  };
  const setMode = (value: string) => api('adminA', 'put', '/org/settings').send({ key: 'ats.headcount_plan', scopeType: 'tenant', value }).expect(200);

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

    planId = (await prisma.plan.create({ data: { name: `ats2-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ATS2 Org ${k}`, slug: `ats2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrPlan', 'A', 'panel', ['ats.headcount.manage', 'pipeline:manage', 'results:view']],
      ['fin', 'A', 'panel', ['ats.headcount.manage']],
      ['rec', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage']],
      ['approver', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@ats2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@ats2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      for (const [k, name, code] of [['fin', 'Finance', 'FIN'], ['ops', 'Operations', 'OPS']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.acct = (await tx.designation.create({ data: { ...x, name: 'Accountant', code: 'ACC' } })).id;
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a plan is approved through P03 by someone other than its author; approved plans are not edited (AT-2.01)', async () => {
    await api('rec', 'get', '/hiring/plans').expect(403);
    const p = (await api('hrPlan', 'post', '/hiring/plans').send({ departmentId: ids.fin, fyStart: 2026, lines: [{ designationId: ids.acct, count: 2, budget: 2_000_000 }] }).expect(201)).body;
    ids.plan = p.id;
    ids.line = p.lines[0].id;
    expect(p).toMatchObject({ department: 'Finance', status: 'draft', lines: [{ designation: 'Accountant', count: 2, budget: 2_000_000, committed: 0, filled: 0 }] });
    await api('hrPlan', 'post', '/hiring/plans').send({ departmentId: ids.fin, fyStart: 2026, lines: [{ designationId: ids.acct, count: 1 }] }).expect(409);
    await api('hrPlan', 'post', '/hiring/plans').send({ departmentId: ids.ops, fyStart: 2026, lines: [{ designationId: randomUUID(), count: 1 }] }).expect(400);
    await api('hrPlan', 'post', `/hiring/plans/${p.id}/submit`).send({ version: p.version }).expect(200);
    expect(await tasksOf('hrPlan')).toHaveLength(0);
    await decide('fin');
    const [after] = (await api('hrPlan', 'get', '/hiring/plans?fy=2026').expect(200)).body;
    expect(after.status).toBe('approved');
    await api('hrPlan', 'put', `/hiring/plans/${p.id}`).send({ departmentId: ids.fin, fyStart: 2026, lines: [{ designationId: ids.acct, count: 5 }], version: after.version }).expect(409);
  });

  it('the company’s requisition chain is the route, run on P03; approval opens the job (AT-2.02, AT-2.03)', async () => {
    await api('adminA', 'put', '/organizations/approvals/chains/requisition').send({ enabled: true, steps: [{ name: 'Department head', approverType: 'users', approverUserIds: [users.approver] }] }).expect(200);
    const j = (await api('rec', 'post', '/jobs').send({ title: `Accountant ${run}`, departmentId: ids.fin, designationId: ids.acct, headcountPlanLineId: ids.line, budgetAmount: 900_000, requisitionReason: 'new' }).expect(201)).body;
    expect(j.status).toBe('draft');
    ids.job1 = j.id;
    expect((await api('rec', 'post', `/jobs/${j.id}/submit`).expect(201)).body.status).toBe('pending_approval');
    const req = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: j.id } }));
    expect(req.requestType).toBe('ats.requisition');
    expect((req.steps as { name: string }[]).map((s) => s.name)).toEqual(['Department head']);
    // Nothing went to the older engine.
    expect(await inA((tx) => tx.approvalRequest.count({ where: { subjectId: j.id } }))).toBe(0);
    await decide('approver');
    const after = (await api('rec', 'get', `/jobs/${j.id}`).expect(200)).body;
    expect(after.status).toBe('open');
    expect(after.approval).toMatchObject({ steps: [{ name: 'Department head', state: 'approved' }] });
    const [plan] = (await api('hrPlan', 'get', '/hiring/plans?fy=2026').expect(200)).body;
    expect(plan.lines[0]).toMatchObject({ committed: 1, committedBudget: 900_000 });
  });

  it('over the line or outside the plan adds the extra step; reasons are required; a P03 request can be withdrawn (AT-2.02)', async () => {
    const j = (await api('rec', 'post', '/jobs').send({ title: `Two more ${run}`, headcount: 2, headcountPlanLineId: ids.line, budgetAmount: 1_500_000 }).expect(201)).body;
    await api('rec', 'post', `/jobs/${j.id}/submit`).expect(201);
    const req = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: j.id } }));
    expect((req.steps as { name: string }[]).map((s) => s.name)).toEqual(['Department head', 'Outside the plan']);
    expect((req.summary as { label: string; value: string }[]).find((s) => s.label === 'Needs finance')?.value).toMatch(/more openings.*budget/);
    await api('rec', 'post', `/jobs/${j.id}/approval/cancel`).expect(201);
    expect((await api('rec', 'get', `/jobs/${j.id}`).expect(200)).body.status).toBe('draft');
    expect((await inA((tx) => tx.wfRequest.findUniqueOrThrow({ where: { id: req.id } }))).status).toBe('withdrawn');

    const out = (await api('rec', 'post', '/jobs').send({ title: `New client ${run}`, outsidePlan: true }).expect(201)).body;
    expect((await api('rec', 'post', `/jobs/${out.id}/submit`).expect(400)).body.message).toMatch(/outside the plan/);
    const rep = (await api('rec', 'post', '/jobs').send({ title: `Replacement ${run}`, requisitionReason: 'replacement' }).expect(201)).body;
    expect((await api('rec', 'post', `/jobs/${rep.id}/submit`).expect(400)).body.message).toMatch(/replaces/);
  });

  it('plan modes: off and advisory without a chain open jobs at once; required asks for a line or a reason (D5)', async () => {
    await api('adminA', 'put', '/organizations/approvals/chains/requisition').send({ enabled: false, steps: [] }).expect(200);
    expect((await api('rec', 'post', '/jobs').send({ title: `Open now ${run}` }).expect(201)).body.status).toBe('open');
    await setMode('required');
    const j = (await api('rec', 'post', '/jobs').send({ title: `Needs a line ${run}` }).expect(201)).body;
    expect(j.status).toBe('draft');
    expect((await api('rec', 'post', `/jobs/${j.id}/submit`).expect(400)).body.message).toMatch(/approved headcount plan/);
    await api('rec', 'patch', `/jobs/${j.id}`).send({ outsidePlan: true, outsidePlanReason: 'New plant opening' }).expect(200);
    await api('rec', 'post', `/jobs/${j.id}/submit`).expect(201);
    const req = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: j.id } }));
    expect((req.steps as { name: string }[]).map((s) => s.name)).toEqual(['Outside the plan']);
    await decide('hrPlan', 'reject');
    expect((await api('rec', 'get', `/jobs/${j.id}`).expect(200)).body.status).toBe('draft');
    await setMode('advisory');
  });

  it('closing a job releases its openings; a line of another company is refused; companies apart (AT-2.04)', async () => {
    await api('rec', 'patch', `/jobs/${ids.job1}`).send({ status: 'closed' }).expect(200);
    const [plan] = (await api('hrPlan', 'get', '/hiring/plans?fy=2026').expect(200)).body;
    expect(plan.lines[0].committed).toBe(0);
    const lines = (await api('rec', 'get', `/hiring/plan-lines?departmentId=${ids.fin}`).expect(200)).body;
    expect(lines).toEqual([expect.objectContaining({ id: ids.line, left: 2, department: 'Finance', fyStart: 2026 })]);
    expect((await api('adminB', 'post', '/jobs').send({ title: 'Other', headcountPlanLineId: ids.line }).expect(400)).body.message).toMatch(/headcount plan/);
    expect((await api('adminB', 'get', '/hiring/plans').expect(200)).body).toEqual([]);
    await expect(inA((tx) => tx.$executeRaw`DELETE FROM headcount_plans WHERE id = ${ids.plan}::uuid`)).rejects.toThrow(/permission denied/);
  });
});
