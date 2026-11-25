import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { StatutoryRulesService } from '../src/statutory/statutory.service';
import type { RuleSet } from '../src/statutory/evaluator';
import { payReady } from './fixtures/pay-ready';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// D14 (founder answers 2404, 2405) end to end against the real database and Redis: the loan type and the "exempt, with
// reason" mark (payroll.loan.manage, never one's own loan, audited, another company sees nothing, bad input saves
// nothing); with the shipped rule set (no SBI rates) the run warns "rates not loaded" and works nothing out; with rates
// loaded the payslip carries the information line on the month's maximum outstanding, the medical loan is left out, and
// approval writes the month's loan perquisite to the person's perquisites (Form 12BA / Form No. 123).
// The published rule sets can never be changed or removed, so the "CA loaded the rates" version is served by the rules
// service for this suite only (a spy), never written to the shared database.
describe('Loan perquisite (D14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let rules: StatutoryRulesService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'emp1' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const short = () => `PLQ-${run}`.toUpperCase();
  const perq = (loanId: string, body: object) => api('payAdmin', 'put', `/payroll/loans/${loanId}/perquisite`).send(body);
  const loanRow = (loanId: string) => scoped((tx) => tx.loan.findFirstOrThrow({ where: { id: loanId }, select: { perqPurpose: true, perqExempt: true, perqExemptReason: true } }));
  const waitFor = async (id: string, status: string) => {
    for (let i = 0; i < 120; i++) {
      const r = (await api('payAdmin', 'get', `/payroll/runs/${id}`).expect(200)).body;
      if (r.status === status) return r;
      if (r.status === 'draft' && status !== 'draft') throw new Error(`calculation failed: ${JSON.stringify((await api('payAdmin', 'get', `/payroll/runs/${id}/progress`).expect(200)).body.failures)}`);
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`run never reached ${status}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    rules = moduleRef.get(StatutoryRulesService);
    planId = (await prisma.plan.create({ data: { name: `payperq-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayPerq Org ${k}`, slug: `payperq-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['emp1', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys
        ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id
        : null;
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: o, email: `${who}@payperq-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@payperq-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'PayPerq Mills', shortName: `PLQ-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    await payReady(tenantPrisma, org.A.id, ids.entity);
    ids.emp1 = (
      await api('adminA', 'post', '/people/employees')
        .send({
          legalEntityId: ids.entity,
          status: 'confirmed',
          reason: 'Joined',
          givenName: 'emp1',
          familyName: run,
          employeeCode: 'PLQ-001',
          joinedOn: first,
          userId: users.emp1,
          workEmail: `emp1@payperq-${run}.test`,
          assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
        })
        .expect(201)
    ).body.id;
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`).send({ employeeIds: [ids.emp1], from: first }).expect(201);
    const ch = (
      await api('payAdmin', 'post', `/payroll/employees/${ids.emp1}/compensation-changes`)
        .send({ employeeId: ids.emp1, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: '1800000', reason: 'Joining salary' })
        .expect(201)
    ).body;
    await stepUp('approver1');
    await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    // Two disbursed loans (made here, as an approved request would leave them): an interest-free loan of 3,00,000 and a
    // 50,000 advance that pays for medical treatment.
    const emp = await scoped((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: ids.emp1 }, select: { id: true } }));
    const mk = (loanType: string, principal: string, emi: string, reason: string) =>
      scoped((tx) =>
        tx.loan.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp1, employmentId: emp.id, loanType, principal, interestRate: 0, emi, firstMonth: new Date(`${first}T00:00:00Z`), outstanding: principal, reason, status: 'active', requestedBy: users.payAdmin } }),
      );
    ids.loan = (await mk('loan', '300000', '10000', 'House repairs')).id;
    ids.medical = (await mk('advance', '50000', '5000', 'Surgery for a parent')).id;
  }, 300_000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the loan list says each loan’s type and exempt mark (personal, not exempt, by default)', async () => {
    const list = (await api('payAdmin', 'get', '/payroll/loans').expect(200)).body as { id: string; perquisite: object }[];
    expect(list.find((l) => l.id === ids.loan)?.perquisite).toEqual({ purpose: 'personal', exempt: false, reason: null });
    // Another company's payroll sees none of them.
    expect((await api('payAdminB', 'get', '/payroll/loans').expect(200)).body).toEqual([]);
  });

  it('negatives: wrong role 403, another company 404, bad input 400 with nothing saved', async () => {
    const before = await loanRow(ids.medical);
    await api('emp1', 'put', `/payroll/loans/${ids.medical}/perquisite`).send({ purpose: 'personal', exempt: true, reason: 'Surgery for a parent' }).expect(403);
    await api('approver1', 'put', `/payroll/loans/${ids.medical}/perquisite`).send({ purpose: 'personal', exempt: true, reason: 'Surgery for a parent' }).expect(403);
    await api('payAdminB', 'put', `/payroll/loans/${ids.medical}/perquisite`).send({ purpose: 'personal', exempt: true, reason: 'Surgery for a parent' }).expect(404);
    await perq(randomUUID(), { purpose: 'personal', exempt: false }).expect(404);
    await perq('not-a-uuid', { purpose: 'personal', exempt: false }).expect(400);
    await perq(ids.medical, { purpose: 'gold', exempt: false }).expect(400);
    await perq(ids.medical, { purpose: 'personal', exempt: 'yes', reason: 'Surgery for a parent' }).expect(400);
    await perq(ids.medical, { purpose: 'personal', exempt: true, reason: 'abc' }).expect(400);
    await perq(ids.medical, { purpose: 'personal', exempt: true, reason: 'Surgery', extra: 1 }).expect(400);
    expect((await perq(ids.medical, { purpose: 'personal', exempt: true }).expect(400)).body.message).toBe('Say why the loan is exempt, for example the treatment it pays for (Rule 3A).');
    expect(await loanRow(ids.medical)).toEqual(before);
    expect(await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => tx.auditLog.count({ where: { action: 'payroll.loan.perquisite_changed' } }))).toBe(0);
  });

  it('marks the medical advance exempt with its reason; audited before and after', async () => {
    expect((await perq(ids.medical, { purpose: 'personal', exempt: true, reason: '  Surgery for a parent (Rule 3A)  ' }).expect(200)).body).toEqual({ id: ids.medical, purpose: 'personal', exempt: true, reason: 'Surgery for a parent (Rule 3A)' });
    expect(await loanRow(ids.medical)).toEqual({ perqPurpose: 'personal', perqExempt: true, perqExemptReason: 'Surgery for a parent (Rule 3A)' });
    const a = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'payroll.loan.perquisite_changed', entityId: ids.medical } }));
    expect(JSON.parse(a.metadataJson ?? "{}")).toMatchObject({ before: { purpose: 'personal', exempt: false, reason: null }, after: { purpose: 'personal', exempt: true, reason: 'Surgery for a parent (Rule 3A)' } });
    // Taking the mark off clears the reason; putting it back is the same call.
    expect((await perq(ids.loan, { purpose: 'housing', exempt: false, reason: 'ignored when not exempt' }).expect(200)).body).toMatchObject({ purpose: 'housing', exempt: false, reason: null });
    await perq(ids.loan, { purpose: 'personal', exempt: false }).expect(200);
  });

  it('rates not loaded (the shipped rule set): the run warns and nothing is worked out', async () => {
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/readiness`).expect(200)).body;
    expect(ready.checks.filter((c: { checkKey: string }) => c.checkKey === 'loan_perq_rates')).toEqual([
      expect.objectContaining({ employeeId: ids.emp1, severity: 'warn', message: `emp1 ${run}: loan perquisite rates are not loaded, so no loan perquisite is worked out. Ask your CA to load the SBI rates.` }),
    ]);
    for (const b of ready.checks.filter((c: { checkKey: string }) => c.checkKey === 'bank_missing')) await api('payAdmin', 'post', `/payroll/runs/${ids.run}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    const slip = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/payslips`).expect(200)).body[0];
    const lines = (await api('payAdmin', 'get', `/payroll/payslips/${slip.id}`).expect(200)).body.lines as { code: string }[];
    expect(lines.map((l) => l.code)).toContain('loan_emi');
    expect(lines.map((l) => l.code)).not.toContain('loan_perquisite');
  });

  it('rates loaded: the information line on the maximum outstanding, the medical advance left out; approval writes the perquisite', async () => {
    const real = rules.published.bind(rules);
    jest.spyOn(rules, 'published').mockImplementation(async () => {
      const sets = await real();
      const shipped = sets.find((s) => s.statute === 'IN.PERQ-LOAN')!;
      const loaded: RuleSet = { ...shipped, version: `E2E-${run}`, validFrom: first, values: { ...shipped.values, rates: { housing: '8.50', vehicle: '9.15', education: '10.00', personal: '12.00', other: '12.00' } } };
      return [...sets, loaded];
    });
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/readiness`).expect(200)).body;
    expect(ready.checks.filter((c: { checkKey: string }) => c.checkKey === 'loan_perq_rates')).toEqual([]);
    const slip = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/payslips`).expect(200)).body[0];
    const lines = (await api('payAdmin', 'get', `/payroll/payslips/${slip.id}`).expect(200)).body.lines as { code: string; kind: string; amount: string; explanation: string }[];
    const p = lines.filter((l) => l.code === 'loan_perquisite');
    // 3,00,000 owed before this month's instalment × 12% ÷ 12 = 3,000.00; the exempt medical advance gives none.
    expect(p).toEqual([expect.objectContaining({ kind: 'info', amount: '3000.00' })]);
    expect(p[0].explanation).toContain('₹300000.00, the most owed this month');

    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${ids.run}/decision`)
        .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [{ label: 'People', value: '1' }] } })
        .expect(200);
    }
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('approved');
    const perqs = (await api('payAdmin', 'get', `/tax/perquisites?employeeId=${ids.emp1}`).expect(200)).body as { kind: string; annualValue: string; cancelled: boolean; description: string }[];
    expect(perqs).toEqual([expect.objectContaining({ kind: 'loan', annualValue: '3000.00', cancelled: false })]);
    expect(perqs[0].description.startsWith(`${month}: Interest benefit on a loan`)).toBe(true);
    const row = await scoped((tx) => tx.perquisite.findFirstOrThrow({ where: { employeeId: ids.emp1, kind: 'loan' } }));
    expect(row).toMatchObject({ sourceRef: `loan:${ids.loan}:${month}`, enteredBy: '00000000-0000-0000-0000-000000000000' });
    expect(row.periodStart?.toISOString().slice(0, 10)).toBe(first);
    // Another company sees none of it.
    expect((await api('payAdminB', 'get', `/tax/perquisites?employeeId=${ids.emp1}`).expect(200)).body).toEqual([]);
    await api('emp1', 'get', `/tax/perquisites?employeeId=${ids.emp1}`).expect(403);
    // Answer 2451: the TDS projection counts this month's 3,000 for this month and each month left (spread evenly).
    const sheet = (await api('emp1', 'get', '/tax/me/tax-sheet').expect(200)).body.sheet as { income: { perquisites: string }; remainingPeriods: number };
    expect(sheet.income.perquisites).toBe((3000 * sheet.remainingPeriods).toFixed(2));
  });

  it('answer 2454: a hand-entered loan perquisite is refused while payroll works it out; nothing saved', async () => {
    const y = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);
    const taxYear = `${y}-${String(y + 1).slice(2)}`;
    const count = () => scoped((tx) => tx.perquisite.count({ where: { employeeId: ids.emp1 } }));
    const before = await count();
    const r = await api('payAdmin', 'post', '/tax/perquisites').send({ employeeId: ids.emp1, taxYear, kind: 'loan', annualValue: '5000', description: 'Interest-free loan benefit' }).expect(409);
    expect(r.body.message).toContain('Payroll works out the loan perquisite itself');
    expect(await count()).toBe(before);
    // Other kinds are still entered by hand.
    await api('payAdmin', 'post', '/tax/perquisites').send({ employeeId: ids.emp1, taxYear, kind: 'car', annualValue: '28800', description: 'Company car, also private use' }).expect(201);
  });
});
