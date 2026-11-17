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
import { loanEmi } from '../src/payroll/inputs.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';
import { payrollSettingsApplyAtOnce } from './fixtures/payroll-second-person';

// Founder answers of 30 Oct 2026 end to end against the real database:
//   1  the loan interest rate is the company's per loan type (settings with a default); a client rate is refused;
//   5  a loan's repayments (recovered and scheduled) and the pre-closure interest;
//   3  after the regime cut-off, "ask HR to change my regime" through Approvals; approved changes it (audited);
//   2  a residential-status change waits for payroll with the TRC and Form 10F (proof queue); nobody decides their own;
//   16 an employee withdraws their own payslip query with no reply.
describe('Pay follow-ups (founder answers 1, 2, 3, 5, 16)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'payAdmin2' | 'approver1' | 'emp1' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
  const PDF = Buffer.from('%PDF-1.4 tax residency certificate');
  const setting = (who: 'adminA' | 'adminB', key: string, value: string, scopeId?: string) =>
    api(who, 'put', '/org/settings')
      .send({ key, value, scopeType: scopeId ? 'legal_entity' : 'tenant', ...(scopeId ? { scopeId } : {}) })
      .expect(200);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; requestId: string; title: string }[];
  const residency = (who: Who, f: Record<string, string>, file: Buffer | null = PDF) => {
    const r = api(who, 'post', '/tax/me/residency');
    for (const [k, v] of Object.entries(f)) r.field(k, v);
    return file ? r.attach('file', file, 'trc.pdf') : r;
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
    planId = (await prisma.plan.create({ data: { name: `payfu-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayFU Org ${k}`, slug: `payfu-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['payAdmin2', 'A', 'panel', template('payroll_admin')],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
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
          tx.user.create({ data: { organizationId: o, email: `${who.toLowerCase()}@payfu-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who.toLowerCase()}@payfu-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'PayFU Mills', shortName: `PFU-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
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
            workEmail: `${who.toLowerCase()}@payfu-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'PFU-001');
    ids.payAdminEmp = await hire('payAdmin', 'PFU-002');
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    const ch = (
      await api('payAdmin', 'post', `/payroll/employees/${ids.emp1}/compensation-changes`)
        .send({ employeeId: ids.emp1, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: '600000', reason: 'Joining salary' })
        .expect(201)
    ).body;
    await stepUp('approver1');
    await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    // Answers 1325 / 1521: this suite's payroll settings apply at once (the second-person control is tested elsewhere).
    await payrollSettingsApplyAtOnce(server(), tenantPrisma, org.A, token.adminA);
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

  // ------------------------------------------------------------------------------------------ 1 · loan interest

  it('1: the rate is the company’s per loan type (default interest-free); a rate sent by the client is refused', async () => {
    expect((await api('emp1', 'get', '/payroll/loans/rules').expect(200)).body.interestRate).toEqual({ advance: '0', loan: '0' });
    const ask = { loanType: 'loan', principal: '12000', instalments: 12, firstMonth: '2099-01', reason: 'House repairs' };
    expect((await api('emp1', 'post', '/payroll/loans').send({ ...ask, interestRate: '1' }).expect(400)).body.message).toBe('The interest rate is set by the company for each loan type. Send the request without it.');
    // Payroll asking on someone's behalf cannot send one either.
    await api('payAdmin', 'post', '/payroll/loans').send({ ...ask, employeeId: ids.emp1, interestRate: '0' }).expect(400);
    // Only HR sets it; the entity's value beats the company's; another company's changes nothing here.
    await api('payAdmin', 'put', '/org/settings').send({ key: 'payroll.loan.interest_rate.loan', scopeType: 'tenant', value: '8' }).expect(403);
    await setting('adminA', 'payroll.loan.interest_rate.loan', '8');
    await setting('adminA', 'payroll.loan.interest_rate.loan', '9', ids.entity);
    await setting('adminB', 'payroll.loan.interest_rate.loan', '12');
    await api('adminA', 'put', '/org/settings').send({ key: 'payroll.loan.interest_rate.loan', scopeType: 'tenant', value: '3.3' }).expect(400);
    expect((await api('emp1', 'get', '/payroll/loans/rules').expect(200)).body.interestRate).toEqual({ advance: '0', loan: '9' });
    const loan = (await api('emp1', 'post', '/payroll/loans').send(ask).expect(201)).body;
    expect(loan.emi).toBe(loanEmi(D('12000'), D('9'), 12).toFixed(2));
    const task = (await inbox('approver1')).find((t) => /Loan of ₹12000/.test(t.title))!;
    await api('approver1', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    const mine = ((await api('emp1', 'get', '/payroll/loans').expect(200)).body as { id: string; interestRate: string; status: string }[]).find((l) => l.id === loan.id)!;
    expect(mine).toMatchObject({ interestRate: '9.00', status: 'active' });
    ids.loan = loan.id;
    // A salary advance stays interest-free (its own setting).
    const adv = (await api('emp1', 'post', '/payroll/loans').send({ ...ask, loanType: 'advance', principal: '1200' }).expect(201)).body;
    expect(adv.emi).toBe('100.00');
  });

  // ------------------------------------------------------------------------------------------ 5 · repayments

  it('5: a loan’s months, recovered and scheduled, for its owner and payroll in scope; nobody else', async () => {
    const r = (await api('emp1', 'get', `/payroll/loans/${ids.loan}/repayments`).expect(200)).body;
    expect(r).toMatchObject({ loanId: ids.loan, interestRate: '9.00', recovered: '0.00' });
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0]).toMatchObject({ no: 1, month: '2099-01', interest: '90.00', status: 'scheduled' });
    expect(r.rows[11].balance).toBe('0.00');
    // Interest runs from the first instalment month (2099), so a pre-closure today owes none yet.
    expect(r.closing).toMatchObject({ principal: '12000.00', interest: '0.00', total: '12000.00', days: 0 });
    expect((await api('payAdmin', 'get', `/payroll/loans/${ids.loan}/repayments`).expect(200)).body.rows).toHaveLength(12);
    await api('payAdminB', 'get', `/payroll/loans/${ids.loan}/repayments`).expect(404);
    await api('approver1', 'get', `/payroll/loans/${ids.loan}/repayments`).expect(404);
    await api('emp1', 'get', `/payroll/loans/${randomUUID()}/repayments`).expect(404);
    await api('emp1', 'get', '/payroll/loans/not-a-uuid/repayments').expect(400);
  });

  it('5: a month recovered in payroll is a recovered row; the rest follows from the balance; pre-closure keeps its interest', async () => {
    // A recovered instalment as the run books it: the payslip's month and the amount taken (interest on the balance first).
    const loan = await inA((tx) => tx.loan.findFirstOrThrow({ where: { id: ids.loan } }));
    const emp = await inA((tx) => tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.emp1 } }));
    await inA(async (tx) => {
      const slip = await tx.payslip.create({
        data: { organizationId: org.A.id, legalEntityId: ids.entity, employmentId: emp.id, employeeId: ids.emp1, periodStart: new Date(`${month}-01T00:00:00Z`), calcVersion: 1, status: 'approved', gross: 50000, deductions: loan.emi, net: D(50000).sub(loan.emi), employerCost: 50000, ruleVersions: {}, snapshotHash: 'a'.repeat(64), resultHash: 'b'.repeat(64) },
      });
      await tx.loanRepayment.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp1, loanId: loan.id, payslipId: slip.id, amount: loan.emi } });
      ids.slip = slip.id;
      const interest = D(12000).mul(9).div(1200).toDecimalPlaces(2);
      await tx.loan.update({ where: { id: loan.id }, data: { outstanding: D(12000).sub(loan.emi.sub(interest)), firstMonth: new Date(`${month}-01T00:00:00Z`) } });
    });
    const r = (await api('emp1', 'get', `/payroll/loans/${ids.loan}/repayments`).expect(200)).body;
    expect(r.recovered).toBe(loan.emi.toFixed(2));
    expect(r.rows[0]).toMatchObject({ no: 1, month, emi: loan.emi.toFixed(2), interest: '90.00', status: 'recovered' });
    expect(r.rows[1].status).toBe('scheduled');
    expect(r.rows[r.rows.length - 1].balance).toBe('0.00');
    // Interest from the month after the last recovery: none until then.
    expect(r.closing.interestFrom > today).toBe(true);
    // Only payroll pre-closes, never the borrower; the server works the interest out and keeps it with the change.
    await api('emp1', 'post', `/payroll/loans/${ids.loan}/schedule-changes`).send({ kind: 'preclose', reason: 'Paid back myself' }).expect(403);
    const closed = (await api('payAdmin', 'post', `/payroll/loans/${ids.loan}/schedule-changes`).send({ kind: 'preclose', reason: 'Paid back from a bonus' }).expect(201)).body;
    expect(closed).toMatchObject({ kind: 'preclose', interest: r.closing.interest, total: r.closing.total, closedOn: today });
    const after = (await api('emp1', 'get', `/payroll/loans/${ids.loan}/repayments`).expect(200)).body;
    expect(after.closing).toBeNull();
    expect(after.rows.every((x: { status: string }) => x.status === 'recovered')).toBe(true);
    await api('payAdmin', 'post', `/payroll/loans/${ids.loan}/schedule-changes`).send({ kind: 'preclose', reason: 'Again by mistake' }).expect(409);
    const change = await inA((tx) => tx.loanScheduleChange.findFirstOrThrow({ where: { loanId: ids.loan, kind: 'preclose' } }));
    expect(change.detail).toMatchObject({ interest: r.closing.interest, total: r.closing.total, outstandingBefore: r.closing.principal });
  });

  // ------------------------------------------------------------------------------------------ 6 · payslip days strip

  it('6: the payslip detail carries the month’s days from attendance (one per day employed); off-cycle has none', async () => {
    const day2 = `${month}-02`;
    await inA((tx) => tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: ids.emp1, workOn: new Date(`${day2}T00:00:00Z`), mode: 'punch', status: 'absent' } }));
    const s = (await api('payAdmin', 'get', `/payroll/payslips/${ids.slip}`).expect(200)).body;
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    expect(s.days.list).toHaveLength(last);
    expect(s.days.list[1]).toEqual({ day: 2, kind: 'lop' });
    expect(s.days.list[0]).toEqual({ day: 1, kind: 'paid' });
    expect(s.days).toMatchObject({ calendarDays: null, paidDays: null, lopDays: null });
    // An off-cycle payslip of the same month has no strip (approved payslips never change, so a second one).
    const emp = await inA((tx) => tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.emp1 } }));
    const off = await inA((tx) =>
      tx.payslip.create({
        data: { organizationId: org.A.id, legalEntityId: ids.entity, employmentId: emp.id, employeeId: ids.emp1, runType: 'offcycle', periodStart: new Date(`${month}-01T00:00:00Z`), calcVersion: 1, status: 'approved', gross: 1000, deductions: 0, net: 1000, employerCost: 1000, ruleVersions: {}, snapshotHash: 'c'.repeat(64), resultHash: 'd'.repeat(64) },
      }),
    );
    expect((await api('payAdmin', 'get', `/payroll/payslips/${off.id}`).expect(200)).body.days).toBeNull();
    // Not published (no run): the employee does not see it yet; another company never.
    await api('emp1', 'get', `/payroll/payslips/${ids.slip}`).expect(404);
    await api('payAdminB', 'get', `/payroll/payslips/${ids.slip}`).expect(404);
  });

  // ------------------------------------------------------------------------------------------ 16 · withdraw own query

  it('16: the employee withdraws their own query with no reply; payroll still answers before closing; never someone else’s', async () => {
    const mk = () => inA((tx) => tx.payslipQuery.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp1, payslipId: ids.slip, text: 'Why is the second unpaid?', raisedBy: users.emp1 } }));
    const q = await mk();
    // Payroll closes only after answering; the employee may withdraw at once.
    expect((await api('payAdmin', 'patch', `/payroll/queries/${q.id}`).send({ status: 'closed' }).expect(409)).body.message).toBe('Reply to the employee before closing the query.');
    await api('emp1', 'patch', `/payroll/queries/${q.id}`).send({ status: 'answered' }).expect(403);
    expect((await api('emp1', 'patch', `/payroll/queries/${q.id}`).send({ status: 'closed' }).expect(200)).body).toMatchObject({ id: q.id, status: 'closed', mine: true });
    await api('emp1', 'patch', `/payroll/queries/${q.id}`).send({ status: 'closed' }).expect(409);
    // An answered query can be withdrawn too.
    const q2 = await mk();
    await api('payAdmin', 'patch', `/payroll/queries/${q2.id}`).send({ reply: 'It was an absence with no leave applied.' }).expect(200);
    expect((await api('emp1', 'patch', `/payroll/queries/${q2.id}`).send({ status: 'closed' }).expect(200)).body.status).toBe('closed');
    // Someone else (another employee of the company, or another company) never reaches it.
    const q3 = await mk();
    await api('approver1', 'patch', `/payroll/queries/${q3.id}`).send({ status: 'closed' }).expect(404);
    await api('payAdminB', 'patch', `/payroll/queries/${q3.id}`).send({ status: 'closed' }).expect(404);
    const logged = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'payslip.query.updated', entityId: q.id } }));
    expect(logged).toBe(1);
  });

  // ------------------------------------------------------------------------------------------ 3 · regime after the cut-off

  it('3: after the cut-off the employee asks HR with a reason; a second ask waits; the approver changes it (audited)', async () => {
    const ws = (await api('emp1', 'get', '/tax/me/workspace').expect(200)).body;
    ids.ws1 = ws.id;
    expect(ws.regimeRequest).toBeNull();
    if (today <= ws.dates.regimeCutoff) {
      expect((await api('emp1', 'post', '/tax/me/regime-request').send({ regime: 'old', reason: 'Home loan taken in August' }).expect(409)).body.message).toMatch(/You can still change your regime yourself/);
      return;
    }
    await api('emp1', 'post', '/tax/me/regime-request').send({ regime: 'old', reason: 'Too short' }).expect(400);
    expect((await api('emp1', 'post', '/tax/me/regime-request').send({ regime: ws.regime, reason: 'Home loan taken in August' }).expect(400)).body.message).toMatch(/already yours/);
    const req = (await api('emp1', 'post', '/tax/me/regime-request').send({ regime: 'old', reason: 'Home loan taken in August' }).expect(201)).body;
    expect(req).toMatchObject({ from: 'new', to: 'old', status: 'pending' });
    expect((await api('emp1', 'post', '/tax/me/regime-request').send({ regime: 'old', reason: 'Asking a second time now' }).expect(409)).body.message).toMatch(/still with HR/);
    expect((await api('emp1', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ regime: 'new', regimeRequest: { id: req.id, status: 'pending' } });
    // Approvers are the holders of tax.regime.override in the entity; the approver of loans alone is not one.
    expect((await inbox('approver1')).some((t) => /Tax regime change/.test(t.title))).toBe(false);
    const task = (await inbox('payAdmin2')).find((t) => /Tax regime change to the old regime/.test(t.title))!;
    expect(task).toBeDefined();
    await api('payAdmin2', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'reject' }).expect(400);
    await api('payAdmin2', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    await api('payAdmin', 'post', `/workflow/approvals/tasks/${(await inbox('payAdmin')).find((t) => t.requestId === task.requestId)?.taskId ?? randomUUID()}/decide`).send({ decision: 'approve' }).expect((res) => expect([404, 409]).toContain(res.status));
    const after = (await api('emp1', 'get', '/tax/me/workspace').expect(200)).body;
    expect(after).toMatchObject({ regime: 'old', regimeOverridden: true, regimeRequest: { id: req.id, status: 'approved' } });
    const logged = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { in: ['tax.regime.requested', 'tax.regime.overridden', 'tax.regime.request_approved'] } }, select: { action: true, actorUserId: true } }));
    expect(logged.map((l) => l.action).sort()).toEqual(['tax.regime.overridden', 'tax.regime.request_approved', 'tax.regime.requested']);
    expect(logged.find((l) => l.action === 'tax.regime.overridden')!.actorUserId).toBe(users.payAdmin2);
    // Asked back and turned down: the regime stays.
    await api('emp1', 'post', '/tax/me/regime-request').send({ regime: 'new', reason: 'Changed my mind about it' }).expect(201);
    const back = (await inbox('payAdmin')).find((t) => /to the new regime/.test(t.title))!;
    await api('payAdmin', 'post', `/workflow/approvals/tasks/${back.taskId}/decide`).send({ decision: 'reject', reason: 'One change a year' }).expect(200);
    expect((await api('emp1', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ regime: 'old', regimeRequest: { status: 'rejected' } });
  });

  it('3: nobody approves their own request; with no other approver it is refused', async () => {
    const ws = (await api('payAdmin', 'get', '/tax/me/workspace').expect(200)).body;
    if (today <= ws.dates.regimeCutoff) return;
    const own = (await api('payAdmin', 'post', '/tax/me/regime-request').send({ regime: 'old', reason: 'Rent receipts arrived late' }).expect(201)).body;
    expect((await inbox('payAdmin')).some((t) => /Tax regime change/.test(t.title))).toBe(false);
    const task = (await inbox('payAdmin2')).find((t) => /Tax regime change/.test(t.title))!;
    await api('payAdmin2', 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision: 'reject', reason: 'Send rent receipts first' }).expect(200);
    expect((await api('payAdmin', 'get', '/tax/me/workspace').expect(200)).body.regimeRequest).toMatchObject({ id: own.id, status: 'rejected' });
    // payAdmin2 away (inactive): only payAdmin holds the key, and it is their own request.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users.payAdmin2 }, data: { status: 'inactive' } }));
    try {
      expect((await api('payAdmin', 'post', '/tax/me/regime-request').send({ regime: 'old', reason: 'Rent receipts are here now' }).expect(400)).body.message).toMatch(/No one can approve this yet/);
    } finally {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users.payAdmin2 }, data: { status: 'active' } }));
    }
    // The database refuses a self-decision even past the service.
    await expect(inA((tx) => tx.taxRegimeRequest.update({ where: { id: own.id }, data: { decidedBy: users.payAdmin } }))).rejects.toThrow(/YX_TAX_SELF_APPROVE/);
  });

  // ------------------------------------------------------------------------------------------ 2 · residential status

  it('2: the status never changes by a direct save; non-resident needs a PDF TRC, its end day and Form 10F', async () => {
    const trcTo = `${Number(today.slice(0, 4)) + 1}-03-31`;
    expect((await api('emp1', 'patch', '/tax/me/workspace').send({ residentialStatus: 'non_resident' }).expect(409)).body.message).toMatch(/once payroll approves/);
    await api('emp1', 'patch', '/tax/me/workspace').send({ dtaaCountry: 'SG' }).expect(409);
    // Saving the same values (other income) still works.
    await api('emp1', 'patch', '/tax/me/workspace').send({ residentialStatus: 'resident', otherIncome: [] }).expect(200);
    expect((await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: trcTo, form10fFiled: 'true' }, null).expect(400)).body.message).toMatch(/Attach your tax residency certificate/);
    expect((await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: trcTo, form10fFiled: 'true' }, Buffer.from('GIF89a not a pdf')).expect(400)).body.message).toMatch(/must be a PDF/);
    expect((await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: trcTo }).expect(400)).body.message).toMatch(/Form 10F/);
    expect((await residency('emp1', { residentialStatus: 'non_resident', form10fFiled: 'true' }).expect(400)).body.message).toMatch(/last day/);
    expect((await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: '2020-03-31', form10fFiled: 'true' }).expect(400)).body.message).toMatch(/ended on 31 Mar 2020/);
    await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: trcTo, form10fFiled: 'true', dtaaCountry: 'sg1' }).expect(400);
    expect((await residency('emp1', { residentialStatus: 'resident' }, null).expect(409)).body.message).toMatch(/already resident/);
    const rq = (await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: trcTo, form10fFiled: 'true', dtaaCountry: 'SG' }).expect(201)).body;
    expect(rq).toMatchObject({ from: 'resident', residentialStatus: 'non_resident', trcValidTo: trcTo, dtaaCountry: 'SG', status: 'pending', file: { name: 'trc.pdf' } });
    expect((await residency('emp1', { residentialStatus: 'non_resident', trcValidTo: trcTo, form10fFiled: 'true' }).expect(409)).body.message).toMatch(/still with payroll/);
    expect((await api('emp1', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ residentialStatus: 'resident', dtaaCountry: null, residencyRequest: { id: rq.id, status: 'pending' } });
    ids.res1 = rq.id;
  });

  it('2: payroll in scope decides in the proof queue; never their own; another company sees nothing', async () => {
    const trcTo = `${Number(today.slice(0, 4)) + 1}-03-31`;
    const own = (await residency('payAdmin', { residentialStatus: 'non_resident', trcValidTo: trcTo, form10fFiled: 'true' }).expect(201)).body;
    const queue = (await api('payAdmin', 'get', '/tax/residency').expect(200)).body as { id: string; employeeName: string }[];
    expect(queue.map((x) => x.id)).toEqual([ids.res1]);
    expect(queue[0].employeeName).toBe(`emp1 ${run}`);
    expect((await api('payAdmin2', 'get', '/tax/residency').expect(200)).body.map((x: { id: string }) => x.id).sort()).toEqual([ids.res1, own.id].sort());
    expect((await api('payAdmin', 'post', `/tax/residency/${own.id}/decision`).send({ decision: 'approve' }).expect(403)).body.message).toBe('Someone else checks your own residential status.');
    await api('payAdminB', 'get', '/tax/residency').expect(200).expect((r) => expect(r.body).toEqual([]));
    await api('payAdminB', 'post', `/tax/residency/${ids.res1}/decision`).send({ decision: 'approve' }).expect(404);
    await api('emp1', 'get', '/tax/residency').expect(403);
    await api('emp1', 'post', `/tax/residency/${ids.res1}/decision`).send({ decision: 'approve' }).expect(403);
    const file = await api('payAdmin', 'get', `/tax/residency/${ids.res1}/file`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((file.body as Buffer).equals(PDF)).toBe(true);
    expect((await api('payAdmin', 'post', `/tax/residency/${ids.res1}/decision`).send({ decision: 'reject' }).expect(400)).body.message).toMatch(/Say why/);
    await api('payAdmin', 'post', `/tax/residency/${ids.res1}/decision`).send({ decision: 'approve' }).expect(200);
    await api('payAdmin2', 'post', `/tax/residency/${ids.res1}/decision`).send({ decision: 'reject', comment: 'Too late' }).expect(409);
    expect((await api('emp1', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ residentialStatus: 'non_resident', trcValidTo: trcTo, residencyRequest: { status: 'approved' } });
    await api('payAdmin2', 'post', `/tax/residency/${own.id}/decision`).send({ decision: 'reject', comment: 'The TRC is not signed' }).expect(200);
    expect((await api('payAdmin', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ residentialStatus: 'resident', residencyRequest: { status: 'rejected', comment: 'The TRC is not signed' } });
    // Back to resident needs no certificate, and still waits for payroll.
    expect((await residency('emp1', { residentialStatus: 'resident' }, null).expect(201)).body).toMatchObject({ from: 'non_resident', residentialStatus: 'resident', file: null, status: 'pending' });
    // The database refuses a self-verification even past the service.
    await expect(inA((tx) => tx.taxResidencyRequest.update({ where: { id: own.id }, data: { verifierId: users.payAdmin } }))).rejects.toThrow(/YX_TAX_SELF_VERIFY/);
  });

  // ------------------------------------------------------------------------------------------ PAY-22 NoPan · the PAN link

  it('PAY-22 NoPan: the PAN link confirmation goes to the proof queue; checked by someone else; approved, the PAN works again', async () => {
    const send = (who: Who, file: Buffer | null, name = 'pan-link.pdf') => {
      const r = api(who, 'post', '/tax/me/pan-link');
      return file ? r.attach('file', file, name) : r;
    };
    const LINK = Buffer.from('%PDF-1.4 PAN Aadhaar link confirmation');
    // Nothing to send while payroll has not recorded the PAN as inoperative.
    expect((await send('emp1', LINK).expect(409)).body.message).toMatch(/not recorded your PAN as inoperative/);
    const ws1 = (await api('emp1', 'get', '/tax/me/workspace').expect(200)).body.id;
    await api('payAdmin', 'post', `/tax/workspaces/${ws1}/pan-status`).send({ status: 'inoperative', reason: 'Not linked with Aadhaar' }).expect(200);
    expect((await send('emp1', null).expect(400)).body.message).toMatch(/Attach the link confirmation/);
    await send('emp1', Buffer.from('GIF89a not a pdf'), 'pan-link.pdf').expect(400);
    await send('emp1', Buffer.from('<html><script>x</script></html>'), 'pan-link.pdf').expect(400);
    await send('emp1', Buffer.alloc(5 * 1024 * 1024 + 10, 1), 'pan-link.pdf').expect((r) => expect([400, 413]).toContain(r.status));
    const rq = (await send('emp1', LINK).expect(201)).body;
    expect(rq).toMatchObject({ status: 'pending', file: { name: 'pan-link.pdf', type: 'application/pdf' } });
    expect((await send('emp1', LINK).expect(409)).body.message).toMatch(/still with payroll/);
    expect((await api('emp1', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ panStatus: 'inoperative', panLinkRequest: { id: rq.id, status: 'pending' } });

    // payAdmin's own: never in their queue, never decided by them (and the database refuses it too).
    const wsP = (await api('payAdmin', 'get', '/tax/me/workspace').expect(200)).body;
    await api('payAdmin2', 'post', `/tax/workspaces/${wsP.id}/pan-status`).send({ status: 'inoperative', reason: 'Not linked with Aadhaar' }).expect(200);
    const own = (await send('payAdmin', LINK).expect(201)).body;
    expect(((await api('payAdmin', 'get', '/tax/pan-links').expect(200)).body as { id: string }[]).map((x) => x.id)).toEqual([rq.id]);
    expect((await api('payAdmin', 'post', `/tax/pan-links/${own.id}/decision`).send({ decision: 'approve' }).expect(403)).body.message).toBe('Someone else checks your own PAN.');
    await api('payAdmin', 'get', `/tax/pan-links/${own.id}/file`).expect(403);
    await expect(inA((tx) => tx.taxPanLinkRequest.update({ where: { id: own.id }, data: { verifierId: users.payAdmin } }))).rejects.toThrow(/YX_TAX_SELF_VERIFY/);

    // Not payroll, or another company: nothing.
    await api('emp1', 'get', '/tax/pan-links').expect(403);
    await api('emp1', 'post', `/tax/pan-links/${rq.id}/decision`).send({ decision: 'approve' }).expect(403);
    await api('payAdminB', 'get', '/tax/pan-links').expect(200).expect((r) => expect(r.body).toEqual([]));
    await api('payAdminB', 'post', `/tax/pan-links/${rq.id}/decision`).send({ decision: 'approve' }).expect(404);
    await api('payAdminB', 'get', `/tax/pan-links/${rq.id}/file`).expect(404);

    // The file opens once the virus scan has passed (fail closed until then).
    let file: request.Response | null = null;
    for (let i = 0; i < 40 && file?.status !== 200; i++) {
      file = await api('payAdmin', 'get', `/tax/pan-links/${rq.id}/file`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      if (file.status !== 200) await new Promise((ok) => setTimeout(ok, 250));
    }
    expect(file?.status).toBe(200);
    expect((file!.body as Buffer).equals(LINK)).toBe(true);

    await api('payAdmin', 'post', `/tax/pan-links/${rq.id}/decision`).send({ decision: 'maybe' }).expect(400);
    expect((await api('payAdmin', 'post', `/tax/pan-links/${rq.id}/decision`).send({ decision: 'reject' }).expect(400)).body.message).toMatch(/Say why/);
    await api('payAdmin', 'post', `/tax/pan-links/${rq.id}/decision`).send({ decision: 'approve' }).expect(200);
    await api('payAdmin2', 'post', `/tax/pan-links/${rq.id}/decision`).send({ decision: 'reject', comment: 'Too late' }).expect(409);
    expect((await api('emp1', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ panStatus: 'operative', panLinkRequest: { status: 'approved' } });
    expect((await api('payAdmin', 'get', '/tax/pan-links?status=approved').expect(200)).body).toEqual([expect.objectContaining({ id: rq.id, employeeId: expect.any(String) })]);
    // A refusal says why; the person sends again.
    await api('payAdmin2', 'post', `/tax/pan-links/${own.id}/decision`).send({ decision: 'reject', comment: 'The confirmation is for another PAN' }).expect(200);
    expect((await api('payAdmin', 'get', '/tax/me/workspace').expect(200)).body).toMatchObject({ panStatus: 'inoperative', panLinkRequest: { status: 'rejected', comment: 'The confirmation is for another PAN' } });
    await send('payAdmin', LINK).expect(201);
    const logged = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, entityId: rq.id }, select: { action: true } }));
    expect(logged.map((l) => l.action).sort()).toEqual(['tax.pan_link.requested', 'tax.pan_link.verified', 'tax.pan_link.viewed']);
  });
});
