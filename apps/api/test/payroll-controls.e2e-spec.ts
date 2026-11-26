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
import { PayslipsService } from '../src/payroll/payslips.service';
import { monthRange } from '../src/time/time-core';
import { payReady } from './fixtures/pay-ready';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Enterprise E5 payroll controls end to end (answers 2656, 2657; Oracle O16, O17): a one-time earning paid separately
// (its own bank file line) and grossed up (the payroll approver approves it; the person gets it in full), a month's own
// cut-off and release dates set with a reason, a late item rolled to the next month and listed on the run, and published
// payslips hidden from the employee until the release date (early only with a reason). Positive and negative.
describe('Enterprise E5 payroll controls', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let crypto: OrgSecretsCryptoService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { id: '', slug: '' };
  type Who = 'payAdmin' | 'approver1' | 'approver2' | 'viewer' | 'emp1' | 'emp2';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const { to: last } = monthRange(month);
  const short = () => `E5-${run}`.toUpperCase();
  const waitFor = async (id: string, status: string) => {
    for (let i = 0; i < 120; i++) {
      const r = (await api('payAdmin', 'get', `/payroll/runs/${id}`).expect(200)).body;
      if (r.status === status) return r;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`run never reached ${status}`);
  };
  const oneTime = (body: Record<string, unknown>) => api('payAdmin', 'post', '/payroll/one-time-pays').send({ employeeId: ids.emp1, componentCode: 'bonus', amount: '100000', month, reason: 'Joining bonus', ...body });
  const approveTask = async (who: Who, otpId: string) => {
    const row = await scoped((tx) => tx.oneTimePay.findFirstOrThrow({ where: { id: otpId } }));
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: row.wfRequestId!, assigneeUserId: users[who], status: 'open' } }));
    await api(who, 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
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
    crypto = moduleRef.get(OrgSecretsCryptoService);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-bank-formats.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, sets, await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    planId = (await prisma.plan.create({ data: { name: `e5-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'E5 Org', slug: `e5-${run}`, planId } });
    Object.assign(org, { id: created.id, slug: created.slug });
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, readonly string[] | null][] = [
      ['payAdmin', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['approver1', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['viewer', 'panel', ['payroll.run.view']],
      ['emp1', 'panel', null],
      ['emp2', 'panel', null],
    ];
    for (const [who, role, keys] of roster) {
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: org.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: org.id, email: `${who}@e5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: `${who}@e5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'E5 Mills', shortName: `E5-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    await payReady(tenantPrisma, org.id, ids.entity);
    const hire = async (who: Who, code: string) =>
      (
        await api('payAdmin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: first, userId: users[who], workEmail: `${who}@e5-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'E5-001');
    ids.emp2 = await hire('emp2', 'E5-002');
    for (const [emp, number] of [[ids.emp1, '000111222333'], [ids.emp2, '000444555666']] as const)
      await inA((tx) => tx.employeeBankAccount.create({ data: { organizationId: org.id, employeeId: emp, purpose: 'salary', holderName: 'Holder', ifsc: 'HDFC0001234', accountEnc: sealValue(crypto, org.id, emp, number), accountHash: hashValue(crypto, org.id, 'bank', `HDFC0001234:${number}`), accountLast4: number.slice(-4), validFrom: new Date(Date.now() - 86_400_000), usableFrom: new Date(Date.now() - 86_400_000) } }));
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    // The pay group shows payslips three days after the month ends (answer 2657).
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0, releaseDay: 3 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`).send({ employeeIds: [ids.emp1, ids.emp2], from: first }).expect(201);
    for (const emp of [ids.emp1, ids.emp2]) {
      const ch = (await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`).send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: '480000', reason: 'Joining salary' }).expect(201)).body;
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
        await tx.payPeriod.updateMany({ where: { organizationId: org.id }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: org.id } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the new table has forced RLS, tenant isolation and the support exclusion', async () => {
    const [t] = await prisma.$queryRaw<{ forced: boolean; policies: bigint }[]>`SELECT c.relforcerowsecurity AS forced, (SELECT count(*) FROM pg_policies p WHERE p.tablename = 'pay_group_period_dates') AS policies FROM pg_class c WHERE c.relname = 'pay_group_period_dates'`;
    expect(t).toEqual({ forced: true, policies: BigInt(2) });
  });

  it('a month’s own cut-off and release dates: a reason, a day in the month, release on or after the cut-off (positive and negative)', async () => {
    const dates = (who: Who, body: Record<string, unknown>) => api(who, 'put', `/payroll/pay-groups/${ids.group}/periods/${month}/dates`).send(body);
    await dates('payAdmin', { cutOffOn: last, releaseOn: null, reason: 'short' }).expect(400);
    await dates('payAdmin', { cutOffOn: '2001-01-01', releaseOn: null, reason: 'Inputs stay open all month' }).expect(400);
    await dates('payAdmin', { cutOffOn: last, releaseOn: first, reason: 'Inputs stay open all month' }).expect(400);
    await dates('viewer', { cutOffOn: last, releaseOn: null, reason: 'Inputs stay open all month' }).expect(403);
    await api('payAdmin', 'put', `/payroll/pay-groups/${ids.group}/periods/2026-13/dates`).send({ cutOffOn: last, reason: 'Inputs stay open all month' }).expect(400);
    // Open all month for now (the items below belong to this month); the release date stays far ahead.
    const saved = (await dates('payAdmin', { cutOffOn: last, releaseOn: '2099-01-03', reason: 'Inputs stay open all month' }).expect(200)).body;
    expect(saved).toMatchObject({ month, cutOff: last, release: '2099-01-03', changed: { reason: 'Inputs stay open all month', version: 1 } });
    const cal = (await api('payAdmin', 'get', `/payroll/pay-groups/${ids.group}/calendar?year=${month.slice(0, 4)}`).expect(200)).body as { month: string; cutOff: string; release: string | null }[];
    expect(cal.find((m) => m.month === month)).toMatchObject({ cutOff: last, release: '2099-01-03' });
    // Another month keeps the group's days: cut-off on the 25th, release three days after the month ends.
    const other = cal.find((m) => m.month !== month)!;
    expect(other.cutOff.slice(8)).toBe('25');
    expect(other.release).not.toBeNull();
  });

  it('gross-up and paying separately are for a one-time earning; gross-up always waits for the payroll approver (positive and negative)', async () => {
    await oneTime({ componentCode: 'pf_employee', grossUp: true }).expect(400);
    await oneTime({ grossUp: true, endOn: last }).expect(400);
    const up = (await oneTime({ grossUp: true, paidSeparately: true }).expect(201)).body;
    expect(up.status).toBe('pending');
    // The requester never approves; a payroll approver does.
    await expect(inA((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users.payAdmin, status: 'open' } }))).rejects.toThrow();
    await approveTask('approver1', up.id);
    ids.bonus = up.id;
    const small = (await oneTime({ componentCode: 'bonus', amount: '5000', reason: 'Spot award', paidSeparately: true, employeeId: ids.emp2 }).expect(201)).body;
    expect(small.status).toBe('approved');
    const list = (await api('payAdmin', 'get', `/payroll/one-time-pays?month=${month}`).expect(200)).body as { id: string; status: string; paidSeparately: boolean; grossUp: boolean }[];
    expect(list.find((x) => x.id === up.id)).toMatchObject({ status: 'approved', paidSeparately: true, grossUp: true });
  });

  it('after the cut-off an item rolls to next month, the answer says so, and the run lists it (positive)', async () => {
    if (today === first) return; // shortcut: on the 1st no cut-off can be in the past this month.
    await api('payAdmin', 'put', `/payroll/pay-groups/${ids.group}/periods/${month}/dates`).send({ cutOffOn: first, releaseOn: '2099-01-03', reason: 'Inputs closed on the first', version: 1 }).expect(200);
    const late = (await oneTime({ employeeId: ids.emp2, amount: '2000', reason: 'Late incentive' }).expect(201)).body;
    expect(late.rolledTo).toBe(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 7));
    const row = await scoped((tx) => tx.oneTimePay.findFirstOrThrow({ where: { id: late.id } }));
    expect(row.rolledFrom?.toISOString().slice(0, 10)).toBe(first);
    ids.late = late.id;
    // Back to open all month, so the run below pays this month's items.
    await api('payAdmin', 'put', `/payroll/pay-groups/${ids.group}/periods/${month}/dates`).send({ cutOffOn: last, releaseOn: '2099-01-03', reason: 'Inputs stay open all month', version: 2 }).expect(200);
  });

  it('the run: readiness shows the dates and the late item; the grossed-up bonus is paid in full on its own bank line', async () => {
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/readiness`).expect(200)).body;
    expect(ready.dates).toMatchObject({ payGroup: { id: ids.group }, cutOff: last, release: '2099-01-03', canChange: true });
    if (ids.late) expect(ready.late).toEqual([expect.objectContaining({ id: ids.late, direction: 'out', from: month })]);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    await waitFor(ids.run, 'calculated');
    const slip = await scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: ids.run, employeeId: ids.emp1 } }));
    const lines = await scoped((tx) => tx.payslipLine.findMany({ where: { payslipId: slip.id } }));
    const paid = lines.find((l) => l.componentCode === 'tax_paid_by_company')!;
    expect(Number(paid.amount)).toBeGreaterThan(0);
    expect(lines.filter((l) => l.separate).map((l) => l.componentCode).sort()).toEqual(['bonus', 'tax_paid_by_company', 'tds']);
    const tdsOnBonus = lines.find((l) => l.separate && l.componentCode === 'tds')!;
    expect(Number(tdsOnBonus.amount)).toBeCloseTo(Number(paid.amount), 2);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${ids.run}/decision`).send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } }).expect(200);
    }
    const g = (await api('payAdmin', 'post', `/payroll/runs/${ids.run}/bank-files`).send({ debitAccount: '0050200012345678' }).expect(201)).body;
    // emp1: salary + the bonus; emp2: salary + the spot award.
    expect(g.rows).toBe(4);
    const link = (await api('payAdmin', 'post', `/payroll/files/${g.fileId}/link`).expect(200)).body;
    const file = await api('payAdmin', 'get', link.path).buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    }).expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.body as ArrayBuffer);
    const sheet = wb.getWorksheet('Payments')!;
    const head = Array.from(sheet.getRow(1).values as unknown[], (v) => String(v ?? '').toLowerCase());
    const amountAt = head.findIndex((h) => h.includes('amount'));
    expect(amountAt).toBeGreaterThan(0);
    const rows: (string | number)[][] = [];
    sheet.eachRow((r, i) => i > 1 && rows.push([String(r.getCell(2).value), Number(r.getCell(amountAt).value)]));
    const emp1Rows = rows.filter((r) => r[0] === '000111222333');
    expect(emp1Rows).toHaveLength(2);
    expect(emp1Rows.map((r) => r[1])).toContain(100000);
    expect(emp1Rows.reduce((t, r) => t + Number(r[1]), 0)).toBeCloseTo(Number(slip.net), 2);
  });

  it('publish before the release date: hidden from the employee; releasing early needs a reason; shown on the day (positive and negative)', async () => {
    await stepUp('payAdmin');
    const n = (await scoped((tx) => tx.payslip.count({ where: { runId: ids.run, status: 'approved' } })));
    const publish = (body: Record<string, unknown>) => api('payAdmin', 'post', `/payroll/runs/${ids.run}/publish`).send({ confirmation: { phrase: `PUBLISH ${n}`, impact: [] }, selfApprovalReason: 'Only payroll admin here', ...body });
    expect((await publish({ releaseNow: true }).expect(400)).body.code).toBe('RELEASE_REASON');
    await publish({ releaseNow: true, releaseReason: 'short' }).expect(400);
    expect((await publish({}).expect(200)).body).toMatchObject({ releaseOn: '2099-01-03', emailed: null });
    expect((await api('emp1', 'get', '/payroll/me/payslips').expect(200)).body).toEqual([]);
    // The release day comes: the job tells the employees once, and the payslip shows.
    await scoped((tx) => tx.payrollRun.update({ where: { id: ids.run }, data: { releaseAt: new Date(Date.now() - 1000) } }));
    expect(await app.get(PayslipsService).releaseDue()).toBeGreaterThanOrEqual(1);
    expect((await api('emp1', 'get', '/payroll/me/payslips').expect(200)).body).toHaveLength(1);
    const again = await scoped((tx) => tx.payrollRun.findFirstOrThrow({ where: { id: ids.run } }));
    expect(again.releaseNoticedAt).not.toBeNull();
  });
});
