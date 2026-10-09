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
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5c end to end against the real database and Redis: a run per pay group and month (one live regular run),
// validations and waivers (a waived missing bank account holds net pay), manual LOP and one-time pay, the BullMQ
// calculation with per-employee progress, payslips with explanations, submit and two approvals by other people with
// step-up and the typed phrase (the preparer cannot approve; nobody approves two steps), the month locked on approval,
// approved payslips unchangeable and one per person and month in the database, reproduce from the snapshot, holds
// released idempotently, loans requested by the employee and repaid from pay, court orders, the journal and cost rates,
// the pay guard and another company kept apart, and a reopened month recalculated with the old payslips revised.
describe('Payroll batch 5c', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'finance' | 'emp1' | 'emp2' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const short = () => `P5C-${run}`.toUpperCase();
  const waitFor = async (id: string, status: string) => {
    for (let i = 0; i < 120; i++) {
      const r = (await api('payAdmin', 'get', `/payroll/runs/${id}`).expect(200)).body;
      if (r.status === status) return r;
      if (r.status === 'draft' && status !== 'draft') {
        const p = (await api('payAdmin', 'get', `/payroll/runs/${id}/progress`).expect(200)).body;
        throw new Error(`calculation failed: ${JSON.stringify(p.failures)}`);
      }
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`run never reached ${status}`);
  };
  const decide = async (who: Who, runId: string) => {
    await stepUp(who);
    return api(who, 'post', `/payroll/runs/${runId}/decision`).send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [{ label: 'People', value: '2' }] } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `pay5c-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5C Org ${k}`, slug: `pay5c-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['finance', 'A', 'panel', template('finance_approver')],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pay5c-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pay5c-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5C Mills', shortName: `P5C-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: first, userId: users[who], workEmail: `${who}@pay5c-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P5C-001');
    ids.emp2 = await hire('emp2', 'P5C-002');
    // 5b set-up: the starter library and template, a pay group, and approved salaries from the 1st.
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`).send({ employeeIds: [ids.emp1, ids.emp2], from: first }).expect(201);
    for (const [emp, ctc] of [[ids.emp1, '726000'], [ids.emp2, '480000']]) {
      const ch = (await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`).send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: ctc, reason: 'Joining salary' }).expect(201)).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
  }, 300_000);

  afterAll(async () => {
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

  it('every 5c table has forced RLS, tenant isolation and the support exclusion, and the pay guard', async () => {
    const tables = ['payroll_runs', 'run_employees', 'run_validations', 'payslips', 'payslip_lines', 'payslip_snapshots', 'lop_inputs', 'one_time_pays', 'special_days', 'variance_flags', 'payroll_withholds', 'pay_carry_forwards', 'court_orders', 'loans', 'loan_repayments', 'loan_schedule_changes', 'journals', 'employee_cost_rates'];
    const rows = await prisma.$queryRaw<{ t: string; ok: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive)
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive)) AS ok
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' WHERE c.relkind = 'r' AND c.relname = ANY (${tables})`;
    expect(rows.filter((r) => r.ok).map((r) => r.t).sort()).toEqual([...tables].sort());
  });

  it('inputs: manual LOP, one-time pay, a loan the employee asks for and someone else approves, a court order; another company sees none of it', async () => {
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`).send({ rows: [{ employeeId: ids.emp2, lopDays: '40', reason: 'Too many' }] }).expect(400);
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`).send({ rows: [{ employeeId: ids.emp2, lopDays: '2', reason: 'Absent without leave' }] }).expect(200);
    await api('payAdminB', 'put', `/payroll/lop-inputs/${month}`).send({ rows: [{ employeeId: ids.emp2, lopDays: '2', reason: 'Absent without leave' }] }).expect(404);
    await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp1, componentCode: 'pf_employee', amount: '100', month, reason: 'Not allowed' }).expect(400);
    expect((await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp1, componentCode: 'bonus', amount: '5000', month, reason: 'Festival bonus' }).expect(201)).body.status).toBe('approved');

    const loan = (await api('emp2', 'post', '/payroll/loans').send({ loanType: 'advance', principal: '12000', instalments: 4, firstMonth: month, reason: 'Medical expenses' }).expect(201)).body;
    expect(loan).toMatchObject({ status: 'requested', emi: '3000.00' });
    await api('emp2', 'post', '/payroll/loans').send({ employeeId: ids.emp1, loanType: 'advance', principal: '12000', instalments: 4, firstMonth: month, reason: 'For someone else' }).expect(404);
    const inbox = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; type?: string; title: string }[];
    const task = inbox.find((t) => /Salary advance/.test(t.title))!;
    await api('approver1', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    const loans = (await api('emp2', 'get', '/payroll/loans').expect(200)).body;
    expect(loans).toEqual([expect.objectContaining({ status: 'active', mine: true })]);
    ids.loan = loans[0].id;

    await api('payAdmin', 'post', '/payroll/court-orders').send({ employeeId: ids.emp1, orderRef: 'MC 44/2026', amount: '2000', priorityDate: '2026-01-15', payee: 'Family court deposit account 0001234 IFSC SBIN0000001' }).expect(201);
    expect((await api('payAdminB', 'get', '/payroll/court-orders').expect(200)).body).toEqual([]);
    expect(await inA((tx) => tx.loan.count())).toBe(0);
  });

  it('a run: one live regular run per group and month; missing bank accounts block until waived; waived means held', async () => {
    await api('approver1', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(403);
    const r = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body;
    ids.run = r.id;
    await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(409);
    await api('payAdminB', 'get', `/payroll/runs/${ids.run}`).expect(404);
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/readiness`).expect(200)).body;
    const banks = ready.checks.filter((c: { checkKey: string }) => c.checkKey === 'bank_missing');
    expect(banks).toHaveLength(2);
    // 5c-D2: no skill class on the jobs yet: a warning (the minimum-wage check uses the lowest class).
    expect(ready.checks.filter((c: { checkKey: string; severity: string }) => c.checkKey === 'skill_missing' && c.severity === 'warn')).toHaveLength(2);
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(409)).body.code).toBe('RUN_BLOCKED');
    for (const b of banks) await api('payAdmin', 'post', `/payroll/runs/${ids.run}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
  });

  it('calculates on the queue with progress; payslips explain every line; the month is frozen', async () => {
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202)).body).toMatchObject({ queued: 2 });
    const done = await waitFor(ids.run, 'calculated');
    expect(done.totals).toMatchObject({ people: 2, failed: 0 });
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}/progress`).expect(200)).body).toMatchObject({ ok: 2, failed: 0, queued: 0 });
    const slips = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/payslips`).expect(200)).body as { id: string; employeeId: string; held: boolean; net: string }[];
    expect(slips.every((s) => s.held)).toBe(true);
    ids.slip1 = slips.find((s) => s.employeeId === ids.emp1)!.id;
    ids.slip2 = slips.find((s) => s.employeeId === ids.emp2)!.id;
    const one = (await api('approver1', 'get', `/payroll/payslips/${ids.slip1}`).expect(200)).body;
    const codes = one.lines.map((l: { code: string }) => l.code);
    expect(codes).toEqual(expect.arrayContaining(['basic', 'pf_employee', 'pt', 'bonus', 'court_attachment', 'held']));
    expect(one.lines.find((l: { code: string }) => l.code === 'pf_employee')).toMatchObject({ amount: '1800.00', rule: { statute: 'IN.PF' } });
    const two = (await api('payAdmin', 'get', `/payroll/payslips/${ids.slip2}`).expect(200)).body;
    expect(two.lines.find((l: { code: string }) => l.code === 'loan_emi')).toMatchObject({ amount: '3000.00' });
    expect(two.lines.find((l: { code: string }) => l.code === 'basic').explanation).toMatch(/unpaid days/);
    await api('emp1', 'get', `/payroll/payslips/${ids.slip1}`).expect(404);
    const period = await inA((tx) => tx.payPeriod.findFirst({ where: { legalEntityId: ids.entity, periodStart: new Date(`${first}T00:00:00Z`) } }));
    expect(period?.stage).toBe('frozen');
    expect(await inA((tx) => tx.payslip.count())).toBe(0);
  });

  it('submit and approve: maker ≠ checker, step-up, the typed phrase, nobody approves two steps; approval locks the month', async () => {
    await api('approver1', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(403);
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200)).body).toMatchObject({ status: 'submitted', approvers: 2 });
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/void`).send({ reason: 'Changed my mind' }).expect(409);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/decision`).send({ decision: 'approve' }).expect(403);
    expect((await api('approver2', 'post', `/payroll/runs/${ids.run}/decision`).send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
    await stepUp('approver1');
    await api('approver1', 'post', `/payroll/runs/${ids.run}/decision`).send({ decision: 'approve', confirmation: { phrase: 'APPROVE', impact: [] } }).expect(400);
    const inbox = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; decideAt: string | null; title: string }[];
    const generic = inbox.find((t) => /Payroll for/.test(t.title))!;
    expect(generic.decideAt).toBe('/yx/payroll/runs');
    await api('approver1', 'post', `/workflow/approvals/tasks/${generic.taskId}/decide`).send({ decision: 'approve' }).expect(409);
    expect((await decide('approver1', ids.run)).status).toBe(200);
    expect((await decide('approver1', ids.run)).status).toBe(404);
    expect((await decide('approver2', ids.run)).status).toBe(200);
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('approved');
    const period = await inA((tx) => tx.payPeriod.findFirst({ where: { legalEntityId: ids.entity, periodStart: new Date(`${first}T00:00:00Z`) } }));
    expect(period).toMatchObject({ stage: 'locked', lockedByRunId: ids.run });
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`).send({ rows: [{ employeeId: ids.emp2, lopDays: '1', reason: 'Too late now' }] }).expect(409);
  });

  it('after approval: payslips never change and one per person and month; recoveries settled; reproduce matches; journal and cost rates', async () => {
    const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
      inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
        return fn(tx);
      });
    await expect(scoped((tx) => tx.payslip.update({ where: { id: ids.slip1 }, data: { net: 1 } }))).rejects.toThrow(/YX_PAYSLIP_APPROVED/);
    await expect(
      scoped(async (tx) => {
        const s = await tx.payslip.findFirstOrThrow({ where: { id: ids.slip1 } });
        const { id: _i, createdAt: _c, ...rest } = s;
        return tx.payslip.create({ data: { ...rest, ruleVersions: s.ruleVersions as object, calcVersion: 99 } });
      }),
    ).rejects.toThrow(/payslips_one_regular|Unique constraint/);
    const loan = (await api('payAdmin', 'get', '/payroll/loans').expect(200)).body.find((l: { id: string }) => l.id === ids.loan);
    expect(loan.outstanding).toBe('9000.00');
    expect((await api('payAdmin', 'get', '/payroll/court-orders').expect(200)).body[0].remittedTotal).toBe('2000.00');
    expect((await api('approver1', 'post', `/payroll/payslips/${ids.slip1}/reproduce`).expect(200)).body).toMatchObject({ same: true, inputsMatch: true });
    const j = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/journal`).expect(200)).body;
    const debit = j.lines.reduce((t: number, l: { debit: string }) => t + Number(l.debit), 0);
    const credit = j.lines.reduce((t: number, l: { credit: string }) => t + Number(l.credit), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    const csv = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'csv' }).expect(200);
    expect(csv.text).toMatch(/Net salary payable/);
    const tally = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'tally' }).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(Buffer.from(tally.body as Buffer).toString()).toMatch(/<VOUCHER VCHTYPE="Journal"/);
    expect((await api('finance', 'get', `/payroll/cost-rates?month=${month}`).expect(200)).body).toHaveLength(2);
    await api('emp1', 'get', `/payroll/cost-rates?month=${month}`).expect(403);
  });

  it('holds: one open hold per person; release is idempotent', async () => {
    const h = (await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: ids.emp1, reasonCode: 'investigation', note: 'Pending enquiry' }).expect(201)).body;
    expect((await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: ids.emp1, reasonCode: 'other', note: 'Second try' }).expect(201)).body).toEqual({ id: h.id, created: false });
    const a = (await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).expect(200)).body;
    const b = (await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).expect(200)).body;
    expect(b.releasedAt).toBe(a.releasedAt);
  });

  it('a reopened month: the run recalculates, a new approval revises the earlier payslips (kept)', async () => {
    await stepUp('payAdmin');
    const asked = (await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entity, month, reason: 'A missed allowance must be paid this month' }).expect(201)).body;
    const phrase = `REOPEN ${short()} ${month}`;
    await stepUp('approver1');
    await api('approver1', 'post', `/payroll/reopen-requests/${asked.id}/decide`).send({ decision: 'approve', confirmation: { phrase, impact: [] } }).expect(200);
    await stepUp('finance');
    await api('finance', 'post', `/payroll/reopen-requests/${asked.id}/decide`).send({ decision: 'approve', confirmation: { phrase, impact: [] } }).expect(200);
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('reopened');
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    for (const v of (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/variances`).expect(200)).body) await api('payAdmin', 'post', `/payroll/runs/${ids.run}/variances/${v.id}/ack`).send({}).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    expect((await decide('approver2', ids.run)).status).toBe(200);
    expect((await decide('approver1', ids.run)).status).toBe(200);
    const versions = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.payslip.findMany({ where: { employeeId: ids.emp1, status: { in: ['approved', 'revised'] } }, orderBy: { version: 'asc' }, select: { version: true, status: true } });
    });
    expect(versions).toEqual([{ version: 1, status: 'revised' }, { version: 2, status: 'approved' }]);
  });

  it('security review: nobody enters inputs or holds about themselves; a request about an approver goes to someone else', async () => {
    const hireAs = async (who: Who, code: string) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: today, userId: users[who], workEmail: `${who}@pay5c-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id as string;
    const payAdminEmp = await hireAs('payAdmin', 'P5C-003');
    const approverEmp = await hireAs('approver1', 'P5C-004');
    await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: payAdminEmp, reasonCode: 'other', note: 'My own hold' }).expect(403);
    await api('payAdmin', 'put', '/payroll/special-days').send({ employeeId: payAdminEmp, month: '2099-01', kind: 'injury', days: '2', note: 'My own days' }).expect(403);
    await api('payAdmin', 'post', '/payroll/court-orders').send({ employeeId: payAdminEmp, orderRef: 'X 1/2026', amount: '1', priorityDate: '2026-01-01', payee: 'Account 123456789' }).expect(403);
    await api('payAdmin', 'post', '/payroll/loans').send({ employeeId: approverEmp, loanType: 'advance', principal: '6000', instalments: 3, firstMonth: '2099-01', reason: 'Advance for the approver' }).expect(201);
    const mine = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { title: string }[];
    const theirs = (await api('approver2', 'get', '/workflow/approvals/inbox').expect(200)).body as { title: string }[];
    expect(mine.some((t) => /Salary advance of ₹6000/.test(t.title))).toBe(false);
    expect(theirs.some((t) => /Salary advance of ₹6000/.test(t.title))).toBe(true);
  });

  it('5c-D2: the skill class is a dated job fact set through a change someone else approves, shown to HR and used by the salary check', async () => {
    const ch = (await api('adminA', 'post', '/people/changes').send({ employeeId: ids.emp2, changeType: 'redesignation', effectiveDate: today, payload: { assignment: { skillClass: 'skilled' } }, reason: 'Skilled work from today' }).expect(201)).body;
    await api('adminA', 'post', '/people/changes').send({ employeeId: ids.emp2, changeType: 'redesignation', effectiveDate: today, payload: { assignment: { skillClass: 'expert' } }, reason: 'Not a class' }).expect(400);
    await stepUp('approver1');
    await api('approver1', 'post', `/people/changes/${ch.id}/approve`).send({ confirmRebase: true }).expect(201);
    const asOf = (await api('adminA', 'get', `/people/employees/${ids.emp2}/as-of?date=${today}`).expect(200)).body;
    expect(JSON.stringify(asOf)).toMatch(/"skillClass":"skilled"/);
  });
});
