import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ExpensePaymentsService } from '../src/expenses/payments.service';
import { hashValue, sealValue } from '../src/people/profile.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Expenses batch E3 end to end against the real database (forced RLS, the app role): an approved claim handed to the next
// payroll as one-time pay (exempt and taxable parts), paid when the run is paid (the same event twice changes nothing), a
// failed salary payment and the hourly check that marks it paid once payroll pays it again; a claim paid by a bank file
// that someone else releases with step-up and the phrase, the bank's results (a paid taxable part reported to payroll, a
// failure moved to the next payroll); the month's journal blocked until every code is mapped; who may do what; two
// companies apart.
process.env.EXPENSE_OCR_ADAPTER = 'dev-fake';
process.env.SD_SCANNER = 'dev-fake';
process.env.TRAVEL_BOOKING_ADAPTER = 'dev-fake';

describe('Expenses batch E3', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let crypto: OrgSecretsCryptoService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'mgr' | 'ravi' | 'sita' | 'fin' | 'fin2' | 'books';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const paid = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const setting = (key: string, value: string) => inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } }));
  type Claim = { id: string; status: string; paymentStatus: string; payment: { route: string; month: string | null; paidOn: string | null } | null; netPayable: string | null; version: number; lines: { id: string }[] };
  type ToPay = { claims: { id: string; paymentStatus: string; route: string | null; payMonth: string | null; reason: string | null }[]; batches: { id: string; status: string }[] };

  /** A claim of mileage (₹714, exempt) and phone (₹400, taxable for this company), submitted and approved by the manager. */
  const approvedClaim = async (who: 'ravi' | 'sita', title: string) => {
    let c = (await api(who, 'post', '/expenses/claims').send({ title }).expect(201)).body as Claim;
    c = (await api(who, 'post', `/expenses/claims/${c.id}/lines`).send({ payMode: 'personal', spentOn: shift(today, -3), categoryCode: 'mileage', mileage: { vehicle: 'car', km: 42, from: 'Office', to: 'Client' } }).expect(201)).body;
    c = (await api(who, 'post', `/expenses/claims/${c.id}/lines`).send({ payMode: 'personal', spentOn: shift(today, -3), categoryCode: 'phone_internet', merchant: 'Airtel', amount: '400.00', selfDeclared: true }).expect(201)).body;
    c = (await api(who, 'post', `/expenses/claims/${c.id}/submit`).send({ version: c.version }).expect(200)).body;
    await api('mgr', 'post', `/expenses/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    return (await api(who, 'get', `/expenses/claims/${c.id}`).expect(200)).body as Claim;
  };
  /** A paid (or failed) run with the claim's one-time pay rows on the person's payslip, as payroll would leave it. */
  const runWith = async (employeeId: string, employmentId: string, oneTimeIds: string[], paymentStatus: 'paid' | 'failed') =>
    paid(async (tx) => {
      const x = { organizationId: org.A.id, legalEntityId: ids.entity };
      const month = `${today.slice(0, 7)}-01`;
      const r = await tx.payrollRun.create({ data: { ...x, payGroupId: ids.group, periodStart: new Date(`${month}T00:00:00Z`), periodEnd: new Date(`${month}T00:00:00Z`), runType: 'offcycle', offcycleKind: 'payment', status: 'paid', preparedBy: users.adminA } });
      const otp = await tx.oneTimePay.findMany({ where: { id: { in: oneTimeIds } } });
      const net = otp.reduce((t, o) => t + Number(o.amount), 0).toFixed(2);
      const s = await tx.payslip.create({ data: { ...x, runId: r.id, runType: 'offcycle', employmentId, employeeId, periodStart: new Date(`${month}T00:00:00Z`), calcVersion: 1, gross: '0', deductions: '0', net, employerCost: '0', ruleVersions: {}, snapshotHash: 'a'.repeat(64), resultHash: 'b'.repeat(64), status: 'approved', paymentStatus } });
      await tx.payslipLine.createMany({ data: otp.map((o, i) => ({ ...x, employeeId, payslipId: s.id, position: i, componentCode: o.componentCode, name: o.componentCode, kind: o.componentCode === 'exp_reimb' ? 'reimbursement' : 'earning', segmentNo: 0, amount: o.amount, explanation: 'One-time pay', sourceRef: o.id })) });
      return { runId: r.id, payslipId: s.id };
    });

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
    crypto = moduleRef.get(OrgSecretsCryptoService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `exp3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Exp3 Org ${k}`, slug: `exp3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['mgr', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['fin', 'A', 'panel', ['expense.payout.manage']],
      ['fin2', 'A', 'panel', ['expense.payout.manage']],
      ['books', 'A', 'panel', ['payroll.ledger.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@exp3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@exp3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Hill Teas Pvt Ltd', shortName: `HT${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Kochi', code: 'KOC', address: {}, country: 'IN', state: 'IN-KL', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.group = (await tx.payGroup.create({ data: { ...x, legalEntityId: ids.entity, name: 'Monthly' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@exp3-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'HT-001', null);
    emp.mgr = await hire('mgr', 'Divya', 'HT-002', emp.head);
    emp.ravi = await hire('ravi', 'Ravi', 'HT-003', emp.mgr);
    emp.sita = await hire('sita', 'Sita', 'HT-004', emp.mgr);
    emp.fin = await hire('fin', 'Meena', 'HT-005', emp.head);
    emp.fin2 = await hire('fin2', 'Neha', 'HT-006', emp.head);
    await api('adminA', 'post', '/expenses/setup/from-starter').expect(201);
    await inA(async (tx) => {
      // This company treats phone bills as taxable (a perquisite), so claims have a taxable part.
      await tx.expenseCategory.updateMany({ where: { organizationId: org.A.id, code: 'phone_internet' }, data: { taxable: 'always' } });
      for (const [e, n] of [[emp.ravi, '501234567890'], [emp.sita, '509876543210']] as const)
        await tx.employeeBankAccount.create({ data: { organizationId: org.A.id, employeeId: e, purpose: 'salary', holderName: 'Account Holder', ifsc: 'HDFC0001234', accountEnc: sealValue(crypto, org.A.id, e, n), accountHash: hashValue(crypto, org.A.id, 'bank', `HDFC0001234:${n}`), accountLast4: n.slice(-4), validFrom: new Date('2026-04-01'), usableFrom: new Date('2026-04-01') } });
    });
    await setting('expense.payroll_cutoff_day', '28');
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('approval hands the claim to the next payroll: the exempt part as exp_reimb, the taxable part as exp_taxable (XP-3.03)', async () => {
    const c = await approvedClaim('ravi', 'Client visit');
    expect(c).toMatchObject({ status: 'approved', paymentStatus: 'in_payroll', payment: { route: 'payroll' }, netPayable: '1114.00' });
    ids.claim1 = c.id;
    const month = Number(today.slice(8)) <= 28 ? today.slice(0, 7) : shift(`${today.slice(0, 7)}-01`, 32).slice(0, 7);
    const rows = await paid((tx) => tx.oneTimePay.findMany({ where: { source: 'm05', sourceRef: { startsWith: c.id } }, orderBy: { componentCode: 'asc' } }));
    expect(rows.map((r) => [r.componentCode, r.amount.toFixed(2), r.status, r.periodStart.toISOString().slice(0, 7)])).toEqual([
      ['exp_reimb', '714.00', 'approved', month],
      ['exp_taxable', '400.00', 'approved', month],
    ]);
    ids.otp1 = rows.map((r) => r.id).join(',');
    const list = (await api('fin', 'get', '/expenses/to-pay').expect(200)).body as ToPay;
    expect(list.claims.find((x) => x.id === c.id)).toMatchObject({ paymentStatus: 'in_payroll', payMonth: month });
  });

  it('paid when the payroll run is paid; the same event again changes nothing (XP-3.04)', async () => {
    const svc = app.get(ExpensePaymentsService);
    const employment = (await paid((tx) => tx.oneTimePay.findFirstOrThrow({ where: { id: ids.otp1.split(',')[0] } }))).employmentId;
    const r = await runWith(emp.ravi, employment, ids.otp1.split(','), 'paid');
    const ev = { id: randomUUID(), organizationId: org.A.id, type: 'payroll.run.paid', payload: { runId: r.runId, paidOn: today, offcycle: true } };
    await svc.onEvent(ev);
    const c = (await api('ravi', 'get', `/expenses/claims/${ids.claim1}`).expect(200)).body as Claim;
    expect(c.paymentStatus).toBe('paid');
    await svc.onEvent(ev);
    await svc.onEvent({ ...ev, id: randomUUID() });
    expect(await inA((tx) => tx.eventOutbox.count({ where: { eventType: 'expense.claim.paid' } }))).toBe(1);
    expect(await inA((tx) => tx.expenseEventReceipt.count())).toBe(2);
    // YX-EXP-12: a paid claim's lines never change.
    await expect(inA((tx) => tx.expenseLine.updateMany({ where: { claimId: ids.claim1 }, data: { claimed: 1 } }))).rejects.toThrow();
  });

  it('a failed salary payment marks the claim failed; payroll pays it again and the hourly check marks it paid', async () => {
    const svc = app.get(ExpensePaymentsService);
    const c = await approvedClaim('sita', 'Field day');
    const otp = await paid((tx) => tx.oneTimePay.findMany({ where: { source: 'm05', sourceRef: { startsWith: c.id } } }));
    const r = await runWith(emp.sita, otp[0].employmentId, otp.map((o) => o.id), 'failed');
    await svc.onEvent({ id: randomUUID(), organizationId: org.A.id, type: 'payment.failed', payload: { payslipId: r.payslipId, runId: r.runId, kind: 'payslip', employeeId: emp.sita, status: 'failed' } });
    expect(((await api('sita', 'get', `/expenses/claims/${c.id}`).expect(200)).body as Claim).paymentStatus).toBe('payment_failed');
    // Payroll pays the salary again; finance does not move it (that would pay twice).
    expect((await api('fin', 'post', '/expenses/to-pay/payroll').send({ claimIds: [c.id] }).expect(200)).body.refused[0].reason).toMatch(/Payroll pays a failed salary payment again/);
    await paid((tx) => tx.payslip.update({ where: { id: r.payslipId }, data: { paymentStatus: 'paid' } }));
    expect(await svc.reconcile(org.A.id)).toBe(1);
    expect(((await api('sita', 'get', `/expenses/claims/${c.id}`).expect(200)).body as Claim).paymentStatus).toBe('paid');
  });

  it('a bank file: never released by its maker; step-up and the phrase; results mark paid (taxable part reported to payroll) or failed (XP-3.05, 3.06)', async () => {
    await setting('expense.route.default', 'payout');
    const a = await approvedClaim('ravi', 'Conference');
    const b = await approvedClaim('sita', 'Dealer meet');
    expect([a.paymentStatus, a.payment?.route]).toEqual(['approved_unpaid', 'payout']);
    // The employee cannot see or pay; finance pays.
    await api('ravi', 'get', '/expenses/to-pay').expect(403);
    const made = (await api('fin', 'post', '/expenses/payouts').send({ claimIds: [a.id, b.id], debitAccount: '00123456789' }).expect(201)).body;
    expect(made).toMatchObject({ rows: 2, total: '2228.00', phrase: 'RELEASE 2', excluded: [] });
    expect(((await api('ravi', 'get', `/expenses/claims/${a.id}`).expect(200)).body as Claim).paymentStatus).toBe('payout_queued');
    const file = await api('fin', 'get', `/expenses/payouts/${made.id}/file`).buffer(true).expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="expenses-/);
    await markSteppedUp(tenantPrisma, token.fin);
    expect((await api('fin', 'post', `/expenses/payouts/${made.id}/release`).send({ phrase: 'RELEASE 2' }).expect(403)).body.message).toMatch(/someone else must release/);
    expect((await api('fin2', 'post', `/expenses/payouts/${made.id}/release`).send({ phrase: 'RELEASE 2' }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
    await markSteppedUp(tenantPrisma, token.fin2);
    await api('fin2', 'post', `/expenses/payouts/${made.id}/release`).send({ phrase: 'RELEASE' }).expect(400);
    expect((await api('fin2', 'post', `/expenses/payouts/${made.id}/release`).send({ phrase: 'RELEASE 2' }).expect(200)).body).toEqual({ id: made.id, status: 'released' });
    await api('fin', 'post', `/expenses/payouts/${made.id}/results`).send({ rows: [{ claimId: b.id, status: 'failed' }] }).expect(400);
    expect(
      (
        await api('fin', 'post', `/expenses/payouts/${made.id}/results`)
          .send({ rows: [{ claimId: a.id, status: 'paid', ref: 'UTR-77' }, { claimId: b.id, status: 'returned', reason: 'Account closed' }] })
          .expect(200)
      ).body,
    ).toEqual({ recorded: 2, batchStatus: 'confirmed' });
    expect(((await api('ravi', 'get', `/expenses/claims/${a.id}`).expect(200)).body as Claim).paymentStatus).toBe('paid');
    // The taxable ₹400 paid by transfer is taxable salary for this year's TDS (M03 change 3).
    expect((await paid((tx) => tx.taxPaidOutside.findMany({ where: { employeeId: emp.ravi } }))).map((x) => x.amount.toFixed(2))).toEqual(['400.00']);
    // The returned one goes to the next payroll instead.
    const list = (await api('fin', 'get', '/expenses/to-pay').expect(200)).body as ToPay;
    expect(list.claims.find((x) => x.id === b.id)).toMatchObject({ paymentStatus: 'payment_failed', reason: 'Account closed' });
    expect((await api('fin', 'post', '/expenses/to-pay/payroll').send({ claimIds: [b.id] }).expect(200)).body).toEqual({ moved: 1, refused: [] });
    expect(((await api('sita', 'get', `/expenses/claims/${b.id}`).expect(200)).body as Claim).paymentStatus).toBe('in_payroll');
  });

  it('a bank file not released can be cancelled; its claims wait again', async () => {
    const c = await approvedClaim('ravi', 'Training');
    const made = (await api('fin', 'post', '/expenses/payouts').send({ claimIds: [c.id], debitAccount: '00123456789' }).expect(201)).body;
    await api('fin', 'post', `/expenses/payouts/${made.id}/cancel`).send({ reason: 'Wrong debit account' }).expect(200);
    expect(((await api('ravi', 'get', `/expenses/claims/${c.id}`).expect(200)).body as Claim).paymentStatus).toBe('approved_unpaid');
    await api('fin', 'post', `/expenses/payouts/${made.id}/results`).send({ rows: [{ claimId: c.id, status: 'paid' }] }).expect(409);
  });

  it('the journal: unmapped codes block the export; mapped, it balances and is exported once and marked posted (XP-3.07)', async () => {
    const month = today.slice(0, 7);
    const j = (await api('fin', 'get', `/expenses/journal?entityId=${ids.entity}&month=${month}`).expect(200)).body;
    expect(j.balanced).toBe(true);
    const codes = (j.unmapped as { componentCode: string }[]).map((u) => u.componentCode).sort();
    expect(codes).toEqual(expect.arrayContaining(['exp._bank', 'exp._payable', 'exp.mileage', 'exp.phone_internet']));
    expect((await api('fin', 'post', '/expenses/journal/export').send({ entityId: ids.entity, month }).expect(409)).body.unmapped.length).toBe(codes.length);
    await api('books', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: 'exp.nope', side: 'expense', accountCode: '9999', accountName: 'Nothing' }).expect(400);
    for (const [i, code] of codes.entries()) await api('books', 'put', '/payroll/ledger-mappings').send({ scopeType: 'company', componentCode: code, side: 'expense', accountCode: `6${100 + i}`, accountName: code }).expect(200);
    const out = (await api('fin', 'post', '/expenses/journal/export').send({ entityId: ids.entity, month }).expect(200)).body;
    expect(out.csv.split('\n')[0]).toBe('Period,Account code,Account name,Debit,Credit');
    await api('fin', 'post', `/expenses/journal/${out.id}/posted`).expect(200);
    expect((await api('fin', 'get', `/expenses/journal?entityId=${ids.entity}&month=${month}`).expect(200)).body.exports[0]).toMatchObject({ id: out.id, status: 'posted' });
  });

  it('finance never pays its own claim; another company sees nothing', async () => {
    let c = (await api('fin', 'post', '/expenses/claims').send({ title: 'My cab' }).expect(201)).body as Claim;
    c = (await api('fin', 'post', `/expenses/claims/${c.id}/lines`).send({ payMode: 'personal', spentOn: shift(today, -2), categoryCode: 'mileage', mileage: { vehicle: 'car', km: 10, from: 'A', to: 'B' } }).expect(201)).body;
    c = (await api('fin', 'post', `/expenses/claims/${c.id}/submit`).send({ version: c.version }).expect(200)).body;
    await api('head', 'post', `/expenses/claims/${c.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await api('fin', 'get', '/expenses/to-pay').expect(200)).body.claims.some((x: { id: string }) => x.id === c.id)).toBe(false);
    await api('fin', 'post', '/expenses/payouts').send({ claimIds: [c.id], debitAccount: '00123456789' }).expect(403);
    const batch = ((await api('fin', 'get', '/expenses/to-pay').expect(200)).body as ToPay).batches[0];
    await api('adminB', 'get', `/expenses/payouts/${batch.id}/file`).expect(403);
    await api('adminB', 'post', '/expenses/payouts').send({ claimIds: [ids.claim1], debitAccount: '00123456789' }).expect(403);
  });
});
