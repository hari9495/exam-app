import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// PAY-25 payroll reports end to end against the real database. Known payslips, loans, holds and arrears in two legal
// entities of one company (and a second company), then every report: exact totals, the filters, paging, CSV export
// (audited), and the scope: no key 403, another entity or company 404 or nothing.
describe('Payroll reports (PAY-25)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'payAdmin' | 'finance' | 'tnOnly' | 'noKey' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, path: string) => request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const payScoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.ka},${ids.tn}}`}, true)`;
      return fn(tx);
    });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  // Last tax year (past-dated hires may reach it): July (P) and August (M).
  const Y = tm >= 4 ? ty - 1 : ty - 2;
  const P = `${Y}-07`;
  const M = `${Y}-08`;
  const D = (x: string) => new Prisma.Decimal(x);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const KA = () => `legalEntityId=${ids.ka}`;

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
    planId = (await prisma.plan.create({ data: { name: `payrep-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayRep Org ${k}`, slug: `payrep-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
      ['finance', 'A', 'panel', template('finance_approver')],
      ['tnOnly', 'A', 'panel', null],
      // HR without payroll scope.
      ['noKey', 'A', 'panel', template('hr_admin').filter((k) => k !== 'payroll.reports.view')],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who.toLowerCase()}@payrep-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.ka = (await tx.legalEntity.create({ data: { ...o, name: 'Report Foods', shortName: `RPF-${run}`, isDefault: true } })).id;
      ids.tn = (await tx.legalEntity.create({ data: { ...o, name: 'Report Foods TN', shortName: `RTN-${run}` } })).id;
      const loc = (entity: string, name: string, code: string, state: string) => tx.location.create({ data: { ...o, legalEntityId: entity, name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata', minWageZone: '1' } });
      ids.blr = (await loc(ids.ka, 'Bengaluru', 'BLR', 'IN-KA')).id;
      ids.mys = (await loc(ids.ka, 'Mysuru', 'MYS', 'IN-KA')).id;
      ids.che = (await loc(ids.tn, 'Chennai', 'CHE', 'IN-TN')).id;
      for (const [k, name, code] of [['ops', 'Operations', 'OPS'], ['fin', 'Finance', 'FIN']] as const) {
        const id = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...o, id, name, code, path: `/${id}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      // Payroll reports for the TN entity only: a role grant on that legal entity.
      const role = await tx.permissionProfile.create({ data: { ...o, name: `tn-reports-${run}`, permissionsJson: JSON.stringify(['payroll.reports.view']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.tnOnly, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.tn, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Payroll for TN', grantedBy: users.adminA } });
    });
    for (const [who, k] of Object.entries({ adminA: 'A', payAdmin: 'A', finance: 'A', tnOnly: 'A', noKey: 'A', payAdminB: 'B' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who.toLowerCase()}@payrep-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key: 'employee_change.retro_limit', scopeType: 'tenant', value: 'previous_fy' }).expect(200);
    const hire = async (key: string, entity: string, location: string, dept: string, code: string, joinedOn: string) => {
      const id = (
        await request(server())
          .post('/api/v1/people/employees')
          .set('Authorization', `Bearer ${token.adminA}`)
          .send({ legalEntityId: entity, status: 'confirmed', reason: 'Joined', givenName: key[0].toUpperCase() + key.slice(1), familyName: run, employeeCode: code, joinedOn, assignment: { locationId: location, departmentId: dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
      ids[key] = id;
      ids[`em_${key}`] = (await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: id } }))).id;
    };
    await hire('asha', ids.ka, ids.blr, ids.ops, 'RP-001', `${Y}-04-01`);
    await hire('bala', ids.ka, ids.blr, ids.ops, 'RP-002', `${Y}-04-01`);
    await hire('chitra', ids.ka, ids.mys, ids.fin, 'RP-003', `${Y}-04-01`);
    await hire('dev', ids.ka, ids.blr, ids.ops, 'RP-004', `${M}-01`); // joins in August
    await hire('farid', ids.ka, ids.blr, ids.fin, 'RP-005', `${Y}-04-01`); // paid in July only
    await hire('esha', ids.tn, ids.che, ids.ops, 'RP-006', `${Y}-04-01`);
    // Asha's service counts from 2019 (gratuity is payable after the rule's minimum years).
    await inA((tx) => tx.employment.update({ where: { id: ids.em_asha }, data: { continuousServiceFrom: new Date('2019-01-01T00:00:00Z'), continuousServiceReason: 'Transferred from a group company' } }));

    await payScoped(async (tx) => {
      const o = { organizationId: org.A.id };
      const slip = async (key: string, entity: string, m: string, gross: string, ded: string, employer: string, extra: { runType?: string; held?: boolean; lines?: [string, string, string][] } = {}) => {
        const net = D(gross).sub(D(ded)).toFixed(2);
        const s = await tx.payslip.create({
          data: { ...o, legalEntityId: entity, employmentId: ids[`em_${key}`], employeeId: ids[key], periodStart: new Date(`${m}-01T00:00:00Z`), runType: extra.runType ?? 'regular', calcVersion: 1, status: 'approved', gross: D(gross), deductions: D(ded), net: D(net), employerCost: D(employer), held: extra.held ?? false, ruleVersions: {}, snapshotHash: 'b'.repeat(64), resultHash: 'c'.repeat(64) },
        });
        let pos = 0;
        for (const [code, kind, amount] of extra.lines ?? [['basic', 'earning', gross]]) await tx.payslipLine.create({ data: { ...o, legalEntityId: entity, employeeId: ids[key], payslipId: s.id, position: ++pos, componentCode: code, name: code, kind, amount: D(amount), explanation: code } });
        return s.id;
      };
      const ashaLines: [string, string, string][] = [
        ['basic', 'earning', '15000'],
        ['hra', 'earning', '6000'],
        ['special', 'earning', '9000'],
        ['pf_employee', 'deduction', '1800'],
        ['tds', 'deduction', '1200'],
        ['pf_employer', 'employer', '1800'],
        ['gratuity_provision', 'employer', '721.15'],
      ];
      // July (P): Asha 30,000, Bala 20,000, Chitra 43,000, Farid 12,000 (KA); nobody in TN.
      ids.ashaP = await slip('asha', ids.ka, P, '30000', '3000', '32521.15', { lines: ashaLines });
      await slip('bala', ids.ka, P, '20000', '1000', '20000');
      await slip('chitra', ids.ka, P, '43000', '3000', '43000');
      await slip('farid', ids.ka, P, '12000', '0', '12000');
      // August (M): Asha 30,000 (+ a 5,000 off-cycle payslip), Bala 16,000 (unpaid leave, net −21%), Chitra 45,000 (+5%),
      // Dev 10,000 (joiner); Esha 50,000 in TN. Bala is held; Chitra is paid in cash.
      ids.ashaM = await slip('asha', ids.ka, M, '30000', '3000', '32521.15', { lines: ashaLines });
      await slip('asha', ids.ka, M, '5000', '0', '5000', { runType: 'offcycle', lines: [['bonus', 'earning', '5000']] });
      await slip('bala', ids.ka, M, '16000', '1000', '16000', { held: true });
      await slip('chitra', ids.ka, M, '45000', '3000', '45000');
      await slip('dev', ids.ka, M, '10000', '0', '10000');
      await slip('esha', ids.tn, M, '50000', '5000', '50000');
      await tx.employeeBankAccount.create({ data: { ...o, employeeId: ids.asha, purpose: 'salary', holderName: 'Asha', accountEnc: 'enc', accountHash: 'd'.repeat(64), accountLast4: '1234', ifsc: 'HDFC0001234', usableFrom: daysAgo(400) } });
      await tx.employeePaymentMode.create({ data: { ...o, legalEntityId: ids.ka, employeeId: ids.chitra, employmentId: ids.em_chitra, mode: 'cash', validFrom: new Date(`${Y}-04-01T00:00:00Z`), reason: 'No bank account', status: 'approved', requestedBy: users.payAdmin } });
      // Holds today: Bala 45 days (₹15,000), Dev 5 days (₹2,500), Esha 70 days in TN (₹5,000).
      for (const [key, entity, reason, amount, age] of [['bala', ids.ka, 'investigation', '15000', 45], ['dev', ids.ka, 'bank_missing', '2500', 5], ['esha', ids.tn, 'other', '5000', 70]] as const)
        await tx.payrollWithhold.create({ data: { ...o, legalEntityId: entity, employeeId: ids[key], employmentId: ids[`em_${key}`], reasonCode: reason, note: 'Held', amount: D(amount), createdBy: users.payAdmin, createdAt: daysAgo(age) } });
      // A loan of 12,000 at 2,000 a month: recovered in July and August, 6,000 left today.
      const loan = await tx.loan.create({ data: { ...o, legalEntityId: ids.ka, employeeId: ids.asha, employmentId: ids.em_asha, loanType: 'loan', principal: D('12000'), emi: D('2000'), firstMonth: new Date(`${Y}-06-01T00:00:00Z`), outstanding: D('6000'), reason: 'Medical', status: 'active', requestedBy: users.payAdmin } });
      for (const s of [ids.ashaP, ids.ashaM]) await tx.loanRepayment.create({ data: { ...o, legalEntityId: ids.ka, employeeId: ids.asha, loanId: loan.id, payslipId: s, amount: D('2000') } });
      // Chitra's July arrears, paid in August.
      await tx.arrearsWorksheet.create({ data: { ...o, legalEntityId: ids.ka, employeeId: ids.chitra, employmentId: ids.em_chitra, source: 'manual', fromMonth: new Date(`${P}-01T00:00:00Z`), toMonth: new Date(`${P}-01T00:00:00Z`), status: 'approved', total: D('3500'), employerCost: D('420'), payMonth: new Date(`${M}-01T00:00:00Z`), reason: 'Revision from July approved late', createdBy: users.payAdmin, approvedBy: users.finance, approvedAt: new Date() } });
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('options: the entities in scope, departments, locations and the months with approved payslips', async () => {
    const r = (await api('payAdmin', '/payroll/reports').expect(200)).body;
    expect(r.entities.map((e: { id: string }) => e.id)).toEqual([ids.ka, ids.tn]);
    expect(r.departments.map((d: { name: string }) => d.name)).toEqual(['Finance', 'Operations']);
    expect(r.locations.map((l: { name: string }) => l.name)).toEqual(['Bengaluru', 'Chennai', 'Mysuru']);
    expect(r.months).toEqual([M, P]);
    const tn = (await api('tnOnly', '/payroll/reports').expect(200)).body;
    expect(tn.entities.map((e: { id: string }) => e.id)).toEqual([ids.tn]);
    expect(tn.locations.map((l: { name: string }) => l.name)).toEqual(['Chennai']);
    expect(tn.months).toEqual([M]);
  });

  it('salary register: one row per payslip, a column per component, exact totals; department, location, paging', async () => {
    const r = (await api('payAdmin', `/payroll/reports/register?${KA()}&from=${M}&to=${M}`).expect(200)).body;
    expect(r.total).toBe(5);
    expect(r.totals).toMatchObject({ gross: '106000.00', deductions: '7000.00', net: '99000.00' });
    expect(r.components.map((c: { code: string }) => c.code)).toEqual(['basic', 'bonus', 'hra', 'special', 'pf_employee', 'tds', 'pf_employer', 'gratuity_provision']);
    expect(r.totals.lines).toMatchObject({ basic: '86000.00', hra: '6000.00', bonus: '5000.00', tds: '1200.00', gratuity_provision: '721.15' });
    const asha = r.rows.find((x: { employeeId: string; runType: string }) => x.employeeId === ids.asha && x.runType === 'regular');
    expect(asha).toMatchObject({ code: 'RP-001', department: 'Operations', month: M, gross: '30000.00', net: '27000.00', employerCost: '32521.15', lines: { basic: '15000.00', pf_employee: '1800.00', tds: '1200.00' } });
    // Operations (Asha twice, Bala, Dev); Mysuru (Chitra).
    const ops = (await api('payAdmin', `/payroll/reports/register?${KA()}&from=${M}&to=${M}&departmentId=${ids.ops}`).expect(200)).body;
    expect([ops.total, ops.totals.gross]).toEqual([4, '61000.00']);
    const mys = (await api('payAdmin', `/payroll/reports/register?${KA()}&from=${M}&to=${M}&locationId=${ids.mys}`).expect(200)).body;
    expect(mys.rows.map((x: { code: string }) => x.code)).toEqual(['RP-003']);
    // Two months, page 2 of 2-row pages: the totals still cover every row.
    const p2 = (await api('payAdmin', `/payroll/reports/register?${KA()}&from=${P}&to=${M}&page=2&pageSize=2`).expect(200)).body;
    expect([p2.total, p2.page, p2.pageSize, p2.rows.length, p2.totals.gross]).toEqual([9, 2, 2, 2, '211000.00']);
    // No entity chosen: every entity in scope (Esha in TN too).
    expect((await api('payAdmin', `/payroll/reports/register?from=${M}&to=${M}`).expect(200)).body.totals.gross).toBe('156000.00');
  });

  it('reconciliation: August against July with the gross bridge, and the trend (finance approver)', async () => {
    const r = (await api('finance', `/payroll/reports/recon?${KA()}&to=${M}`).expect(200)).body;
    expect([r.month, r.previous]).toEqual([M, P]);
    const row = (k: string) => r.rows.find((x: { item: string }) => x.item === k);
    expect(row('employees')).toMatchObject({ previous: '4', current: '4', difference: '0' });
    expect(row('gross')).toMatchObject({ previous: '105000.00', current: '101000.00', difference: '-4000.00' });
    expect(row('net')).toMatchObject({ previous: '98000.00', current: '94000.00', difference: '-4000.00' });
    expect(row('deductions')).toMatchObject({ previous: '7000.00', current: '7000.00' });
    // 105,000 + 10,000 joiner − 12,000 leaver − 2,000 changes = 101,000.
    expect(r.bridge).toEqual({ joiners: { count: 1, gross: '10000.00' }, leavers: { count: 1, gross: '-12000.00' }, changed: { count: 2, gross: '-2000.00' } });
    expect(r.trend).toEqual([
      { month: P, gross: '105000.00', net: '98000.00' },
      { month: M, gross: '101000.00', net: '94000.00' },
    ]);
  });

  it('variance: net changes above the company threshold against the last paid month', async () => {
    const r = (await api('payAdmin', `/payroll/reports/variance?${KA()}&to=${M}`).expect(200)).body;
    expect(r.threshold).toBe('10');
    // Bala −21.1%; Asha 0%; Chitra +5%; Dev has no earlier month.
    expect(r.buckets).toEqual({ below: 1, down: 0, up: 2, above: 0 });
    expect(r.total).toBe(1);
    expect(r.rows[0]).toMatchObject({ employeeId: ids.bala, previous: '19000.00', current: '15000.00', difference: '-4000.00', change: '-21.1', cause: null });
    // At 25% nobody is flagged.
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key: 'payroll.variance_threshold_pct', scopeType: 'legal_entity', scopeId: ids.ka, value: '25' }).expect(200);
    const at25 = (await api('payAdmin', `/payroll/reports/variance?${KA()}&to=${M}`).expect(200)).body;
    expect([at25.threshold, at25.total, at25.buckets.down]).toEqual(['25', 0, 1]);
    await request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).send({ key: 'payroll.variance_threshold_pct', scopeType: 'legal_entity', scopeId: ids.ka, value: '10' }).expect(200);
  });

  it('CTC by department: gross, employer contributions and cost to company', async () => {
    const r = (await api('payAdmin', `/payroll/reports/ctc?${KA()}&from=${M}&to=${M}`).expect(200)).body;
    expect(r.rows).toEqual([
      { id: ids.fin, department: 'Finance', people: 1, gross: '45000.00', employer: '0.00', ctc: '45000.00' },
      { id: ids.ops, department: 'Operations', people: 3, gross: '61000.00', employer: '2521.15', ctc: '63521.15' },
    ]);
    expect(r.totals).toEqual({ gross: '106000.00', employer: '2521.15', ctc: '108521.15' });
  });

  it('arrears: approved worksheets paid in the months', async () => {
    const r = (await api('payAdmin', `/payroll/reports/arrears?${KA()}&from=${M}&to=${M}`).expect(200)).body;
    expect(r.total).toBe(1);
    expect(r.rows[0]).toMatchObject({ employeeId: ids.chitra, fromMonth: P, toMonth: P, payMonth: M, amount: '3500.00', employerCost: '420.00', reason: 'Revision from July approved late' });
    expect(r.totals).toEqual({ amount: '3500.00', employerCost: '420.00' });
    expect((await api('payAdmin', `/payroll/reports/arrears?${KA()}&from=${P}&to=${P}`).expect(200)).body.total).toBe(0);
  });

  it('year to date: April to August per person, TDS from the tax lines', async () => {
    const r = (await api('payAdmin', `/payroll/reports/ytd?${KA()}&to=${M}`).expect(200)).body;
    expect(r.yearStart).toBe(`${Y}-04`);
    expect(r.totals).toEqual({ gross: '211000.00', tds: '2400.00', deductions: '14000.00', net: '197000.00' });
    expect(r.rows.find((x: { employeeId: string }) => x.employeeId === ids.asha)).toMatchObject({ months: 2, gross: '65000.00', tds: '2400.00', net: '59000.00' });
    expect(r.trend).toEqual([
      { month: P, gross: '105000.00', net: '98000.00' },
      { month: M, gross: '211000.00', net: '197000.00' },
    ]);
  });

  it('bank advice: unheld, bank-mode payslips with the masked account; held and cash are left out', async () => {
    const r = (await api('payAdmin', `/payroll/reports/bank?${KA()}&from=${M}&to=${M}`).expect(200)).body;
    expect(r.totals).toEqual({ count: 3, amount: '42000.00' });
    expect(r.left).toBe(2);
    expect(r.rows.find((x: { employeeId: string; amount: string }) => x.employeeId === ids.asha && x.amount === '27000.00')).toMatchObject({ ifsc: 'HDFC0001234', account: '1234', status: 'pending' });
    expect(r.rows.find((x: { employeeId: string }) => x.employeeId === ids.dev)).toMatchObject({ ifsc: null, account: null, amount: '10000.00' });
    expect(JSON.stringify(r)).not.toMatch(/accountEnc|account_enc/);
  });

  it('hold ageing: open holds today by age and reason', async () => {
    const r = (await api('payAdmin', `/payroll/reports/holds?${KA()}`).expect(200)).body;
    expect(r.buckets).toEqual([
      { id: '0-30', count: 1, amount: '2500.00' },
      { id: '31-60', count: 1, amount: '15000.00' },
      { id: '61+', count: 0, amount: '0.00' },
    ]);
    expect(r.reasons).toEqual([
      { reason: 'investigation', count: 1, amount: '15000.00' },
      { reason: 'bank_missing', count: 1, amount: '2500.00' },
    ]);
    expect(r.rows.map((x: { employeeId: string; ageDays: number }) => [x.employeeId, x.ageDays])).toEqual([
      [ids.bala, 45],
      [ids.dev, 5],
    ]);
    expect((await api('payAdmin', '/payroll/reports/holds').expect(200)).body.totals).toEqual({ count: 3, amount: '22500.00' });
  });

  it('gratuity provision: the month and to date from the provision lines; payable after the minimum service', async () => {
    const r = (await api('payAdmin', `/payroll/reports/gratuity?${KA()}&to=${M}`).expect(200)).body;
    expect(r.total).toBe(4);
    expect(r.totals).toEqual({ thisMonth: '721.15', toDate: '1442.30' });
    const asha = r.rows.find((x: { employeeId: string }) => x.employeeId === ids.asha);
    expect(asha).toMatchObject({ joined: '2019-01-01', thisMonth: '721.15', toDate: '1442.30' });
    expect(asha.eligible).toBe(r.minYears == null ? null : true);
    expect(r.rows.find((x: { employeeId: string }) => x.employeeId === ids.dev)).toMatchObject({ serviceMonths: 0, thisMonth: '0.00', toDate: '0.00', eligible: r.minYears == null ? null : false });
  });

  it('loan ledger: opening, recovered and closing balances work back from the loan balance today', async () => {
    const aug = (await api('payAdmin', `/payroll/reports/loans?${KA()}&from=${M}&to=${M}`).expect(200)).body;
    expect(aug.rows).toHaveLength(1);
    expect(aug.rows[0]).toMatchObject({ employeeId: ids.asha, principal: '12000.00', opening: '8000.00', recovered: '2000.00', closing: '6000.00' });
    const jul = (await api('payAdmin', `/payroll/reports/loans?${KA()}&from=${P}&to=${P}`).expect(200)).body;
    expect(jul.totals).toEqual({ principal: '12000.00', opening: '10000.00', recovered: '2000.00', closing: '8000.00' });
    const both = (await api('payAdmin', `/payroll/reports/loans?${KA()}&from=${P}&to=${M}`).expect(200)).body;
    expect(both.totals).toMatchObject({ opening: '10000.00', recovered: '4000.00', closing: '6000.00' });
  });

  it('CSV export: every row with the same scope, formula-safe, audited', async () => {
    const res = await api('payAdmin', `/payroll/reports/register?${KA()}&from=${M}&to=${M}&format=csv&pageSize=1`).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`payroll-register-${M}.csv`);
    const lines = res.text.trim().split('\r\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('Employee,Code,Department,Month,Run,basic,bonus,hra,special,pf_employee,tds,pf_employer,gratuity_provision,Gross,Deductions,Net,Cost to company');
    const tn = await api('tnOnly', `/payroll/reports/register?from=${M}&to=${M}&format=csv`).expect(200);
    expect(tn.text.trim().split('\r\n')).toHaveLength(2);
    expect(tn.text).toContain('RP-006');
    const g = await api('payAdmin', `/payroll/reports/gratuity?${KA()}&to=${M}&format=csv`).expect(200);
    expect(g.text).not.toMatch(/,true,|,false,/);
    const logs = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'payroll.report.exported' }, orderBy: { createdAt: 'asc' } }));
    expect(logs.map((l) => [l.entityId, l.actorUserId])).toEqual([
      ['register', users.payAdmin],
      ['register', users.tnOnly],
      ['gratuity', users.payAdmin],
    ]);
    expect(JSON.parse(logs[0].metadataJson ?? '{}')).toMatchObject({ legalEntityId: ids.ka, from: M, to: M, rows: 5 });
  });

  it('scope: no key 403; another entity or company 404 or nothing; the TN grant sees TN only', async () => {
    await api('noKey', '/payroll/reports').expect(403);
    for (const kind of ['register', 'recon', 'variance', 'ctc', 'arrears', 'ytd', 'bank', 'holds', 'gratuity', 'loans']) {
      await api('noKey', `/payroll/reports/${kind}`).expect(403);
      await api('noKey', `/payroll/reports/${kind}?format=csv`).expect(403);
    }
    await api('tnOnly', `/payroll/reports/register?${KA()}`).expect(404);
    await api('tnOnly', `/payroll/reports/register?${KA()}&format=csv`).expect(404);
    await api('payAdminB', `/payroll/reports/register?${KA()}`).expect(404);
    await api('payAdminB', `/payroll/reports/register?departmentId=${ids.ops}`).expect(404);
    await api('tnOnly', `/payroll/reports/register?locationId=${ids.blr}`).expect(404);
    const b = (await api('payAdminB', `/payroll/reports/register?from=${M}&to=${M}`).expect(200)).body;
    expect([b.total, b.totals.gross]).toEqual([0, '0.00']);
    expect((await api('payAdminB', '/payroll/reports/holds').expect(200)).body.totals.count).toBe(0);
    const tn = (await api('tnOnly', `/payroll/reports/register?from=${M}&to=${M}`).expect(200)).body;
    expect(tn.rows.map((x: { code: string }) => x.code)).toEqual(['RP-006']);
    expect((await api('tnOnly', '/payroll/reports/holds').expect(200)).body.totals).toEqual({ count: 1, amount: '5000.00' });
    expect((await api('tnOnly', `/payroll/reports/loans?from=${M}&to=${M}`).expect(200)).body.total).toBe(0);
  });

  it('bad input: unknown report, months the wrong way round or badly written, too many months, a page too big', async () => {
    await api('payAdmin', '/payroll/reports/payslips').expect(400);
    await api('payAdmin', `/payroll/reports/register?from=${M}&to=${P}`).expect(400);
    await api('payAdmin', '/payroll/reports/register?from=2026-13').expect(400);
    await api('payAdmin', '/payroll/reports/register?from=2020-01&to=2026-01').expect(400);
    await api('payAdmin', '/payroll/reports/register?pageSize=500').expect(400);
    await api('payAdmin', '/payroll/reports/register?legalEntityId=not-a-uuid').expect(400);
    await api('payAdmin', '/payroll/reports/register?extra=1').expect(400);
  });
});
