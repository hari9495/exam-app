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
import { payReady } from './fixtures/pay-ready';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';
import { monthRange } from '../src/time/time-core';

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
  /** Company A with its pay guard opened to the test entity (test set-up only). */
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
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
    planId = (await prisma.plan.create({ data: { name: `pay5c-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5C Org ${k}`, slug: `pay5c-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Founder 21 Oct 2026 (option A): only HR changes pay. These pay tests' payroll fixture also plays the HR person who
    // sets the pay (the job-change key); payroll itself is refused a pay change (people-increment.e2e-spec.ts).
    // Founder 28 Oct 2026: only HR approves job changes; the approver fixture also plays the HR approver who sees pay
    // (payroll itself is refused: employee-history.e2e-spec.ts).
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
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
      const permissionProfileId = keys
        ? (
            await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
              tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }),
            )
          ).id
        : null;
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: o, email: `${who}@pay5c-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@pay5c-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5C Mills', shortName: `P5C-${run}`, isDefault: true } })).id;
      ids.loc = (
        await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })
      ).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    // Batch H A2: approval needs the entity's TAN, PAN and PT registrations.
    await payReady(tenantPrisma, org.A.id, ids.entity);
    const hire = async (who: Who, code: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({
            legalEntityId: ids.entity,
            status: 'confirmed',
            reason: 'Joined',
            givenName: who,
            familyName: run,
            employeeCode: code,
            joinedOn: first,
            userId: users[who],
            workEmail: `${who}@pay5c-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P5C-001');
    ids.emp2 = await hire('emp2', 'P5C-002');
    // 5b set-up: the starter library and template, a pay group, and approved salaries from the 1st.
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp1, ids.emp2], from: first })
      .expect(201);
    // E5 (answer 2657): one-time pay after the cut-off moves to next month; this month's inputs stay open to its last day,
    // so the suite pays them in this month whatever day it runs.
    await api('payAdmin', 'put', `/payroll/pay-groups/${ids.group}/periods/${month}/dates`).send({ cutOffOn: monthRange(month).to, releaseOn: null, reason: 'Inputs open all month for this suite' }).expect(200);
    for (const [emp, ctc] of [
      [ids.emp1, '726000'],
      [ids.emp2, '480000'],
    ]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: ctc, reason: 'Joining salary' })
          .expect(201)
      ).body;
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
    const tables = [
      'payroll_runs',
      'run_employees',
      'run_validations',
      'payslips',
      'payslip_lines',
      'payslip_snapshots',
      'lop_inputs',
      'one_time_pays',
      'special_days',
      'variance_flags',
      'payroll_withholds',
      'pay_carry_forwards',
      'court_order_remittances',
      'court_orders',
      'loans',
      'loan_repayments',
      'loan_schedule_changes',
      'journals',
      'employee_cost_rates',
    ];
    const rows = await prisma.$queryRaw<{ t: string; ok: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive)
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive)) AS ok
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' WHERE c.relkind = 'r' AND c.relname = ANY (${tables})`;
    expect(
      rows
        .filter((r) => r.ok)
        .map((r) => r.t)
        .sort(),
    ).toEqual([...tables].sort());
  });

  it('inputs: manual LOP, one-time pay, a loan the employee asks for and someone else approves, a court order; another company sees none of it', async () => {
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`)
      .send({ rows: [{ employeeId: ids.emp2, lopDays: '40', reason: 'Too many' }] })
      .expect(400);
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`)
      .send({ rows: [{ employeeId: ids.emp2, lopDays: '2', reason: 'Absent without leave' }] })
      .expect(200);
    await api('payAdminB', 'put', `/payroll/lop-inputs/${month}`)
      .send({ rows: [{ employeeId: ids.emp2, lopDays: '2', reason: 'Absent without leave' }] })
      .expect(404);
    await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp1, componentCode: 'pf_employee', amount: '100', month, reason: 'Not allowed' }).expect(400);
    expect(
      (await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp1, componentCode: 'bonus', amount: '5000', month, reason: 'Festival bonus' }).expect(201)).body.status,
    ).toBe('approved');

    // PAY-05 effect summary: the calculator's change for one more bonus (gross up by it; nothing saved); wrong role,
    // another company and bad input refused.
    const before = await inA((tx) => tx.oneTimePay.count());
    const eff = (await api('payAdmin', 'get', `/payroll/one-time-pays/effect?employeeId=${ids.emp1}&componentCode=bonus&amount=10000&month=${month}`).expect(200)).body;
    expect(eff).toMatchObject({ month, component: { code: 'bonus' }, gross: '10000.00' });
    expect(Number(eff.net)).toBeLessThanOrEqual(10000);
    expect(Number(eff.net)).toBeCloseTo(10000 - Number(eff.tds) - Number(eff.pfEmployee) - Number(eff.esiEmployee), 2);
    expect(await inA((tx) => tx.oneTimePay.count())).toBe(before);
    await api('emp1', 'get', `/payroll/one-time-pays/effect?employeeId=${ids.emp1}&componentCode=bonus&amount=10000&month=${month}`).expect(403);
    await api('payAdminB', 'get', `/payroll/one-time-pays/effect?employeeId=${ids.emp1}&componentCode=bonus&amount=10000&month=${month}`).expect(404);
    await api('payAdmin', 'get', `/payroll/one-time-pays/effect?employeeId=${ids.emp1}&componentCode=pf_employee&amount=10000&month=${month}`).expect(400);
    await api('payAdmin', 'get', `/payroll/one-time-pays/effect?employeeId=${ids.emp1}&componentCode=bonus&amount=lots&month=${month}`).expect(400);

    // PAY-05 drafts: kept out of payroll until sent; sent or deleted in bulk, all or nothing; another company's refused.
    const d1 = (await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp2, componentCode: 'bonus', amount: '700', month, reason: 'Spot award', draft: true }).expect(201)).body;
    const d2 = (await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp2, componentCode: 'bonus', amount: '800', month, reason: 'Spot award', draft: 'yes' }).expect(400)).body;
    expect(d2.message).toBeTruthy();
    const d3 = (await api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp2, componentCode: 'bonus', amount: '900', month, reason: 'Spot award', draft: true }).expect(201)).body;
    expect(d1.status).toBe('draft');
    const approvedId = ((await api('payAdmin', 'get', `/payroll/one-time-pays?month=${month}`).expect(200)).body as { id: string; status: string; amount: string }[]).find((r) => r.status === 'approved' && r.amount === '5000.00')!.id;
    expect((await api('payAdmin', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d1.id, approvedId], action: 'submit' }).expect(409)).body.code).toBe('NOT_DRAFT');
    await api('payAdminB', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d1.id], action: 'submit' }).expect(404);
    await api('emp1', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d1.id], action: 'submit' }).expect(403);
    await api('payAdmin', 'post', '/payroll/one-time-pays/bulk').send({ ids: [], action: 'submit' }).expect(400);
    await api('payAdmin', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d1.id], action: 'approve' }).expect(400);
    expect((await api('payAdmin', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d1.id], action: 'submit' }).expect(200)).body).toEqual({ action: 'submit', items: [{ id: d1.id, status: 'approved' }] });
    expect((await api('payAdmin', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d1.id], action: 'delete' }).expect(409)).body.code).toBe('NOT_DRAFT');
    expect((await api('payAdmin', 'post', '/payroll/one-time-pays/bulk').send({ ids: [d3.id], action: 'delete' }).expect(200)).body.items).toEqual([{ id: d3.id, status: 'cancelled' }]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: { in: ['payroll.one_time.drafted', 'payroll.one_time.draft_deleted'] } } }))).toBe(3);
    // Keep the run's totals as before: the sent spot award is cancelled again.
    await api('payAdmin', 'patch', `/payroll/one-time-pays/${d1.id}/cancel`).expect(200);

    const loan = (await api('emp2', 'post', '/payroll/loans').send({ loanType: 'advance', principal: '12000', instalments: 4, firstMonth: month, reason: 'Medical expenses' }).expect(201)).body;
    expect(loan).toMatchObject({ status: 'requested', emi: '3000.00' });
    await api('emp2', 'post', '/payroll/loans').send({ employeeId: ids.emp1, loanType: 'advance', principal: '12000', instalments: 4, firstMonth: month, reason: 'For someone else' }).expect(404);
    // PAY-18: the requester sees the approval steps; who it waits for; payroll's list carries no one's steps.
    const waiting = ((await api('emp2', 'get', '/payroll/loans').expect(200)).body as { id: string; approval?: { steps: { state: string; waitingFor: string[]; by: string | null }[] } }[]).find((l) => l.id === loan.id)!;
    expect(waiting.approval?.steps[0]).toMatchObject({ state: 'open', by: null, waitingFor: expect.arrayContaining([expect.any(String)]) });
    expect(((await api('payAdmin', 'get', '/payroll/loans').expect(200)).body as { id: string; approval?: unknown }[]).find((l) => l.id === loan.id)?.approval).toBeUndefined();
    const inbox = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; type?: string; title: string }[];
    const task = inbox.find((t) => /Salary advance/.test(t.title))!;
    await api('approver1', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    const loans = (await api('emp2', 'get', '/payroll/loans').expect(200)).body;
    expect(loans).toEqual([expect.objectContaining({ status: 'active', mine: true })]);
    expect(loans[0].approval.steps.at(-1)).toMatchObject({ state: 'approved', by: expect.stringContaining('approver1'), at: expect.any(String), waitingFor: [] });
    ids.loan = loans[0].id;

    await api('payAdmin', 'post', '/payroll/court-orders')
      .send({ employeeId: ids.emp1, orderRef: 'MC 44/2026', amount: '2000', priorityDate: '2026-01-15', payee: 'Family court deposit account 0001234 IFSC SBIN0000001' })
      .expect(201);
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
    // PAY-02: attendance mode per group (the company default: punch, missing punches block approval); emp2 has a manual LOP entry.
    expect(ready.groups).toEqual([expect.objectContaining({ group: 'Bengaluru', mode: 'punch_block', employees: 2, lopEntered: 1, attendanceStage: 'open' })]);
    await api('approver1', 'get', `/payroll/runs/${ids.run}/readiness`).expect(403);
    // PAY-29: the run says its pay group and frequency (a weekly or fortnightly group opens the step view).
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.payGroup).toEqual({ name: expect.any(String), frequency: 'monthly' });
    await api('payAdminB', 'get', `/payroll/runs/${ids.run}/readiness`).expect(404);
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
    // From 17 Sep 2026 the PF ceiling is 25,000 (S.O. 5109(E)): 12% of the whole basic 24,200.
    expect(one.lines.find((l: { code: string }) => l.code === 'pf_employee')).toMatchObject({ amount: '2904.00', rule: { statute: 'IN.PF' } });
    const two = (await api('payAdmin', 'get', `/payroll/payslips/${ids.slip2}`).expect(200)).body;
    expect(two.lines.find((l: { code: string }) => l.code === 'loan_emi')).toMatchObject({ amount: '3000.00' });
    expect(two.lines.find((l: { code: string }) => l.code === 'basic').explanation).toMatch(/unpaid days/);
    await api('emp1', 'get', `/payroll/payslips/${ids.slip1}`).expect(404);
    const period = await inA((tx) => tx.payPeriod.findFirst({ where: { legalEntityId: ids.entity, periodStart: new Date(`${first}T00:00:00Z`) } }));
    expect(period?.stage).toBe('frozen');
    expect(await inA((tx) => tx.payslip.count())).toBe(0);
  });

  it('PAY-04 Frozen: the inputs say the month stage; a late request goes to someone else in payroll, never the requester', async () => {
    expect((await api('payAdmin', 'get', `/payroll/input-periods/${month}`).expect(200)).body).toEqual([{ legalEntityId: ids.entity, month, stage: 'frozen' }]);
    await api('payAdmin', 'get', '/payroll/input-periods/2026-13').expect(400);
    await api('emp1', 'get', `/payroll/input-periods/${month}`).expect(403);
    // Founder answer 4: the API refuses LOP for a frozen month too, as the screen does; nothing changes.
    const lopBefore = (await api('payAdmin', 'get', `/payroll/lop-inputs/${month}`).expect(200)).body;
    const frozen = await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`).send({ rows: [{ employeeId: ids.emp2, lopDays: '3', reason: 'Changed after the freeze' }] }).expect(409);
    expect(frozen.body).toMatchObject({ code: 'PERIOD_FROZEN', message: `Inputs are frozen for ${month}. Send the change as a late request.` });
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`).send({ source: 'upload', rows: [{ employeeId: ids.emp2, lopDays: '3', reason: 'Changed after the freeze' }] }).expect(409);
    expect((await api('payAdmin', 'get', `/payroll/lop-inputs/${month}`).expect(200)).body).toEqual(lopBefore);
    expect((await api('payAdminB', 'get', `/payroll/input-periods/${month}`).expect(200)).body.some((r: { legalEntityId: string }) => r.legalEntityId === ids.entity)).toBe(false);
    const ask = { employeeId: ids.emp2, on: first, kind: 'attendance', shouldBe: 'present', reason: 'Was on a client visit, approved late' };
    await api('emp1', 'post', '/payroll/input-corrections').send(ask).expect(403);
    await api('payAdminB', 'post', '/payroll/input-corrections').send(ask).expect(404);
    await api('payAdmin', 'post', '/payroll/input-corrections').send({ ...ask, reason: 'short' }).expect(400);
    await api('payAdmin', 'post', '/payroll/input-corrections').send({ ...ask, on: '2099-01-01' }).expect(400);
    // Nobody else holds payroll.correction.approve yet: refused, nothing recorded.
    expect((await api('payAdmin', 'post', '/payroll/input-corrections').send(ask).expect(400)).body.message).toMatch(/No one else can approve/);
    await inA(async (tx) => {
      const u = await tx.user.findFirstOrThrow({ where: { id: users.approver1 } });
      const prof = await tx.permissionProfile.findFirstOrThrow({ where: { id: u.permissionProfileId! } });
      await tx.permissionProfile.update({ where: { id: prof.id }, data: { permissionsJson: JSON.stringify([...JSON.parse(prof.permissionsJson), 'payroll.correction.approve']) } });
    });
    expect((await api('payAdmin', 'post', '/payroll/input-corrections').send(ask).expect(201)).body).toMatchObject({ status: 'pending', stage: 'frozen' });
    expect((await api('payAdmin', 'post', '/payroll/input-corrections').send(ask).expect(409)).body.message).toMatch(/already waiting/);
    const inbox = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { title: string }[];
    expect(inbox.some((t) => /correction for/.test(t.title))).toBe(true);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'payroll.correction.submitted' } }))).toBe(1);
  });

  it('PAY-03 retry only the failed people (founder 29 Oct 2026): only after failures, prepare key, in scope, audited', async () => {
    // Nobody failed: refused, so a whole recalculation goes through Calculate.
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/retry-failed`).expect(409)).body.message).toMatch(/No one failed/);
    await api('emp1', 'post', `/payroll/runs/${ids.run}/retry-failed`).expect(403);
    await api('finance', 'post', `/payroll/runs/${ids.run}/retry-failed`).expect(403);
    await api('payAdminB', 'post', `/payroll/runs/${ids.run}/retry-failed`).expect(404);
    await api('payAdmin', 'post', '/payroll/runs/not-a-uuid/retry-failed').expect(400);
    // The calculation failed for emp1 (as a missing input does): the run goes back to draft with that person failed.
    await scoped(async (tx) => {
      const r = await tx.payrollRun.findFirstOrThrow({ where: { id: ids.run } });
      await tx.payslip.updateMany({ where: { runId: ids.run, employeeId: ids.emp1, calcVersion: r.calcVersion, status: 'draft' }, data: { status: 'void', voidReason: 'test: failed' } });
      await tx.runEmployee.updateMany({ where: { runId: ids.run, employeeId: ids.emp1, calcVersion: r.calcVersion }, data: { state: 'failed', failure: { field: 'bank', message: 'Add a salary bank account' } } });
      await tx.payrollRun.update({ where: { id: ids.run }, data: { status: 'draft' } });
    });
    const before = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.calcVersion;
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/retry-failed`).expect(202)).body).toMatchObject({ queued: 1, calcVersion: before });
    const done = await waitFor(ids.run, 'calculated');
    expect(done).toMatchObject({ calcVersion: before, totals: { people: 2, failed: 0 } });
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}/progress`).expect(200)).body).toMatchObject({ ok: 2, failed: 0, queued: 0 });
    const slips = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/payslips`).expect(200)).body as { id: string; employeeId: string }[];
    expect(slips).toHaveLength(2);
    ids.slip1 = slips.find((s) => s.employeeId === ids.emp1)!.id;
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'payroll.run.retry_failed', entityId: ids.run } }))).toBe(1);
    // A repeat once nothing has failed is refused again.
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/retry-failed`).expect(409);
  });

  it('PAY-03 input sources: per source for the run month and people; read keys only, never another company', async () => {
    const x = (await api('approver1', 'get', `/payroll/runs/${ids.run}/input-sources`).expect(200)).body as { people: number; sources: { key: string; people: number; amount: string | null; days: string | null }[] };
    expect(x.people).toBe(2);
    expect(x.sources.map((s) => s.key)).toEqual(['attendance', 'lop', 'one_time', 'holds', 'loans', 'court_orders', 'overpayments', 'carry_forwards']);
    expect(x.sources.find((s) => s.key === 'loans')).toMatchObject({ people: 1, amount: '3000.00' });
    expect(x.sources.find((s) => s.key === 'court_orders')).toMatchObject({ people: 1 });
    await api('emp1', 'get', `/payroll/runs/${ids.run}/input-sources`).expect(403);
    await api('payAdminB', 'get', `/payroll/runs/${ids.run}/input-sources`).expect(404);
  });

  it('submit and approve: maker ≠ checker, step-up, the typed phrase, nobody approves two steps; approval locks the month', async () => {
    await api('approver1', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(403);
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200)).body).toMatchObject({ status: 'submitted', approvers: 2 });
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/void`).send({ reason: 'Changed my mind' }).expect(409);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/decision`).send({ decision: 'approve' }).expect(403);
    expect(
      (
        await api('approver2', 'post', `/payroll/runs/${ids.run}/decision`)
          .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } })
          .expect(403)
      ).body.code,
    ).toBe('STEP_UP_REQUIRED');
    await stepUp('approver1');
    await api('approver1', 'post', `/payroll/runs/${ids.run}/decision`)
      .send({ decision: 'approve', confirmation: { phrase: 'APPROVE', impact: [] } })
      .expect(400);
    const inbox = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; decideAt: string | null; title: string }[];
    const generic = inbox.find((t) => /Payroll for/.test(t.title))!;
    expect(generic.decideAt).toBe('/yx/payroll/runs');
    await api('approver1', 'post', `/workflow/approvals/tasks/${generic.taskId}/decide`).send({ decision: 'approve' }).expect(409);
    expect((await decide('approver1', ids.run)).status).toBe(200);
    expect((await decide('approver1', ids.run)).status).toBe(404);
    expect((await decide('approver2', ids.run)).status).toBe(200);
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('approved');
    // HIR-12 answer 231: modules that follow approved pay hear the approval once (the referral bonus cost).
    expect(await inA((tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'payroll.run.approved', payload: { path: ['runId'], equals: ids.run } } }))).toBe(1);
    const period = await inA((tx) => tx.payPeriod.findFirst({ where: { legalEntityId: ids.entity, periodStart: new Date(`${first}T00:00:00Z`) } }));
    expect(period).toMatchObject({ stage: 'locked', lockedByRunId: ids.run });
    await api('payAdmin', 'put', `/payroll/lop-inputs/${month}`)
      .send({ rows: [{ employeeId: ids.emp2, lopDays: '1', reason: 'Too late now' }] })
      .expect(409);
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
    // PAY-19 OrderPanel: the month's deduction, paid to the court once with its reference (audited); no other month.
    const orderId = (await api('payAdmin', 'get', '/payroll/court-orders').expect(200)).body[0].id as string;
    expect((await api('payAdmin', 'get', `/payroll/court-orders/${orderId}/remittances`).expect(200)).body).toEqual([{ month, deducted: '2000.00', remitted: null }]);
    await api('payAdminB', 'get', `/payroll/court-orders/${orderId}/remittances`).expect(404);
    await api('emp1', 'get', `/payroll/court-orders/${orderId}/remittances`).expect(403);
    await api('payAdmin', 'post', `/payroll/court-orders/${orderId}/remittances`).send({ month, reference: '!' }).expect(400);
    await api('payAdmin', 'post', `/payroll/court-orders/${orderId}/remittances`).send({ month: '2020-01', reference: 'UTR-1' }).expect(400);
    expect((await api('payAdmin', 'post', `/payroll/court-orders/${orderId}/remittances`).send({ month, reference: 'UTR-7788' }).expect(201)).body).toMatchObject({ month, amount: '2000.00', reference: 'UTR-7788' });
    await api('payAdmin', 'post', `/payroll/court-orders/${orderId}/remittances`).send({ month, reference: 'UTR-7789' }).expect(409);
    expect((await api('payAdmin', 'get', `/payroll/court-orders/${orderId}/remittances`).expect(200)).body[0].remitted).toMatchObject({ reference: 'UTR-7788' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'payroll.court_order.remitted' } }))).toBe(1);
    // Insert-only: the app role cannot change a recorded remittance.
    await expect(scoped((tx) => tx.courtOrderRemittance.updateMany({ data: { reference: 'CHANGED' } }))).rejects.toThrow(/permission denied/);
    // PAY-19 carry-forwards and the cap check: read keys only, never another company.
    expect(Array.isArray((await api('payAdmin', 'get', '/payroll/carry-forwards').expect(200)).body)).toBe(true);
    await api('emp1', 'get', '/payroll/carry-forwards').expect(403);
    const cap = (await api('approver1', 'get', `/payroll/payslips/${ids.slip1}/deduction-cap`).expect(200)).body;
    expect(cap).toMatchObject({ payslipId: ids.slip1, employeeId: ids.emp1, month });
    expect(cap.lines[0]).toMatchObject({ kind: 'statutory', deferred: '0.00' });
    expect(cap.lines.find((l: { kind: string }) => l.kind === 'court_order')).toMatchObject({ deducted: '2000.00' });
    await api('payAdminB', 'get', `/payroll/payslips/${ids.slip1}/deduction-cap`).expect(404);
    await api('emp1', 'get', `/payroll/payslips/${ids.slip1}/deduction-cap`).expect(403);
    expect(Array.isArray((await api('approver1', 'get', '/payroll/deferrals').expect(200)).body)).toBe(true);
    expect((await api('payAdminB', 'get', '/payroll/deferrals').expect(200)).body).toEqual([]);
    expect((await api('approver1', 'post', `/payroll/payslips/${ids.slip1}/reproduce`).expect(200)).body).toMatchObject({ same: true, inputsMatch: true });
    const j = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/journal`).expect(200)).body;
    const debit = j.lines.reduce((t: number, l: { debit: string }) => t + Number(l.debit), 0);
    const credit = j.lines.reduce((t: number, l: { credit: string }) => t + Number(l.credit), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    // GP-PAY-1: nothing is mapped yet, so everything sits in Unmapped and export and posting are refused.
    expect(j).toMatchObject({ canPost: false });
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'csv' }).expect(409)).body.code).toBe('JOURNAL_UNMAPPED');
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/posted`).expect(409);
    await api('emp1', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: '_net_pay', side: 'payable', accountCode: '2100', accountName: 'Net salary payable' }).expect(403);
    for (const u of j.unmapped as { componentCode: string; side: string }[]) {
      await api('payAdmin', 'put', '/payroll/ledger-mappings')
        .send({
          scopeType: 'company',
          componentCode: u.componentCode,
          side: u.side,
          accountCode: u.componentCode === '_net_pay' ? '2100' : u.side === 'expense' ? '5100' : '2200',
          accountName: u.componentCode === '_net_pay' ? 'Net salary payable' : u.side === 'expense' ? 'Salaries and wages' : 'Statutory dues payable',
        })
        .expect(200);
    }
    // An override for the legal entity wins over the company default.
    await api('payAdmin', 'put', '/payroll/ledger-mappings')
      .send({ scopeType: 'legal_entity', scopeId: ids.entity, componentCode: 'basic', side: 'expense', accountCode: '5110', accountName: 'Basic salary' })
      .expect(200);
    await api('payAdmin', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: 'no_such', side: 'expense', accountCode: '1', accountName: 'Nope' }).expect(400);
    const mapped = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/journal`).expect(200)).body;
    expect(mapped).toMatchObject({ canPost: true, unmapped: [] });
    expect(mapped.lines.map((l: { accountCode: string }) => l.accountCode)).toContain('5110');
    const csv = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'csv' }).expect(200);
    expect(csv.text).toMatch(/Net salary payable/);
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/posted`).expect(200)).body.postedAt).toBeTruthy();
    const tally = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`)
      .send({ format: 'tally' })
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (x: Buffer) => c.push(x));
        res.on('end', () => cb(null, Buffer.concat(c)));
      })
      .expect(200);
    expect(Buffer.from(tally.body as Buffer).toString()).toMatch(/<VOUCHER VCHTYPE="Journal"/);
    // Enterprise E4 (O20, O22): with a suspense account an unmapped line is parked there and the journal still goes to
    // the books (the fix list stays); every line carries its department and location; SAP and Oracle files.
    await api('payAdmin', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: '_suspense', side: 'payable', accountCode: '9999', accountName: 'Payroll suspense' }).expect(200);
    const maps = (await api('payAdmin', 'get', '/payroll/ledger-mappings').expect(200)).body as { id: string; scopeType: string; componentCode: string; side: string; accountCode: string; accountName: string }[];
    const dropped = maps.find((m) => m.scopeType === 'company' && m.side === 'payable' && !m.componentCode.startsWith('_'))!;
    await api('payAdmin', 'post', `/payroll/ledger-mappings/${dropped.id}/remove`).expect(200);
    const parked = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/journal`).expect(200)).body;
    expect(parked).toMatchObject({ canPost: true, suspense: { on: true, account: '9999 · Payroll suspense' }, split: 'cost_centre', defaultFormat: 'csv', reversal: null });
    expect(Number(parked.suspense.amount)).toBeGreaterThan(0);
    expect(parked.unmapped.map((u: { componentCode: string }) => u.componentCode)).toContain(dropped.componentCode);
    expect(parked.lines.some((l: { accountCode: string }) => l.accountCode === '9999')).toBe(true);
    expect(parked.lines.every((l: { department: string | null }) => typeof l.department === 'string')).toBe(true);
    const sap = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'sap' }).expect(200);
    expect(sap.text).toMatch(/^DocDate,PostingDate,Reference,HeaderText,PostingKey,GLAccount/);
    expect(sap.text).toMatch(/,40,"9999"|,50,"9999"/);
    const ora = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'oracle' }).expect(200);
    expect(ora.text).toMatch(/ENTERED_DR,ENTERED_CR/);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'xml' }).expect(400);
    // The suspense line is only a pay line for payroll's ledger key.
    await api('emp1', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: '_suspense', side: 'payable', accountCode: '1', accountName: 'Mine' }).expect(403);
    await api('payAdmin', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: dropped.componentCode, side: dropped.side, accountCode: dropped.accountCode, accountName: dropped.accountName }).expect(200);
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}/journal`).expect(200)).body).toMatchObject({ unmapped: [], suspense: { amount: '0.00' } });
    expect((await api('finance', 'get', `/payroll/cost-rates?month=${month}`).expect(200)).body).toHaveLength(2);
    await api('emp1', 'get', `/payroll/cost-rates?month=${month}`).expect(403);
  });

  it('holds: one open hold per person; release is idempotent', async () => {
    const h = (await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: ids.emp1, reasonCode: 'investigation', note: 'Pending enquiry' }).expect(201)).body;
    expect((await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: ids.emp1, reasonCode: 'other', note: 'Second try' }).expect(201)).body).toEqual({ id: h.id, created: false });
    // Founder 29 Oct 2026: a reason (5 to 300 letters) and a route are required.
    await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({}).expect(400);
    await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'ok', route: 'next_bank_file' }).expect(400);
    await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed', route: 'cash' }).expect(400);
    await api('emp2', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed', route: 'next_bank_file' }).expect(403);
    await api('payAdminB', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed', route: 'next_bank_file' }).expect(404);
    // Nothing is held in an approved run yet (the hold came after approval): an off-cycle payment has nothing to pay.
    expect((await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed', route: 'offcycle' }).expect(400)).body.message).toMatch(/Nothing is held/);
    const a = (await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed', route: 'next_bank_file' }).expect(200)).body;
    expect(a).toMatchObject({ released: true, route: 'next_bank_file', payslips: 0 });
    const b = (await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed again', route: 'offcycle' }).expect(200)).body;
    expect(b.releasedAt).toBe(a.releasedAt);
    const logged = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'payroll.hold.released', entityId: ids.emp1 } }));
    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0].metadataJson ?? '{}')).toMatchObject({ holdId: h.id, reason: 'Enquiry closed', route: 'next_bank_file' });
  });

  it('a reopened month: the run recalculates, a new approval revises the earlier payslips (kept)', async () => {
    await stepUp('payAdmin');
    const asked = (await api('payAdmin', 'post', '/payroll/reopen-requests').send({ legalEntityId: ids.entity, month, reason: 'A missed allowance must be paid this month' }).expect(201)).body;
    const phrase = `REOPEN ${short()} ${month}`;
    await stepUp('approver1');
    await api('approver1', 'post', `/payroll/reopen-requests/${asked.id}/decide`)
      .send({ decision: 'approve', confirmation: { phrase, impact: [] } })
      .expect(200);
    await stepUp('finance');
    await api('finance', 'post', `/payroll/reopen-requests/${asked.id}/decide`)
      .send({ decision: 'approve', confirmation: { phrase, impact: [] } })
      .expect(200);
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('reopened');
    // Enterprise E4 (O22): the reopened run's exported journal is offered as its reversing journal (debits and credits
    // swapped); exporting it is recorded as a reversal.
    const rev = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/journal`).expect(200)).body;
    expect(rev).toMatchObject({ canPost: false, lines: [], reversal: { exportedAt: expect.any(String) } });
    const net = rev.reversal.lines.find((l: { accountCode: string }) => l.accountCode === '2100');
    expect(Number(net.debit)).toBeGreaterThan(0);
    expect(net.credit).toBe('0.00');
    const back = await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/export`).send({ format: 'csv' }).expect(200);
    expect(back.headers['content-disposition']).toMatch(/payroll-journal-.*-reversal\.csv/);
    expect(back.text).toMatch(/"2100"/);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/journal/posted`).expect(409);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'payroll.journal.reversal_exported', entityId: ids.run } }))).toBe(1);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    for (const v of (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/variances`).expect(200)).body)
      await api('payAdmin', 'post', `/payroll/runs/${ids.run}/variances/${v.id}/ack`).send({}).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    expect((await decide('approver2', ids.run)).status).toBe(200);
    expect((await decide('approver1', ids.run)).status).toBe(200);
    const versions = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.payslip.findMany({ where: { employeeId: ids.emp1, status: { in: ['approved', 'revised'] } }, orderBy: { version: 'asc' }, select: { version: true, status: true } });
    });
    expect(versions).toEqual([
      { version: 1, status: 'revised' },
      { version: 2, status: 'approved' },
    ]);
  });

  it('security review: nobody enters inputs or holds about themselves; a request about an approver goes to someone else', async () => {
    const hireAs = async (who: Who, code: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({
            legalEntityId: ids.entity,
            status: 'confirmed',
            reason: 'Joined',
            givenName: who,
            familyName: run,
            employeeCode: code,
            joinedOn: today,
            userId: users[who],
            workEmail: `${who}@pay5c-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    const payAdminEmp = await hireAs('payAdmin', 'P5C-003');
    const approverEmp = await hireAs('approver1', 'P5C-004');
    // Founder decision 8: a loan is capped at months of gross pay, so the approver gets a salary (someone else approves it).
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    const pay = (
      await api('payAdmin', 'post', `/payroll/employees/${approverEmp}/compensation-changes`)
        .send({ employeeId: approverEmp, effectiveDate: today, templateVersionId: version, entryMode: 'ctc', annualCtc: '600000', reason: 'Joining salary' })
        .expect(201)
    ).body;
    await stepUp('approver2');
    await api('approver2', 'post', `/people/changes/${pay.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: payAdminEmp, reasonCode: 'other', note: 'My own hold' }).expect(403);
    await api('payAdmin', 'put', '/payroll/special-days').send({ employeeId: payAdminEmp, month: '2099-01', kind: 'injury', days: '2', note: 'My own days' }).expect(403);
    // HLP-12 answer 65: the month's special days list with each row's source; nothing was saved for their own pay.
    expect(((await api('payAdmin', 'get', '/payroll/special-days?month=2099-01').expect(200)).body as { employeeId: string }[]).some((r) => r.employeeId === payAdminEmp)).toBe(false);
    await api('payAdmin', 'get', '/payroll/special-days?month=99-1').expect(400);
    await api('payAdmin', 'get', '/payroll/special-days').expect(400);
    await api('payAdmin', 'post', '/payroll/court-orders').send({ employeeId: payAdminEmp, orderRef: 'X 1/2026', amount: '1', priorityDate: '2026-01-01', payee: 'Account 123456789' }).expect(403);
    await api('payAdmin', 'post', '/payroll/loans')
      .send({ employeeId: approverEmp, loanType: 'advance', principal: '6000', instalments: 3, firstMonth: '2099-01', reason: 'Advance for the approver' })
      .expect(201);
    const mine = (await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { title: string }[];
    const theirs = (await api('approver2', 'get', '/workflow/approvals/inbox').expect(200)).body as { title: string }[];
    expect(mine.some((t) => /Salary advance of ₹6000/.test(t.title))).toBe(false);
    expect(theirs.some((t) => /Salary advance of ₹6000/.test(t.title))).toBe(true);
  });

  it('5c-D2: the skill class is a dated job fact set through a change someone else approves, shown to HR and used by the salary check', async () => {
    const ch = (
      await api('adminA', 'post', '/people/changes')
        .send({ employeeId: ids.emp2, changeType: 'redesignation', effectiveDate: today, payload: { assignment: { skillClass: 'skilled' } }, reason: 'Skilled work from today' })
        .expect(201)
    ).body;
    await api('adminA', 'post', '/people/changes')
      .send({ employeeId: ids.emp2, changeType: 'redesignation', effectiveDate: today, payload: { assignment: { skillClass: 'expert' } }, reason: 'Not a class' })
      .expect(400);
    await stepUp('approver1');
    await api('approver1', 'post', `/people/changes/${ch.id}/approve`).send({ confirmRebase: true }).expect(201);
    const asOf = (await api('adminA', 'get', `/people/employees/${ids.emp2}/as-of?date=${today}`).expect(200)).body;
    expect(JSON.stringify(asOf)).toMatch(/"skillClass":"skilled"/);
  });

  it('PAY-06 release pays what the hold held (off-cycle now), never what a missing bank account held', async () => {
    const h = (await api('payAdmin', 'post', '/payroll/holds').send({ employeeId: ids.emp2, reasonCode: 'investigation', note: 'Backdated for the test' }).expect(201)).body;
    // The hold was open before the run was approved, so the approved payslip is held by it (and by the waived bank check).
    await scoped((tx) => tx.payrollWithhold.update({ where: { id: h.id }, data: { createdAt: new Date(Date.parse(first) - 86_400_000) } }));
    const bankOnly = (await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Still checking the bank', route: 'offcycle' }).expect(400)).body;
    expect(bankOnly.message).toMatch(/Nothing is held/);
    // Bank details arrived (the check no longer waived): now the hold alone holds the payslip, and the release frees it.
    await scoped((tx) => tx.runValidation.updateMany({ where: { runId: ids.run, employeeId: ids.emp2, checkKey: 'bank_missing' }, data: { waivedBy: null, waiverReason: null, waivedAt: null } }));
    const r = (await api('payAdmin', 'post', `/payroll/holds/${h.id}/release`).send({ reason: 'Enquiry closed, pay now', route: 'offcycle' }).expect(200)).body;
    expect(r).toMatchObject({ route: 'offcycle', payslips: 1, runIds: [ids.run] });
    const slip = await scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: ids.run, employeeId: ids.emp2, status: 'approved' } }));
    expect(slip).toMatchObject({ held: false, paymentStatus: 'pending' });
    const log = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'payroll.hold.released', entityId: ids.emp2 } }));
    expect(JSON.parse(log?.metadataJson ?? '{}')).toMatchObject({ reason: 'Enquiry closed, pay now', route: 'offcycle', payslips: 1 });
  });
});
