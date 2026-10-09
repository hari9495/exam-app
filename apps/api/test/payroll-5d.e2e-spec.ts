import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

// Payroll batch 5d end to end against the real database: an approved run paid out. The bank file from the published
// generic format (approved, unheld, bank-mode payslips past the bank-change cooling period; leading zeros kept), a new
// one only with a reason, released by someone else after a fresh second step with the payslips checked again (never
// through the generic file route); results by hand and by the bank's CSV with the failure flow and the urgent bank fix;
// a cash payment mode approved by someone else and its register; the run paid; payslips published, the employee's own
// list, a single-use PDF link and payslip queries; the pay guard and another company kept apart.
describe('Payroll batch 5d', () => {
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
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'auditor' | 'emp1' | 'emp2' | 'emp3' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const sendMock = jest.fn(async (_m: unknown) => ({ success: true }));
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  /** The second step expires (as it does 15 minutes later). */
  const stepDown = (who: Who) =>
    tenantPrisma.forTenant(SUPER, (tx) =>
      tx.session.update({ where: { id: (JSON.parse(Buffer.from(token[who].split('.')[1], 'base64url').toString()) as { sid: string }).sid }, data: { assuranceLevel: 'aal1', mfaVerifiedAt: null } }),
    );
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const short = () => `P5D-${run}`.toUpperCase();
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
  const slipOf = async (emp: string) => scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: ids.run, employeeId: emp, status: 'approved' } }));
  const release = async (who: Who, bankFileId: string, rows: number) => {
    await stepUp(who);
    return api(who, 'post', `/payroll/bank-files/${bankFileId}/release`).send({ confirmation: { phrase: `RELEASE ${rows}`, impact: [] } });
  };
  const account = (emp: string, number: string, usableFrom: Date, validFrom = new Date()) =>
    inA((tx) =>
      tx.employeeBankAccount.create({
        data: {
          organizationId: org.A.id,
          employeeId: emp,
          purpose: 'salary',
          holderName: 'Account Holder',
          ifsc: 'HDFC0001234',
          accountEnc: sealValue(crypto, org.A.id, emp, number),
          accountHash: hashValue(crypto, org.A.id, 'bank', `HDFC0001234:${number}`),
          accountLast4: number.slice(-4),
          validFrom,
          usableFrom,
        },
      }),
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: sendMock })
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
    // The generic bank format, published by two staff (already there after the seed).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-bank-formats.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, sets, await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    planId = (await prisma.plan.create({ data: { name: `pay5d-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5D Org ${k}`, slug: `pay5d-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      // The payroll admin also holds the release key, to prove the maker still cannot release their own file.
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro', 'payroll.bankfile.release']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['auditor', 'A', 'panel', template('payroll_auditor')],
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
          tx.user.create({ data: { organizationId: o, email: `${who}@pay5d-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@pay5d-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5D Mills', shortName: `P5D-${run}`, isDefault: true } })).id;
      ids.loc = (
        await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })
      ).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
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
            workEmail: `${who}@pay5d-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P5D-001');
    ids.emp2 = await hire('emp2', 'P5D-002');
    ids.emp3 = await hire('emp3', 'P5D-003');
    // Bank accounts: emp1's keeps its leading zeros; emp2's is new and still in its cooling period; emp3 is paid in cash.
    await account(ids.emp1, '000111222333', new Date(Date.now() - 86_400_000));
    await account(ids.emp2, '004455667788', new Date(Date.now() + 2 * 86_400_000));
    await account(ids.emp3, '009988776655', new Date(Date.now() - 86_400_000));
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp1, ids.emp2, ids.emp3], from: first })
      .expect(201);
    for (const emp of [ids.emp1, ids.emp2, ids.emp3]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: '480000', reason: 'Joining salary' })
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

  it('every 5d table has forced RLS, tenant isolation, the support exclusion and the pay guard', async () => {
    const tables = ['bank_files', 'payment_records', 'employee_payment_modes', 'disbursements', 'payslip_queries', 'payslip_links'];
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

  it('a cash payment mode is asked for by payroll and approved by someone else (P03)', async () => {
    await api('emp1', 'post', '/payroll/payment-modes').send({ employeeId: ids.emp3, mode: 'cash', validFrom: first, reason: 'No bank branch nearby' }).expect(403);
    const m = (await api('payAdmin', 'post', '/payroll/payment-modes').send({ employeeId: ids.emp3, mode: 'cash', validFrom: first, reason: 'No bank branch nearby' }).expect(201)).body;
    expect(m.status).toBe('pending');
    const task = ((await api('approver1', 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string }[]).find((t) => /Pay by cash/.test(t.title))!;
    await api('approver1', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await api('payAdmin', 'get', '/payroll/payment-modes').expect(200)).body).toEqual([expect.objectContaining({ employeeId: ids.emp3, mode: 'cash', status: 'approved' })]);
    expect((await api('payAdminB', 'get', '/payroll/payment-modes').expect(200)).body).toEqual([]);
  });

  it('an approved run: calculated, submitted and approved by two others', async () => {
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(409);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${ids.run}/decision`)
        .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } })
        .expect(200);
    }
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('approved');
  });

  it('bank file: only approved bank-mode payslips past the cooling period; leading zeros kept; a new one needs a reason', async () => {
    await api('payAdminB', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(404);
    await api('approver1', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(403);
    const g = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(201)).body;
    expect(g).toMatchObject({ generationNo: 1, rows: 1, format: { key: 'GENERIC', version: 'BANKFMT-GENERIC-1' } });
    expect(g.excluded).toEqual(
      expect.arrayContaining([
        { employeeId: ids.emp2, reason: expect.stringMatching(/cooling period/) },
        { employeeId: ids.emp3, reason: expect.stringMatching(/cash/) },
      ]),
    );
    // Security review: a bank file has full account numbers; an auditor who reads payroll files cannot download it.
    expect((await api('auditor', 'post', `/payroll/files/${g.fileId}/link`).expect(403)).body.message).toMatch(/generate or release/);
    const link = (await api('payAdmin', 'post', `/payroll/files/${g.fileId}/link`).expect(200)).body;
    const xlsx = await binary(api('payAdmin', 'get', link.path)).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as ArrayBuffer);
    const row = wb.getWorksheet('Payments')!.getRow(2);
    expect([row.getCell(2).value, row.getCell(7).value, row.getCell(9).value]).toEqual(['000111222333', '0050200012345678', 'P5D 001']);
    expect((await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(400)).body.message).toMatch(/Say why/);
    const g2 = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678', reason: 'Wrong debit account on the first file' }).expect(201)).body;
    expect(g2.generationNo).toBe(2);
    const list = (await api('approver1', 'get', `/payroll/runs/${ids.run}/bank-files`).expect(200)).body;
    expect(list.map((f: { generationNo: number; status: string }) => [f.generationNo, f.status])).toEqual([
      [2, 'generated'],
      [1, 'superseded'],
    ]);
    ids.bank2 = g2.id;
    ids.bankFile2 = g2.fileId;
  });

  it('release: never by the maker or through the generic file route; step-up and the phrase; the payslips are checked again', async () => {
    expect((await release('payAdmin', ids.bank2, 1)).status).toBe(403);
    await stepUp('approver1');
    expect(
      (
        await api('approver1', 'post', `/payroll/files/${ids.bankFile2}/release`)
          .send({ confirmation: { phrase: 'RELEASE 1', impact: [] } })
          .expect(403)
      ).body.message,
    ).toMatch(/payroll run/);
    await stepDown('approver2');
    const fresh = await api('approver2', 'post', `/payroll/bank-files/${ids.bank2}/release`)
      .send({ confirmation: { phrase: 'RELEASE 1', impact: [] } })
      .expect(403);
    expect(fresh.body.code).toBe('STEP_UP_REQUIRED');
    expect((await release('approver1', ids.bank2, 2)).status).toBe(400);
    // A payslip that moved on since the file was made: the release refuses.
    const s1 = await slipOf(ids.emp1);
    await scoped((tx) => tx.payslip.update({ where: { id: s1.id }, data: { paymentStatus: 'paid' } }));
    expect((await release('approver1', ids.bank2, 1)).status).toBe(409);
    await scoped((tx) => tx.payslip.update({ where: { id: s1.id }, data: { paymentStatus: 'pending' } }));
    expect((await release('approver1', ids.bank2, 1)).body).toMatchObject({ status: 'released' });
    expect((await release('approver2', ids.bank2, 1)).status).toBe(409);
    expect((await slipOf(ids.emp1)).paymentStatus).toBe('sent');
  });

  it('results: a failure is told to the employee; the urgent bank fix needs a changed account, a checker and step-up', async () => {
    const s1 = await slipOf(ids.emp1);
    expect(
      (
        await api('payAdmin', 'post', `/payroll/runs/${ids.run}/payment-results`)
          .send({ rows: [{ payslipId: s1.id, status: 'failed' }] })
          .expect(400)
      ).body.problems,
    ).toEqual(expect.arrayContaining([expect.stringMatching(/say why/), expect.stringMatching(/needs a reason/)]));
    const s2 = await slipOf(ids.emp2);
    expect(
      (
        await api('payAdmin', 'post', `/payroll/runs/${ids.run}/payment-results`)
          .send({ rows: [{ payslipId: s2.id, status: 'paid', reason: 'Bank says paid' }] })
          .expect(400)
      ).body.problems[0],
    ).toMatch(/not waiting for a bank result/);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/payment-results`)
      .send({ rows: [{ payslipId: s1.id, status: 'failed', bankReference: 'UTR-1', reason: 'Account closed' }] })
      .expect(200);
    expect((await slipOf(ids.emp1)).paymentStatus).toBe('failed');
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.emp1, type: 'payroll.payment.failed' } }))).toBe(1);
    await stepDown('payAdmin');
    expect((await api('payAdmin', 'post', `/payroll/payslips/${s1.id}/expedite-bank`).send({ pennyDropReference: 'PD-778899', reason: 'Salary failed, new account' }).expect(403)).body.code).toBe(
      'STEP_UP_REQUIRED',
    );
    await stepUp('payAdmin');
    expect(
      (await api('payAdmin', 'post', `/payroll/payslips/${s1.id}/expedite-bank`).send({ pennyDropReference: 'PD-778899', reason: 'Salary failed, new account' }).expect(409)).body.message,
    ).toMatch(/not changed their bank account/);
    // The employee's bank change is approved (P02): the new account waits out its cooling period.
    await inA((tx) => tx.employeeBankAccount.updateMany({ where: { employeeId: ids.emp1, validTo: null }, data: { validTo: new Date() } }));
    await account(ids.emp1, '000111222444', new Date(Date.now() + 2 * 86_400_000));
    await api('emp1', 'post', `/payroll/payslips/${s1.id}/expedite-bank`).send({ pennyDropReference: 'PD-778899', reason: 'My own account' }).expect(403);
    expect((await api('payAdmin', 'post', `/payroll/payslips/${s1.id}/expedite-bank`).send({ pennyDropReference: 'PD-778899', reason: 'Salary failed, new account' }).expect(200)).body).toMatchObject({
      account: '•••• 2444',
      usableNow: true,
    });
    const g3 = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678', reason: 'Pay the failed salary again' }).expect(201)).body;
    expect(g3.rows).toBe(1);
    expect((await release('approver2', g3.id, 1)).status).toBe(200);
    // The bank's response file.
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/payment-results/upload`)
      .attach('file', Buffer.from('employee_code,status,reference,reason\nP5D-001,paid,UTR-2,\n'), 'response.csv')
      .expect(200);
    expect((await slipOf(ids.emp1)).paymentStatus).toBe('paid');
  });

  it('cash register and the run paid once nobody waits', async () => {
    const reg = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/disbursements`).expect(200)).body;
    expect(reg).toEqual([expect.objectContaining({ employeeId: ids.emp3, mode: 'cash', paymentStatus: 'pending' })]);
    const s3 = await slipOf(ids.emp3);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/disbursements`).send({ payslipId: s3.id, mode: 'cash', chequeNo: '123456', paidOn: today }).expect(400);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/disbursements`).send({ payslipId: s3.id, mode: 'cheque', chequeNo: '123456', paidOn: today }).expect(409);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/disbursements`).send({ payslipId: s3.id, mode: 'cash', paidOn: today, acknowledgement: 'Signed register page 4' }).expect(201);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/disbursements`).send({ payslipId: s3.id, mode: 'cash', paidOn: today }).expect(409);
    expect((await api('payAdmin', 'get', `/payroll/runs/${ids.run}`).expect(200)).body.status).toBe('approved');
    // emp2's cooling period ends: the next file pays them and the run is paid.
    const acc2 = await inA((tx) => tx.employeeBankAccount.findFirstOrThrow({ where: { employeeId: ids.emp2, validTo: null } }));
    await inA((tx) => tx.$queryRaw`SELECT bank_account_use_now(${org.A.id}::uuid, ${acc2.id}::uuid)`);
    const g4 = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678', reason: 'Cooling period over' }).expect(201)).body;
    expect(g4.rows).toBe(1);
    expect((await release('approver1', g4.id, 1)).status).toBe(200);
    expect(
      (
        await api('payAdmin', 'post', `/payroll/runs/${ids.run}/payment-results`)
          .send({ rows: [{ employeeCode: 'P5D-002', status: 'paid', bankReference: 'UTR-3', reason: 'Bank statement line 12' }] })
          .expect(200)
      ).body,
    ).toMatchObject({ runStatus: 'paid' });
  });

  it('5e-D1: the company turns payslip email on (a link to the in-app payslip, never a PDF)', async () => {
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'legal_entity', scopeId: ids.entity, key: 'payroll.payslip_email', value: 'on' } }));
  });

  it('publish: step-up and the phrase, once; then the employee sees their own payslip, its PDF through a single-use link', async () => {
    expect((await api('emp1', 'get', '/payroll/me/payslips').expect(200)).body).toEqual([]);
    const s1 = await slipOf(ids.emp1);
    await api('emp1', 'get', `/payroll/payslips/${s1.id}`).expect(404);
    await api('approver1', 'post', `/payroll/runs/${ids.run}/publish`)
      .send({ confirmation: { phrase: 'PUBLISH 3', impact: [] } })
      .expect(403);
    await stepDown('payAdmin');
    expect(
      (
        await api('payAdmin', 'post', `/payroll/runs/${ids.run}/publish`)
          .send({ confirmation: { phrase: 'PUBLISH 3', impact: [] } })
          .expect(403)
      ).body.code,
    ).toBe('STEP_UP_REQUIRED');
    await stepUp('payAdmin');
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/publish`)
      .send({ confirmation: { phrase: 'PUBLISH', impact: [] } })
      .expect(400);
    expect(
      (
        await api('payAdmin', 'post', `/payroll/runs/${ids.run}/publish`)
          .send({ confirmation: { phrase: 'PUBLISH 3', impact: [] } })
          .expect(200)
      ).body,
    ).toMatchObject({ publishedPeople: 3, emailed: { sent: 3, noEmail: 0 } });
    // 5e-D1: a link, never a PDF; no pay figures in the email; the link opens that payslip for that person only, once signed in.
    const mails = sendMock.mock.calls.map(([m]) => m as { to: string; html: string; attachments?: unknown[] });
    expect(mails.filter((m) => m.attachments?.length)).toEqual([]);
    const mail1 = mails.find((m) => m.to === `emp1@pay5d-${run}.test` && m.html.includes('open='))!;
    expect(mails.filter((m) => m.html.includes('open='))).toHaveLength(3);
    expect(mail1.html).not.toMatch(/₹|Rs\.?\s?\d|\d{1,3}(,\d{2,3})+/);
    const linkToken = /open=([A-Za-z0-9_-]+)/.exec(mail1.html)![1];
    await api('emp2', 'post', `/payroll/me/payslip-links/${linkToken}/open`).expect(404);
    expect((await api('emp1', 'post', `/payroll/me/payslip-links/${linkToken}/open`).expect(200)).body).toMatchObject({ month });
    // A view link is not a PDF download link.
    await api('emp1', 'get', `/payroll/payslip-downloads/${linkToken}`).expect(404);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/publish`)
      .send({ confirmation: { phrase: 'PUBLISH 3', impact: [] } })
      .expect(409);
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: { in: [users.emp1, users.emp2, users.emp3] }, type: 'payroll.payslip.published' } }))).toBe(3);
    const mine = (await api('emp1', 'get', '/payroll/me/payslips').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ id: s1.id, month, paymentStatus: 'paid' })]);
    expect((await api('emp1', 'get', `/payroll/payslips/${s1.id}`).expect(200)).body.lines.length).toBeGreaterThan(3);
    const s2 = await slipOf(ids.emp2);
    await api('emp1', 'get', `/payroll/payslips/${s2.id}`).expect(404);
    await api('emp1', 'get', `/payroll/me/payslips/${s2.id}/pdf`).expect(404);
    const link = (await api('emp1', 'get', `/payroll/me/payslips/${s1.id}/pdf`).expect(200)).body;
    await api('emp2', 'get', link.path).expect(404);
    const pdf = await binary(api('emp1', 'get', link.path)).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.body as Buffer).toString('latin1')).toContain(`result:${s1.resultHash}`);
    await api('emp1', 'get', link.path).expect(404);
    const logged = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'payroll.payslip.downloaded', entityId: s1.id } }));
    expect(JSON.parse(logged?.metadataJson ?? '{}').sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('payslip queries: the employee on their own payslip; payroll of the entity answers; each side does only its part', async () => {
    const s1 = await slipOf(ids.emp1);
    const s2 = await slipOf(ids.emp2);
    await api('emp1', 'post', `/payroll/me/payslips/${s2.id}/queries`).send({ text: 'Why is this so?' }).expect(404);
    await api('emp1', 'post', `/payroll/me/payslips/${s1.id}/queries`).send({ lineCode: 'nope', text: 'Why is this so?' }).expect(400);
    const q = (await api('emp1', 'post', `/payroll/me/payslips/${s1.id}/queries`).send({ lineCode: 'basic', text: 'Why is my basic lower?' }).expect(201)).body;
    expect((await api('payAdminB', 'get', '/payroll/queries').expect(200)).body).toEqual([]);
    expect((await api('emp2', 'get', '/payroll/queries').expect(200)).body).toEqual([]);
    expect((await api('payAdmin', 'get', '/payroll/queries?status=open').expect(200)).body).toEqual([expect.objectContaining({ id: q.id, lineCode: 'basic', mine: false })]);
    await api('emp2', 'patch', `/payroll/queries/${q.id}`).send({ reply: 'Me too' }).expect(404);
    expect((await api('payAdmin', 'patch', `/payroll/queries/${q.id}`).send({ reply: 'You joined mid-month last year; this month is full.' }).expect(200)).body.status).toBe('answered');
    await api('emp1', 'patch', `/payroll/queries/${q.id}`).send({ assigneeUserId: users.payAdmin }).expect(403);
    const mine = (await api('emp1', 'get', '/payroll/queries').expect(200)).body;
    expect(mine[0].replies).toEqual([expect.objectContaining({ side: 'payroll' })]);
    expect((await api('emp1', 'patch', `/payroll/queries/${q.id}`).send({ status: 'closed' }).expect(200)).body.status).toBe('closed');
    await api('payAdmin', 'patch', `/payroll/queries/${q.id}`).send({ reply: 'Late' }).expect(409);
  });
});
