// The F&F statement letter: the template preview passes the (fake) virus check and letters are made by the fake converter.
process.env.SD_SCANNER = 'dev-fake';
process.env.LETTER_PDF_CONVERTER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { StatutoryRulesService } from '../src/statutory/statutory.service';
import { freezeSettlementIn } from '../src/lifecycle/settlement';
import { FnfService, moneyText } from '../src/payroll/fnf.service';
import { MODULE_COMPONENTS } from '../src/payroll/starter';
import { serviceYears } from '../src/statutory/evaluator';
import type { CompanyContext } from '../src/org-structure/org-structure.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5g end to end against the real database: an off-cycle bonus run on the same engine and approval, which
// never touches the regular payslip; arrears per month and component (corrected − as-paid) after a past-dated raise,
// paid in an arrears run with PF on them; a month with no payslip asks for a base, and what was overpaid becomes a
// recovery the employee agrees to, written off only by someone else; rule-change proposals accepted or dismissed; F&F
// made from lifecycle's hand-off with the deadline over a weekend and a holiday, retrenchment lines held without the
// government's permission and paid in a second run; death in service split by shares; another company apart.
describe('Payroll batch 5g (off-cycle, arrears, F&F)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let fnf: FnfService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'emp1' | 'emp2' | 'emp3' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (d: string, n: number) => iso(new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000));
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const prevMonth = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1))).slice(0, 7);
  const prevFirst = `${prevMonth}-01`;
  const short = () => `P5G-${run}`.toUpperCase();

  /** Waive missing bank details and calculate. */
  const calculate = async (runId: string) => {
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${runId}/readiness`).expect(200)).body;
    for (const b of ready.checks.filter((c: { checkKey: string; waived: boolean }) => c.checkKey === 'bank_missing' && !c.waived))
      await api('payAdmin', 'post', `/payroll/runs/${runId}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${runId}/calculate`).expect(202);
    let r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    for (let i = 0; i < 160 && r.status === 'calculating'; i++) {
      await new Promise((ok) => setTimeout(ok, 250));
      r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    }
    if (r.status !== 'calculated') throw new Error(`run ${runId}: ${JSON.stringify((await api('payAdmin', 'get', `/payroll/runs/${runId}/progress`)).body)}`);
    return r;
  };
  /** Calculate, submit, and both approvers approve with the phrase. */
  const approveRun = async (runId: string) => {
    const r = await calculate(runId);
    await api('payAdmin', 'post', `/payroll/runs/${runId}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${runId}/decision`)
        .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${r.month}`, impact: [] } })
        .expect(200);
    }
    return (await api('payAdmin', 'get', `/payroll/runs/${runId}/payslips`).expect(200)).body as { id: string; employeeId: string; net: string; held: boolean; status: string }[];
  };
  const linesOf = (payslipId: string) => api('payAdmin', 'get', `/payroll/payslips/${payslipId}`).expect(200);

  /** An accepted company exit recorded straight in lifecycle's table, then the payroll hand-off frozen (as lifecycle does). */
  const exitCase = async (employeeId: string, exitType: string, lwd: string, extra: Record<string, unknown> = {}) => {
    const c = { organizationId: org.A.id, isSuperAdmin: false, userId: users.adminA } as unknown as CompanyContext;
    const id = await inA(async (tx) => {
      const e = await tx.employee.findFirstOrThrow({ where: { id: employeeId } });
      const em = await tx.employment.findFirstOrThrow({ where: { employeeId } });
      const k = await tx.exitCase.create({
        data: {
          organizationId: org.A.id,
          employmentId: em.id,
          employeeId,
          personId: e.personId!,
          exitType,
          initiatedBy: 'company',
          reasonText: 'Test exit',
          submittedOn: new Date(`${today}T00:00:00Z`),
          noticePeriod: '0d',
          standardLwd: new Date(`${lwd}T00:00:00Z`),
          approvedLwd: new Date(`${lwd}T00:00:00Z`),
          status: 'accepted',
          acceptedAt: new Date(),
          ...extra,
        },
      });
      await freezeSettlementIn(tx, c, k.id, 'accepted');
      return k.id;
    });
    await fnf.fromInputs(org.A.id, id);
    const list = (await api('payAdmin', 'get', '/payroll/fnf').expect(200)).body as { id: string; exitCaseId: string }[];
    return list.find((f) => f.exitCaseId === id)!.id;
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
    fnf = moduleRef.get(FnfService);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, [...pack('in-tax.json'), ...pack('in-exit.json'), ...pack('in-bank-formats.json')], await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    (moduleRef.get(StatutoryRulesService) as unknown as { cache: null }).cache = null;
    planId = (await prisma.plan.create({ data: { name: `pay5g-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5G Org ${k}`, slug: `pay5g-${k.toLowerCase()}-${run}`, planId } });
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
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['emp3', 'A', 'panel', null],
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
          tx.user.create({ data: { organizationId: o, email: `${who}@pay5g-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@pay5g-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5G Mills', shortName: `P5G-${run}`, isDefault: true } })).id;
      ids.loc = (
        await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })
      ).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string, joinedOn: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({
            legalEntityId: ids.entity,
            status: 'confirmed',
            reason: 'Joined',
            givenName: who,
            familyName: run,
            employeeCode: code,
            joinedOn,
            userId: users[who],
            workEmail: `${who}@pay5g-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P5G-001', first);
    ids.emp2 = await hire('emp2', 'P5G-002', first);
    ids.emp3 = await hire('emp3', 'P5G-003', prevFirst);
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    ids.version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp1, ids.emp2], from: first })
      .expect(201);
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp3], from: prevFirst })
      .expect(201);
    for (const [emp, ctc, from] of [
      [ids.emp1, '600000', first],
      [ids.emp2, '240000', first],
      [ids.emp3, '360000', prevFirst],
    ]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: from, templateVersionId: ids.version, entryMode: 'ctc', annualCtc: ctc, reason: 'Joining salary' })
          .expect(201)
      ).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    await approveRun(ids.run);
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

  it('every 5g table has forced RLS, tenant isolation, the support exclusion and the pay guard', async () => {
    const tables = ['arrears_worksheets', 'arrears_worksheet_lines', 'statutory_arrears_proposals', 'fnf_settlements', 'overpayment_recoveries'];
    const rows = await prisma.$queryRaw<{ t: string; ok: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive)
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive)) AS ok
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[])`;
    expect(
      rows
        .filter((r) => r.ok)
        .map((r) => r.t)
        .sort(),
    ).toEqual([...tables].sort());
  });

  it('an off-cycle bonus run: its items only, the same approval, the regular payslip untouched; others cannot add to it', async () => {
    const off = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month, offcycleKind: 'bonus' }).expect(201)).body;
    expect(off).toMatchObject({ runType: 'offcycle', offcycleKind: 'bonus' });
    // The regular run of a locked month is refused; the off-cycle one is not.
    await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(409);
    await api('payAdminB', 'post', `/payroll/runs/${off.id}/items`).send({ employeeId: ids.emp1, componentCode: 'bonus', amount: '20000', reason: 'Diwali bonus' }).expect(404);
    await api('emp1', 'post', `/payroll/runs/${off.id}/items`).send({ employeeId: ids.emp1, componentCode: 'bonus', amount: '20000', reason: 'Diwali bonus' }).expect(403);
    await api('payAdmin', 'post', `/payroll/runs/${off.id}/items`).send({ employeeId: ids.emp1, componentCode: 'pf_employee', amount: '20000', reason: 'Wrong' }).expect(400);
    await api('payAdmin', 'post', `/payroll/runs/${off.id}/items`)
      .send({ employeeId: ids.emp1, componentCode: 'bonus', amount: '20000', reason: 'Diwali bonus', label: 'Diwali bonus 2026.' })
      .expect(201);
    const slips = await approveRun(off.id);
    expect(slips).toHaveLength(1);
    const lines = (await linesOf(slips[0].id)).body.lines as { code: string; amount: string; explanation: string }[];
    expect(lines.find((l) => l.code === 'bonus')).toMatchObject({ amount: '20000.00', explanation: 'Diwali bonus 2026.' });
    expect(lines.some((l) => l.code === 'basic' || l.code === 'pt')).toBe(false);
    const regular = await scoped((tx) => tx.payslip.findMany({ where: { employeeId: ids.emp1, runType: 'regular' } }));
    expect(regular.map((s) => s.status)).toEqual(['approved']);
    expect((await api('payAdmin', 'get', `/payroll/runs/${off.id}`).expect(200)).body.status).toBe('approved');
  });

  it('arrears after a past-dated raise: corrected − as-paid per component, approved by someone else, paid in an arrears run with PF', async () => {
    const ch = (
      await api('payAdmin', 'post', `/payroll/employees/${ids.emp1}/compensation-changes`)
        .send({ employeeId: ids.emp1, effectiveDate: first, templateVersionId: ids.version, entryMode: 'ctc', annualCtc: '720000', reason: 'Raise from the start of the month' })
        .expect(201)
    ).body;
    await stepUp('approver1');
    await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    const w = (await api('payAdmin', 'post', '/payroll/arrears-worksheets').send({ employeeId: ids.emp1, from: month, to: month, reason: 'Raise approved late', changeId: ch.changeId }).expect(201))
      .body;
    expect(w).toMatchObject({ source: 'change', status: 'draft', missing: 0 });
    const basic = w.lines.find((l: { componentCode: string }) => l.componentCode === 'basic');
    expect(basic.base).toBe('payslip');
    expect(Number(basic.difference)).toBeCloseTo(Number(basic.corrected) - Number(basic.asPaid), 2);
    expect(Number(basic.difference)).toBeGreaterThan(0);
    expect(Number(w.total)).toBeGreaterThan(0);
    await api('payAdminB', 'get', `/payroll/arrears-worksheets/${w.id}`).expect(404);
    // The maker cannot approve; the month is locked, so it is paid in an arrears run.
    expect((await api('payAdmin', 'post', `/payroll/arrears-worksheets/${w.id}/approve`).send({}).expect(403)).body.message).toMatch(/Someone other/);
    await api('approver1', 'post', `/payroll/arrears-worksheets/${w.id}/approve`).send({}).expect(409);
    const arrearsRun = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month, offcycleKind: 'arrears' }).expect(201)).body.id;
    expect((await api('approver1', 'post', `/payroll/arrears-worksheets/${w.id}/approve`).send({ runId: arrearsRun }).expect(200)).body).toMatchObject({ status: 'approved', overpaid: '0.00' });
    const slips = await approveRun(arrearsRun);
    const lines = (await linesOf(slips[0].id)).body.lines as { code: string; amount: string; explanation: string }[];
    expect(lines.find((l) => l.code === 'basic')).toMatchObject({ amount: Number(basic.difference).toFixed(2), explanation: `Arrears for ${month}.` });
    expect(Number(lines.find((l) => l.code === 'pf_employee')?.amount)).toBeGreaterThan(0);
    // A second worksheet for the same month owes nothing more (arrears approved earlier count as paid).
    const again = (await api('payAdmin', 'post', '/payroll/arrears-worksheets').send({ employeeId: ids.emp1, from: month, to: month, reason: 'Check again' }).expect(201)).body;
    expect(Number(again.total)).toBe(0);
  });

  it('a month with no payslip asks for a base; what was overpaid becomes a recovery the employee agrees to', async () => {
    const w = (await api('payAdmin', 'post', '/payroll/arrears-worksheets').send({ employeeId: ids.emp3, from: prevMonth, to: prevMonth, reason: 'Paid by the old system' }).expect(201)).body;
    expect(w.missing).toBeGreaterThan(0);
    expect(w.lines.every((l: { base: string; asPaid: string | null }) => l.base === 'missing' && l.asPaid === null)).toBe(true);
    await api('approver1', 'post', `/payroll/arrears-worksheets/${w.id}/approve`).send({}).expect(409);
    const lines = w.lines.map((l: { componentCode: string; corrected: string }) => ({
      componentCode: l.componentCode,
      // 5g-D6: PF was under-deducted by 100 (employee and employer share alike).
      asPaid: l.componentCode === 'special' ? (Number(l.corrected) + 1000).toFixed(2) : ['pf_employee', 'pf_employer'].includes(l.componentCode) ? (Number(l.corrected) - 100).toFixed(2) : l.corrected,
    }));
    const confirmed = (await api('payAdmin', 'post', `/payroll/arrears-worksheets/${w.id}/confirm-base`).send({ period: prevMonth, lines, reason: 'From the old payroll register' }).expect(200)).body;
    expect(confirmed).toMatchObject({ missing: 0, total: '-1100.00', employerCost: '100.00' });
    expect(w.lines.find((l: { componentCode: string }) => l.componentCode === 'pf_employee').kind).toBe('deduction');
    const ok = (await api('approver1', 'post', `/payroll/arrears-worksheets/${w.id}/approve`).send({}).expect(200)).body;
    expect(ok).toMatchObject({ overpaid: '1100.00' });
    // The employee sees and answers only their own plan.
    expect((await api('emp1', 'get', '/payroll/me/overpayments').expect(200)).body).toEqual([]);
    const mine = (await api('emp3', 'get', '/payroll/me/overpayments').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ id: ok.recoveryId, status: 'proposed', amount: '1100.00', balance: '1100.00' })]);
    await api('emp1', 'post', `/payroll/me/overpayments/${ok.recoveryId}/answer`).send({ agree: true }).expect(404);
    expect((await api('emp3', 'post', `/payroll/me/overpayments/${ok.recoveryId}/answer`).send({ agree: true }).expect(200)).body.status).toBe('active');
    await api('emp3', 'post', `/payroll/me/overpayments/${ok.recoveryId}/answer`).send({ agree: true }).expect(409);
    ids.recovery = ok.recoveryId;
  });

  it('write-off: someone other than who raised it, with step-up; cross-year recoveries are listed for tax', async () => {
    await api('payAdmin', 'post', `/payroll/overpayments/${ids.recovery}/write-off`).send({ reason: 'Not worth recovering' }).expect(403);
    await stepUp('approver1');
    expect((await api('approver1', 'post', `/payroll/overpayments/${ids.recovery}/write-off`).send({ reason: 'Not worth recovering' }).expect(200)).body).toMatchObject({
      status: 'written_off',
      balance: '0.00',
      writtenOff: '1100.00',
    });
    const own = (
      await api('approver1', 'post', '/payroll/overpayments').send({ employeeId: ids.emp1, amount: '3000', instalment: '1000', reason: 'Paid twice in March', taxYear: '2024-25' }).expect(201)
    ).body;
    await stepUp('approver1');
    expect((await api('approver1', 'post', `/payroll/overpayments/${own.id}/write-off`).send({ reason: 'Mine to forgive' }).expect(403)).body.message).toMatch(/Someone other/);
    const cross = (await api('approver2', 'get', '/payroll/overpayments?crossYear=true').expect(200)).body;
    expect(cross).toEqual([expect.objectContaining({ id: own.id, crossYear: true, originTaxYear: '2024-25' })]);
    await api('payAdminB', 'get', '/payroll/overpayments').expect(200).expect([]);
  });

  it('a rule-change proposal: dismissed only with a reason; accepted, it makes worksheets for someone else to approve', async () => {
    const make = (version: string) =>
      scoped((tx) =>
        tx.statutoryArrearsProposal.create({
          data: { organizationId: org.A.id, legalEntityId: ids.entity, statute: 'IN.PT', jurisdiction: 'IN-KA', ruleVersion: version, periods: [month], employees: [ids.emp1], employeeCount: 1 },
        }),
      );
    const p1 = await make(`T1-${run}`);
    const p2 = await make(`T2-${run}`);
    const list = (await api('approver1', 'get', '/statutory/arrears-proposals').expect(200)).body;
    expect(list.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([p1.id, p2.id]));
    await api('approver1', 'post', `/statutory/arrears-proposals/${p1.id}/dismiss`).send({ reason: 'no' }).expect(400);
    expect((await api('approver1', 'post', `/statutory/arrears-proposals/${p1.id}/dismiss`).send({ reason: 'Already settled by hand' }).expect(200)).body.status).toBe('dismissed');
    const acc = (await api('approver1', 'post', `/statutory/arrears-proposals/${p2.id}/accept`).expect(200)).body;
    expect(acc.worksheets).toHaveLength(1);
    expect((await api('payAdmin', 'get', `/payroll/arrears-worksheets/${acc.worksheets[0]}`).expect(200)).body).toMatchObject({ source: 'rule', sourceRef: p2.id, createdBy: users.approver1 });
    await api('approver1', 'post', `/statutory/arrears-proposals/${p2.id}/accept`).expect(409);
    await api('payAdminB', 'post', `/statutory/arrears-proposals/${p1.id}/accept`).expect(404);
  });

  it('F&F from the hand-off: deadline over a weekend and a holiday; retrenchment lines held without permission, paid in a second run', async () => {
    // PPL-22: the company switches on the starter F&F statement and names who signs for the entity.
    const tpl = (await api('adminA', 'post', '/letters/templates/starter').send({ letterType: 'fnf_statement' }).expect(201)).body.id;
    await api('adminA', 'get', `/letters/templates/${tpl}/preview`).expect(200);
    await api('adminA', 'post', `/letters/templates/${tpl}/activate`).expect(200);
    await stepUp('adminA');
    await api('adminA', 'post', '/letters/signatories').field('legalEntityId', ids.entity).field('userId', users.adminA).field('title', 'Director').expect(201);
    let friday = plus(today, 1);
    while (new Date(`${friday}T00:00:00Z`).getUTCDay() !== 5) friday = plus(friday, 1);
    await inA(async (tx) => {
      const cal = await tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: 'Company holidays' } });
      await tx.holiday.create({ data: { organizationId: org.A.id, calendarId: cal.id, holidayOn: new Date(`${plus(friday, 3)}T00:00:00Z`), name: 'Test holiday' } });
    });
    const id = await exitCase(ids.emp2, 'retrenchment', friday, { retrenchment: { selectionBasis: 'Last in, first out', noticeMode: 'pay_in_lieu', workers: 350 } });
    const f = (await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body;
    // Friday, then Saturday, Sunday, the Monday holiday: Tuesday and Wednesday are the two working days.
    expect(f).toMatchObject({ lwd: friday, deadline: plus(friday, 5), status: 'open', runStatus: 'draft', runReference: `FNF-${today.slice(0, 4)}-0001` });
    const notice = f.items.find((i: { componentCode: string }) => i.componentCode === 'notice_pay');
    expect(notice.held).toMatch(/permission/);
    expect(f.items.find((i: { componentCode: string }) => i.componentCode === 'reskilling_fund').held).toMatch(/permission/);
    await api('emp2', 'get', `/payroll/fnf/${id}`).expect(403);
    await api('payAdminB', 'get', `/payroll/fnf/${id}`).expect(404);
    // The leaver is paid in the F&F run, not the next regular run.
    const slips = await approveRun(f.runId);
    expect(slips.map((s) => s.employeeId)).toEqual([ids.emp2]);
    // The approval asks for the F&F statement letter; it is issued once into the person's letters with the net.
    const personOf = async (employeeId: string) => (await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: employeeId } }))).personId!;
    const person = await personOf(ids.emp2);
    expect(await inA((tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'payroll.fnf.run_approved', payload: { path: ['runId'], equals: f.runId } } }))).toBe(1);
    const statements = () => inA((tx) => tx.letterIssue.findMany({ where: { personId: person, letterType: 'fnf_statement' }, orderBy: { createdAt: 'asc' } }));
    // The outbox worker may get there first: asking again is harmless (once per run), so ask until it is issued.
    const statementFor = async (runId: string) => {
      for (let i = 0; i < 40; i++) {
        await fnf.issueStatement(org.A.id, id, runId).catch(() => undefined);
        if ((await statements()).some((l) => l.subjectId === runId && l.status === 'issued')) return;
        await new Promise((ok) => setTimeout(ok, 250));
      }
    };
    await statementFor(f.runId);
    await statementFor(f.runId);
    const crypto = app.get(OrgSecretsCryptoService);
    const dataOf = (enc: string) => JSON.parse(crypto.decrypt(enc)) as Record<string, string>;
    const inr = (v: string) => {
      const [i, d] = Number(v).toFixed(2).split('.');
      return `₹${i.length > 3 ? `${i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${i.slice(-3)}` : i}.${d}`;
    };
    const [first1] = await statements();
    expect(await statements()).toHaveLength(1);
    expect(first1).toMatchObject({ status: 'issued', subjectType: 'payroll_run', subjectId: f.runId, referenceNo: expect.stringMatching(/\/FNF\//) });
    expect(dataOf(first1.dataEnc)).toMatchObject({ fnf_run: `FNF-${today.slice(0, 4)}-0001`, fnf_net_label: 'Net payable to you', fnf_net: inr(slips[0].net) });
    // The leaver sees it among their letters; another employee cannot open it.
    expect(((await api('emp2', 'get', '/letters/me').expect(200)).body.letters as { id: string }[]).map((l) => l.id)).toContain(first1.id);
    await api('emp1', 'get', `/letters/${first1.id}/file`).expect(403);
    const lines = (await linesOf(slips[0].id)).body.lines as { code: string }[];
    expect(lines.some((l) => l.code === 'notice_pay')).toBe(false);
    // The permission came: the held lines are released and paid in the second run.
    const after = (await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body;
    expect(after.status).toBe('open');
    await api('payAdmin', 'post', `/payroll/fnf/${id}/second-run`).expect(409);
    const held = after.items.filter((i: { held: string | null }) => i.held).map((i: { id: string }) => ({ id: i.id, holdReason: null }));
    // Founder 26 Oct 2026: a wage line can't be put on hold by hand (due in 2 working days).
    await api('payAdmin', 'patch', `/payroll/fnf/${id}`).send({ version: after.version, reason: 'Dispute', items: [{ id: held[0].id, holdReason: 'Dispute' }] }).expect(400);
    await api('payAdmin', 'patch', `/payroll/fnf/${id}`).send({ version: after.version, reason: 'Government permission granted', items: held }).expect(200);
    const second = (await api('payAdmin', 'post', `/payroll/fnf/${id}/second-run`).expect(201)).body;
    expect(second.lines).toBe(held.length);
    // Gap-free per company and year: the second F&F run takes the next number; another company starts at 1.
    expect((await api('payAdmin', 'get', `/payroll/runs/${second.runId}`).expect(200)).body.reference).toBe(`FNF-${today.slice(0, 4)}-0002`);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => (fnf as unknown as { runReference: (t: unknown, o: string) => Promise<string> }).runReference(tx, org.B.id))).toBe(`FNF-${today.slice(0, 4)}-0001`);
    const s2 = await approveRun(second.runId);
    // The second run's statement supersedes the first and covers both runs.
    await statementFor(second.runId);
    const [old, fresh] = await statements();
    expect(old.status).toBe('superseded');
    expect(fresh).toMatchObject({ status: 'issued', supersedesId: old.id, subjectId: second.runId });
    expect(dataOf(fresh.dataEnc)).toMatchObject({ fnf_run: `FNF-${today.slice(0, 4)}-0001 and FNF-${today.slice(0, 4)}-0002`, fnf_net: inr(String(Number(slips[0].net) + Number(s2[0].net))) });
    expect((await linesOf(s2[0].id)).body.lines.find((l: { code: string }) => l.code === 'notice_pay')).toBeTruthy();
    expect((await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body.status).toBe('settled');
  });

  it('an unserved resignation notice is recovered by the company policy; HR waives it for one person with a reason', async () => {
    const lwd = plus(today, 10);
    // An approved expense claim queued for payroll and not paid yet (M05): the settlement pays it in its own run.
    const claimLine = await scoped(async (tx) => {
      const em = await tx.employment.findFirstOrThrow({ where: { employeeId: ids.emp1 } });
      await tx.payComponent.createMany({ data: MODULE_COMPONENTS.filter((m) => m.code === 'exp_reimb').map((s) => ({ organizationId: org.A.id, ...s, taxable: s.taxable ?? true, statutory: null, createdBy: null })), skipDuplicates: true });
      const claim = await tx.expenseClaim.create({ data: { organizationId: org.A.id, employeeId: ids.emp1, employmentId: em.id, legalEntityId: ids.entity, title: 'Travel to Mysuru', currency: 'INR', status: 'approved', paymentStatus: 'in_payroll', route: 'payroll' } });
      const otp = await tx.oneTimePay.create({
        data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp1, employmentId: em.id, componentCode: 'exp_reimb', amount: '3450.00', periodStart: new Date(`${first}T00:00:00Z`), source: 'm05', sourceRef: `${claim.id}:r`, reason: 'Expense claim: Travel to Mysuru', status: 'approved', createdBy: users.adminA },
      });
      await tx.expensePayment.create({ data: { organizationId: org.A.id, claimId: claim.id, legalEntityId: ids.entity, employeeId: ids.emp1, route: 'payroll', payMonth: new Date(`${first}T00:00:00Z`), oneTimePayIds: [otp.id], amount: '3450.00', status: 'queued' } });
      return otp.id;
    });
    const id = await exitCase(ids.emp1, 'resignation', lwd, { initiatedBy: 'employee', noticePeriod: '30d', standardLwd: new Date(`${plus(today, 30)}T00:00:00Z`) });
    const f = (await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body;
    const line = f.items.find((i: { componentCode: string }) => i.componentCode === 'notice_recovery');
    expect(line.label).toMatch(/^Notice not served: 20 days/);
    // PPL-22: each line is explained and tagged; the claim is pulled into the F&F run.
    expect(line).toMatchObject({ kind: 'deduction', title: 'Notice period recovery', how: moneyText(line.label), wage: false, auto: false, claim: false, byPayroll: false, held: null });
    const claim = f.items.find((i: { id: string }) => i.id === claimLine);
    expect(claim).toMatchObject({ kind: 'earning', amount: '3450.00', title: 'Pending reimbursement: Travel to Mysuru', auto: true, claim: true, wage: false, inRun: f.runId, byPayroll: false });
    // Before the run is calculated: only the settlement lines are counted; salary, TDS and net wait for the run.
    expect(f.salary).toBeNull();
    const paise = (xs: { amount: string }[]) => xs.reduce((t, x) => t + Math.round(Number(x.amount) * 100), 0);
    const rupee = (p: number) => (p / 100).toFixed(2);
    const earned = f.items.filter((i: { kind: string }) => i.kind === 'earning');
    const wages = f.items.filter((i: { wage: boolean }) => i.wage);
    expect(wages.every((i: { componentCode: string }) => ['leave_encashment', 'bonus', 'notice_pay'].includes(i.componentCode))).toBe(true);
    expect(f.totals).toEqual({ earnings: rupee(paise(earned)), wageLines: rupee(paise(wages)), recoveries: line.amount, tds: null, statutory: null, rounding: null, net: null, held: '0.00' });
    // Joined this month: gratuity needs 5 years; it falls due 30 days after the last day.
    expect(f.gratuity).toEqual({ eligible: false, years: 0, months: serviceYears(first, lwd).months, counted: 0, minYears: 5, dueBy: plus(lwd, 30) });
    // Working days to the deadline: weekdays after today up to it, less the company's holidays.
    const off = new Set((await inA((tx) => tx.holiday.findMany({ where: { organizationId: org.A.id } }))).map((h) => iso(h.holidayOn)));
    let left = 0;
    for (let d = today; d < f.deadline; ) {
      d = plus(d, 1);
      if (![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !off.has(d)) left++;
    }
    expect(f.workingDaysLeft).toBe(left);
    // Calculated: salary to the last day and the statutory lines come from the run's payslip, and the totals add up to it.
    await calculate(f.runId);
    const c = (await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body;
    const slip = ((await api('payAdmin', 'get', `/payroll/runs/${f.runId}/payslips`).expect(200)).body as { id: string; employeeId: string; net: string }[]).find((s) => s.employeeId === ids.emp1)!;
    const slipLines = (await linesOf(slip.id)).body.lines as { code: string; amount: string; kind: string; explanation: string }[];
    // The payslip's earnings that are not settlement lines: salary to the last day.
    const salaryEarn = slipLines.filter((l) => l.kind === 'earning' && !earned.some((i: { componentCode: string }) => i.componentCode === l.code));
    expect(c.salary.filter((l: { group: string }) => l.group === 'earning')).toEqual(salaryEarn.map((l) => expect.objectContaining({ code: l.code, amount: l.amount, how: moneyText(l.explanation) })));
    expect(Math.round(Number(c.totals.earnings) * 100)).toBe(paise(salaryEarn) + paise(earned));
    expect(c.totals.wageLines).toBe(rupee(paise(salaryEarn) + paise(wages)));
    expect(c.totals.recoveries).toBe(line.amount);
    expect(c.totals.tds).toBe(rupee(paise(slipLines.filter((l) => l.code === 'tds'))));
    // A deficit the payslip carries forward is what the leaver owes: the settlement shows it as a negative net.
    const carried = paise(slipLines.filter((l) => l.code === 'negative_net'));
    expect(Math.round(Number(c.totals.net) * 100)).toBe(Math.round(Number(slip.net) * 100) - carried);
    expect(Math.round(Number(c.totals.net) * 100)).toBe(Math.round(Number(c.totals.earnings) * 100) - Math.round(Number(c.totals.recoveries) * 100) - Math.round(Number(c.totals.tds) * 100) - Math.round(Number(c.totals.statutory) * 100) + Math.round(Number(c.totals.rounding) * 100));
    // Another company and the employee never see it.
    await api('emp1', 'get', '/payroll/fnf').expect(403);
    expect(((await api('payAdminB', 'get', '/payroll/fnf').expect(200)).body as { id: string }[]).some((x) => x.id === id)).toBe(false);
    // 5j-D2: its own key (HR Admin and Payroll Admin), not the approver's.
    await api('approver1', 'post', `/payroll/fnf/${id}/waive-notice`).send({ reason: 'Leaving to care for a parent' }).expect(403);
    await api('payAdmin', 'post', `/payroll/fnf/${id}/waive-notice`).send({ reason: 'ok' }).expect(400);
    const waived = (await api('payAdmin', 'post', `/payroll/fnf/${id}/waive-notice`).send({ reason: 'Leaving to care for a parent' }).expect(200)).body;
    expect(waived.noticeWaived).toMatchObject({ by: users.payAdmin, reason: 'Leaving to care for a parent' });
    expect(waived.items.some((i: { componentCode: string }) => i.componentCode === 'notice_recovery')).toBe(false);
    // The payslip still recovers the waived notice: it is no longer current until the run is calculated again.
    expect(waived.salary).toBeNull();
    expect(waived.totals).toMatchObject({ earnings: rupee(paise(earned)), recoveries: '0.00', net: null });
    await api('payAdmin', 'post', `/payroll/fnf/${id}/waive-notice`).send({ reason: 'Leaving to care for a parent' }).expect(409);
  });

  it('death in service: the bank file pays each payee by share; exit exemptions come off the taxed pay', async () => {
    const id = await exitCase(ids.emp3, 'death', today);
    const f = (await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body;
    const payees = (a: string, b: string) => [
      { kind: 'nominee', name: 'Lakshmi', relation: 'Spouse', sharePercent: a, accountNumber: '123456789012', ifsc: 'HDFC0001234' },
      { kind: 'nominee', name: 'Arjun', relation: 'Son', sharePercent: b, accountNumber: '998877665544', ifsc: 'SBIN0000456' },
    ];
    // Bank accounts of payees need a fresh second sign-in step.
    await api('payAdmin', 'post', `/payroll/fnf/${id}/payees`)
      .send({ version: f.version, reason: 'Nominees from Form F', payees: payees('60', '40') })
      .expect(403);
    await stepUp('payAdmin');
    expect(
      (
        await api('payAdmin', 'post', `/payroll/fnf/${id}/payees`)
          .send({ version: f.version, reason: 'Nominees from Form F', payees: payees('60', '30') })
          .expect(400)
      ).body.message,
    ).toMatch(/100%/);
    const withPayees = (
      await api('payAdmin', 'post', `/payroll/fnf/${id}/payees`)
        .send({ version: f.version, reason: 'Nominees from Form F', payees: payees('60', '40') })
        .expect(200)
    ).body;
    await api('payAdmin', 'patch', `/payroll/fnf/${id}`)
      .send({ version: f.version, reason: 'Gratuity on death', add: [{ componentCode: 'gratuity', amount: '50000', label: 'Gratuity on death (any length of service).' }] })
      .expect(409);
    await api('payAdmin', 'patch', `/payroll/fnf/${id}`)
      .send({ version: withPayees.version, reason: 'Gratuity on death', add: [{ componentCode: 'gratuity', amount: '50000', label: 'Gratuity on death (any length of service).' }] })
      .expect(200);
    expect(withPayees.payees[0]).toMatchObject({ name: 'Lakshmi', accountLast4: '9012' });
    const stored = await scoped((tx) => tx.fnfSettlement.findFirstOrThrow({ where: { id } }));
    expect(JSON.stringify(stored.payees)).not.toContain('123456789012');
    const slips = await approveRun(f.runId);
    expect(slips[0].held).toBe(false);
    const exempt = (await linesOf(slips[0].id)).body.lines.find((l: { code: string }) => l.code === 'gratuity_exempt');
    expect(exempt).toMatchObject({ amount: '50000.00', explanation: expect.stringMatching(/exempt from income tax/) });
    const done = (await api('payAdmin', 'get', `/payroll/fnf/${id}`).expect(200)).body;
    expect(Number(done.net)).toBeGreaterThan(0);
    expect(done.taxNote).toMatch(/verify/);
    expect(done.payees.map((p: { amount: string }) => p.amount)).toEqual([(Number(done.net) * 0.6).toFixed(2), (Number(done.net) * 0.4).toFixed(2)]);
    const bank = (await api('payAdmin', 'post', `/payroll/runs/${f.runId}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(201)).body;
    expect(bank).toMatchObject({ rows: 2, total: done.net, excluded: [] });
  });
});
