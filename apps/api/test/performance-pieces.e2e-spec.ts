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
import { PerformanceHomeService, monthBefore } from '../src/performance/home.service';

// The "live, gap" Performance pieces (3 Nov 2026), end to end against the real database (forced RLS), positive and
// negative for the employee, the manager, HR, another company and bad input:
//   PRF-04 calibration sessions planned in the wizard, made at launch, filled as reviews finish
//   PRF-05/06 the review PDF, for whoever may open the review, audited
//   PRF-01 the HR home's monthly snapshot and last month's figures (founder answer b)
//   PRF-13 reassign to HR (bulk) and the audit entry
//   PRF-14 competency CSV import (all or nothing) and the skills-test question tag
//   PRF-16 coach signals from Time and People (counts only)
//   PRF-12 one more extension after "not met" (founder answer a)

describe('Performance live-gap pieces (3 Nov 2026)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'meena' | 'fac' | 'hr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => inOrg(org.A.id, fn);
  type Review = { id: string; status: string; template: { sections: { questions: { id: string; answer: string }[] }[] } };
  const answers = (r: Review, rating: number) => r.template.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Notes' } : { questionId: q.id, rating })));
  const pdfOf = (res: request.Response) => Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text ?? '', 'binary');
  const binary = (req: request.Test) => req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
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
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `ppc-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PPC Org ${k}`, slug: `ppc-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['meena', 'A', 'panel', []],
      ['fac', 'A', 'panel', ['perf.calibration.facilitate']],
      ['hr', 'A', 'panel', ['perf.pip.manage', 'perf.cycle.manage', 'perf.review.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await inOrg(o, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@ppc-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@ppc-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KP${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      for (const [k, name, code] of [['sales', 'Sales', 'SAL'], ['board', 'Board', 'BRD']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who | null, given: string, code: string, manager: string | null, dept = ids.sales) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', ...(who ? { userId: users[who], workEmail: `${who}@ppc-${run}.test` } : {}), assignment: { locationId: ids.loc, departmentId: dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).then((r) => {
        if (r.status !== 201) throw new Error(`hire ${given}: ${JSON.stringify(r.body)}`);
        return r;
      })).body.id as string;
    emp.chandra = await hire(null, 'Chandra', 'KP-000', null, ids.board);
    emp.head = await hire('head', 'Arun', 'KP-001', emp.chandra);
    emp.priya = await hire('priya', 'Priya', 'KP-002', emp.head);
    emp.arjun = await hire('arjun', 'Arjun', 'KP-003', emp.priya);
    emp.meena = await hire('meena', 'Meena', 'KP-004', emp.priya);
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    ids.template = ((await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[]).find((t) => t.kind === 'half_yearly')!.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  const sales = () => ({ id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] });
  const cycleBody = (calibration: unknown) => ({ name: `H1 ${run}`, kind: 'half_yearly', periodFrom: '2025-04-01', periodTo: '2025-09-30', templateId: ids.template, population: sales(), stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 0, rateLeavers: false }, calibration });

  it('PRF-04: planned calibration sessions are checked, made at launch, and a finished review goes into one', async () => {
    // Negative: a facilitator who cannot run sessions, a department of no company, two sessions with one name, bad input.
    await api('adminA', 'post', '/cycles').send(cycleBody([{ name: 'Sales', facilitatorUserId: users.meena }])).expect(400);
    await api('adminA', 'post', '/cycles').send(cycleBody([{ name: 'Sales', facilitatorUserId: users.fac, departmentIds: [randomUUID()] }])).expect(400);
    await api('adminA', 'post', '/cycles').send(cycleBody([{ name: 'Sales', facilitatorUserId: users.fac }, { name: 'sales', facilitatorUserId: users.fac }])).expect(400);
    await api('adminA', 'post', '/cycles').send(cycleBody([{ name: 'S', facilitatorUserId: 'nope' }])).expect(400);
    await api('meena', 'post', '/cycles').send(cycleBody([])).expect(403);
    const c = (await api('adminA', 'post', '/cycles').send(cycleBody([{ name: 'Sales calibration', facilitatorUserId: users.fac, departmentIds: [ids.sales] }])).expect(201)).body;
    expect(c.calibration).toEqual([{ name: 'Sales calibration', facilitatorUserId: users.fac, departmentIds: [ids.sales] }]);
    ids.cycle = c.id;
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    const sessions = await inA((tx) => tx.calibrationSession.findMany({ where: { organizationId: org.A.id, cycleId: c.id } }));
    expect(sessions.map((s) => [s.name, s.facilitatorUserId, s.status])).toEqual([['Sales calibration', users.fac, 'open']]);
    ids.session = sessions[0].id;
    ids.arjunReview = (await api('arjun', 'get', '/reviews?view=mine').expect(200)).body[0].id;
    ids.meenaReview = (await api('meena', 'get', '/reviews?view=mine').expect(200)).body[0].id;
    const r = (await api('priya', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body as Review;
    const done = (await api('priya', 'post', `/reviews/${ids.arjunReview}/entries/manager/submit`).send({ answers: answers(r, 4) }).expect(200)).body as Review;
    expect(done.status).toBe('in_calibration');
    expect((await inA((tx) => tx.review.findFirstOrThrow({ where: { id: ids.arjunReview } }))).calibrationSessionId).toBe(ids.session);
    // Another company never sees the cycle.
    await api('adminB', 'get', `/cycles/${c.id}`).expect(404);
  });

  it('PRF-05 / PRF-06: the review PDF for whoever may open it, audited; no one else', async () => {
    const res = await binary(api('priya', 'get', `/reviews/${ids.arjunReview}/pdf`)).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="review-/);
    expect(pdfOf(res).subarray(0, 5).toString()).toBe('%PDF-');
    await binary(api('arjun', 'get', `/reviews/${ids.arjunReview}/pdf`)).expect(200);
    await binary(api('head', 'get', `/reviews/${ids.arjunReview}/pdf`)).expect(200);
    await api('meena', 'get', `/reviews/${ids.arjunReview}/pdf`).expect(404);
    await api('fac', 'get', `/reviews/${ids.arjunReview}/pdf`).expect(404);
    await api('adminB', 'get', `/reviews/${ids.arjunReview}/pdf`).expect(404);
    await api('priya', 'get', '/reviews/not-a-uuid/pdf').expect(400);
    await api('priya', 'get', `/reviews/${randomUUID()}/pdf`).expect(404);
    const audit = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'perf.review.downloaded', entityId: ids.arjunReview } }));
    expect(audit.map((a) => a.actorUserId).sort()).toEqual([users.arjun, users.head, users.priya].sort());
  });

  it('PRF-01: the monthly snapshot is safe to re-run; HR sees last month, others do not', async () => {
    const home = app.get(PerformanceHomeService);
    await home.snapshotOrg(org.A.id, today);
    await home.snapshotOrg(org.A.id, today);
    const rows = await inA((tx) => tx.perfHomeSnapshot.findMany({ where: { organizationId: org.A.id } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cyclesRunning: 1 });
    const before = (await api('hr', 'get', '/home').expect(200)).body;
    expect(before.hr.previous).toBeNull();
    await inA((tx) => tx.perfHomeSnapshot.create({ data: { organizationId: org.A.id, month: new Date(`${monthBefore(today)}T00:00:00Z`), cyclesRunning: 0, overdueStages: 4, pipsActive: 2, goalsAligned: 50 } }));
    const hr = (await api('hr', 'get', '/home').expect(200)).body;
    expect(hr.hr.previous).toEqual({ label: expect.any(String), cyclesRunning: 0, overdueStages: 4, pipsActive: 2, goalsAligned: 50 });
    expect(hr.hr.cyclesRunning).toBe(1);
    expect((await api('meena', 'get', '/home').expect(200)).body.hr).toBeNull();
    expect((await api('adminB', 'get', '/home').expect(200)).body.hr?.previous ?? null).toBeNull();
    // RLS: company B reads none of A's snapshots.
    expect(await inOrg(org.B.id, (tx) => tx.perfHomeSnapshot.count())).toBe(0);
  });

  it('PRF-13: HR reassigns open decisions to HR and reads the audit entry; others are refused', async () => {
    await inA(async (tx) => {
      const base = { organizationId: org.A.id, employeeId: emp.arjun, oldManagerEmployeeId: emp.head, newManagerEmployeeId: emp.priya, effectiveOn: new Date(`${today}T00:00:00Z`) };
      ids.goalRow = (await tx.perfOwnerTransfer.create({ data: { ...base, artefactType: 'goal_parent', artefactId: randomUUID(), decisionNeeded: true } })).id;
      ids.reviewRow = (await tx.perfOwnerTransfer.create({ data: { ...base, artefactType: 'review', artefactId: ids.arjunReview } })).id;
    });
    expect(((await api('priya', 'get', '/handover-list').expect(200)).body as { id: string }[]).map((r) => r.id).sort()).toEqual([ids.goalRow, ids.reviewRow].sort());
    await api('priya', 'post', '/handover-list/with-hr').send({ ids: [ids.goalRow] }).expect(403);
    await api('hr', 'post', '/handover-list/with-hr').send({ ids: [] }).expect(400);
    await api('hr', 'post', '/handover-list/with-hr').send({ ids: ['x'] }).expect(400);
    const other = randomUUID();
    const out = (await api('hr', 'post', '/handover-list/with-hr').send({ ids: [ids.goalRow, ids.reviewRow, other] }).expect(200)).body;
    expect(out.moved).toBe(1);
    expect(out.skipped).toEqual([{ id: ids.reviewRow, reason: expect.stringMatching(/needs no decision/) }, { id: other, reason: 'No such hand-over.' }]);
    // Again: nothing moves twice.
    expect((await api('hr', 'post', '/handover-list/with-hr').send({ ids: [ids.goalRow] }).expect(200)).body).toEqual({ moved: 0, skipped: [{ id: ids.goalRow, reason: 'HR already has this one.' }] });
    // The new manager no longer sees or decides it; HR's list shows it with HR.
    expect(((await api('priya', 'get', '/handover-list').expect(200)).body as { id: string }[]).map((r) => r.id)).toEqual([ids.reviewRow]);
    await api('priya', 'post', `/handover-list/${ids.goalRow}/decide`).send({ decision: 'unaligned' }).expect(404);
    const all = (await api('hr', 'get', '/handover-list/all').expect(200)).body as { id: string; to: string; withHr: boolean }[];
    expect(all.find((r) => r.id === ids.goalRow)).toMatchObject({ to: 'HR', withHr: true });
    const trail = (await api('hr', 'get', `/handover-list/${ids.goalRow}/audit`).expect(200)).body as { who: string | null; what: string }[];
    expect(trail.map((t) => t.what)).toEqual([expect.stringMatching(/when the manager changed/), 'reassigned the decision to HR']);
    expect(trail[0].who).toBeNull();
    await api('priya', 'get', `/handover-list/${ids.goalRow}/audit`).expect(403);
    await api('adminB', 'get', `/handover-list/${ids.goalRow}/audit`).expect(404);
    expect((await api('adminB', 'post', '/handover-list/with-hr').send({ ids: [ids.goalRow] }).expect(200)).body).toEqual({ moved: 0, skipped: [{ id: ids.goalRow, reason: 'No such hand-over.' }] });
  });

  it('PRF-14: the import checks every row and saves all or nothing; the skills test is a tag of the same company', async () => {
    const count = () => inA((tx) => tx.competency.count({ where: { organizationId: org.A.id } }));
    const n0 = await count();
    const head = 'name,group,description,levels,roles';
    const bad = [head, `Line safety ${run},functional,,Aware|Applies|Leads,Executive=2`, `Coaching ${run},leadership,,Only one,`, `Pace ${run},core,,A1|B1,Plant Head=1`].join('\n');
    const refused = (await api('adminA', 'post', '/competencies/import').send({ csv: bad }).expect(400)).body;
    expect(refused.message).toMatch(/2 rows have problems\. Nothing was imported/);
    expect(refused.problems.map((p: { line: number }) => p.line)).toEqual([3, 4]);
    expect(refused.problems[1].problems).toEqual(['No designation called Plant Head in this company.']);
    expect(await count()).toBe(n0);
    await api('adminA', 'post', '/competencies/import').send({ csv: 'colour\nred' }).expect(400);
    await api('adminA', 'post', '/competencies/import').send({}).expect(400);
    await api('meena', 'post', '/competencies/import').send({ csv: bad }).expect(403);
    const good = [head, `Line safety ${run},functional,Plant hygiene,Aware|Applies|Leads,executive=2`, `Pace ${run},core,,A1|B1,`].join('\n');
    expect((await api('adminA', 'post', '/competencies/import').send({ csv: good }).expect(200)).body).toEqual({ imported: 2 });
    expect(await count()).toBe(n0 + 2);
    const list = (await api('adminA', 'get', '/competencies').expect(200)).body as { id: string; name: string; roles: { designationId: string; level: number }[]; levels: unknown[]; version: number; group: string; skillsTest: unknown }[];
    const made = list.find((c) => c.name === `Line safety ${run}`)!;
    expect(made.roles).toEqual([expect.objectContaining({ designationId: ids.desig, level: 2 })]);
    // The same file again: the names are taken, nothing is saved.
    expect((await api('adminA', 'post', '/competencies/import').send({ csv: good }).expect(400)).body.problems).toHaveLength(2);
    expect(await count()).toBe(n0 + 2);
    const audit = await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'perf.competency.imported' } }));
    expect(audit).toBe(2);

    // Skills test: the company's tags only, with their active questions.
    const tagA = await inA((tx) => tx.tag.create({ data: { organizationId: org.A.id, name: `Food safety ${run}` } }));
    const tagB = await inOrg(org.B.id, (tx) => tx.tag.create({ data: { organizationId: org.B.id, name: `Other ${run}` } }));
    const tags = (await api('adminA', 'get', '/competencies/question-tags').expect(200)).body as { value: string; label: string; questions: number }[];
    expect(tags).toEqual([{ value: tagA.id, label: `Food safety ${run}`, questions: 0 }]);
    await api('meena', 'get', '/competencies/question-tags').expect(403);
    const save = (questionTagId: unknown, version: number) => api('adminA', 'put', `/competencies/${made.id}`).send({ name: made.name, group: 'functional', levels: [{ label: 'Aware' }, { label: 'Applies' }, { label: 'Leads' }], roles: [], questionTagId, version });
    await save(tagB.id, made.version).expect(400);
    await save('not-a-uuid', made.version).expect(400);
    const linked = (await save(tagA.id, made.version).expect(200)).body;
    expect(linked.skillsTest).toEqual({ tagId: tagA.id, name: `Food safety ${run}`, questions: 0 });
    expect((await save(null, linked.version).expect(200)).body.skillsTest).toBeNull();
  });

  it('PRF-16: the coach reads unused leave, overtime and onboarding (counts only); the employee has no card', async () => {
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const el = await tx.leaveType.create({ data: { ...o, code: `EL${run.slice(0, 4)}`, name: 'Earned leave', kind: 'earned' } });
      await tx.leaveLedgerEntry.create({ data: { ...o, employeeId: emp.arjun, leaveTypeId: el.id, entryOn: new Date(`${shift(today, -30)}T00:00:00Z`), kind: 'accrual', days: 15, reason: 'Accrual' } });
      const rule = await tx.overtimeRule.create({ data: { ...o, name: 'Plant', scopeType: 'legal_entity', scopeId: ids.entity, validFrom: new Date('2025-01-01T00:00:00Z') } });
      for (const back of [2, 9, 16])
        await tx.overtimeRequest.create({ data: { ...o, employeeId: emp.meena, workOn: new Date(`${shift(today, -back)}T00:00:00Z`), ruleId: rule.id, category: 'normal', scheduledMinutes: 480, workedMinutes: 600, eligibleMinutes: 120, payableMinutes: 120, rate: 2, settle: 'pay', reason: 'Line changeover', status: 'approved' } });
    });
    const coach = (await api('priya', 'get', '/coach').expect(200)).body as { state: string; looksAt: string[]; nudges: { person: string; signal: string }[] };
    expect(coach.state).toBe('ready');
    expect(coach.looksAt).toContain('Unused leave balance above 12 days (counts only)');
    const arjun = coach.nudges.find((n) => n.person.startsWith('Arjun'))!;
    const meena = coach.nudges.find((n) => n.person.startsWith('Meena'))!;
    expect(arjun.signal).toContain('15 leave days unused this year.');
    expect(meena.signal).toContain('Overtime 3 weeks running.');
    expect(meena.signal).not.toContain('leave days');
    expect(arjun.signal).not.toMatch(/Accrual|Line changeover/);
    expect((await api('arjun', 'get', '/coach').expect(200)).body).toMatchObject({ state: 'not-manager', nudges: [] });
    expect((await api('adminB', 'get', '/coach').expect(200)).body.nudges).toEqual([]);
  });

  it('PRF-12: after "not met" HR extends once more with a reason; then only met, not met or the exit case', async () => {
    const pipId = await inA(async (tx) => {
      const m = await tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: emp.meena } });
      return (await tx.pip.create({ data: { organizationId: org.A.id, employeeId: emp.meena, employmentId: m.id, managerEmployeeId: emp.priya, reason: 'Accuracy fell.', expectations: 'Errors at most 2%.', support: 'Coaching.', startsOn: new Date(`${shift(today, -40)}T00:00:00Z`), endsOn: new Date(`${shift(today, -10)}T00:00:00Z`), checkinEveryDays: 7, status: 'not_met', outcomeNote: 'Two goals missed.', outcomeAt: new Date(), version: 3 } })).id;
    });
    const p = `/pips/${pipId}`;
    const view = (await api('hr', 'get', p).expect(200)).body;
    expect(view.can).toMatchObject({ extendAgain: true, extend: false });
    expect(view.extendAgainDays).toBe(30);
    expect((await api('priya', 'get', p).expect(200)).body.can.extendAgain).toBe(false);
    await api('priya', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: 3 }).expect(403);
    await api('meena', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: 3 }).expect(403);
    await api('adminB', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: 3 }).expect(404);
    await api('hr', 'post', `${p}/extend-again`).send({ reason: 'Too short', version: 3 }).expect(400);
    await api('hr', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.' }).expect(400);
    await api('hr', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: 2 }).expect(409);
    const ext = (await api('hr', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: 3 }).expect(200)).body;
    expect(ext).toMatchObject({ status: 'extended', plannedEndsOn: shift(today, 30), reextendedFrom: shift(today, -10), reextendReason: 'One last month to show it.', outcomeNote: null });
    expect(ext.can).toMatchObject({ extendAgain: false, extend: false, outcome: true });
    expect(ext.checkins.filter((c: { status: string }) => c.status === 'due').map((c: { dueOn: string }) => c.dueOn)).toEqual([7, 14, 21, 28, 30].map((n) => shift(today, n)));
    // Once only, and the outcome cannot extend it a third time.
    await api('hr', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: ext.version }).expect(409);
    await api('hr', 'post', `${p}/outcome`).send({ outcome: 'extended', note: 'More time', extendTo: shift(today, 45), version: ext.version }).expect(400);
    const notMet = (await api('hr', 'post', `${p}/outcome`).send({ outcome: 'not_met', note: 'Still short of the target.', version: ext.version }).expect(200)).body;
    expect(notMet.can.extendAgain).toBe(false);
    await api('hr', 'post', `${p}/extend-again`).send({ reason: 'One last month to show it.', version: notMet.version }).expect(409);
    const audit = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'perf.pip.extended_again', entityId: pipId } }));
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].metadataJson!)).toMatchObject({ from: shift(today, -10), to: shift(today, 30), days: 30, reason: 'One last month to show it.', notMetNote: 'Two goals missed.' });
  });
});
