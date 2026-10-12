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
import { markSteppedUp } from './fixtures/step-up';

// Performance batch PM4 end to end against the real database (forced RLS, the app role): a cycle on the starter annual
// template; the pre-flight check names people with no manager and launch is refused until the population leaves them
// out; J11 eligibility (a February joiner left out, a July joiner 9 of 12 months, maternity counted as served); the
// employee sees the stage, never a score (U69); the manager waits for the self review and reads it only after saving
// a draft of their own; a section left unrated is named and left out of the score (YX-PERF-02); HR overrides with a
// reason; reminders; the skip-level agrees or sends back, never rating; release, acknowledgement and a disagreement
// within the window, HR's answer and an audited reopen (YX-PERF-09); a manager change moves the open review to the new
// manager, keeps the old manager's draft hidden and flags goals aligned to the old manager's goal (D7); a probation
// cycle overlaps the annual one (PF-D4); a launch of 520 reviews; companies apart.

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
  type Who = 'adminA' | 'admin2' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'ravi' | 'hr';
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
      ['admin2', 'A', 'org_admin', null],
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
    // Chandra heads the company (no login); Arun reports to her, so every manager has a manager for skip-level reviews.
    emp.chandra = (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: 'Chandra', familyName: run, employeeCode: 'KF-000', joinedOn: '2019-01-07', assignment: { locationId: ids.loc, departmentId: ids.ops, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id;
    emp.head = await hire('head', 'Arun', 'KF-001', emp.chandra, 'ops', '2020-01-06');
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
    expect(pf.problems.map((p) => p.text)).toEqual(expect.arrayContaining([expect.stringMatching(/^Chandra .* has no manager/), expect.stringMatching(/^Ravi .* has no manager/)]));
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
    expect(r.can).toMatchObject({ self: true, manager: false });
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

  it('the skip-level agrees or sends back with a reason, and never rates (PM-4.05)', async () => {
    const half = (await api('adminA', 'get', '/templates').expect(200)).body.find((t: { kind: string }) => t.kind === 'half_yearly').id;
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send(cycleBody({ name: `H2 ${run}`, kind: 'half_yearly', templateId: half, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }, { key: 'skip', dueOn: shift(today, 20) }] })).expect(201)).body;
    ids.half = c.id;
    expect((await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200)).body.reviews).toBe(3);
    const rid = (await api('arjun', 'get', `/reviews?view=mine&cycle=${c.id}`).expect(200)).body[0].id;
    ids.halfArjun = rid;
    let m = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body as Review;
    expect(m.can.manager).toBe(true);
    m = (await api('priya', 'post', `/reviews/${rid}/entries/manager/submit`).send({ answers: answers(m, 'manager', { Goals: 3, Competencies: 4 }) }).expect(200)).body;
    expect(m.next.stage).toBe('skip');
    // Priya cannot do her own skip-level; Arun (her manager) can, and sends it back with a reason.
    await api('priya', 'post', `/reviews/${rid}/send-back`).send({ reason: 'Please look again' }).expect(403);
    await api('head', 'post', `/reviews/${rid}/send-back`).send({ reason: 'x' }).expect(400);
    let h = (await api('head', 'post', `/reviews/${rid}/send-back`).send({ reason: 'Goals rating looks low for the Hosur launch' }).expect(200)).body as Review & { finalScore: number | null };
    expect(h).toMatchObject({ finalScore: null, next: { stage: 'manager' } });
    m = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body;
    expect(m.can.manager).toBe(true);
    m = (await api('priya', 'post', `/reviews/${rid}/entries/manager/submit`).send({ answers: answers(m, 'manager', { Goals: 4, Competencies: 4 }) }).expect(200)).body;
    h = (await api('head', 'post', `/reviews/${rid}/skip/agree`).send({ comment: 'Agreed.' }).expect(200)).body;
    expect(h).toMatchObject({ status: 'ready', finalScore: 4, skipComment: 'Agreed.' });
    await api('head', 'post', `/reviews/${rid}/skip/agree`).send({}).expect(409);
  });

  it('release shows the rating; the employee acknowledges, may disagree within the window; HR answers and reopens with a reason (PM-4.06)', async () => {
    await api('arjun', 'post', `/reviews/${ids.review}/acknowledge`).send({}).expect(409);
    await api('priya', 'post', `/cycles/${ids.cycle}/release`).expect(403);
    expect((await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(200)).body).toEqual({ released: 1, notReady: 3 });
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(409);
    let own = (await api('arjun', 'get', `/reviews/${ids.review}`).expect(200)).body;
    expect(own).toMatchObject({ status: 'released', finalScore: 4, excludedSections: ['Competencies'], can: { acknowledge: true, disagree: true } });
    expect(own.managerEntry).toBeTruthy();
    own = (await api('arjun', 'post', `/reviews/${ids.review}/acknowledge`).send({ comment: 'Thanks' }).expect(200)).body;
    expect(own).toMatchObject({ status: 'acknowledged', finalScore: 4 });
    own = (await api('arjun', 'post', `/reviews/${ids.review}/disagree`).send({ text: 'The Madurai accounts were mine.' }).expect(200)).body;
    expect(own.disagreements).toEqual([expect.objectContaining({ status: 'open' })]);
    await api('arjun', 'post', `/reviews/${ids.review}/disagree`).send({ text: 'Again' }).expect(409);
    await api('priya', 'post', `/reviews/${ids.review}/disagree`).send({ text: 'Not mine' }).expect(404);
    const list = (await api('adminA', 'get', `/cycles/${ids.cycle}/disagreements`).expect(200)).body;
    expect(list).toHaveLength(1);
    await api('adminA', 'post', `/disagreements/${list[0].id}/decide`).send({ status: 'upheld', hrNote: 'Accounts confirmed; the manager will look again.' }).expect(200);
    await api('adminA', 'post', `/disagreements/${list[0].id}/decide`).send({ status: 'upheld', hrNote: 'Twice' }).expect(409);
    await api('adminA', 'post', `/reviews/${ids.review}/reopen`).send({ reason: 'x' }).expect(400);
    const r = (await api('adminA', 'post', `/reviews/${ids.review}/reopen`).send({ reason: 'Disagreement upheld' }).expect(200)).body;
    expect(r).toMatchObject({ status: 'open', next: { stage: 'manager' } });
    expect((await api('arjun', 'get', `/reviews/${ids.review}`).expect(200)).body).toMatchObject({ finalScore: null, managerEntry: null });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'perf.review.reopened', entityId: ids.review } }))).toBe(1);
    // The window: a review released 40 days ago cannot be disagreed with.
    await inA((tx) => tx.review.updateMany({ where: { id: ids.halfArjun }, data: { status: 'released', releasedAt: new Date(Date.now() - 40 * 86_400_000) } }));
    await api('arjun', 'post', `/reviews/${ids.halfArjun}/disagree`).send({ text: 'Too late' }).expect(409);
  });

  it('a manager change moves the open review to the new manager, keeps the old draft hidden, flags aligned goals (PM-4.07, D7)', async () => {
    const rid = (await api('meena', 'get', `/reviews?view=mine&cycle=${ids.half}`).expect(200)).body[0].id;
    let m = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body as Review;
    await api('priya', 'put', `/reviews/${rid}/entries/manager`).send({ answers: answers(m, 'manager', { Goals: 2 }) }).expect(200);
    // Meena's goal aligns to Priya's goal.
    const period = (await api('adminA', 'post', '/goal-periods').send({ name: `P ${run}`, fromOn: shift(today, -30), toOn: shift(today, 150) }).expect(201)).body.id;
    const pg = (await api('priya', 'post', '/goals').send({ periodId: period, ownerType: 'person', kind: 'kpi', title: 'Team revenue', weight: 100, keyResults: [] }).expect(201)).body.id;
    await api('meena', 'post', '/goals').send({ periodId: period, ownerType: 'person', kind: 'kpi', title: 'My revenue', weight: 100, parentGoalId: pg, keyResults: [] }).expect(201);
    // Meena now reports to Arun (maker-checker change through job history).
    const raised = (await request(server()).post('/api/v1/people/changes').set('Authorization', `Bearer ${token.adminA}`).send({ employeeId: emp.meena, changeType: 'manager_change', effectiveDate: today, payload: { assignment: { managerEmployeeId: emp.head } }, reason: 'Team split' }).expect(201)).body;
    await markSteppedUp(tenantPrisma, token.admin2);
    await request(server()).post(`/api/v1/people/changes/${raised.id}/approve`).set('Authorization', `Bearer ${token.admin2}`).send({ confirmRebase: false }).expect(201);
    const svc = app.get(PerformanceReviewsService);
    expect(await svc.handOver(org.A.id, today)).toBeGreaterThanOrEqual(1);
    await api('priya', 'get', `/reviews/${rid}`).expect(404);
    m = (await api('head', 'get', `/reviews/${rid}`).expect(200)).body;
    expect(m).toMatchObject({ role: 'manager', managerEntry: null, can: { manager: true } });
    const toHead = (await api('head', 'get', '/handovers').expect(200)).body as { direction: string; artefactType: string; decisionNeeded: boolean; employee: string }[];
    expect(toHead.filter((x) => x.employee.startsWith('Meena'))).toEqual(expect.arrayContaining([expect.objectContaining({ direction: 'to_me', artefactType: 'review' }), expect.objectContaining({ artefactType: 'goal_parent', decisionNeeded: true })]));
    expect((await api('priya', 'get', '/handovers').expect(200)).body.some((x: { direction: string }) => x.direction === 'from_me')).toBe(true);
    expect(await svc.handOver(org.A.id, today)).toBe(0);
  });

  it('a probation cycle overlaps the annual one (PF-D4)', async () => {
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send(cycleBody({ name: `Probation ${run}`, kind: 'probation', templateId: ids.probation, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }] })).expect(201)).body;
    expect((await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200)).body.reviews).toBeGreaterThan(0);
    expect((await api('arjun', 'get', '/reviews?view=mine').expect(200)).body.length).toBe(3);
  });

  it('launches 520 reviews in chunks, all or nothing (PM-4.01)', async () => {
    await inA(async (tx) => {
      const deptId = randomUUID();
      ids.bulk = (await tx.department.create({ data: { organizationId: org.A.id, id: deptId, name: 'Packing', code: 'PCK', path: `/${deptId}/` } })).id;
      await tx.$executeRaw`
        WITH p AS (INSERT INTO persons (organization_id, given_name, family_name) SELECT ${org.A.id}::uuid, 'Packer', 'P' || g FROM generate_series(1, 520) g RETURNING id),
             e AS (INSERT INTO employees (organization_id, person_id, given_name) SELECT ${org.A.id}::uuid, p.id, 'Packer' FROM p RETURNING id),
             m AS (INSERT INTO employments (organization_id, employee_id, legal_entity_id, employee_code, code_scope_key, joined_on)
                   SELECT ${org.A.id}::uuid, e.id, ${ids.entity}::uuid, 'PK' || row_number() OVER (), ${ids.entity}::uuid, '2020-01-01' FROM e RETURNING id, employee_id),
             ch AS (INSERT INTO employee_changes (organization_id, employee_id, employment_id, change_type, effective_date, status, payload, reason, applied_at)
                    SELECT ${org.A.id}::uuid, m.employee_id, m.id, 'join', '2020-01-01', 'effective', '{}'::jsonb, 'Bulk', now() FROM m RETURNING id, employee_id, employment_id)
        INSERT INTO employee_assignments (organization_id, legal_entity_id, employee_id, employment_id, valid_from, location_id, department_id, designation_id, employment_type_id, manager_employee_id, change_id)
        SELECT ${org.A.id}::uuid, ${ids.entity}::uuid, ch.employee_id, ch.employment_id, '2020-01-01', ${ids.loc}::uuid, ${ids.bulk}::uuid, ${ids.desig}::uuid, ${ids.perm}::uuid, ${emp.priya}::uuid, ch.id FROM ch`;
    });
    const pack = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.bulk }] };
    const c = (await api('adminA', 'post', '/cycles').send(cycleBody({ name: `Packing ${run}`, population: pack })).expect(201)).body;
    expect((await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200)).body).toEqual({ reviews: 520 });
    expect(await inA((tx) => tx.reviewEligibility.count({ where: { cycleId: c.id } }))).toBe(520);
    const funnel = (await api('adminA', 'get', `/cycles/${c.id}/funnel`).expect(200)).body as { stage: string; count: number }[];
    expect(funnel.find((f) => f.stage === 'self')!.count).toBe(520);
  }, 120_000);

  it('keeps companies apart', async () => {
    await api('adminB', 'get', `/reviews/${ids.review}`).expect(404);
    await api('adminB', 'post', `/cycles/${ids.cycle}/preflight`).expect(404);
    expect((await api('adminB', 'get', '/cycles').expect(200)).body).toEqual([]);
  });
});
