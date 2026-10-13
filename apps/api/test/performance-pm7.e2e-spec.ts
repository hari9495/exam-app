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
import { APPLY_LIMITS } from '../src/performance/comp.service';
import { markSteppedUp } from './fixtures/step-up';

// Performance batch PM7 end to end against the real database (forced RLS, the pay guard, the app role): the starter
// merit matrix; a comp cycle opened from a released review cycle (compa-ratio, matrix cell, prorated target %, bonus
// split of a department pool); a manager sees and changes only their team's proposals, every look audited (Q6); outside
// the matrix needs a reason and an extra finance step (YX-PERF-10); over budget blocks or adds the step; the P03 chain
// approves; apply makes approved P06 bulk batches (comp_review, linked to the cycle, split at the batch size) and
// perf_bonus one-time pays through payroll, all or nothing, and refuses a second apply; my pay band; pay equity with
// suppression; companies apart.

describe('Performance batch PM7', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'kiran' | 'hr' | 'fin' | 'fin2';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const nextMonth = shift(today, 35).slice(0, 7);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const team: Who[] = ['arjun', 'sita', 'meena'];
  const pay: Record<string, number> = { arjun: 850_000, sita: 800_000, meena: 700_000, priya: 1_200_000 };
  type Sheet = { role: string; proposals: { id: string; employeeId: string; band: string | null; compaRatio: number | null; meritPct: number; meritAmount: number; bonusAmount: number; newCtc: number; outOfRange: boolean; status: string; version: number }[]; budgets: { kind: string; over: boolean; used: number }[]; can: { submit: boolean; apply: boolean } };
  const decideAll = async (wfId: string) => {
    for (let i = 0; i < 10; i++) {
      const open = await inA((tx) => tx.wfTask.findMany({ where: { requestId: wfId, status: 'open' } }));
      if (!open.length) return;
      // One approval per step: a step for any one of several people closes the others' tasks.
      for (const t of open.slice(0, 1)) {
        const who = (Object.keys(users) as Who[]).find((w) => users[w] === t.assigneeUserId)!;
        await request(server()).post(`/api/v1/workflow/approvals/tasks/${t.id}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision: 'approve' }).then((r) => {
          if (r.status !== 200) throw new Error(`decide as ${who}: ${r.status} ${JSON.stringify(r.body)}`);
        });
      }
    }
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

    planId = (await prisma.plan.create({ data: { name: `pm7-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM7 Org ${k}`, slug: `pm7-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const HR = ['perf.comp.manage', 'perf.cycle.manage', 'employee.change.manage', 'employee.salary.view', 'employee.salary.manage'];
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ...team.map((w): [Who, 'A', string, string[]] => [w, 'A', 'panel', []]),
      ['kiran', 'A', 'panel', []],
      ['hr', 'A', 'panel', HR],
      ['fin', 'A', 'panel', ['perf.comp.approve']],
      ['fin2', 'A', 'panel', ['perf.comp.approve']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm7-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm7-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
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
      ids.lead = (await tx.designation.create({ data: { ...x, name: 'Lead', code: 'LD' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.grade = (await tx.grade.create({ data: { ...x, name: 'G1', code: 'G1', rank: 1 } })).id;
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      await tx.gradePayRange.create({ data: { ...x, gradeId: ids.grade, legalEntityId: ids.entity, currency: 'INR', min: 600_000, mid: 800_000, max: 1_000_000, validFrom: new Date('2020-01-01T00:00:00Z') } });
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null, dept: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', userId: users[who], workEmail: `${who}@pm7-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, gradeId: ids.grade, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'ops');
    let n = 3;
    for (const w of team) emp[w] = await hire(w, w[0].toUpperCase() + w.slice(1), `KF-00${n++}`, emp.priya, 'sales');
    emp.kiran = await hire('kiran', 'Kiran', 'KF-009', emp.head, 'ops');
    // Current pay, behind the pay guard (as payroll's fixtures do).
    await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      for (const w of [...team, 'priya']) {
        const m = await tx.employment.findFirstOrThrow({ where: { employeeId: emp[w] } });
        const join = await tx.employeeChange.findFirstOrThrow({ where: { employmentId: m.id, changeType: 'join' } });
        await tx.compensation.create({ data: { organizationId: org.A.id, employmentId: m.id, validFrom: m.joinedOn, currency: 'INR', annualCtc: pay[w], changeId: join.id } });
      }
    });
    // A released half-year review: Priya rates Arjun 4 (Exceeds), Sita 3 (Meets), Meena 2 (Partly meets).
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send({ name: `H1 ${run}`, kind: 'half_yearly', periodFrom: '2025-04-01', periodTo: '2025-09-30', templateId: templates.find((t) => t.kind === 'half_yearly')!.id, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false } }).expect(201)).body;
    ids.review = c.id;
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    for (const [w, score] of [['arjun', 4], ['sita', 3], ['meena', 2]] as [Who, number][]) {
      const rid = (await api(w, 'get', '/reviews?view=mine').expect(200)).body[0].id;
      const r = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body as { template: { sections: { questions: { id: string; answer: string }[] }[] } };
      await api('priya', 'post', `/reviews/${rid}/entries/manager/submit`).send({ answers: r.template.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Notes' } : { questionId: q.id, rating: score }))) }).expect(200);
    }
    await api('adminA', 'post', `/cycles/${c.id}/release`).expect(200);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the starter matrix is copied once; a matrix with a gap is refused (PM-7.01)', async () => {
    await api('priya', 'post', '/comp-matrices/from-starter').expect(403);
    const m = (await api('hr', 'post', '/comp-matrices/from-starter').expect(201)).body;
    expect(m.created).toBe(true);
    ids.matrix = m.id;
    expect((await api('hr', 'post', '/comp-matrices/from-starter').expect(201)).body.created).toBe(false);
    const bands = ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'];
    const gap = bands.flatMap((band) => [{ band, compaFrom: null, compaTo: 0.9, minPct: 1, targetPct: 2, maxPct: 3 }, { band, compaFrom: 1, compaTo: null, minPct: 1, targetPct: 2, maxPct: 3 }]);
    expect((await api('hr', 'post', '/comp-matrices').send({ name: 'Gappy', axis: 'compa_ratio', cells: gap }).expect(400)).body.message).toMatch(/gap or overlap/);
  });

  it('opening a cycle makes proposals: compa-ratio, matrix cell, target %, bonus share (PM-7.02, 7.04)', async () => {
    const x = (await api('hr', 'post', '/comp-cycles').send({ name: `FY27 merit ${run}`, reviewCycleId: ids.review, legalEntityId: ids.entity, currency: 'INR', effectiveOn: shift(today, 20), matrixId: ids.matrix, bonus: { month: nextMonth, targetPct: 10, multipliers: { Exceeds: 1.5, Meets: 1, 'Partly meets': 0.5 } } }).expect(201)).body;
    ids.comp = x.id;
    await api('hr', 'put', `/comp-cycles/${x.id}/budgets`).send({ budgets: [{ departmentId: ids.sales, kind: 'merit', amount: 120_000 }, { departmentId: ids.sales, kind: 'bonus', amount: 50_000 }] }).expect(200);
    expect((await api('hr', 'post', `/comp-cycles/${x.id}/open`).send({ version: x.version }).expect(200)).body).toEqual({ proposals: 3, withoutPay: 0 });
    const s = (await api('hr', 'get', `/comp-cycles/${x.id}/sheet`).expect(200)).body as Sheet;
    const of = (w: Who) => s.proposals.find((p) => p.employeeId === emp[w])!;
    expect(of('arjun')).toMatchObject({ band: 'Exceeds', compaRatio: 1.063 });
    expect(of('arjun').meritPct).toBeGreaterThan(0);
    expect(of('arjun').newCtc).toBe(850_000 + of('arjun').meritAmount);
    expect(s.proposals.reduce((t, p) => Math.round((t + p.bonusAmount) * 100) / 100, 0)).toBe(50_000);
    expect(of('arjun').bonusAmount).toBeGreaterThan(of('meena').bonusAmount);
  });

  it('a manager sees only their team, audited; outside the matrix needs a reason (Q6, YX-PERF-10)', async () => {
    await api('kiran', 'get', `/comp-cycles/${ids.comp}/sheet`).expect(404);
    const s = (await api('priya', 'get', `/comp-cycles/${ids.comp}/sheet`).expect(200)).body as Sheet;
    expect(s.role).toBe('manager');
    expect(s.proposals).toHaveLength(3);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'perf.comp.team_pay_viewed', entityId: ids.comp } }))).toBeGreaterThan(0);
    const arjun = s.proposals.find((p) => p.employeeId === emp.arjun)!;
    await api('priya', 'put', `/comp-proposals/${arjun.id}`).send({ meritPct: 20, version: arjun.version }).expect(400);
    const p = (await api('priya', 'put', `/comp-proposals/${arjun.id}`).send({ meritPct: 20, justification: 'Took over the Madurai territory', version: arjun.version }).expect(200)).body;
    expect(p).toMatchObject({ outOfRange: true, meritAmount: 170_000, newCtc: 1_020_000 });
  });

  it('over budget blocks with "block" and adds a finance step with "extra_approval"; the chain approves (PM-7.03, 7.05)', async () => {
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key: 'perf.comp.budget_overrun', scopeType: 'tenant', value: 'block' }).expect(200);
    expect((await api('priya', 'post', `/comp-cycles/${ids.comp}/submit`).expect(409)).body.message).toMatch(/Over budget/);
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key: 'perf.comp.budget_overrun', scopeType: 'tenant', value: 'extra_approval' }).expect(200);
    await api('priya', 'post', `/comp-cycles/${ids.comp}/submit`).expect(200);
    const wf = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return (await tx.compProposal.findFirstOrThrow({ where: { compCycleId: ids.comp } })).wfRequestId!;
    });
    const steps = (await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: wf } }))).steps as { name: string }[];
    expect(steps.map((x) => x.name)).toEqual(['Your manager', 'HR', 'Finance', 'Finance (exceptions)']);
    await decideAll(wf);
    expect((await api('hr', 'get', '/comp-cycles').expect(200)).body.find((x: { id: string }) => x.id === ids.comp).status).toBe('approved');
  });

  it('apply: approved P06 batches linked to the cycle, bonuses through payroll, all at once; never twice (PM-7.06)', async () => {
    const x = (await api('hr', 'get', '/comp-cycles').expect(200)).body.find((y: { id: string }) => y.id === ids.comp);
    await api('priya', 'post', `/comp-cycles/${ids.comp}/apply`).send({ version: x.version }).expect(403);
    await markSteppedUp(tenantPrisma, token.hr);
    const res = (await api('hr', 'post', `/comp-cycles/${ids.comp}/apply`).send({ version: x.version }).expect(200)).body;
    expect(res).toMatchObject({ changes: 3, batches: 1, bonuses: 3 });
    const batch = await inA((tx) => tx.employeeChangeBatch.findMany({ where: { compCycleId: ids.comp } }));
    expect(batch).toEqual([expect.objectContaining({ source: 'comp_review', status: 'approved', rowCount: 3 })]);
    const changes = await inA((tx) => tx.employeeChange.findMany({ where: { batchId: batch[0].id } }));
    expect(changes.every((ch) => ch.changeType === 'salary_revision' && ch.status === 'scheduled')).toBe(true);
    const otp = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.oneTimePay.findMany({ where: { source: 'm06', employeeId: { in: team.map((w) => emp[w]) } } });
    });
    expect(otp).toHaveLength(3);
    expect(otp.every((o) => o.componentCode === 'perf_bonus' && o.status === 'approved')).toBe(true);
    await markSteppedUp(tenantPrisma, token.hr);
    expect((await api('hr', 'post', `/comp-cycles/${ids.comp}/apply`).send({ version: x.version + 1 }).expect(409)).body.message).toMatch(/already applied/);
  });

  it('a large cycle is split into linked batches; a failure on the last row leaves nothing applied (§12.6)', async () => {
    // Same three people, a second cycle with the batch size set to 1 for the test: three batches, or none.
    const y = (await api('hr', 'post', '/comp-cycles').send({ name: `Split ${run}`, reviewCycleId: ids.review, legalEntityId: ids.entity, currency: 'INR', effectiveOn: shift(today, 25), matrixId: ids.matrix }).expect(201)).body;
    await api('hr', 'post', `/comp-cycles/${y.id}/open`).send({ version: y.version }).expect(200);
    await api('hr', 'post', `/comp-cycles/${y.id}/submit`).expect(200);
    const wf = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return (await tx.compProposal.findFirstOrThrow({ where: { compCycleId: y.id } })).wfRequestId!;
    });
    await decideAll(wf);
    const before = APPLY_LIMITS.batchRows;
    APPLY_LIMITS.batchRows = 1;
    try {
      // Meena leaves before the date, so her row (the last) fails: nothing of the cycle is applied.
      const m = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.meena } }));
      await inA((tx) => tx.employment.update({ where: { id: m.id }, data: { exitedOn: new Date(`${shift(today, 22)}T00:00:00Z`) } }));
      const cur = (await api('hr', 'get', '/comp-cycles').expect(200)).body.find((z: { id: string }) => z.id === y.id);
      await markSteppedUp(tenantPrisma, token.hr);
      const fail = await api('hr', 'post', `/comp-cycles/${y.id}/apply`).send({ version: cur.version });
      expect(fail.status).toBeGreaterThanOrEqual(400);
      expect(await inA((tx) => tx.employeeChangeBatch.count({ where: { compCycleId: y.id } }))).toBe(0);
      expect((await api('hr', 'get', '/comp-cycles').expect(200)).body.find((z: { id: string }) => z.id === y.id).status).toBe('approved');
      await inA((tx) => tx.employment.update({ where: { id: m.id }, data: { exitedOn: null } }));
      await markSteppedUp(tenantPrisma, token.hr);
      const ok = (await api('hr', 'post', `/comp-cycles/${y.id}/apply`).send({ version: cur.version }).expect(200)).body;
      expect(ok.batches).toBe(3);
      const batches = await inA((tx) => tx.employeeChangeBatch.findMany({ where: { compCycleId: y.id } }));
      expect(batches.map((b) => b.rowCount)).toEqual([1, 1, 1]);
    } finally {
      APPLY_LIMITS.batchRows = before;
    }
  }, 180_000);

  it('my pay band shows only my own range and where I sit (PAY-39)', async () => {
    const b = (await api('sita', 'get', '/me/pay-band').expect(200)).body;
    expect(b).toMatchObject({ visible: true, currency: 'INR', range: { min: 600_000, mid: 800_000, max: 1_000_000 }, position: 'within' });
    expect(JSON.stringify(b)).not.toContain('850000');
  });

  it('pay equity: before and after, small groups suppressed (YX-PERF-18)', async () => {
    await api('priya', 'get', `/comp-cycles/${ids.comp}/pay-equity?dimension=gender`).expect(403);
    const e = (await api('fin', 'get', `/comp-cycles/${ids.comp}/pay-equity?dimension=grade`).expect(200)).body;
    expect(e.before).toEqual([{ group: 'G1', count: null, suppressed: true }]);
    expect(e.after).toEqual([{ group: 'G1', count: null, suppressed: true }]);
  });

  it('keeps companies apart', async () => {
    await api('adminB', 'get', `/comp-cycles/${ids.comp}/sheet`).expect(404);
    expect((await api('adminB', 'get', '/comp-cycles').expect(200)).body).toEqual([]);
  });
});
