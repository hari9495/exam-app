import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { hashValue, sealValue } from '../src/people/profile.service';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// PPL-46 split pay paid by payroll, against the real database: an approved run whose bank file pays each Indian account
// of a split in force (salary and reimbursement accounts) and lists the account abroad in the outward remittance list,
// released with the bank file by someone else; a split still in its cooling period pays as before; a split above the net
// pay is refused with the designed message once there is a payslip; the remittance list is never released alone or
// downloaded by an auditor; another company never reaches it.
describe('Payroll split pay (PPL-46)', () => {
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
  type Who = 'adminA' | 'payAdmin' | 'approver1' | 'approver2' | 'auditor' | 'hr' | 'emp1' | 'emp2' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const short = () => `PSP-${run}`.toUpperCase();
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
  const waitFor = async (id: string, status: string) => {
    for (let i = 0; i < 120; i++) {
      const r = (await api('payAdmin', 'get', `/payroll/runs/${id}`).expect(200)).body;
      if (r.status === status) return r;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`run never reached ${status}`);
  };
  const IBAN = 'AE070331234567890123456';
  const account = (emp: string, purpose: 'salary' | 'reimbursement', number: string) =>
    inA((tx) =>
      tx.employeeBankAccount.create({
        data: { organizationId: org.A.id, employeeId: emp, purpose, holderName: 'Account Holder', ifsc: 'HDFC0001234', accountEnc: sealValue(crypto, org.A.id, emp, number), accountHash: hashValue(crypto, org.A.id, 'bank', `HDFC0001234:${number}`), accountLast4: number.slice(-4), validFrom: new Date(), usableFrom: new Date(Date.now() - 86_400_000) },
      }),
    );
  const split = (lines: { account: string; rule: string; value: number }[]) => ({ kind: 'pay_split', value: { split: lines } });

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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-bank-formats.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, sets, await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    planId = (await prisma.plan.create({ data: { name: `psp-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PSP Org ${k}`, slug: `psp-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro', 'payroll.bankfile.release']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['auditor', 'A', 'panel', template('payroll_auditor')],
      ['hr', 'A', 'panel', [...template('hr_admin'), 'employee.identity.approve', 'employee.identity.manage']],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@psp-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@psp-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'PSP Mills', shortName: `PSP-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: first, userId: users[who], workEmail: `${who}@psp-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'PSP-001');
    ids.emp2 = await hire('emp2', 'PSP-002');
    // emp1: salary and reimbursement accounts in India and an account abroad; emp2: a salary account only.
    await account(ids.emp1, 'salary', '000111222333');
    await account(ids.emp1, 'reimbursement', '000444555666');
    await account(ids.emp2, 'salary', '000777888999');
    await inA((tx) => tx.employeeIntlBankAccount.create({ data: { organizationId: org.A.id, employeeId: ids.emp1, country: 'AE', ibanEnc: sealValue(crypto, org.A.id, ids.emp1, IBAN), ibanHash: hashValue(crypto, org.A.id, 'iban', IBAN), ibanLast4: IBAN.slice(-4), bic: 'ECBKAEAD', currency: 'AED', validFrom: new Date(), usableFrom: new Date(Date.now() - 86_400_000) } }));
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`).send({ employeeIds: [ids.emp1, ids.emp2], from: first }).expect(201);
    for (const emp of [ids.emp1, ids.emp2]) {
      const ch = (await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`).send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: '480000', reason: 'Joining salary' }).expect(201)).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
    // The run, approved by two others.
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${ids.run}/decision`).send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } }).expect(200);
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

  it('a split above the net pay is refused with the designed message; one that fits goes to HR approval', async () => {
    const net = (await scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: ids.run, employeeId: ids.emp1, status: 'approved' } }))).net;
    ids.net1 = net.toFixed(2);
    expect((await api('emp1', 'get', `/people/employees/${ids.emp1}/pay-split`).expect(200)).body.net).toBe(Number(net));
    await stepUp('emp1');
    const over = (await api('emp1', 'post', `/people/employees/${ids.emp1}/profile-requests`).send(split([{ account: 'salary', rule: 'remainder', value: 0 }, { account: 'abroad', rule: 'fixed', value: Number(net) + 1 }])).expect(400)).body;
    expect(over).toMatchObject({ code: 'OVER_SPLIT', message: 'Fixed amounts and percentages are more than the net pay.' });
    const r = (await api('emp1', 'post', `/people/employees/${ids.emp1}/profile-requests`).send(split([{ account: 'abroad', rule: 'remainder', value: 0 }, { account: 'salary', rule: 'fixed', value: 1000 }, { account: 'reimbursement', rule: 'percent', value: 10 }])).expect(201)).body;
    await stepUp('hr');
    await api('hr', 'post', `/people/profile-requests/${r.id}/approve`).send({}).expect(201);
  });

  it('while the new split cools, the bank file pays the salary account as before', async () => {
    const g = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(201)).body;
    expect(g).toMatchObject({ rows: 2, remittance: null });
  });

  it('once in force: the Indian accounts in the bank file, the account abroad in the remittance list; totals are the net pay', async () => {
    await inA((tx) => tx.employeePaySplit.updateMany({ where: { employeeId: ids.emp1, validTo: null }, data: { usableFrom: new Date(Date.now() - 60_000) } }));
    await api('payAdminB', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678', reason: 'Split in force' }).expect(404);
    const g = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678', reason: 'Split in force' }).expect(201)).body;
    const net = new Prisma.Decimal(ids.net1);
    const reimb = net.sub(1000).mul(10).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const abroad = net.sub(1000).sub(reimb);
    expect(g.rows).toBe(3); // emp1 salary + reimbursement, emp2 salary
    expect(g.remittance).toMatchObject({ rows: 1, total: abroad.toFixed(2) });
    const slips = await scoped((tx) => tx.payslip.findMany({ where: { runId: ids.run, status: 'approved' } }));
    expect(new Prisma.Decimal(g.total).eq(slips.reduce((t, s) => t.add(s.net), new Prisma.Decimal(0)))).toBe(true);
    // The bank file's rows: emp1's two Indian accounts with their amounts.
    const link = (await api('payAdmin', 'post', `/payroll/files/${g.fileId}/link`).expect(200)).body;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await binary(api('payAdmin', 'get', link.path)).expect(200)).body as ArrayBuffer);
    const sheet = wb.getWorksheet('Payments')!;
    const cells = [2, 3, 4].map((i) => [sheet.getRow(i).getCell(2).value, Number(sheet.getRow(i).getCell(5).value)]);
    expect(cells).toEqual(expect.arrayContaining([['000111222333', 1000], ['000444555666', Number(reimb)]]));
    // The remittance list: the full IBAN for the bank, never for an auditor; never released on its own.
    expect((await api('auditor', 'post', `/payroll/files/${g.remittance.fileId}/link`).expect(403)).body.message).toMatch(/generate or release/);
    const rl = (await api('payAdmin', 'post', `/payroll/files/${g.remittance.fileId}/link`).expect(200)).body;
    const csv = (await binary(api('payAdmin', 'get', rl.path)).expect(200)).body.toString('utf8') as string;
    expect(csv.split('\r\n')[0]).toBe('employee_code,name,iban,bic,payout_currency,amount_inr,narration');
    expect(csv.split('\r\n')[1]).toBe(`PSP-001,emp1 ${run},${IBAN},ECBKAEAD,AED,${abroad.toFixed(2)},Salary ${month}`);
    await stepUp('approver1');
    expect((await api('approver1', 'post', `/payroll/files/${g.remittance.fileId}/release`).send({ confirmation: { phrase: 'RELEASE 1', impact: [] } }).expect(403)).body.message).toMatch(/with its bank file/);
    ids.bank = g.id;
    ids.remit = g.remittance.fileId;
  });

  it('released by someone else with the bank file: both files released, the payslips sent', async () => {
    await stepUp('payAdmin');
    await api('payAdmin', 'post', `/payroll/bank-files/${ids.bank}/release`).send({ confirmation: { phrase: 'RELEASE 3', impact: [] } }).expect(403); // the maker
    await stepUp('approver1');
    expect((await api('approver1', 'post', `/payroll/bank-files/${ids.bank}/release`).send({ confirmation: { phrase: 'RELEASE 3', impact: [] } }).expect(200)).body).toMatchObject({ status: 'released' });
    const remit = await scoped((tx) => tx.exchangeFile.findFirstOrThrow({ where: { id: ids.remit } }));
    expect(remit).toMatchObject({ status: 'released', releasedBy: users.approver1 });
    const slips = await scoped((tx) => tx.payslip.findMany({ where: { runId: ids.run, status: 'approved' } }));
    expect(slips.every((s) => s.paymentStatus === 'sent')).toBe(true);
  });
});
