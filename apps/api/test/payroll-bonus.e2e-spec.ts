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
import { markSteppedUp } from './fixtures/step-up';

// PAY-24 statutory bonus end to end against the real database: every route, positive and negative, with the boundaries
// (exactly the eligibility limit and ₹0.01 above it, 29 and 30 working days), the company settings, maker ≠ checker,
// stale versions, another company and another legal entity (key scope and the database pay guard), and the hand-off to
// an off-cycle bonus run.
describe('Payroll statutory bonus (PAY-24)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'both' | 'approver' | 'tnAdmin' | 'noPay' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const payScoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  // The last accounting year (April to March) that has ended, and the current one.
  const Y = tm >= 4 ? ty - 1 : ty - 2;
  const yearStart = `${Y}-04-01`;
  const yearEnd = `${Y + 1}-03-31`;
  const current = `${Y + 1}-04-01`;
  const months = Array.from({ length: 12 }, (_, i) => `${i < 9 ? Y : Y + 1}-${String(((i + 3) % 12) + 1).padStart(2, '0')}`);
  const label = `${Y}-${String(Y + 1).slice(2)}`;
  const D = (x: string) => new Prisma.Decimal(x);
  type Row = { employmentId: string; employeeId: string; eligible: boolean; reason: string | null; bonus: string; bonusSalary: string; payable: string; workingDays: string; ceiling: string; pujaPaid: string };
  const rowOf = (body: { rows: Row[] }, who: string) => body.rows.find((r) => r.employeeId === ids[who])!;
  let comp: { id: string; version: number };
  const v = () => comp.version;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keep = (body: any) => {
    comp = { id: body.id, version: body.version };
    return body;
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
    planId = (await prisma.plan.create({ data: { name: `paybonus-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayBonus Org ${k}`, slug: `paybonus-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      // As in the other pay tests: the payroll fixture also plays the HR person who sets pay, the approver the HR approver.
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.manage', 'employee.change.retro']],
      ['both', 'A', 'panel', [...template('payroll_admin'), 'payroll.bonus.approve']],
      ['approver', 'A', 'panel', [...template('payroll_approver'), 'employee.change.approve', 'employee.change.retro']],
      ['tnAdmin', 'A', 'panel', null],
      ['noPay', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who.toLowerCase()}@paybonus-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Bonus Foods', shortName: `BNF-${run}`, isDefault: true } })).id;
      ids.tn = (await tx.legalEntity.create({ data: { ...o, name: 'Bonus Foods TN', shortName: `BTN-${run}` } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Operations', code: 'OPS', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.group = (await tx.payGroup.create({ data: { ...o, legalEntityId: ids.entity, name: 'Monthly staff' } })).id;
      // Payroll for the TN entity only: a role grant on that legal entity.
      const role = await tx.permissionProfile.create({ data: { ...o, name: `tn-bonus-${run}`, permissionsJson: JSON.stringify(['payroll.bonus.manage', 'payroll.bonus.approve']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.tnAdmin, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.tn, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Payroll for TN', grantedBy: users.adminA } });
    });
    for (const [who, k] of Object.entries({ adminA: 'A', adminB: 'B', payAdmin: 'A', both: 'A', approver: 'A', tnAdmin: 'A', noPay: 'A', payAdminB: 'B' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who.toLowerCase()}@paybonus-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Five workers hired in the past financial year (HR lets past-dated changes reach it for this test company).
    await api('adminA', 'put', '/org/settings').send({ key: 'employee_change.retro_limit', scopeType: 'tenant', value: 'previous_fy' }).expect(200);
    const hire = async (name: string, code: string, joinedOn: string) => {
      const id = (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: name, familyName: run, employeeCode: code, joinedOn, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
      ids[`em_${name}`] = (await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: id } }))).id;
      return id;
    };
    ids.asha = await hire('Asha', 'BN-001', yearStart); // ₹6,000 a month all year
    ids.bala = await hire('Bala', 'BN-002', yearStart); // exactly ₹21,000: eligible
    ids.chitra = await hire('Chitra', 'BN-003', yearStart); // ₹21,000.01: not eligible
    ids.dev = await hire('Dev', 'BN-004', `${Y + 1}-03-03`); // 29 days in the year
    ids.esha = await hire('Esha', 'BN-005', `${Y + 1}-03-02`); // 30 days
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    // Asha and Bala have a salary this month (an off-cycle run pays only people with one); the others do not.
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    for (const emp of [ids.asha, ids.bala]) {
      const ch = (await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`).send({ employeeId: emp, effectiveDate: `${today.slice(0, 7)}-01`, templateVersionId: version, entryMode: 'ctc', annualCtc: '240000', reason: 'Salary' }).expect(201)).body;
      await markSteppedUp(tenantPrisma, token.approver);
      await api('approver', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
    // The year's pay: imported history (basic is a bonus-wage component); Asha's April also has an approved payslip, which wins.
    await payScoped(async (tx) => {
      const o = { organizationId: org.A.id, legalEntityId: ids.entity };
      const batch = await tx.payImportBatch.create({ data: { ...o, kind: 'as_paid_lines', rows: 0, staged: [], sha256: 'a'.repeat(64), status: 'committed', createdBy: users.payAdmin } });
      const line = (who: string, month: string, amount: string) => ({ ...o, employeeId: ids[who], employmentId: ids[`em_${who[0].toUpperCase()}${who.slice(1)}`], periodStart: new Date(`${month}-01T00:00:00Z`), componentCode: 'basic', amount: D(amount), batchId: batch.id });
      await tx.asPaidLine.createMany({
        data: [
          ...months.map((m) => line('asha', m, m === months[0] ? '9999' : '6000')),
          ...months.map((m) => line('bala', m, '21000')),
          ...months.map((m) => line('chitra', m, '21000.01')),
          line('dev', months[11], '6000'),
          line('esha', months[11], '6000'),
          // House rent is not bonus wage.
          { ...line('asha', months[1], '2500'), componentCode: 'hra' },
        ],
      });
      const slip = await tx.payslip.create({ data: { ...o, employmentId: ids.em_Asha, employeeId: ids.asha, periodStart: new Date(`${months[0]}-01T00:00:00Z`), calcVersion: 1, status: 'approved', gross: D('6000'), deductions: D('0'), net: D('6000'), employerCost: D('6000'), ruleVersions: {}, snapshotHash: 'b'.repeat(64), resultHash: 'c'.repeat(64) } });
      await tx.payslipLine.create({ data: { ...o, employeeId: ids.asha, payslipId: slip.id, position: 1, componentCode: 'basic', name: 'Basic', kind: 'earning', amount: D('6000'), explanation: 'Basic' } });
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

  it('overview: the last five years, the last ended one chosen, the Act defaults, nothing worked out yet', async () => {
    const r = (await api('payAdmin', 'get', `/payroll/bonus?legalEntityId=${ids.entity}`).expect(200)).body;
    expect(r.years).toHaveLength(5);
    expect(r.year).toMatchObject({ start: yearStart, end: yearEnd, label, ended: true, dueOn: `${Y + 1}-11-30` });
    expect(r.rules).toEqual({ yearStartMonth: 4, eligibilityWage: '21000', calculationCeiling: '7000', minRate: '8.33', maxRate: '20', minWorkingDays: 30, minAmount: '100', allocablePercent: '60', carryYears: 4, dueMonths: 8 });
    expect(r.can).toEqual({ manage: true, approve: false });
    expect(r.computation).toBeNull();
    expect((await api('approver', 'get', `/payroll/bonus?legalEntityId=${ids.entity}`).expect(200)).body.can).toEqual({ manage: false, approve: true });
    await api('payAdmin', 'get', `/payroll/bonus?legalEntityId=${ids.entity}&yearStart=2001-04-01`).expect(400);
  });

  it('the entity picker lists only the entities each person reaches', async () => {
    // By name: "Bonus Foods", then "Bonus Foods TN".
    expect((await api('payAdmin', 'get', '/payroll/bonus/entities').expect(200)).body.map((e: { id: string; keys: string[] }) => [e.id, e.keys])).toEqual([
      [ids.entity, ['payroll.bonus.manage']],
      [ids.tn, ['payroll.bonus.manage']],
    ]);
    expect((await api('tnAdmin', 'get', '/payroll/bonus/entities').expect(200)).body.map((e: { id: string }) => e.id)).toEqual([ids.tn]);
    expect((await api('payAdminB', 'get', '/payroll/bonus/entities').expect(200)).body).toEqual([]);
    await api('noPay', 'get', '/payroll/bonus/entities').expect(403);
  });

  it('who may look: no key 403; another company or another legal entity 404', async () => {
    await api('noPay', 'get', `/payroll/bonus?legalEntityId=${ids.entity}`).expect(403);
    await api('payAdminB', 'get', `/payroll/bonus?legalEntityId=${ids.entity}`).expect(404);
    await api('tnAdmin', 'get', `/payroll/bonus?legalEntityId=${ids.entity}`).expect(404);
    expect((await api('tnAdmin', 'get', `/payroll/bonus?legalEntityId=${ids.tn}`).expect(200)).body.can).toEqual({ manage: true, approve: true });
  });

  it('compute: refused too early, for a wrong start, for the wrong role and out of scope', async () => {
    const early = await api('payAdmin', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart: current }).expect(409);
    expect(early.body.message).toBe(`The ${Y + 1}-${String(Y + 2).slice(2)} accounting year ends on ${Y + 2}-03-31. Work out its bonus after that day.`);
    await api('payAdmin', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart: `${Y}-05-01` }).expect(400);
    await api('payAdmin', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart: `${Y}-04-15` }).expect(400);
    await api('approver', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart }).expect(403);
    await api('tnAdmin', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart }).expect(404);
    await api('payAdminB', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart }).expect(404);
  });

  it('compute: eligibility at the limit and the 30-day rule, the bonus wage from payslips first, then imported history', async () => {
    const r = keep((await api('payAdmin', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart }).expect(201)).body);
    expect(r).toMatchObject({ status: 'draft', year: { start: yearStart, end: yearEnd, label, dueOn: `${Y + 1}-11-30` }, supportedRate: '8.33', rate: '8.33', availableSurplus: null, firstYear: true, madeByMe: true });
    expect(r.totals).toMatchObject({ people: 5, eligible: 3 });
    const asha = rowOf(r, 'asha');
    // April's payslip (6,000) wins over the imported 9,999; HRA is not bonus wage.
    expect(asha).toMatchObject({ eligible: true, bonusSalary: '72000.00', bonus: '5998.00', payable: '5998.00' });
    const bala = rowOf(r, 'bala');
    expect(bala.eligible).toBe(true);
    expect(bala.bonus).toBe(D(bala.bonusSalary).mul('0.0833').toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(2));
    expect(D(bala.ceiling).gte(7000)).toBe(true);
    expect(rowOf(r, 'chitra')).toMatchObject({ eligible: false, reason: 'Wage above ₹21,000 a month all year.', payable: '0.00' });
    expect(rowOf(r, 'dev')).toMatchObject({ eligible: false, workingDays: '29', reason: 'Worked 29 days; at least 30 are needed.' });
    expect(rowOf(r, 'esha')).toMatchObject({ eligible: true, workingDays: '30', bonus: '500.00' });
    // Once per year and entity.
    expect((await api('payAdmin', 'post', '/payroll/bonus').send({ legalEntityId: ids.entity, yearStart }).expect(409)).body.message).toBe(`The bonus for ${label} is already worked out. Open it instead.`);
    expect((await api('payAdmin', 'get', `/payroll/bonus?legalEntityId=${ids.entity}`).expect(200)).body.computation.id).toBe(comp.id);
    await api('payAdmin', 'get', `/payroll/bonus/${comp.id}`).expect(200);
    await api('tnAdmin', 'get', `/payroll/bonus/${comp.id}`).expect(404);
    await api('payAdminB', 'get', `/payroll/bonus/${comp.id}`).expect(404);
  });

  it('the company setting changes the working-days rule (HR, per legal entity)', async () => {
    await api('adminA', 'put', '/org/settings').send({ key: 'payroll.bonus.min_working_days', scopeType: 'legal_entity', scopeId: ids.entity, value: '15' }).expect(200);
    let r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v() }).expect(200)).body);
    expect(rowOf(r, 'dev').eligible).toBe(true);
    expect(r.rules.minWorkingDays).toBe(15);
    await api('adminA', 'put', '/org/settings').send({ key: 'payroll.bonus.min_working_days', scopeType: 'legal_entity', scopeId: ids.entity, value: '30' }).expect(200);
    r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v() }).expect(200)).body);
    expect(rowOf(r, 'dev').eligible).toBe(false);
    // Only the Act's values or more generous ones exist.
    await api('adminA', 'put', '/org/settings').send({ key: 'payroll.bonus.eligibility_wage', scopeType: 'tenant', value: '15000' }).expect(400);
  });

  it('surplus: the rate follows it between 8.33% and 20%; set-off below the minimum, set-on above the highest', async () => {
    // A stale version is a conflict, never a lost change.
    expect((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v() - 1, availableSurplus: '0' }).expect(409)).body.message).toMatch(/^Someone else changed this bonus/);
    let r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), availableSurplus: '0' }).expect(200)).body);
    expect(r).toMatchObject({ availableSurplus: '0.00', allocableSurplus: '0.00', rate: '8.33', setOnMade: '0.00', setOffMade: r.totals.bonus });
    r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), availableSurplus: '100000000' }).expect(200)).body);
    expect(r).toMatchObject({ allocableSurplus: '60000000.00', supportedRate: '20.00', rate: '20.00', setOffMade: '0.00' });
    expect(r.setOnMade).toBe(D(r.totals.salary).mul('0.2').toFixed(2));
    expect(rowOf(r, 'asha').bonus).toBe('14400.00');
    // A surplus that supports a rate in between.
    const want = D(r.totals.salary).mul('0.125').div('0.6').toDecimalPlaces(0, Prisma.Decimal.ROUND_UP).toFixed(0);
    r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), availableSurplus: want }).expect(200)).body);
    expect(r.rate).toBe('12.50');
    // Never below what the surplus supports, never above the highest; a higher rate is the company's choice.
    expect((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), rate: '10' }).expect(400)).body.message).toBe('The surplus supports 12.5%, so the bonus rate must be between 12.5% and 20%.');
    await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), rate: '20.01' }).expect(400);
    await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), rate: 'abc' }).expect(400);
    await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), availableSurplus: '-5' }).expect(400);
    r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), rate: '15' }).expect(200)).body);
    expect([r.rate, r.chosenRate, r.supportedRate]).toEqual(['15.00', '15.00', '12.50']);
    // The entity's first year takes an opening set-on from before.
    r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), openingSetOn: '5000' }).expect(200)).body);
    expect(r.setOnIn).toBe('5000.00');
    // The approver only reads.
    await api('approver', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), availableSurplus: '1' }).expect(403);
  });

  it('deductions: puja bonus and misconduct loss need a reason; a s.9 dismissal pays nothing', async () => {
    const path = `/payroll/bonus/${comp.id}/rows/${ids.em_Asha}`;
    expect((await api('payAdmin', 'patch', path).send({ version: v(), pujaPaid: '1000', misconductLoss: '0', disqualified: false }).expect(400)).body.message).toBe('Give the reason for the deduction or the dismissal (at least 5 characters).');
    await api('payAdmin', 'patch', path).send({ version: v(), pujaPaid: '-1', misconductLoss: '0', disqualified: false, reason: 'Diwali puja bonus' }).expect(400);
    // The person with both keys changes a row: they are now one of its makers.
    let r = keep((await api('both', 'patch', path).send({ version: v(), pujaPaid: '1000', misconductLoss: '250.50', disqualified: false, reason: 'Diwali puja bonus; damaged pallet' }).expect(200)).body);
    const asha = rowOf(r, 'asha');
    expect(asha.payable).toBe(D(asha.bonus).sub('1250.50').toFixed(2));
    r = keep((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}/rows/${ids.em_Esha}`).send({ version: v(), pujaPaid: '0', misconductLoss: '0', disqualified: true, reason: 'Dismissed for theft on 3 Mar' }).expect(200)).body);
    expect(rowOf(r, 'esha')).toMatchObject({ eligible: false, payable: '0.00' });
    await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}/rows/${randomUUID()}`).send({ version: v(), pujaPaid: '0', misconductLoss: '0', disqualified: false }).expect(404);
    expect(r.totals.eligible).toBe(2);
  });

  it('submit, send back with a reason, submit again; nothing changes while it waits', async () => {
    await api('approver', 'post', `/payroll/bonus/${comp.id}/approve`).send({ version: v() }).expect(409);
    let r = keep((await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/submit`).send({ version: v() }).expect(200)).body);
    expect(r.status).toBe('submitted');
    expect((await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}`).send({ version: v(), availableSurplus: '1' }).expect(409)).body.message).toBe('This bonus is waiting for approval. Ask the approver to send it back before changing it.');
    await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/return`).send({ version: v(), reason: 'Check the puja amounts' }).expect(403);
    await api('approver', 'post', `/payroll/bonus/${comp.id}/return`).send({ version: v(), reason: 'no' }).expect(400);
    r = keep((await api('approver', 'post', `/payroll/bonus/${comp.id}/return`).send({ version: v(), reason: 'Check the puja amounts' }).expect(200)).body);
    expect(r).toMatchObject({ status: 'draft', returnedReason: 'Check the puja amounts', submitted: null });
    r = keep((await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/submit`).send({ version: v() }).expect(200)).body);
    expect(r.returnedReason).toBeNull();
  });

  it('approve: never by someone who worked on it; the approver approves once', async () => {
    expect((await api('both', 'post', `/payroll/bonus/${comp.id}/approve`).send({ version: v() }).expect(403)).body.message).toBe('You worked on this bonus, so someone else approves it.');
    await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/approve`).send({ version: v() }).expect(403);
    await api('tnAdmin', 'post', `/payroll/bonus/${comp.id}/approve`).send({ version: v() }).expect(404);
    const r = keep((await api('approver', 'post', `/payroll/bonus/${comp.id}/approve`).send({ version: v() }).expect(200)).body);
    expect(r.status).toBe('approved');
    expect(r.approved.by).toBe(`approver ${run}`);
    expect((await api('approver', 'post', `/payroll/bonus/${comp.id}/approve`).send({ version: v() }).expect(409)).body.message).toBe('This bonus is already approved.');
    await api('payAdmin', 'patch', `/payroll/bonus/${comp.id}/rows/${ids.em_Asha}`).send({ version: v(), pujaPaid: '0', misconductLoss: '0', disqualified: false }).expect(409);
  });

  it('send: one-time bonus pay per person into a new off-cycle bonus run; once only', async () => {
    await api('approver', 'post', `/payroll/bonus/${comp.id}/send`).send({ version: v() }).expect(403);
    await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/send`).send({ version: v(), runId: randomUUID() }).expect(409);
    const before = (await api('payAdmin', 'get', `/payroll/bonus/${comp.id}`).expect(200)).body;
    const r = keep((await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/send`).send({ version: v() }).expect(200)).body);
    expect(r.status).toBe('sent');
    expect(r.sent).toMatchObject({ runStatus: 'draft', runMonth: today.slice(0, 7) });
    const items = await payScoped((tx) => tx.oneTimePay.findMany({ where: { runId: r.sent.runId }, orderBy: { amount: 'asc' } }));
    const paying = (before.rows as Row[]).filter((x) => D(x.payable).gt(0));
    expect(items.map((x) => [x.employeeId, x.amount.toFixed(2), x.componentCode, x.source, x.sourceRef])).toEqual(
      paying.sort((a, b) => D(a.payable).cmp(D(b.payable))).map((x) => [x.employeeId, x.payable, 'bonus', 'bonus', comp.id]),
    );
    const runRow = await payScoped((tx) => tx.payrollRun.findFirstOrThrow({ where: { id: r.sent.runId } }));
    expect([runRow.runType, runRow.offcycleKind, runRow.payGroupId]).toEqual(['offcycle', 'bonus', ids.group]);
    expect((await api('payAdmin', 'post', `/payroll/bonus/${comp.id}/send`).send({ version: v() }).expect(409)).body.message).toBe('This bonus is already sent to an off-cycle run.');
  });

  it('the off-cycle bonus run pays it: each payslip carries the bonus line', async () => {
    const runId = (await api('payAdmin', 'get', `/payroll/bonus/${comp.id}`).expect(200)).body.sent.runId as string;
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${runId}/readiness`).expect(200)).body;
    for (const b of ready.checks.filter((c: { checkKey: string; waived: boolean; severity: string }) => c.checkKey === 'bank_missing' && !c.waived))
      await api('payAdmin', 'post', `/payroll/runs/${runId}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${runId}/calculate`).expect(202);
    let r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    for (let i = 0; i < 160 && r.status === 'calculating'; i++) {
      await new Promise((ok) => setTimeout(ok, 250));
      r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    }
    expect(r.status).toBe('calculated');
    // Asha and Bala are the two with bonus to pay (Chitra and Dev are not eligible, Esha was dismissed).
    const items = await payScoped((tx) => tx.oneTimePay.findMany({ where: { runId } }));
    expect(items.map((x) => x.employeeId).sort()).toEqual([ids.asha, ids.bala].sort());
    const slips = (await api('payAdmin', 'get', `/payroll/runs/${runId}/payslips`).expect(200)).body as { id: string; employeeId: string }[];
    expect(slips.map((x) => x.employeeId).sort()).toEqual(items.map((x) => x.employeeId).sort());
    for (const slip of slips) {
      const lines = (await api('payAdmin', 'get', `/payroll/payslips/${slip.id}`).expect(200)).body.lines as { code: string; amount: string }[];
      expect(lines.find((l) => l.code === 'bonus')?.amount).toBe(items.find((x) => x.employeeId === slip.employeeId)!.amount.toFixed(2));
    }
  });

  it('audit trail and the database pay guard', async () => {
    const actions = (await inA((tx) => tx.auditLog.findMany({ where: { entityId: comp.id }, orderBy: { createdAt: 'asc' }, select: { action: true } }))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['payroll.bonus.computed', 'payroll.bonus.changed', 'payroll.bonus.row_changed', 'payroll.bonus.submitted', 'payroll.bonus.returned', 'payroll.bonus.approved', 'payroll.bonus.sent']));
    // Without the pay scope the rows are invisible even inside the company; another company never sees them.
    expect(await inA((tx) => tx.bonusComputation.count())).toBe(0);
    expect(await inA((tx) => tx.bonusComputationRow.count())).toBe(0);
    expect(await payScoped((tx) => tx.bonusComputationRow.count({ where: { computationId: comp.id } }))).toBe(5);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.bonusComputation.count();
    })).toBe(0);
    // The table refuses an approval by its maker even if the service were bypassed.
    await expect(payScoped((tx) => tx.bonusComputation.update({ where: { id: comp.id }, data: { approvedBy: users.payAdmin } }))).rejects.toThrow();
  });
});
