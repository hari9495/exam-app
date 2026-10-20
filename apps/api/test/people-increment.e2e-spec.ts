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
import { markSteppedUp } from './fixtures/step-up';

// PPL-06 annual increment end to end against the real database (forced RLS, the pay guard): ratings from a released
// review cycle, one percentage for everyone, a raise per person; new pay rounded to whole rupees; only the people every
// grant reaches (change, see pay, change pay; ratings with perf.review.view); no salary grant, no access; companies
// apart; the batch approved once applies through the change engine.
describe('People annual increment (PPL-06)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'kiran' | 'hr' | 'hrNoPay' | 'hrNoRate' | 'hrSales' | 'approver';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const perf = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inc = (who: Who, body: Record<string, unknown>) => request(server()).post('/api/v1/people/change-batches/increment').set('Authorization', `Bearer ${token[who]}`).send(body);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const effective = shift(today, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const team: Who[] = ['arjun', 'sita', 'meena'];
  const pay: Record<string, number> = { arjun: 850_000, sita: 800_000, meena: 700_001, kiran: 333_333, priya: 1_200_000, head: 1_500_000 };
  const base = () => ({ legalEntityId: ids.entity, effectiveDate: effective, reason: 'Annual increment 2026', dryRun: true });
  const byRating = [
    { band: 'Exceeds', percent: '7.25' },
    { band: 'Meets', percent: '4.15' },
    { band: 'Partly meets', percent: '2.5' },
  ];

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

    planId = (await prisma.plan.create({ data: { name: `inc-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Inc Org ${k}`, slug: `inc-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
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
      ids.grade = (await tx.grade.create({ data: { ...x, name: 'G1', code: 'G1', rank: 1 } })).id;
    });
    const passwordHash = await argon2.hash(PASSWORD);
    const PAY = ['employee.profile.view', 'employee.change.manage', 'employee.salary.view', 'employee.salary.manage'];
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ...team.map((w): [Who, 'A', string, string[]] => [w, 'A', 'panel', []]),
      ['kiran', 'A', 'panel', []],
      ['hr', 'A', 'panel', [...PAY, 'perf.review.view']],
      ['hrNoPay', 'A', 'panel', ['employee.profile.view', 'employee.change.manage', 'perf.review.view']],
      ['hrNoRate', 'A', 'panel', PAY],
      ['hrSales', 'A', 'panel', null],
      ['approver', 'A', 'panel', ['employee.profile.view', 'employee.change.approve', 'employee.salary.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@inc-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    // HR for Sales only: the same keys, granted over one department (P02 §4.3).
    await inA(async (tx) => {
      const profile = await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `sales-hr-${run}`, permissionsJson: JSON.stringify([...PAY, 'perf.review.view']) } });
      await tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrSales, permissionProfileId: profile.id, scopeType: 'department_subtree', departmentId: ids.sales, validFrom: new Date(`${shift(today, -30)}T00:00:00Z`), status: 'active', reason: 'Sales HR' } });
    });
    for (const [who, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@inc-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (who: Who, given: string, code: string, manager: string | null, dept: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', userId: users[who], workEmail: `${who}@inc-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, gradeId: ids.grade, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'ops');
    let n = 3;
    for (const w of team) emp[w] = await hire(w, w[0].toUpperCase() + w.slice(1), `KF-00${n++}`, emp.priya, 'sales');
    emp.kiran = await hire('kiran', 'Kiran', 'KF-009', emp.head, 'ops');
    // Current pay, behind the pay guard (as payroll's fixtures do).
    await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      for (const w of [...team, 'kiran', 'priya', 'head']) {
        const m = await tx.employment.findFirstOrThrow({ where: { employeeId: emp[w] } });
        const join = await tx.employeeChange.findFirstOrThrow({ where: { employmentId: m.id, changeType: 'join' } });
        await tx.compensation.create({ data: { organizationId: org.A.id, employmentId: m.id, validFrom: m.joinedOn, currency: 'INR', annualCtc: pay[w], changeId: join.id } });
      }
    });
    // A released review cycle for Sales: Priya rates Arjun 4 (Exceeds), Sita 3 (Meets), Meena 2 (Partly meets).
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await perf('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await perf('adminA', 'post', '/cycles').send({ name: `H1 ${run}`, kind: 'half_yearly', periodFrom: '2025-04-01', periodTo: '2025-09-30', templateId: templates.find((t) => t.kind === 'half_yearly')!.id, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false } }).expect(201)).body;
    ids.review = c.id;
    await perf('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    for (const [w, score] of [['arjun', 4], ['sita', 3], ['meena', 2]] as [Who, number][]) {
      const rid = (await perf(w, 'get', '/reviews?view=mine').expect(200)).body[0].id;
      const r = (await perf('priya', 'get', `/reviews/${rid}`).expect(200)).body as { template: { sections: { questions: { id: string; answer: string }[] }[] } };
      await perf('priya', 'post', `/reviews/${rid}/entries/manager/submit`).send({ answers: r.template.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Notes' } : { questionId: q.id, rating: score }))) }).expect(200);
    }
    await perf('adminA', 'post', `/cycles/${c.id}/release`).expect(200);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('no salary grant: no increment at all; no perf.review.view: no raise by rating (R1)', async () => {
    await inc('hrNoPay', { ...base(), mode: 'percent', percent: '5' }).expect(403);
    await inc('arjun', { ...base(), mode: 'percent', percent: '5' }).expect(403);
    await inc('hrNoRate', { ...base(), mode: 'rating', byRating }).expect(403);
    const r = (await inc('hrNoRate', { ...base(), mode: 'percent', percent: '5' }).expect(201)).body;
    expect(r.people).toHaveLength(6);
  });

  it('by rating: best rating first, new pay rounded to whole rupees; no rating said plainly', async () => {
    const r = (await inc('hr', { ...base(), mode: 'rating', byRating, overrides: [{ employeeId: emp.sita, percent: '3.33' }] }).expect(201)).body;
    expect(r.ratingCycleId).toBe(ids.review);
    expect(r.bands).toEqual(['Exceeds', 'Meets', 'Partly meets']);
    const of = (w: string) => r.people.find((p: { employeeId: string }) => p.employeeId === emp[w]);
    expect(of('arjun')).toMatchObject({ rating: 'Exceeds', percent: '7.25', currentCtc: '850000.00', newCtc: '911625.00' });
    expect(of('sita')).toMatchObject({ rating: 'Meets', percent: '3.33', newCtc: '826640.00' }); // her own raise wins
    expect(of('meena')).toMatchObject({ rating: 'Partly meets', newCtc: '717501.00' }); // 717501.025 → 717501
    expect(r.people).toHaveLength(3);
    expect(r.leftOut.map((l: { employeeId: string }) => l.employeeId).sort()).toEqual([emp.head, emp.priya, emp.kiran].sort());
    expect(r.leftOut.find((l: { employeeId: string }) => l.employeeId === emp.kiran).why).toBe(`No released rating in H1 ${run}.`);
    expect(r.errors).toBe(0);
    expect(r.batch).toBeNull();
  });

  it('one percent for everyone, rounded to rupees (333333 × 1.05 = 349999.65 → 350000)', async () => {
    const r = (await inc('hr', { ...base(), mode: 'percent', percent: '5' }).expect(201)).body;
    expect(r.people.find((p: { employeeId: string }) => p.employeeId === emp.kiran)).toMatchObject({ newCtc: '350000.00' });
    expect(r.people).toHaveLength(6);
  });

  it('out of scope: Sales HR never sees, counts or changes anyone in Operations', async () => {
    const r = (await inc('hrSales', { ...base(), mode: 'percent', percent: '5', overrides: [{ employeeId: emp.kiran, percent: '50' }] }).expect(201)).body;
    const seen = [...r.people, ...r.leftOut].map((p: { employeeId: string }) => p.employeeId).sort();
    expect(seen).toEqual(team.map((w) => emp[w]).sort());
    expect(JSON.stringify(r)).not.toContain(emp.kiran);
  });

  it('another company: the entity is not found and nothing is listed', async () => {
    await inc('adminB', { ...base(), mode: 'percent', percent: '5' }).expect(403);
    const b = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      const p = await tx.permissionProfile.create({ data: { organizationId: org.B.id, name: `b-pay-${run}`, permissionsJson: JSON.stringify(['employee.profile.view', 'employee.change.manage', 'employee.salary.view', 'employee.salary.manage']) } });
      await tx.user.update({ where: { id: users.adminB }, data: { role: 'panel', permissionProfileId: p.id } });
      return p.id;
    });
    expect(b).toBeTruthy();
    token.adminB = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.B.slug, email: `adminB@inc-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await inc('adminB', { ...base(), mode: 'percent', percent: '5' }).expect(404);
  });

  it('sent as one batch, approved once by someone else, applied through the change engine', async () => {
    const sent = (await inc('hr', { ...base(), dryRun: false, mode: 'rating', byRating }).expect(201)).body;
    expect(sent.batch).toMatchObject({ status: 'pending', rowCount: 3 });
    const batch = await inA((tx) => tx.employeeChangeBatch.findFirstOrThrow({ where: { id: sent.batch.id } }));
    expect(batch.source).toBe('increment');
    await markSteppedUp(tenantPrisma, token.approver);
    await request(server()).post(`/api/v1/people/change-batches/${sent.batch.id}/approve`).set('Authorization', `Bearer ${token.approver}`).send({}).expect(201);
    const ctc = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      const m = await tx.employment.findFirstOrThrow({ where: { employeeId: emp.meena } });
      return tx.compensation.findFirstOrThrow({ where: { employmentId: m.id, supersededAt: null, validFrom: new Date(`${effective}T00:00:00Z`) } });
    });
    expect(ctc.annualCtc.toFixed(2)).toBe('717501.00');
    const changes = await inA((tx) => tx.employeeChange.findMany({ where: { batchId: sent.batch.id } }));
    expect(changes.map((x) => x.changeType)).toEqual(['salary_revision', 'salary_revision', 'salary_revision']);
  });
});
