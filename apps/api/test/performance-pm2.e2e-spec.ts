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
import { PerformanceGoalsService } from '../src/performance/goals.service';

// Performance batch PM2 end to end against the real database (forced RLS, the app role): goal periods and company
// and team goals by goal managers; a person's goals sent to their manager together and approved there (D2); Arjun's
// key result aligned under Priya's goal, under the team goal (U70), with progress worked out from key results and
// rolled up (U71); a typed figure refused; a change to an approved goal only with a reason and the manager's yes;
// alignment in a circle refused; cascade to one's own team only; who sees whose goals; reminders; companies apart.

describe('Performance batch PM2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'hr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Goal = { id: string; status: string; progress: number; version: number; parentGoalId: string | null; pendingChange: unknown; keyResults: { id: string; progress: number }[]; can: Record<string, boolean> };
  const goal = async (who: Who, id: string) => (await api(who, 'get', `/goals/${id}`).expect(200)).body as Goal;
  /** The approver's open P03 task on the goal's request, decided through the shared approvals route. */
  const decide = async (who: Who, goalId: string, decision: 'approve' | 'reject', reason?: string) => {
    const g = await inA((tx) => tx.goal.findFirstOrThrow({ where: { id: goalId } }));
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: g.wfRequestId!, status: 'open' } }));
    return (await request(server()).post(`/api/v1/workflow/approvals/tasks/${task.id}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision, ...(reason ? { reason } : {}) })).status;
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
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `pm2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM2 Org ${k}`, slug: `pm2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['hr', 'A', 'panel', ['perf.goal.view', 'perf.goal.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@pm2-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null);
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head);
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya);
    emp.sita = await hire('sita', 'Sita', 'KF-004', emp.priya);
    emp.hr = await hire('hr', 'Meena', 'KF-005', emp.head);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  const okr = (title: string, o: Record<string, unknown> = {}) => ({ periodId: ids.period, ownerType: 'person', kind: 'okr', title, weight: 60, keyResults: [{ title: 'Close accounts', direction: 'up', start: 0, target: 3 }], ...o });

  it('goal managers open periods and set company and team goals; others cannot (PM-2.01)', async () => {
    await api('arjun', 'post', '/goal-periods').send({ name: `H2 ${run}`, fromOn: shift(today, -30), toOn: shift(today, 150) }).expect(403);
    ids.period = (await api('hr', 'post', '/goal-periods').send({ name: `H2 ${run}`, fromOn: shift(today, -30), toOn: shift(today, 150) }).expect(201)).body.id;
    await api('arjun', 'post', '/goals').send({ periodId: ids.period, ownerType: 'company', kind: 'kpi', title: 'Grow revenue', weight: 0, keyResults: [] }).expect(403);
    const team = (await api('hr', 'post', '/goals').send({ periodId: ids.period, ownerType: 'team', ownerDepartmentId: ids.dept, kind: 'kpi', title: 'Sales team revenue', weight: 0, keyResults: [] }).expect(201)).body as Goal;
    expect(team.status).toBe('active');
    ids.team = team.id;
    await api('hr', 'post', '/goals').send({ periodId: ids.period, ownerType: 'okr', kind: 'okr', title: 'x', weight: 0, keyResults: [] }).expect(400);
    await api('hr', 'post', '/goals').send({ periodId: ids.period, ownerType: 'company', kind: 'okr', title: 'Objective with no key results', weight: 0, keyResults: [] }).expect(400);
  });

  it('a person’s goals go to their manager together; the manager approves (D2); Arjun aligns under Priya, who aligns under the team goal (U70)', async () => {
    let p = (await api('priya', 'post', '/goals').send({ periodId: ids.period, ownerType: 'person', kind: 'kpi', title: 'Grow my team’s revenue', weight: 100, parentGoalId: ids.team, keyResults: [] }).expect(201)).body as Goal;
    ids.priyaGoal = p.id;
    await api('priya', 'post', '/goals/submit').send({ periodId: ids.period }).expect(200);
    expect(await decide('head', ids.priyaGoal, 'approve')).toBe(200);
    p = await goal('priya', ids.priyaGoal);
    expect(p.status).toBe('active');

    const options = (await api('arjun', 'get', `/goals/align-options?period=${ids.period}`).expect(200)).body as { id: string }[];
    expect(options.map((o) => o.id)).toEqual(expect.arrayContaining([ids.team, ids.priyaGoal]));
    await api('arjun', 'post', '/goals').send(okr('Bad target', { keyResults: [{ title: 'Close accounts', direction: 'up', start: 3, target: 3 }] })).expect(400);
    let a = (await api('arjun', 'post', '/goals').send(okr('Close three new accounts', { parentGoalId: ids.priyaGoal })).expect(201)).body as Goal;
    ids.arjunGoal = a.id;
    const mine = (await api('arjun', 'get', `/goals?period=${ids.period}&view=mine`).expect(200)).body;
    expect(mine.totalWeight).toBe(60);
    await api('arjun', 'post', '/goals/submit').send({ periodId: ids.period }).expect(200);
    // The person cannot approve their own goals; their manager does.
    expect(await decide('arjun', ids.arjunGoal, 'approve')).toBeGreaterThanOrEqual(400);
    expect(await decide('priya', ids.arjunGoal, 'approve')).toBe(200);
    a = await goal('arjun', ids.arjunGoal);
    expect(a).toMatchObject({ status: 'active', parentGoalId: ids.priyaGoal });
  });

  it('progress comes from the key results and rolls up; a typed figure is refused (U71)', async () => {
    const a = await goal('arjun', ids.arjunGoal);
    await api('arjun', 'post', `/goals/${a.id}/checkins`).send({ values: [], progress: 80, confidence: 'on_track' }).expect(400);
    const after = (await api('arjun', 'post', `/goals/${a.id}/checkins`).send({ values: [{ keyResultId: a.keyResults[0].id, value: 2 }], confidence: 'on_track', note: 'Two signed' }).expect(201)).body as Goal;
    expect(after.progress).toBe(66.67);
    expect((await goal('priya', ids.priyaGoal)).progress).toBe(66.67);
    expect((await goal('hr', ids.team)).progress).toBe(66.67);
    // Priya, his manager, can check in too; Sita, a peer, cannot even see the goal.
    await api('priya', 'post', `/goals/${a.id}/checkins`).send({ values: [{ keyResultId: a.keyResults[0].id, value: 2 }], confidence: 'at_risk' }).expect(201);
    await api('sita', 'get', `/goals/${a.id}`).expect(404);
  });

  it('an approved goal changes only with a reason and the manager’s yes; a circle is refused', async () => {
    let a = await goal('arjun', ids.arjunGoal);
    const changed = { ...okr('Close four new accounts', { parentGoalId: ids.priyaGoal, keyResults: [{ title: 'Close accounts', direction: 'up', start: 0, target: 4 }] }), version: a.version };
    await api('arjun', 'put', `/goals/${a.id}`).send(changed).expect(400);
    a = (await api('arjun', 'put', `/goals/${a.id}`).send({ ...changed, reason: 'A fourth client joined the pipeline' }).expect(200)).body;
    expect(a.pendingChange).toBeTruthy();
    expect(a.progress).toBe(66.67);
    expect(await decide('priya', a.id, 'reject', 'Keep it at three')).toBe(200);
    a = await goal('arjun', a.id);
    expect(a.pendingChange).toBeNull();
    a = (await api('arjun', 'put', `/goals/${a.id}`).send({ ...changed, version: a.version, reason: 'A fourth client joined the pipeline' }).expect(200)).body;
    expect(await decide('priya', a.id, 'approve')).toBe(200);
    a = await goal('arjun', a.id);
    expect(a.progress).toBe(50);

    const team = await goal('hr', ids.team);
    expect((await api('hr', 'put', `/goals/${team.id}`).send({ periodId: ids.period, ownerType: 'team', ownerDepartmentId: ids.dept, kind: 'kpi', title: 'Sales team revenue', weight: 0, keyResults: [], parentGoalId: ids.arjunGoal, version: team.version }).expect(400)).body.message).toBe('That would make the goals align in a circle.');
  });

  it('cascade reaches only one’s own team; HR sees the company map with what is not aligned', async () => {
    const made = (await api('priya', 'post', `/goals/${ids.priyaGoal}/cascade`).send({ employeeIds: [emp.sita] }).expect(201)).body.created as string[];
    expect((await goal('sita', made[0])).parentGoalId).toBe(ids.priyaGoal);
    await api('priya', 'post', `/goals/${ids.priyaGoal}/cascade`).send({ employeeIds: [emp.head] }).expect(403);
    await api('arjun', 'get', `/goal-map?period=${ids.period}`).expect(403);
    const map = (await api('hr', 'get', `/goal-map?period=${ids.period}`).expect(200)).body as { goals: { id: string }[]; unaligned: string[] };
    expect(map.goals.map((g) => g.id)).toEqual(expect.arrayContaining([ids.team, ids.priyaGoal, ids.arjunGoal]));
    expect(map.unaligned).toEqual([]);
    const team = (await api('priya', 'get', `/goals?period=${ids.period}&view=team`).expect(200)).body.goals as { id: string }[];
    expect(team.map((g) => g.id)).toContain(ids.arjunGoal);
  });

  it('a goal without a check-in for the interval gets one reminder (PM-2.03)', async () => {
    const svc = app.get(PerformanceGoalsService);
    const later = shift(today, 40);
    expect(await svc.sweepOrg(org.A.id, later)).toBeGreaterThan(0);
    expect(await svc.sweepOrg(org.A.id, later)).toBe(0);
  });

  it('two companies stay apart', async () => {
    await api('adminB', 'get', `/goals/${ids.arjunGoal}`).expect(404);
    expect((await api('adminB', 'get', '/goal-periods').expect(200)).body).toEqual([]);
  });
});
