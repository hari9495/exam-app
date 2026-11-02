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

// Performance designs PRF-01 … PRF-06 made live (performance builder 1), end to end against the real database (forced
// RLS, the app role). The home per role (employee, manager, HR, another company); the goal lists carry key results and
// the last check-in; the manager approves or sends back a person's goals only when the approval is theirs; HR suggests
// a parent on the map; the control room's names behind a stage, overdue by owner, reminders and a later deadline; the
// acknowledgement with a disagreement in one step and the section scores of a released review. Positive and negative
// cases: employee, manager, HR, another company, bad input, a repeat and a stale version.

describe('Performance PRF-01 … 06 (design wiring)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'meena';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Section = { id: string; title: string; questions: { id: string; text: string; answer: string; wholeSection: boolean }[] };
  type Review = { id: string; status: string; template: { sections: Section[] }; sectionScores: { title: string; score: number }[]; finalScore: number | null; can: Record<string, boolean>; disagreements: { text: string }[] };
  const answers = (r: Review, stage: string, ratings: Record<string, number>) =>
    r.template.sections.flatMap((s) => s.questions.map((q) => (q.wholeSection ? (s.title in ratings ? { questionId: q.id, rating: ratings[s.title] } : null) : { questionId: q.id, text: `${stage} answer` }))).filter(Boolean);

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

    planId = (await prisma.plan.create({ data: { name: `prf1-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PRF1 Org ${k}`, slug: `prf1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [['adminA', 'A', 'org_admin'], ['adminB', 'B', 'org_admin'], ['head', 'A', 'panel'], ['priya', 'A', 'panel'], ['arjun', 'A', 'panel'], ['meena', 'A', 'panel']];
    for (const [who, k, role] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = role === 'panel' ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: '[]' } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prf1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@prf1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.sales = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      const boardId = randomUUID();
      ids.board = (await tx.department.create({ data: { ...x, id: boardId, name: 'Board', code: 'BRD', path: `/${boardId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who | null, given: string, code: string, manager: string | null, dept = ids.sales) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', ...(who ? { userId: users[who], workEmail: `${who}@prf1-${run}.test` } : {}), assignment: { locationId: ids.loc, departmentId: dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).then((r) => {
        if (r.status !== 201) throw new Error(`hire ${given}: ${JSON.stringify(r.body)}`);
        return r;
      })).body.id as string;
    emp.chandra = await hire(null, 'Chandra', 'KF-000', null, ids.board);
    emp.head = await hire('head', 'Arun', 'KF-001', emp.chandra);
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head);
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya);
    emp.meena = await hire('meena', 'Meena', 'KF-004', emp.priya);
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    ids.template = ((await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[]).find((t) => t.kind === 'annual')!.id;
    ids.period = (await api('adminA', 'post', '/goal-periods').send({ name: `FY ${run}`, fromOn: shift(today, -30), toOn: shift(today, 150) }).expect(201)).body.id;
    ids.company = (await api('adminA', 'post', '/goals').send({ periodId: ids.period, ownerType: 'company', parentGoalId: null, kind: 'okr', title: 'Grow revenue 20%', description: null, weight: 0, keyResults: [{ title: 'Revenue', unit: 'crore', direction: 'up', start: 100, target: 120 }] }).expect(201)).body.id;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('goal lists carry key results, the last check-in and the weights (PRF-02)', async () => {
    const g = (await api('arjun', 'post', '/goals').send({ periodId: ids.period, ownerType: 'person', parentGoalId: null, kind: 'okr', title: 'Close three new accounts', description: null, weight: 100, keyResults: [{ title: 'Accounts', unit: null, direction: 'up', start: 0, target: 3 }] }).expect(201)).body;
    ids.goal = g.id;
    const mine = (await api('arjun', 'get', `/goals?period=${ids.period}&view=mine`).expect(200)).body;
    expect(mine).toMatchObject({ totalWeight: 100, canDecide: false });
    expect(mine.goals[0]).toMatchObject({ id: g.id, confidence: null, lastCheckIn: null, keyResults: [{ title: 'Accounts', start: 0, target: 3, current: 0, progress: 0 }] });
    // Bad input: an unknown view.
    await api('arjun', 'get', `/goals?period=${ids.period}&view=everyone`).expect(400);
  });

  it('only the manager whose approval it is approves or sends back the goals; others are refused (PRF-02)', async () => {
    await api('arjun', 'post', '/goals/submit').send({ periodId: ids.period }).expect(200);
    const asManager = (await api('priya', 'get', `/goals?period=${ids.period}&view=employee&employeeId=${emp.arjun}`).expect(200)).body;
    expect(asManager).toMatchObject({ canDecide: true, totalWeight: 100 });
    expect(asManager.goals[0].status).toBe('submitted');
    // The manager's home lists the goals to approve, linked to the person's goals page.
    expect((await api('priya', 'get', '/home').expect(200)).body.actions).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'Goals', href: `/yx/performance/goals?employee=${emp.arjun}` })]));
    // Meena (a colleague) cannot even read them; the employee cannot approve their own; another company sees nothing.
    await api('meena', 'get', `/goals?period=${ids.period}&view=employee&employeeId=${emp.arjun}`).expect(404);
    await api('arjun', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'approve' }).expect(403);
    await api('adminB', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'approve' }).expect(403);
    // Bad input: sending back needs what to change; an unknown decision is refused.
    await api('priya', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'send_back', reason: 'x' }).expect(400);
    await api('priya', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'maybe' }).expect(400);
    const back = (await api('priya', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'send_back', reason: 'Add a target for repeat orders' }).expect(200)).body;
    expect(back).toMatchObject({ canDecide: false });
    expect(back.goals[0].status).toBe('draft');
    // A repeat after the decision is refused; the resent set is approved.
    await api('priya', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'approve' }).expect(403);
    await api('arjun', 'post', '/goals/submit').send({ periodId: ids.period }).expect(200);
    const ok = (await api('priya', 'post', '/goals/decide').send({ employeeId: emp.arjun, periodId: ids.period, decision: 'approve' }).expect(200)).body;
    expect(ok.goals[0].status).toBe('active');
    await api('arjun', 'post', `/goals/${ids.goal}/checkins`).send({ values: [{ keyResultId: ok.goals[0].keyResults[0].id, value: 1 }], confidence: 'at_risk', note: null }).expect(201);
    const after = (await api('arjun', 'get', `/goals?period=${ids.period}&view=mine`).expect(200)).body.goals[0];
    expect(after).toMatchObject({ confidence: 'at_risk', lastCheckIn: today, keyResults: [{ current: 1 }] });
  });

  it('the goal map has department and confidence; only goal managers suggest a parent, in the same company (PRF-03)', async () => {
    const map = (await api('adminA', 'get', `/goal-map?period=${ids.period}`).expect(200)).body as { goals: { id: string; departmentId: string | null; confidence: string | null }[]; unaligned: string[] };
    expect(map.goals.find((g) => g.id === ids.goal)).toMatchObject({ departmentId: ids.sales, confidence: 'at_risk' });
    expect(map.unaligned).toContain(ids.goal);
    await api('priya', 'post', `/goals/${ids.goal}/suggest-parent`).send({ parentGoalId: ids.company }).expect(403);
    await api('adminB', 'post', `/goals/${ids.goal}/suggest-parent`).send({ parentGoalId: ids.company }).expect(404);
    await api('adminA', 'post', `/goals/${ids.goal}/suggest-parent`).send({ parentGoalId: 'not-a-uuid' }).expect(400);
    await api('adminA', 'post', `/goals/${ids.goal}/suggest-parent`).send({ parentGoalId: ids.goal }).expect(400);
    expect((await api('adminA', 'post', `/goals/${ids.goal}/suggest-parent`).send({ parentGoalId: ids.company }).expect(200)).body).toEqual({ id: ids.goal, suggested: ids.company });
    const audit = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'perf.goal.parent_suggested', entityId: ids.goal } }));
    expect(audit).toBeTruthy();
  });

  it('the home shows each role its own part; another company sees none of it (PRF-01)', async () => {
    const e = (await api('arjun', 'get', '/home').expect(200)).body;
    expect(e).toMatchObject({ persona: 'emp', name: 'Arjun', period: { id: ids.period }, hr: null, team: [] });
    expect(e.myGoals.map((g: { id: string }) => g.id)).toEqual([ids.goal]);
    const m = (await api('priya', 'get', '/home').expect(200)).body;
    expect(m.persona).toBe('mgr');
    expect(m.team.map((t: { id: string }) => t.id).sort()).toEqual([emp.arjun, emp.meena].sort());
    expect(m.team.find((t: { id: string }) => t.id === emp.arjun)).toMatchObject({ goalProgress: 33, reviewStage: 'No review running' });
    expect(m.teamGoals.map((g: { id: string }) => g.id)).toEqual(expect.arrayContaining([ids.goal]));
    const h = (await api('adminA', 'get', '/home').expect(200)).body;
    expect(h.persona).toBe('hr');
    expect(h.hr).toMatchObject({ cycles: [], ratingDistribution: null, goalsAligned: 0 });
    const b = (await api('adminB', 'get', '/home').expect(200)).body;
    expect(b).toMatchObject({ persona: 'hr', period: null, myGoals: [], team: [], hr: { cycles: [], goalsAligned: null } });
  });

  it('the control room: names behind a stage, overdue by owner, reminders and a later deadline (PRF-04)', async () => {
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send({ name: `FY ${run}`, kind: 'annual', periodFrom: shift(today, -200), periodTo: shift(today, -1), templateId: ids.template, population: sales, stages: [{ key: 'self', dueOn: shift(today, 7) }, { key: 'manager', dueOn: shift(today, 14) }], eligibilityRules: { cutoffMonths: 0, rateLeavers: false } }).expect(201)).body;
    ids.cycle = c.id;
    // Everyone in Sales has a manager (Chandra, who has none, is on the Board), so it launches.
    expect((await api('adminA', 'post', `/cycles/${c.id}/preflight`).expect(200)).body.problems).toEqual([]);
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    const people = (await api('adminA', 'get', `/cycles/${c.id}/funnel/people?stage=self`).expect(200)).body as { reviewId: string; employee: string; owner: string; dueOn: string; overdue: boolean }[];
    expect(people.map((p) => p.employee)).toEqual(expect.arrayContaining([`Arjun ${run}`, `Meena ${run}`]));
    expect(people.every((p) => p.dueOn === shift(today, 7) && !p.overdue)).toBe(true);
    ids.arjunReview = people.find((p) => p.employee === `Arjun ${run}`)!.reviewId;
    // The employee's home: the self review to do and the review's stages.
    const home = (await api('arjun', 'get', '/home').expect(200)).body;
    expect(home.actions).toEqual(expect.arrayContaining([expect.objectContaining({ href: `/yx/performance/reviews/${ids.arjunReview}`, actionLabel: 'Start' })]));
    expect(home.myReview).toMatchObject({ id: ids.arjunReview, stage: 'self', stages: [{ key: 'self' }, { key: 'manager' }] });
    await api('adminA', 'get', `/cycles/${c.id}/funnel/people?stage=everyone`).expect(400);
    await api('priya', 'get', `/cycles/${c.id}/funnel/people?stage=self`).expect(403);
    await api('adminB', 'get', `/cycles/${c.id}/funnel/people?stage=self`).expect(404);
    expect((await api('adminA', 'get', `/cycles/${c.id}/overdue`).expect(200)).body).toEqual([]);
    await api('adminA', 'post', `/cycles/${c.id}/remind`).send({ overdueOnly: true }).expect(409);
    expect((await api('adminA', 'post', `/cycles/${c.id}/remind`).send({}).expect(200)).body.reminded).toBeGreaterThanOrEqual(2);
    await api('priya', 'post', `/cycles/${c.id}/remind`).send({}).expect(403);
    // The self review is now overdue (deadline moved into the past in the data): grouped by who owes it.
    await inA((tx) => tx.reviewCycle.update({ where: { id: c.id }, data: { stages: [{ key: 'self', dueOn: shift(today, -2), optional: false }, { key: 'manager', dueOn: shift(today, 14), optional: false }] } }));
    const late = (await api('adminA', 'get', `/cycles/${c.id}/overdue`).expect(200)).body as { owner: string; count: number; stage: string }[];
    expect(late.find((o) => o.owner === `Arjun ${run}`)).toMatchObject({ count: 1, stage: 'Self review' });
    expect((await api('adminA', 'post', `/cycles/${c.id}/remind`).send({ overdueOnly: true }).expect(200)).body.reminded).toBeGreaterThanOrEqual(2);
    // Extend: never earlier, never past the next stage, never on a stale version; audited with before and after.
    const v = (await api('adminA', 'get', `/cycles/${c.id}`).expect(200)).body.version as number;
    await api('adminA', 'post', `/cycles/${c.id}/extend`).send({ stage: 'self', dueOn: shift(today, -3), version: v }).expect(400);
    await api('adminA', 'post', `/cycles/${c.id}/extend`).send({ stage: 'self', dueOn: shift(today, 20), version: v }).expect(400);
    await api('adminA', 'post', `/cycles/${c.id}/extend`).send({ stage: 'self', dueOn: 'soon', version: v }).expect(400);
    await api('adminA', 'post', `/cycles/${c.id}/extend`).send({ stage: 'self', dueOn: shift(today, 5), version: v - 1 }).expect(409);
    await api('priya', 'post', `/cycles/${c.id}/extend`).send({ stage: 'self', dueOn: shift(today, 5), version: v }).expect(403);
    const ext = (await api('adminA', 'post', `/cycles/${c.id}/extend`).send({ stage: 'self', dueOn: shift(today, 5), version: v }).expect(200)).body;
    expect(ext.stages[0]).toMatchObject({ key: 'self', dueOn: shift(today, 5) });
    expect((await api('adminA', 'get', `/cycles/${c.id}/overdue`).expect(200)).body).toEqual([]);
    const audit = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'perf.cycle.deadline_extended', entityId: c.id } }));
    expect(audit).toBeTruthy();
  });

  it('a released review shows section scores; acknowledging with a disagreement is one step, checked and not repeatable (PRF-05, PRF-06)', async () => {
    let r = (await api('arjun', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body as Review;
    expect(r.sectionScores).toEqual([]);
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/entries/self/submit`).send({ answers: answers(r, 'self', { Goals: 4, Competencies: 4 }) }).expect(200);
    const m = (await api('priya', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body as Review;
    await api('priya', 'post', `/reviews/${ids.arjunReview}/entries/manager/submit`).send({ answers: answers(m, 'manager', { Goals: 4, Competencies: 3 }) }).expect(200);
    // Not released yet: the employee cannot acknowledge.
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({}).expect(409);
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(200);
    r = (await api('arjun', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body as Review;
    expect(r.sectionScores).toEqual(expect.arrayContaining([{ title: 'Goals', score: 4 }, { title: 'Competencies', score: 3 }]));
    expect(r.can.acknowledge).toBe(true);
    // Someone else's review, a too-short disagreement and an unknown field are refused.
    await api('meena', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({}).expect(404);
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({ disagreement: 'Too short' }).expect(400);
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({ rating: 5 }).expect(400);
    r = (await api('arjun', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({ comment: 'Thanks', disagreement: 'Goal 1 rating does not count the vendor delay we agreed in my 1:1.' }).expect(200)).body as Review;
    expect(r).toMatchObject({ status: 'acknowledged', disagreements: [{ text: 'Goal 1 rating does not count the vendor delay we agreed in my 1:1.' }] });
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({}).expect(409);
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/disagree`).send({ text: 'Again, please look at it.' }).expect(409);
    // HR's home lists the disagreement to answer and the released bands.
    const h = (await api('adminA', 'get', '/home').expect(200)).body;
    expect(h.actions.some((a: { href: string }) => a.href === `/yx/performance/cycles/${ids.cycle}`)).toBe(true);
    expect(h.hr.ratingDistribution).toMatchObject({ rows: [{ dept: 'Sales', size: 1 }] });
  });
});
