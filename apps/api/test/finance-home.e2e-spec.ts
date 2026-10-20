import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';

// Finance Home (PLT-02 finance, 20 Oct 2026): GET /workspace/home carries the payroll runs, claims to pay and statutory
// dues only for someone holding the key of the page each comes from, inside their own company, with the amounts as
// stored; someone with no such key gets no finance part at all.
describe('Finance home (PLT-02 finance)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const month = today.slice(0, 7);
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const monthEnd = (m: string) => addDays(addDays(`${m}-01`, 32).slice(0, 7) + '-01', -1);
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'adminA' | 'payA' | 'approverA' | 'plainA' | 'payB';
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@fin.test`;
  const home = async (who: Who, query = '') => (await request(server()).get(`/api/v1/workspace/home?month=${month}${query}`).set('Authorization', `Bearer ${token[who]}`).expect(200)).body;
  const PAY = ['payroll.run.view', 'payroll.run.prepare', 'statutory.filing.view', 'expense.payout.manage'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `fin-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Fin ${k}`, slug: `fin-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      await tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${k}`, shortName: `F${k}${runId}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        await tx.department.create({ data: { ...o, id, name: 'Ops', code: 'OPS', path: `/${id}/` } });
        ids[`dept${k}`] = id;
        ids[`des${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`type${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['payA', 'A', 'panel', PAY],
      ['approverA', 'A', 'panel', ['payroll.run.approve']],
      ['plainA', 'A', 'panel', null],
      ['payB', 'B', 'panel', PAY],
    ];
    for (const [name, k, role, keys] of roster) {
      const permissionProfileId = keys ? (await tenantPrisma.forTenant(ctx(k), (tx) => tx.permissionProfile.create({ data: { organizationId: org[k].id, name: `${name}-${runId}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), name: `${name} Person`, passwordHash, role, permissionProfileId } }))).id;
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.ravi = (
      await request(server())
        .post('/api/v1/people/employees')
        .set('Authorization', `Bearer ${token.adminA}`)
        .send({
          legalEntityId: ids.leA,
          status: 'confirmed',
          reason: 'Joined',
          overrideReason: 'Joined before go-live',
          joinedOn: addDays(today, -400),
          givenName: 'Ravi',
          familyName: 'Test',
          workEmail: `ravi-${runId}@fin.test`,
          assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desA, employmentTypeId: ids.typeA, managerEmployeeId: null },
        })
        .expect(201)
    ).body.id;

    // Company A's payroll, as the run pages and the statutory hub store it: last month paid, this month waiting for
    // the approver; approved payslips with PF, ESI and TDS; claims approved and a payout file someone else made.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leA}}`}, true)`;
      const o = { organizationId: org.A.id, legalEntityId: ids.leA };
      const employmentId = (await tx.employment.findFirstOrThrow({ where: { employeeId: ids.ravi } })).id;
      const group = await tx.payGroup.create({ data: { ...o, name: 'Monthly', payDay: 0 } });
      const person = (await tx.employee.findFirstOrThrow({ where: { id: ids.ravi }, select: { personId: true } })).personId;
      const wf = await tx.wfRequest.create({ data: { organizationId: org.A.id, requestType: 'payroll.run', subjectType: 'employee', subjectId: ids.ravi, subjectPersonId: person, title: `Payroll for ${month}`, steps: [{ name: 'Approve', approverIds: [users.approverA], need: 1, state: 'waiting' }], requesterUserId: users.payA, status: 'pending', currentStep: 0 } });
      await tx.wfTask.create({ data: { organizationId: org.A.id, requestId: wf.id, step: 0, assigneeUserId: users.approverA, status: 'open' } });
      ids.wf = wf.id;
      for (const [m, status, net] of [[lastMonth, 'paid', '17985200.00'], [month, 'submitted', '18240500.00']] as const) {
        const run = await tx.payrollRun.create({ data: { ...o, payGroupId: group.id, periodStart: new Date(`${m}-01T00:00:00Z`), periodEnd: new Date(`${monthEnd(m)}T00:00:00Z`), status, preparedBy: users.payA, totals: { people: 248, net, gross: net }, ...(m === month ? { wfRequestId: wf.id } : {}) } });
        ids[`run-${m}`] = run.id;
        const slip = await tx.payslip.create({ data: { ...o, employmentId, employeeId: ids.ravi, runId: run.id, periodStart: new Date(`${m}-01T00:00:00Z`), calcVersion: 1, gross: 100000, deductions: 10000, net: 90000, employerCost: 110000, ruleVersions: {}, snapshotHash: 'a'.repeat(64), resultHash: 'b'.repeat(64), status: 'approved' } });
        const lines: [string, string, number][] = [['pf_employee', 'deduction', m === month ? 1800 : 1700], ['pf_employer', 'employer', 1800], ['esi_employee', 'deduction', 750], ['esi_employer', 'employer', 3250], ['tds', 'deduction', m === month ? 5200 : 5000]];
        await tx.payslipLine.createMany({ data: lines.map(([code, kind, amount], i) => ({ ...o, employeeId: ids.ravi, payslipId: slip.id, position: i, componentCode: code, name: code, kind, amount, explanation: 'Test line' })) });
      }
      await tx.expenseClaim.createMany({
        data: [
          { ...o, employeeId: ids.ravi, employmentId, title: 'Hotel stay', currency: 'INR', status: 'approved', paymentStatus: 'approved_unpaid', approvedTotal: 18200, netPayable: 18200 },
          { ...o, employeeId: ids.ravi, employmentId, title: 'Taxi', currency: 'INR', status: 'approved', paymentStatus: 'payment_failed', approvedTotal: 650.5, netPayable: 650.5 },
          { ...o, employeeId: ids.ravi, employmentId, title: 'Paid already', currency: 'INR', status: 'approved', paymentStatus: 'paid', approvedTotal: 999, netPayable: 999 },
        ],
      });
      await tx.expensePayoutBatch.create({ data: { ...o, formatKey: 'GENERIC', formatVersion: '1', fileName: `expenses-${addDays(today, 2)}.txt`, contentType: 'text/plain', fileEnc: 'x', sha256: 'c'.repeat(64), total: 4200, rowCount: 3, claimIds: [], generatedBy: users.approverA } });
    });
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('gives the payroll person the runs, claims to pay and statutory dues with the amounts as stored', async () => {
    const f = (await home('payA')).finance;
    const now = f.runs.find((r: { month: string }) => r.month === month);
    expect(now).toMatchObject({ id: ids[`run-${month}`], status: 'submitted', people: 248, net: '18240500.00', payOn: monthEnd(month), preparedBy: 'payA Person', preparedByMe: true, approveNow: false });
    expect(f.runs.find((r: { month: string }) => r.month === lastMonth)).toMatchObject({ status: 'paid', net: '17985200.00' });
    // A paid claim is not to pay; a failed one is.
    expect(f.claims).toMatchObject({ count: 2, amount: '18850.50', batches: [{ rows: 3, total: '4200.00', payOn: addDays(today, 2), madeBy: 'approverA Person', madeByMe: false }] });
    const dues = f.dues.find((d: { month: string }) => d.month === month);
    const amount = (s: string) => dues.cards.find((c: { statute: string }) => c.statute === s).amount;
    expect([amount('IN.PF'), amount('IN.ESI'), dues.tds.amount]).toEqual(['3600.00', '4000.00', '5200.00']);
    expect(dues.cards.find((c: { statute: string }) => c.statute === 'IN.PF')).toMatchObject({ status: 'not_generated', dueOn: expect.stringMatching(/-15$/) });
    expect(f.dues.find((d: { month: string }) => d.month === lastMonth).tds.amount).toBe('5000.00');
  });

  it('marks the run the approver decides now, and gives them nothing their keys do not reach', async () => {
    const f = (await home('approverA')).finance;
    expect(f.runs.find((r: { month: string }) => r.month === month)).toMatchObject({ approveNow: true, requestId: ids.wf, preparedBy: 'payA Person', preparedByMe: false });
    expect(f.claims).toBeUndefined();
    expect(f.dues).toBeUndefined();
  });

  it('gives no finance part to someone with no pay, payout or statutory key', async () => {
    expect((await home('plainA')).finance).toBeUndefined();
    expect((await home('adminA')).finance?.runs).toBeUndefined();
  });

  it("never shows another company's runs, claims or dues", async () => {
    const body = await home('payB');
    expect(body.finance.runs).toEqual([]);
    expect(body.finance.claims).toMatchObject({ count: 0, amount: '0.00', batches: [] });
    expect(body.finance.dues.every((d: { entityId: string }) => d.entityId === ids.leB)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/18240500|18850|Ravi|payA Person/);
    // Asking for company A's entity by id shows nothing of it either.
    const other = (await home('payB', `&legalEntityId=${ids.leA}`)).finance;
    expect([other.runs, other.claims.count, other.dues]).toEqual([[], 0, []]);
  });
});
