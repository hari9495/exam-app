import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { entitledMonths, flexYearOf } from '../src/payroll/flex';
import * as orgValidation from '../src/org-structure/org-validation';
import { freezeSettlementIn } from '../src/lifecycle/settlement';
import { FnfService } from '../src/payroll/fnf.service';
import type { CompanyContext } from '../src/org-structure/org-structure.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// B8/E5 (founder answers 2406, 2407) end to end against the real database: the company's flexible components on Settings
// 4.11 (benefits.settings.manage; audited; bad input saves nothing; another company sees nothing), the unclaimed-balance
// setting, the person's own ledger, a claim in the linked expense category held to the balance, and the March
// settlement paid as taxable one-time pay (once; payroll.input.manage in scope; never another company).
describe('Flexible benefits (B8/E5)', () => {
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
  type Who = 'adminA' | 'adminB' | 'hrNoKey' | 'payAdmin' | 'payAdminB' | 'emp1' | 'hrEntity' | 'hrTenant';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const year = flexYearOf(today.slice(0, 7));
  const march = `${Number(year.slice(0, 4)) + 1}-03`;
  const joined = `${year.slice(0, 4)}-04-06`;
  const months = entitledMonths(year, joined, null, today.slice(0, 7));
  const phone = { code: 'phone', name: 'Phone and internet', monthlyAmount: '1500', taxableIfUnclaimed: true, expenseCategoryCode: 'phone_internet' };

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
    planId = (await prisma.plan.create({ data: { name: `flex-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Flex Org ${k}`, slug: `flex-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrNoKey', 'A', 'panel', ['org.structure.view']],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
      ['emp1', 'A', 'panel', null],
      // HR Admin granted for one legal entity (how the template is usually granted), and one granted company-wide.
      ['hrEntity', 'A', 'panel', null],
      ['hrTenant', 'A', 'panel', ['benefits.settings.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys
        ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id
        : null;
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: o, email: `${who.toLowerCase()}@flex-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who.toLowerCase()}@flex-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Flex Mills', shortName: `FLX-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      const hr = await tx.permissionProfile.create({ data: { ...o, name: `hr-entity-${run}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.hrEntity, permissionProfileId: hr.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'HR for Flex Mills' } });
    });
    ids.emp1 = (
      await api('adminA', 'post', '/people/employees')
        .send({
          legalEntityId: ids.entity,
          status: 'confirmed',
          reason: 'Joined',
          givenName: 'emp1',
          familyName: run,
          employeeCode: 'FLX-001',
          joinedOn: joined,
          userId: users.emp1,
          workEmail: `emp1@flex-${run}.test`,
          assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
        })
        .expect(201)
    ).body.id;
    await api('adminA', 'post', '/expenses/setup/from-starter').expect(201);
    await api('adminB', 'post', '/expenses/setup/from-starter').expect(201);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        // As the expense suites: the starter policy rules keep their categories, so an organisation may stay behind.
        for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('both tables have forced RLS with tenant isolation and the support exclusion; settlements also the pay guard', async () => {
    const rows = await prisma.$queryRaw<{ t: string; pols: string }[]>`
      SELECT c.relname AS t, (SELECT string_agg(polname, ',' ORDER BY polname) FROM pg_policy p WHERE p.polrelid = c.oid) AS pols
      FROM pg_class c WHERE c.relname IN ('flex_components', 'flex_settlements') AND c.relrowsecurity AND c.relforcerowsecurity ORDER BY c.relname`;
    expect(rows).toEqual([
      { t: 'flex_components', pols: 'support_session_excluded,tenant_isolation' },
      { t: 'flex_settlements', pols: 'pay_guard,support_session_excluded,tenant_isolation' },
    ]);
  });

  it('Settings 4.11: negatives first: no key 403, bad input 400, unknown category 400; nothing saved', async () => {
    await api('hrNoKey', 'get', '/benefits/flex/settings').expect(403);
    await api('hrNoKey', 'post', '/benefits/flex/components').send(phone).expect(403);
    await api('emp1', 'post', '/benefits/flex/components').send(phone).expect(403);
    for (const bad of [
      { ...phone, monthlyAmount: '0' },
      { ...phone, monthlyAmount: '1000000.01' },
      { ...phone, monthlyAmount: '-5' },
      { ...phone, monthlyAmount: '1500.001' },
      { ...phone, code: 'Phone!' },
      { ...phone, name: '' },
      { ...phone, taxableIfUnclaimed: 'yes' },
      { ...phone, extra: 1 },
    ])
      await api('adminA', 'post', '/benefits/flex/components').send(bad).expect(400);
    expect((await api('adminA', 'post', '/benefits/flex/components').send({ ...phone, expenseCategoryCode: 'no_such' }).expect(400)).body.message).toBe('Choose an active expense category.');
    expect((await api('adminA', 'get', '/benefits/flex/settings').expect(200)).body).toMatchObject({ components: [], unclaimed: 'pay', lastChange: null });
  });

  it('adds and changes components; one category per component; a stale version is refused; audited before and after', async () => {
    const p = (await api('adminA', 'post', '/benefits/flex/components').send(phone).expect(201)).body;
    expect(p).toMatchObject({ code: 'phone', monthlyAmount: '1500.00', taxableIfUnclaimed: true, expenseCategoryCode: 'phone_internet', active: true, version: 1 });
    ids.phone = p.id;
    expect((await api('adminA', 'post', '/benefits/flex/components').send(phone).expect(409)).body.message).toBe('A flexible component with that code already exists.');
    expect((await api('adminA', 'post', '/benefits/flex/components').send({ ...phone, code: 'phone2' }).expect(409)).body.message).toBe('That expense category is already linked to Phone and internet.');
    const books = (await api('adminA', 'post', '/benefits/flex/components').send({ code: 'books', name: 'Books and periodicals', monthlyAmount: '1000', taxableIfUnclaimed: false, expenseCategoryCode: null }).expect(201)).body;
    const changed = (await api('adminA', 'put', `/benefits/flex/components/${books.id}`).send({ code: 'books', name: 'Books', monthlyAmount: '1000.50', taxableIfUnclaimed: false, expenseCategoryCode: null, active: false, version: 1 }).expect(200)).body;
    expect(changed).toMatchObject({ name: 'Books', monthlyAmount: '1000.50', active: false, version: 2 });
    expect((await api('adminA', 'put', `/benefits/flex/components/${books.id}`).send({ code: 'books', name: 'Again', monthlyAmount: '1', taxableIfUnclaimed: false, active: true, version: 1 }).expect(409)).body.message).toBe('Someone else changed this component. Reload it.');
    await api('adminA', 'put', `/benefits/flex/components/${books.id}`).send({ code: 'novels', name: 'Books', monthlyAmount: '1', taxableIfUnclaimed: false, active: true, version: 2 }).expect(400);
    await api('adminB', 'put', `/benefits/flex/components/${books.id}`).send({ code: 'books', name: 'Theirs', monthlyAmount: '1', taxableIfUnclaimed: false, active: true, version: 2 }).expect(404);
    expect((await api('adminB', 'get', '/benefits/flex/settings').expect(200)).body.components).toEqual([]);
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { action: { startsWith: 'benefits.flex.' } }, orderBy: { createdAt: 'asc' } }));
    expect(audits.map((a) => a.action)).toEqual(['benefits.flex.component_added', 'benefits.flex.component_added', 'benefits.flex.component_changed']);
    expect(JSON.parse(audits[2].metadataJson ?? '{}')).toMatchObject({ before: { name: 'Books and periodicals', active: true, monthlyAmount: '1000.00' }, after: { name: 'Books', active: false, monthlyAmount: '1000.50' } });
    expect((await api('adminA', 'get', '/benefits/flex/settings').expect(200)).body.lastChange).toMatchObject({ what: 'Changed a flexible component' });
  });

  it('HR Admin granted for one legal entity reads Settings 4.11 but cannot change the company list; a company-wide grant can', async () => {
    expect((await api('hrEntity', 'get', '/benefits/flex/settings').expect(200)).body.components.map((x: { code: string }) => x.code)).toContain('phone');
    const meal = { code: 'meal', name: 'Meal card', monthlyAmount: '2200', taxableIfUnclaimed: true, expenseCategoryCode: null };
    expect((await api('hrEntity', 'post', '/benefits/flex/components').send(meal).expect(403)).body.message).toMatch(/for the whole company/);
    await api('hrEntity', 'put', `/benefits/flex/components/${ids.phone}`).send({ ...phone, active: true, version: 1 }).expect(403);
    await api('hrEntity', 'put', '/org/settings').send({ key: 'benefits.fbp.unclaimed', scopeType: 'tenant', value: 'carry' }).expect(403);
    expect((await api('adminA', 'get', '/benefits/flex/settings').expect(200)).body).toMatchObject({ unclaimed: 'pay' });
    expect((await api('adminA', 'get', '/benefits/flex/settings').expect(200)).body.components.map((x: { code: string }) => x.code)).not.toContain('meal');
    // The company-wide grant adds it; another company never sees it.
    expect((await api('hrTenant', 'post', '/benefits/flex/components').send(meal).expect(201)).body).toMatchObject({ code: 'meal', active: true });
    expect((await api('adminB', 'get', '/benefits/flex/settings').expect(200)).body.components).toEqual([]);
    const m = (await api('adminA', 'get', '/benefits/flex/settings').expect(200)).body.components.find((x: { code: string }) => x.code === 'meal');
    await api('hrTenant', 'put', `/benefits/flex/components/${m.id}`).send({ ...meal, active: false, version: m.version }).expect(200);
  });

  it('the unclaimed rule is a company setting: pay by default, carry on HR’s say; others refused', async () => {
    await api('hrNoKey', 'put', '/org/settings').send({ key: 'benefits.fbp.unclaimed', scopeType: 'tenant', value: 'carry' }).expect(403);
    await api('adminA', 'put', '/org/settings').send({ key: 'benefits.fbp.unclaimed', scopeType: 'tenant', value: 'later' }).expect(400);
    await api('adminA', 'put', '/org/settings').send({ key: 'benefits.fbp.unclaimed', scopeType: 'tenant', value: 'carry' }).expect(200);
    expect((await api('adminA', 'get', '/benefits/flex/settings').expect(200)).body.unclaimed).toBe('carry');
    expect((await api('adminB', 'get', '/benefits/flex/settings').expect(200)).body.unclaimed).toBe('pay');
    await api('adminA', 'put', '/org/settings').send({ key: 'benefits.fbp.unclaimed', scopeType: 'tenant', value: 'pay' }).expect(200);
  });

  it('the person’s own ledger: 1,500 a month for each month employed so far; a switched-off component is left out', async () => {
    const me = (await api('emp1', 'get', '/benefits/flex/me').expect(200)).body;
    expect(me.taxYear).toBe(year);
    expect(me.rows).toEqual([expect.objectContaining({ code: 'phone', months, entitled: (1500 * months).toFixed(2), carriedIn: '0.00', claimed: '0.00', pending: '0.00', available: (1500 * months).toFixed(2), settlement: null })]);
    // Payroll in scope sees it; another company's payroll, or someone without the key, does not.
    expect((await api('payAdmin', 'get', `/benefits/flex/ledger/${ids.emp1}`).expect(200)).body.rows).toHaveLength(1);
    await api('payAdminB', 'get', `/benefits/flex/ledger/${ids.emp1}`).expect(404);
    await api('emp1', 'get', `/benefits/flex/ledger/${ids.emp1}`).expect(403);
    await api('payAdmin', 'get', '/benefits/flex/me').expect(403);
    await api('payAdmin', 'get', `/benefits/flex/ledger/${ids.emp1}?taxYear=26-27`).expect(400);
  });

  it('a claim in the linked category is held to the balance: a paisa over blocks, exactly the balance passes', async () => {
    const c = (await api('emp1', 'post', '/expenses/claims').send({ title: 'Phone bills' }).expect(201)).body;
    const spentOn = new Date(Date.now() + 330 * 60_000 - 2 * 86_400_000).toISOString().slice(0, 10);
    const balance = (1500 * months).toFixed(2);
    const over = (1500 * months + 0.01).toFixed(2);
    const added = (await api('emp1', 'post', `/expenses/claims/${c.id}/lines`).send({ payMode: 'personal', spentOn, categoryCode: 'phone_internet', merchant: 'Telco', amount: over, selfDeclared: true }).expect(201)).body;
    const msg = `Line 1: your Phone and internet balance for ${year} is ₹${balance}; claim at most that.`;
    expect(((await api('emp1', 'post', `/expenses/claims/${c.id}/check`).expect(200)).body.blockers as { text: string }[]).map((b) => b.text)).toContain(msg);
    const line = added.lines[0];
    await api('emp1', 'put', `/expenses/claims/${c.id}/lines/${line.id}`).send({ payMode: 'personal', spentOn, categoryCode: 'phone_internet', merchant: 'Telco', amount: balance, selfDeclared: true, version: line.version }).expect(200);
    expect(((await api('emp1', 'post', `/expenses/claims/${c.id}/check`).expect(200)).body.blockers as { text: string }[]).map((b) => b.text).filter((t) => /balance/.test(t))).toEqual([]);
  });

  it('answer 2460: the exit settlement starts by itself when F&F is handed off; once; another company sees nothing', async () => {
    const emp2 = (
      await api('adminA', 'post', '/people/employees')
        .send({
          legalEntityId: ids.entity,
          status: 'confirmed',
          reason: 'Joined',
          givenName: 'emp2',
          familyName: run,
          employeeCode: 'FLX-002',
          joinedOn: joined,
          workEmail: `emp2@flex-${run}.test`,
          assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
        })
        .expect(201)
    ).body.id as string;
    ids.emp2 = emp2;
    const c = { organizationId: org.A.id, isSuperAdmin: false, userId: users.adminA } as unknown as CompanyContext;
    const exitCaseId = await inA(async (tx) => {
      await tx.payGroup.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, name: 'Monthly' } });
      const e = await tx.employee.findFirstOrThrow({ where: { id: emp2 } });
      const em = await tx.employment.findFirstOrThrow({ where: { employeeId: emp2 } });
      const k = await tx.exitCase.create({
        data: { organizationId: org.A.id, employmentId: em.id, employeeId: emp2, personId: e.personId!, exitType: 'resignation', initiatedBy: 'employee', reasonText: 'Test exit', submittedOn: new Date(`${today}T00:00:00Z`), noticePeriod: '0d', standardLwd: new Date(`${today}T00:00:00Z`), approvedLwd: new Date(`${today}T00:00:00Z`), status: 'accepted', acceptedAt: new Date() },
      });
      await freezeSettlementIn(tx, c, k.id, 'accepted');
      return k.id;
    });
    await fnf.fromInputs(org.A.id, exitCaseId);
    const settled = () =>
      inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
        return tx.flexSettlement.findMany({ where: { employeeId: emp2 } });
      });
    const rows = await settled();
    // Only the active phone component; the switched-off books component has nothing to settle.
    expect(rows.map((r) => ({ kind: r.kind, payMonth: r.payMonth.toISOString().slice(0, 7), paid: r.paidTaxable.toFixed(2) }))).toEqual([{ kind: 'exit', payMonth: today.slice(0, 7), paid: (1500 * months).toFixed(2) }]);
    expect((await api('payAdmin', 'get', `/benefits/flex/ledger/${emp2}`).expect(200)).body.rows[0]).toMatchObject({ available: '0.00', settlement: { kind: 'exit' } });
    // A refreshed hand-off settles nothing twice; another company's payroll does not see the person.
    await fnf.fromInputs(org.A.id, exitCaseId);
    expect(await settled()).toHaveLength(1);
    await api('payAdminB', 'get', `/benefits/flex/ledger/${emp2}`).expect(404);
    const a = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'benefits.flex.settled', entityId: emp2 } }));
    expect(JSON.parse(a?.metadataJson ?? '{}')).toMatchObject({ kind: 'exit', automatic: true, settled: 1 });
  });

  it('answer 2455: the settlement list for payroll in scope; the leaver carries the F&F last day; refusals', async () => {
    const o = (await api('payAdmin', 'get', `/benefits/flex/settlements?taxYear=${year}`).expect(200)).body;
    expect(o).toMatchObject({ taxYear: year, opensIn: march, unclaimed: 'pay' });
    const byId = new Map((o.people as { employeeId: string }[]).map((p) => [p.employeeId, p]));
    expect(byId.get(ids.emp1)).toMatchObject({ name: `emp1 ${run}`, employeeCode: 'FLX-001', leavesOn: null, settled: null });
    expect(byId.get(ids.emp2)).toMatchObject({ leavesOn: today, available: '0.00', settled: 'exit' });
    // The person's own ledger says what happens to an unclaimed balance.
    expect((await api('emp1', 'get', '/benefits/flex/me').expect(200)).body.unclaimed).toBe('pay');
    // Wrong role, another company (sees nobody of A), bad input.
    await api('emp1', 'get', '/benefits/flex/settlements').expect(403);
    await api('hrNoKey', 'get', '/benefits/flex/settlements').expect(403);
    // Company B's payroll reaches no legal entity of A: refused, nothing of A shown.
    expect((await api('payAdminB', 'get', '/benefits/flex/settlements').expect(403)).body.message).toBe('You need payroll.input.manage over a legal entity.');
    await api('payAdmin', 'get', '/benefits/flex/settlements?taxYear=26-27').expect(400);
  });

  it('answer 2459: the year-end settlement is refused before the March pay month; nothing saved', async () => {
    const real = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
    if (real >= march) return; // in March itself the real clock already allows it
    const r = await api('payAdmin', 'post', '/benefits/flex/settlements').send({ kind: 'year_end', taxYear: year }).expect(409);
    expect(r.body.message).toBe(`The year-end settlement for ${year} opens with the March ${march.slice(0, 4)} pay month.`);
    expect(await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.flexSettlement.count({ where: { employeeId: ids.emp1 } });
    })).toBe(0);
  });

  it('March settlement: what is left paid as taxable one-time pay in March, once; refusals for the wrong role, another company and a non-leaver exit', async () => {
    // The clock moves to the March pay month (answer 2459).
    jest.spyOn(orgValidation, 'todayIst').mockReturnValue(`${march}-10`);
    await api('emp1', 'post', '/benefits/flex/settlements').send({ kind: 'year_end', taxYear: year }).expect(403);
    await api('payAdminB', 'post', '/benefits/flex/settlements').send({ kind: 'year_end', taxYear: year, employeeId: ids.emp1 }).expect(404);
    await api('payAdmin', 'post', '/benefits/flex/settlements').send({ kind: 'exit', taxYear: year }).expect(400);
    await api('payAdmin', 'post', '/benefits/flex/settlements').send({ kind: 'later', taxYear: year }).expect(400);
    expect((await api('payAdmin', 'post', '/benefits/flex/settlements').send({ kind: 'exit', taxYear: year, employeeId: ids.emp1 }).expect(409)).body.message).toBe('This person has no exit date in that tax year. Settle them at year end instead.');
    const r = (await api('payAdmin', 'post', '/benefits/flex/settlements').send({ kind: 'year_end', taxYear: year }).expect(201)).body;
    expect(r.settled).toEqual([{ employeeId: ids.emp1, component: 'phone', paidTaxable: '18000.00', carriedOut: '0.00', lapsed: '0.00' }]);
    const pay = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.oneTimePay.findMany({ where: { employeeId: ids.emp1, source: 'm11' } });
    });
    expect(pay).toEqual([expect.objectContaining({ componentCode: 'fbp_unclaimed', status: 'approved', sourceRef: `fbp:${year}:${ids.emp1}:phone` })]);
    expect(pay[0].amount.toFixed(2)).toBe('18000.00');
    expect(pay[0].periodStart.toISOString().slice(0, 7)).toBe(march);
    // Once: a second run settles nothing; the ledger shows the settlement and the balance is gone.
    expect((await api('payAdmin', 'post', '/benefits/flex/settlements').send({ kind: 'year_end', taxYear: year }).expect(201)).body.settled).toEqual([]);
    const me = (await api('emp1', 'get', '/benefits/flex/me').expect(200)).body.rows[0];
    expect(me).toMatchObject({ available: '0.00', settlement: { kind: 'year_end', payMonth: march, paidTaxable: '18000.00' } });
    // Settled rows are never changed (the database refuses an update).
    await expect(
      inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
        return tx.flexSettlement.updateMany({ data: { paidTaxable: 1 } });
      }),
    ).rejects.toThrow(/permission denied/);
    jest.restoreAllMocks();
  });
});
