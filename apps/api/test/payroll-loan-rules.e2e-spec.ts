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
import { inr } from '../src/payroll/fnf.service';
import { dayMonYear } from '../src/payroll/loan-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';
import { payrollSettingsApplyAtOnce } from './fixtures/payroll-second-person';

// Founder decision 8 end to end against the real database: a loan or advance is at most the company's months of gross
// pay (default 2) less what the person still owes, and only after probation unless HR allows everyone. Both settings are
// HR's (org.settings.manage) per company and legal entity; enforced for a request for yourself and on someone's behalf.
describe('Payroll loan rules (founder decision 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'confirmed' | 'onProbation' | 'noPay' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const D = (x: string) => new Prisma.Decimal(x);
  const ask = (who: Who, principal: string, employeeId?: string) =>
    api(who, 'post', '/payroll/loans').send({ ...(employeeId ? { employeeId } : {}), loanType: 'advance', principal, instalments: 6, firstMonth: '2099-01', reason: 'Family wedding' });
  const setting = (who: 'adminA' | 'adminB', key: string, value: string, scopeId?: string) =>
    api(who, 'put', '/org/settings')
      .send({ key, value, scopeType: scopeId ? 'legal_entity' : 'tenant', ...(scopeId ? { scopeId } : {}) })
      .expect(200);

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
    planId = (await prisma.plan.create({ data: { name: `payloan-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayLoan Org ${k}`, slug: `payloan-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // As in the other pay tests: the payroll fixture also plays the HR person who sets pay, the approver the HR approver.
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['confirmed', 'A', 'panel', null],
      ['onProbation', 'A', 'panel', null],
      ['noPay', 'A', 'panel', null],
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
          tx.user.create({ data: { organizationId: o, email: `${who.toLowerCase()}@payloan-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who.toLowerCase()}@payloan-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'PayLoan Mills', shortName: `PLN-${run}`, isDefault: true } })).id;
      ids.loc = (
        await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })
      ).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string, status: 'confirmed' | 'probation') =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({
            legalEntityId: ids.entity,
            status,
            reason: 'Joined',
            givenName: who,
            familyName: run,
            employeeCode: code,
            joinedOn: first,
            userId: users[who],
            workEmail: `${who.toLowerCase()}@payloan-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.confirmed = await hire('confirmed', 'PLN-001', 'confirmed');
    ids.onProbation = await hire('onProbation', 'PLN-002', 'probation');
    ids.noPay = await hire('noPay', 'PLN-003', 'confirmed');
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    for (const emp of [ids.confirmed, ids.onProbation]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: '600000', reason: 'Joining salary' })
          .expect(201)
      ).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
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

  it('rules for a confirmed employee: 2 months of gross pay by default, nothing owed yet', async () => {
    const r = (await api('confirmed', 'get', '/payroll/loans/rules').expect(200)).body;
    expect(D(r.monthlyGross).gt(0)).toBe(true);
    expect(r).toEqual({
      eligible: true,
      reason: null,
      probationEndsOn: null,
      monthlyGross: r.monthlyGross,
      maxGrossMonths: 2,
      limit: D(r.monthlyGross).mul(2).toFixed(2),
      outstanding: '0.00',
      available: D(r.monthlyGross).mul(2).toFixed(2),
      interestRate: { advance: '0', loan: '0' },
    });
    ids.gross = r.monthlyGross;
    // Someone with no employee record never asks for themselves.
    expect((await api('payAdmin', 'get', '/payroll/loans/rules').expect(403)).body.message).toBe('Only employees request loans for themselves.');
  });

  it('another company’s settings change nothing here', async () => {
    await setting('adminB', 'payroll.loan.after_probation', 'everyone');
    await setting('adminB', 'payroll.loan.max_gross_months', 'none');
    expect((await api('confirmed', 'get', '/payroll/loans/rules').expect(200)).body.maxGrossMonths).toBe(2);
    expect((await api('onProbation', 'get', '/payroll/loans/rules').expect(200)).body.eligible).toBe(false);
    // Nor does another company's payroll reach this person.
    await ask('payAdminB', '1000', ids.confirmed).expect(404);
  });

  it('probation: refused for yourself and on someone’s behalf, with the end date; HR allowing everyone lets it through', async () => {
    const r = (await api('onProbation', 'get', '/payroll/loans/rules').expect(200)).body;
    expect(r.probationEndsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const until = dayMonYear(r.probationEndsOn);
    const self = `You can ask for a loan or advance after your probation is confirmed. Your probation ends on ${until}.`;
    expect(r).toMatchObject({ eligible: false, reason: self, maxGrossMonths: 2, outstanding: '0.00' });
    expect((await ask('onProbation', '1000').expect(403)).body.message).toBe(self);
    expect((await ask('payAdmin', '1000', ids.onProbation).expect(403)).body.message).toBe(`onProbation is on probation until ${until}. The company allows loans only after probation.`);
    // Only HR changes the rule.
    await api('payAdmin', 'put', '/org/settings').send({ key: 'payroll.loan.after_probation', scopeType: 'tenant', value: 'everyone' }).expect(403);
    await setting('adminA', 'payroll.loan.after_probation', 'everyone');
    expect((await api('onProbation', 'get', '/payroll/loans/rules').expect(200)).body).toMatchObject({ eligible: true, reason: null, probationEndsOn: r.probationEndsOn });
    expect((await ask('onProbation', '1000').expect(201)).body.status).toBe('requested');
    await ask('payAdmin', '1000', ids.onProbation).expect(201);
  });

  it('no pay in force: refused, the person named when asked on their behalf', async () => {
    const r = (await api('noPay', 'get', '/payroll/loans/rules').expect(200)).body;
    const msg = "Your pay is not set up yet, so the loan limit can't be worked out. Ask HR.";
    expect(r).toEqual({ eligible: false, reason: msg, probationEndsOn: null, monthlyGross: null, maxGrossMonths: 2, limit: '0.00', outstanding: '0.00', available: '0.00', interestRate: { advance: '0', loan: '0' } });
    expect((await ask('noPay', '1').expect(400)).body.message).toBe(msg);
    expect((await ask('payAdmin', '1', ids.noPay).expect(400)).body.message).toBe("noPay's pay is not set up yet, so the loan limit can't be worked out. Ask HR.");
  });

  it('the limit: a paisa over is refused, exactly at it passes, and open loans count against it', async () => {
    const limit = D(ids.gross).mul(2);
    expect((await ask('confirmed', limit.add('0.01').toFixed(2)).expect(400)).body.message).toBe(`The most you can ask for is ${inr(limit)}: 2 months' gross pay.`);
    await ask('confirmed', '10000.00').expect(201);
    const r = (await api('confirmed', 'get', '/payroll/loans/rules').expect(200)).body;
    const left = limit.sub(10000);
    expect(r).toMatchObject({ outstanding: '10000.00', limit: limit.toFixed(2), available: left.toFixed(2) });
    expect((await ask('confirmed', left.add('0.01').toFixed(2)).expect(400)).body.message).toBe(`The most you can ask for is ${inr(left)}: 2 months' gross pay, less ₹10,000.00 still to repay.`);
    // Payroll asking on the person's behalf meets the same limit.
    expect((await ask('payAdmin', left.add('0.01').toFixed(2), ids.confirmed).expect(400)).body.message).toMatch(/^The most you can ask for is/);
    await ask('confirmed', left.toFixed(2)).expect(201);
    expect((await api('confirmed', 'get', '/payroll/loans/rules').expect(200)).body).toMatchObject({ outstanding: limit.toFixed(2), available: '0.00' });
    await ask('confirmed', '0.01').expect(400);
  });

  it("the entity's setting beats the company's; 'none' is no limit", async () => {
    await setting('adminA', 'payroll.loan.max_gross_months', '1');
    await setting('adminA', 'payroll.loan.max_gross_months', '4', ids.entity);
    const r = (await api('confirmed', 'get', '/payroll/loans/rules').expect(200)).body;
    expect(r).toMatchObject({ maxGrossMonths: 4, limit: D(ids.gross).mul(4).toFixed(2), available: D(ids.gross).mul(2).toFixed(2) });
    await setting('adminA', 'payroll.loan.max_gross_months', 'none', ids.entity);
    expect((await api('confirmed', 'get', '/payroll/loans/rules').expect(200)).body).toMatchObject({ eligible: true, maxGrossMonths: null, limit: null, available: null });
    await ask('confirmed', '5000000').expect(201);
    // 'none' needs no pay to work a limit out.
    await ask('payAdmin', '1000', ids.noPay).expect(201);
  });
});
