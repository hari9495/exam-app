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
import { PerformanceReviewsService } from '../src/performance/reviews.service';

// Performance batch PM4 end to end against the real database (forced RLS, the app role): a cycle on the starter annual
// template; the pre-flight check names people with no manager and launch is refused until the population leaves them
// out; J11 eligibility (a February joiner left out, a July joiner 9 of 12 months, maternity counted as served); the
// employee sees the stage, never a score (U69); the manager waits for the self review and reads it only after saving
// a draft of their own; a section left unrated is named and left out of the score (YX-PERF-02); HR overrides with a
// reason; reminders; companies apart.

describe('Performance batch PM4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'ravi' | 'hr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Section = { id: string; title: string; questions: { id: string; text: string; answer: string; wholeSection: boolean }[] };
  type Review = { id: string; role: string; status: string; next: { stage: string; label: string }; self: { status: string } | null; managerEntry: unknown; finalScore: number | null; band: string | null; excludedSections: string[]; template: { sections: Section[] }; can: { self: boolean; manager: boolean }; version: number };
  const cycleBody = (o: Record<string, unknown> = {}) => ({ name: `FY 2025-26 ${run}`, kind: 'annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', templateId: ids.template, population: null, stages: [{ key: 'self', dueOn: shift(today, 7) }, { key: 'manager', dueOn: shift(today, 14) }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false }, ...o });
  /** Every text question answered; the given whole-section ratings. */
  const answers = (r: Review, stage: 'self' | 'manager', ratings: Record<string, number>) =>
    r.template.sections.filter((s) => s.title !== 'Competencies' || stage).flatMap((s) => s.questions.map((q) => (q.wholeSection ? (s.title in ratings ? { questionId: q.id, rating: ratings[s.title] } : null) : { questionId: q.id, text: `${stage} answer` }))).filter(Boolean);

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

    planId = (await prisma.plan.create({ data: { name: `pm4-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM4 Org ${k}`, slug: `pm4-${k.toLowerCase()}-${run}`, planId } });
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
      ['meena', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['hr', 'A', 'panel', ['perf.review.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      for (const [k, name, code] of [['sales', 'Sales', 'SAL'], ['ops', 'Operations', 'OPS']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null, dept: string, joinedOn: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn, userId: users[who], workEmail: `${who}@pm4-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).then((r) => {
        if (r.status !== 201) throw new Error(`hire ${who}: ${JSON.stringify(r.body)}`);
        return r;
      })).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops', '2020-01-06');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'sales', '2022-01-03');
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya, 'sales', '2025-07-01');
    emp.sita = await hire('sita', 'Sita', 'KF-004', emp.priya, 'sales', '2026-02-02');
    emp.meena = await hire('meena', 'Meena', 'KF-005', emp.priya, 'sales', '2022-06-01');
    emp.ravi = await hire('ravi', 'Ravi', 'KF-006', null, 'ops', '2021-06-01');
    emp.hr = await hire('hr', 'Lakshmi', 'KF-007', emp.head, 'ops', '2021-06-01');
    // Meena's maternity leave inside the period (YX-PERF-21).
    await inA(async (tx) => {
      const lt = await tx.leaveType.create({ data: { organizationId: org.A.id, code: `MAT${run.slice(0, 4)}`, name: 'Maternity', kind: 'maternity' } });
      await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: emp.meena, leaveTypeId: lt.id, fromOn: new Date('2025-09-01T00:00:00Z'), toOn: new Date('2026-02-27T00:00:00Z'), days: 180, status: 'approved' } });
    });
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    ids.template = templates.find((t) => t.kind === 'annual')!.id;
    ids.probation = templates.find((t) => t.kind === 'probation')!.id;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only cycle managers set up cycles; the template must be active and of the kind; stages are checked (PM-4.01)', async () => {
    await api('priya', 'post', '/cycles').send(cycleBody()).expect(403);
    await api('hr', 'get', '/cycles').expect(403);
    await api('adminA', 'post', '/cycles').send(cycleBody({ templateId: ids.probation })).expect(400);
    expect((await api('adminA', 'post', '/cycles').send(cycleBody({ stages: [{ key: 'self', dueOn: shift(today, 7) }] })).expect(400)).body.message).toMatch(/manager stage/);
    const c = (await api('adminA', 'post', '/cycles').send(cycleBody()).expect(201)).body;
    ids.cycle = c.id;
    ids.cycleVersion = String(c.version);
  });

  it('pre-flight names people with no manager; launch is refused until the population leaves them out (§6.3)', async () => {
    const pf = (await api('adminA', 'post', `/cycles/${ids.cycle}/preflight`).expect(200)).body as { problems: { text: string }[] };
    expect(pf.problems.map((p) => p.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Arun .* has no manager/), expect.stringMatching(/^Ravi .* has no manager/)]));
    expect((await api('adminA', 'post', `/cycles/${ids.cycle}/launch`).send({ version: Number(ids.cycleVersion) }).expect(409)).body.message).toMatch(/has no manager/);
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'put', `/cycles/${ids.cycle}`).send(cycleBody({ population: sales, version: Number(ids.cycleVersion) })).expect(200)).body;
    const ok = (await api('adminA', 'post', `/cycles/${ids.cycle}/preflight`).expect(200)).body;
    expect(ok).toMatchObject({ problems: [], reviewed: 3, excluded: 1, protectedLeave: 1 });
    expect((await api('adminA', 'post', `/cycles/${ids.cycle}/launch`).send({ version: c.version }).expect(200)).body).toEqual({ reviews: 3 });
    await api('adminA', 'put', `/cycles/${ids.cycle}`).send(cycleBody({ population: sales, version: c.version + 1 })).expect(409);
  });

  it('J11 eligibility: a February joiner left out, a July joiner 9 of 12 months, maternity counted as served (PM-4.02)', async () => {
    const rows = (await api('adminA', 'get', `/cycles/${ids.cycle}/eligibility`).expect(200)).body as { id: string; employeeId: string; rule: string; eligibleMonths: number; proration: number; reviewed: boolean }[];
    const of = (e: string) => rows.find((r) => r.employeeId === e)!;
    expect(of(emp.sita)).toMatchObject({ rule: 'excluded_cutoff', reviewed: false });
    expect(of(emp.arjun)).toMatchObject({ rule: 'included', eligibleMonths: 9, proration: 0.75, reviewed: true });
    expect(of(emp.meena)).toMatchObject({ rule: 'protected_leave', eligibleMonths: 12, reviewed: true });
    expect(rows.find((r) => r.employeeId === emp.ravi)).toBeUndefined();
    ids.sitaRow = of(emp.sita).id;
  });

  it('the employee sees the stage, never a score; the manager waits for the self review and reads it after their own draft (PM-4.03, U69)', async () => {
    const mine = (await api('arjun', 'get', '/reviews?view=mine').expect(200)).body as { id: string; next: { stage: string; owner: string }; finalScore: null }[];
    expect(mine).toHaveLength(1);
    expect(mine[0].next).toMatchObject({ stage: 'self', owner: expect.stringMatching(/^Arjun/) });
    ids.review = mine[0].id;
    await api('sita', 'get', `/reviews/${ids.review}`).expect(404);
    await api('head', 'get', `/reviews/${ids.review}`).expect(200);
    let r = (await api('arjun', 'get', `/reviews/${ids.review}`).expect(200)).body as Review;
    expect(r.can).toEqual({ self: true, manager: false });
    // The manager cannot answer for the employee, nor submit before the self review is due.
    await api('priya', 'put', `/reviews/${ids.review}/entries/self`).send({ answers: [] }).expect(403);
    const goals = r.template.sections.find((s) => s.title === 'Goals')!.questions[0];
    await api('arjun', 'post', `/reviews/${ids.review}/entries/self/submit`).send({ answers: [{ questionId: goals.id, rating: 4 }] }).expect(400);
    await api('arjun', 'put', `/reviews/${ids.review}/entries/self`).send({ answers: [{ questionId: goals.id, rating: 3.3 }] }).expect(400);
    r = (await api('arjun', 'post', `/reviews/${ids.review}/entries/self/submit`).send({ answers: answers(r, 'self', { Goals: 4, Competencies: 4 }) }).expect(200)).body;
    expect(r.next.stage).toBe('manager');
    expect(r.self!.status).toBe('submitted');
    // With after_manager_draft, Priya sees the self review only once she has saved her own draft.
    let m = (await api('priya', 'get', `/reviews/${ids.review}`).expect(200)).body as Review;
    expect(m.role).toBe('manager');
    expect(m.self).toBeNull();
    m = (await api('priya', 'put', `/reviews/${ids.review}/entries/manager`).send({ answers: [{ questionId: goals.id, rating: 4 }] }).expect(200)).body;
    expect(m.self).toMatchObject({ status: 'submitted' });
    // Meena's review: the manager cannot submit before the self review is due.
    const meenaReview = (await api('meena', 'get', '/reviews?view=mine').expect(200)).body[0].id;
    const mr = (await api('priya', 'get', `/reviews/${meenaReview}`).expect(200)).body as Review;
    expect((await api('priya', 'post', `/reviews/${meenaReview}/entries/manager/submit`).send({ answers: answers(mr, 'manager', { Goals: 3 }) }).expect(409)).body.message).toMatch(/Wait for the self review/);
  });

  it('a section left unrated is named and left out of the score; the employee still sees no score before release (PM-4.04, YX-PERF-02)', async () => {
    const m = (await api('priya', 'get', `/reviews/${ids.review}`).expect(200)).body as Review;
    const done = (await api('priya', 'post', `/reviews/${ids.review}/entries/manager/submit`).send({ answers: answers(m, 'manager', { Goals: 4 }) }).expect(200)).body as Review;
    expect(done).toMatchObject({ status: 'ready', finalScore: 4, band: expect.any(String), excludedSections: ['Competencies'] });
    expect(done.next.stage).toBe('release');
    const own = (await api('arjun', 'get', `/reviews/${ids.review}`).expect(200)).body as Review;
    expect(own).toMatchObject({ finalScore: null, band: null, managerEntry: null, excludedSections: [] });
    expect((await api('arjun', 'get', '/reviews?view=mine').expect(200)).body[0]).toMatchObject({ finalScore: null, band: null });
    // HR in scope reads it; the team view shows it to the manager.
    expect((await api('hr', 'get', `/reviews/${ids.review}`).expect(200)).body.finalScore).toBe(4);
    expect((await api('hr', 'get', '/reviews?view=scope').expect(200)).body.length).toBe(3);
    await api('priya', 'get', '/reviews?view=scope').expect(403);
    expect((await api('priya', 'get', '/reviews?view=team').expect(200)).body.map((x: { employeeId: string }) => x.employeeId).sort()).toEqual([emp.arjun, emp.meena, emp.priya].filter((e) => e !== emp.priya).sort());
    const funnel = (await api('adminA', 'get', `/cycles/${ids.cycle}/funnel`).expect(200)).body as { stage: string; count: number }[];
    expect(funnel.find((f) => f.stage === 'release')!.count).toBe(1);
  });

  it('HR puts a left-out person in with a reason, which opens their review (J11 override)', async () => {
    await api('adminA', 'put', `/eligibility/${ids.sitaRow}`).send({ reviewed: true, reason: 'x' }).expect(400);
    await api('adminA', 'put', `/eligibility/${ids.sitaRow}`).send({ reviewed: true, reason: 'Joined from the sister company' }).expect(200);
    expect((await api('sita', 'get', '/reviews?view=mine').expect(200)).body).toHaveLength(1);
    await api('adminA', 'put', `/eligibility/${ids.sitaRow}`).send({ reviewed: true, reason: 'Again' }).expect(409);
  });

  it('reminds owners two days before a stage is due and escalates the day after (YX-PERF-06)', async () => {
    const svc = app.get(PerformanceReviewsService);
    // Priya, Meena and Sita still owe their self reviews.
    expect(await svc.sweepOrg(org.A.id, shift(today, 5))).toEqual({ soon: 3, late: 0 });
    expect(await svc.sweepOrg(org.A.id, shift(today, 5))).toEqual({ soon: 0, late: 0 });
    // Now overdue: each of them gets a nudge, and so do their managers (Priya for Meena and Sita, Arun for Priya).
    expect(await svc.sweepOrg(org.A.id, shift(today, 8))).toEqual({ soon: 0, late: 4 });
  });

  it('keeps companies apart', async () => {
    await api('adminB', 'get', `/reviews/${ids.review}`).expect(404);
    await api('adminB', 'post', `/cycles/${ids.cycle}/preflight`).expect(404);
    expect((await api('adminB', 'get', '/cycles').expect(200)).body).toEqual([]);
  });
});
