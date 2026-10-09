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
import { PaySetupService } from '../src/payroll/setup.service';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5b end to end against the real database (forced RLS, the app role): the P07 rule store (the app reads
// published rules only and never writes; publish runs the checks and is never the drafter's), entity statutory set-up
// with step-up and completeness, dated legal options within the law's choices, pay groups and membership, the
// component library and starter template, formula checks (hostile text refused, cycles named, statutory lines from the
// pack only), compensation as a P06 change approved by someone else with its breakup kept and the pay guard on it, the
// statutory profile (only the law's choices), imports that lock their months and the go-live check, the payslip layout
// (mandatory wage-slip fields, preview before activate), the coverage monitor; two companies kept apart.
describe('Payroll batch 5b', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'payApprover' | 'hrAdmin' | 'emp' | 'payAdminB' | 'payScoped' | 'staff' | 'staff2';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const hired = addDays(addDays(thisMonth, -100).slice(0, 7) + '-01', 0);
  const firstPaidMonth = hired.slice(0, 7);
  const ruleVersion = `t${run}`;
  const ptRule = (slabs: unknown[]) => ({
    statute: 'IN.PT',
    jurisdiction: 'IN-ZZ',
    version: ruleVersion,
    validFrom: '2099-04-01',
    values: { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs },
    source: 'Test state PT Act (e2e only; a jurisdiction no company uses).',
    lawVersion: 'OLD-ACT',
    verify: true,
    golden: [{ name: '25,000 in May: 200', fn: 'pt', input: { ptWage: '25000', month: 5 }, expected: { amount: '200' } }],
  });
  const goodSlabs = [{ from: '0', to: '24999.99', amount: '0' }, { from: '25000', to: null, amount: '200' }];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    (globalThis as { paySetup?: PaySetupService }).paySetup = moduleRef.get(PaySetupService);

    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2'] as const) {
      const email = `${who}-${run}@pay5b-platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      await stepUp(who);
    }
    planId = (await prisma.plan.create({ data: { name: `pay5b-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5B Org ${k}`, slug: `pay5b-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
      ['payApprover', 'A', 'panel', template('payroll_approver')],
      ['hrAdmin', 'A', 'panel', template('hr_admin')],
      ['emp', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
      ['payScoped', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pay5b-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pay5b-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Pay5B Mills ${k}`, shortName: `P5B${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const hire = async (who: Who, code: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entityA, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn: hired, userId: users[who], workEmail: `${who}@pay5b-${run}.test`, assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desigA, employmentTypeId: ids.permA, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    // A payroll admin of entity A only (a scoped role grant), and a second entity A2 in the same company.
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const profile = await tx.permissionProfile.create({ data: { ...o, name: `scoped-${run}`, permissionsJson: JSON.stringify(template('payroll_admin')) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.payScoped, permissionProfileId: profile.id, scopeType: 'legal_entity', legalEntityId: ids.entityA, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Payroll for entity A' } });
      ids.entityA2 = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5B Mills A2', shortName: `P5BA2-${run}` } })).id;
    });
    ids.empEmp = await hire('emp', 'P5B-001');
    ids.payAdminEmp = await hire('payAdmin', 'P5B-002');
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: [users.staff, users.staff2] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ the database

  it('every 5b table has forced RLS, tenant isolation and the support exclusion; per-person pay tables and compensations carry the pay guard', async () => {
    const tables = ['statutory_registrations', 'entity_statutory_options', 'pay_groups', 'pay_group_members', 'pay_components', 'salary_templates', 'salary_template_versions', 'salary_template_lines', 'compensation_packages', 'compensation_lines', 'employee_statutory', 'establishment_coverage', 'pay_import_batches', 'opening_balances', 'as_paid_lines', 'previous_employment_income', 'payslip_layouts', 'compensations'];
    const rows = await prisma.$queryRaw<{ t: string; forced: boolean; tenant: boolean; support: boolean; guard: boolean }[]>`
      SELECT c.relname AS t, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS tenant,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive) AS support,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive) AS guard
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r' AND c.relname = ANY (${tables}) ORDER BY 1`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ t: r.t, forced: true, tenant: true });
    expect(rows.filter((r) => r.guard).map((r) => r.t)).toEqual(['as_paid_lines', 'compensation_lines', 'compensation_packages', 'compensations', 'employee_statutory', 'opening_balances', 'pay_import_batches', 'previous_employment_income']);
  });

  // ------------------------------------------------------------------------------------------ rule store (PAY-2.01)

  it('rule store: the app role never writes; a draft is invisible to companies; overlapping slabs are refused; the drafter cannot publish, a second staff member can', async () => {
    await expect(inA((tx) => tx.statutoryRuleSet.create({ data: { statute: 'IN.PT', jurisdiction: 'IN-ZZ', version: `x${run}`, validFrom: new Date('2099-01-01'), values: { kind: 'pt' }, source: 'x', verify: true, status: 'published' } }))).rejects.toThrow();
    await api('payAdmin', 'post', '/platform/statutory/rule-sets').send(ptRule(goodSlabs)).expect(403);

    const bad = await api('staff', 'post', '/platform/statutory/rule-sets').send({ ...ptRule([{ from: '0', to: '30000', amount: '0' }, { from: '25000', to: null, amount: '200' }]), version: `b${run}` }).expect(400);
    expect(bad.body.code).toBe('RULE_SHAPE');
    const { id } = (await api('staff', 'post', '/platform/statutory/rule-sets').send(ptRule(goodSlabs)).expect(201)).body;
    expect(await inA((tx) => tx.statutoryRuleSet.findFirst({ where: { id } }))).toBeNull();

    await api('staff', 'post', `/platform/statutory/rule-sets/${id}/publish`).expect(403);
    await api('staff2', 'post', `/platform/statutory/rule-sets/${id}/publish`).expect(200);
    const after = await inA((tx) => tx.statutoryRuleSet.findFirst({ where: { id } }));
    expect(after).toMatchObject({ status: 'published', draftedBy: users.staff, reviewedBy: users.staff2 });
    // The app role cannot change it even as platform staff; the owner role meets the published-row trigger.
    await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.statutoryRuleSet.update({ where: { id }, data: { verify: false } }))).rejects.toThrow(/permission denied/);
  });

  // ------------------------------------------------------------------------------------------ entity set-up (PAY-2.04)

  it('registrations: step-up, entity scope, completeness (the TAN and every PT state), numbers kept out of the audit log', async () => {
    expect((await api('payAdmin', 'get', '/payroll/setup/entities').expect(200)).body.map((e: { id: string }) => e.id)).toEqual([ids.entityA, ids.entityA2]);
    expect((await api('payScoped', 'get', '/payroll/setup/entities').expect(200)).body.map((e: { id: string }) => e.id)).toEqual([ids.entityA]);
    await api('payScoped', 'get', `/payroll/entities/${ids.entityA2}/statutory-registrations`).expect(404);
    expect((await api('payAdminB', 'get', '/payroll/setup/entities').expect(200)).body.map((e: { id: string }) => e.id)).toEqual([ids.entityB]);
    await api('hrAdmin', 'get', '/payroll/setup/entities').expect(403);
    await api('payAdmin', 'get', `/payroll/statutory/rules?entityId=${ids.entityA}`).expect(200);
    await api('hrAdmin', 'get', `/payroll/entities/${ids.entityA}/statutory-registrations`).expect(403);
    await api('payAdminB', 'get', `/payroll/entities/${ids.entityA}/statutory-registrations`).expect(404);
    const first = (await api('payAdmin', 'get', `/payroll/entities/${ids.entityA}/statutory-registrations`).expect(200)).body;
    expect(first.completeness.missing).toEqual(expect.arrayContaining([expect.stringMatching(/TAN/), expect.stringMatching(/IN\.PT IN-KA/)]));

    const regs = { registrations: [{ statute: 'IN.PF', status: 'on', registrationNo: 'KNBNG0012345000', startOn: '2020-04-01', responsiblePerson: 'Asha Rao', responsibleDesignation: 'Director' }, { statute: 'IN.PT', state: 'IN-KA', status: 'applied_awaited', appliedOn: '2026-01-10', responsiblePerson: 'Asha Rao', responsibleDesignation: 'Director' }] };
    await api('payAdmin', 'put', `/payroll/entities/${ids.entityA}/statutory-registrations`).send(regs).expect(403);
    await stepUp('payAdmin');
    await api('payAdmin', 'put', `/payroll/entities/${ids.entityA}/statutory-registrations`).send({ registrations: [{ statute: 'IN.PT', state: 'IN-TN', status: 'off' }] }).expect(400);
    const saved = (await api('payAdmin', 'put', `/payroll/entities/${ids.entityA}/statutory-registrations`).send(regs).expect(200)).body;
    expect(saved.completeness.missing).toEqual([expect.stringMatching(/TAN/)]);
    const logged = await inA((tx) => tx.auditLog.findMany({ where: { action: 'payroll.statutory.registration_saved' } }));
    expect(logged.length).toBe(2);
    expect(logged.map((l) => l.metadataJson).join()).not.toContain('KNBNG0012345000');
  });

  it('legal options: only the law’s choices (bonus rate from the pack), dated, never back-dated over the current value', async () => {
    await stepUp('payAdmin');
    const base = `/payroll/entities/${ids.entityA}/legal-options`;
    expect((await api('payAdmin', 'put', base).send({ optionKey: 'bonus.rate', value: '0.25', validFrom: '2026-04-01' }).expect(400)).body.message).toMatch(/0\.0833 and 0\.2/);
    await api('payAdmin', 'put', base).send({ optionKey: 'bonus.rate', value: '0.1', validFrom: '2026-04-01' }).expect(200);
    await api('payAdmin', 'put', base).send({ optionKey: 'bonus.rate', value: '0.12', validFrom: '2026-03-01' }).expect(409);
    await api('payAdmin', 'put', base).send({ optionKey: 'bonus.rate', value: '0.12', validFrom: '2027-04-01' }).expect(200);
    const rows = (await api('payAdmin', 'get', base).expect(200)).body as { value: string; validTo: string | null }[];
    expect(rows.map((r) => [r.value, r.validTo])).toEqual([['0.12', null], ['0.1', '2027-03-31']]);
  });

  // ------------------------------------------------------------------------------------------ pay groups (PAY-2.05)

  it('pay groups: created in scope, people join from a date, the calendar has cut-off and pay dates', async () => {
    await api('payAdminB', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entityA, name: 'Sneaky', cutOffDay: 25, payDay: 0 }).expect(404);
    const g = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entityA, name: 'Monthly staff', cutOffDay: 25, payDay: 1 }).expect(201)).body;
    ids.group = g.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${g.id}/members`).send({ employeeIds: [ids.empEmp], from: hired }).expect(201);
    const members = (await api('payAdmin', 'get', `/payroll/pay-groups/${g.id}/members`).expect(200)).body;
    expect(members.map((m: { employeeCode: string }) => m.employeeCode)).toEqual(['P5B-001']);
    const cal = (await api('payAdmin', 'get', `/payroll/pay-groups/${g.id}/calendar?year=2026`).expect(200)).body;
    expect(cal[1]).toEqual({ month: '2026-02', periodStart: '2026-02-01', periodEnd: '2026-02-28', cutOff: '2026-02-25', payDate: '2026-03-01' });
    await api('payAdmin', 'patch', `/payroll/pay-groups/${g.id}`).send({ legalEntityId: ids.entityA, name: 'Monthly staff', cutOffDay: 20, payDay: 1, version: 99 }).expect(409);
  });

  // ------------------------------------------------------------------------------------------ components, formulas, templates

  it('components and templates: the starter installs once; hostile formulas refused; cycles named; statutory lines only from the pack; a sample run is required', async () => {
    await api('hrAdmin', 'post', '/payroll/components/starter').expect(403);
    const installed = (await api('payAdmin', 'post', '/payroll/components/starter').expect(201)).body;
    expect(installed.componentsAdded).toBeGreaterThan(20);
    expect((await api('payAdmin', 'post', '/payroll/components/starter').expect(201)).body.componentsAdded).toBe(0);

    for (const text of ['constructor.constructor("return process")()', 'basic["x"]', 'this', 'process.exit()', '"text"']) {
      const r = (await api('payAdmin', 'post', '/payroll/formulas/check').send({ text, codes: ['basic'] }).expect(200)).body;
      expect({ text, ok: r.ok }).toEqual({ text, ok: false });
    }
    expect((await api('payAdmin', 'post', '/payroll/formulas/check').send({ text: 'round(basic * 0.5)', codes: ['basic'] }).expect(200)).body).toMatchObject({ ok: true, uses: ['basic'] });

    const t = (await api('payAdmin', 'post', '/payroll/templates').send({ name: `Plant ${run}`, legalEntityId: ids.entityA }).expect(201)).body;
    const version = (lines: { code: string; formula: string }[], extra: Record<string, unknown> = {}) => ({ validFrom: hired, lines, balancing: 'special', employerPfInCtc: true, employerEsiInCtc: true, gratuityInCtc: false, sample: { annualCtc: '600000', state: 'IN-KA', age: 30 }, ...extra });
    const loop = await api('payAdmin', 'post', `/payroll/templates/${t.id}/versions`).send(version([{ code: 'basic', formula: 'hra * 2' }, { code: 'hra', formula: 'basic / 2' }, { code: 'special', formula: '0' }])).expect(400);
    expect(loop.body.message).toMatch(/basic/);
    expect(loop.body.message).toMatch(/hra/);
    const own = await api('payAdmin', 'post', `/payroll/templates/${t.id}/versions`).send(version([{ code: 'basic', formula: 'round(monthly_ctc * 0.5)' }, { code: 'special', formula: '0' }, { code: 'pf_employee', formula: 'basic * 0.12' }])).expect(400);
    expect(own.body.message).toMatch(/pf_employee\(\)/);
    const { sample: _s, ...noSample } = version([{ code: 'basic', formula: 'round(monthly_ctc * 0.5)' }, { code: 'special', formula: '0' }]);
    await api('payAdmin', 'post', `/payroll/templates/${t.id}/versions`).send(noSample).expect(400);
    const ok = (await api('payAdmin', 'post', `/payroll/templates/${t.id}/versions`).send(version([{ code: 'basic', formula: 'round(monthly_ctc * 0.5)' }, { code: 'special', formula: '0' }, { code: 'pf_employee', formula: 'pf_employee()' }, { code: 'pt', formula: 'pt()' }])).expect(201)).body;
    expect(ok).toMatchObject({ version: 1, sample: { monthlyCtc: '50000.00' } });
    const list = (await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { name: string; versions: { id: string }[] }[];
    ids.version = list.find((x) => x.name.startsWith('Standard monthly'))!.versions[0].id;
    expect((await api('payAdminB', 'get', '/payroll/templates').expect(200)).body).toEqual([]);
    // The library is the company's: a payroll admin of one entity cannot change it.
    await api('payScoped', 'post', '/payroll/components').send({ code: 'canteen', name: 'Canteen', kind: 'deduction' }).expect(403);
    await api('payScoped', 'post', '/payroll/templates').send({ name: `Whole company ${run}` }).expect(403);
    const a2 = (await api('payAdmin', 'post', '/payroll/templates').send({ name: `A2 ${run}`, legalEntityId: ids.entityA2 }).expect(201)).body;
    ids.versionA2 = (await api('payAdmin', 'post', `/payroll/templates/${a2.id}/versions`).send(version([{ code: 'basic', formula: 'round(monthly_ctc * 0.5)' }, { code: 'special', formula: '0' }])).expect(201)).body.id;
  });

  // ------------------------------------------------------------------------------------------ compensation (PAY-2.09)

  it('compensation: preview, change approved by someone else, the breakup kept by change id behind the pay guard; self and payroll read it, HR without pay cannot', async () => {
    const body = { employeeId: ids.empEmp, effectiveDate: today, templateVersionId: ids.version, entryMode: 'ctc', annualCtc: '726000' };
    await api('hrAdmin', 'post', '/payroll/compensations/preview').send(body).expect(403);
    const b404 = await api('payAdminB', 'post', '/payroll/compensations/preview').send(body);
    expect([b404.status, b404.body.message]).toEqual([404, 'Not found']);
    const p = (await api('payAdmin', 'post', '/payroll/compensations/preview').send(body).expect(200)).body;
    expect(p).toMatchObject({ monthlyCtc: '60500.00', warnings: [] });
    expect(p.lines.find((l: { code: string }) => l.code === 'pf_employee')).toMatchObject({ monthly: '1800.00', citation: { statute: 'IN.PF' } });

    // Another entity's template is refused.
    expect((await api('payAdmin', 'post', '/payroll/compensations/preview').send({ ...body, templateVersionId: ids.versionA2 }).expect(400)).body.message).toMatch(/legal entity/);
    // YX-PAY-22: below the floor wage is a plain warning on the breakup.
    expect((await api('payAdmin', 'post', '/payroll/compensations/preview').send({ ...body, annualCtc: '48000' }).expect(200)).body.warnings).toEqual([expect.stringMatching(/minimum or floor wage/)]);
    // YX-HIS-12 retro tiers: a past date needs the retro key (payroll admins do not hold it).
    if (thisMonth < today) expect((await api('payAdmin', 'post', `/payroll/employees/${ids.empEmp}/compensation-changes`).send({ ...body, effectiveDate: thisMonth, reason: 'Back-dated' }).expect(403)).body.message).toMatch(/retro/);
    // Their own pay is someone else's to change.
    await api('payAdmin', 'post', `/payroll/employees/${ids.payAdminEmp}/compensation-changes`).send({ ...body, employeeId: ids.payAdminEmp, reason: 'Annual review' }).expect(403);
    const chRes = await api('payAdmin', 'post', `/payroll/employees/${ids.empEmp}/compensation-changes`).send({ ...body, reason: 'Annual review' });
    expect([chRes.status, chRes.body.message]).toEqual([201, undefined]);
    const ch = chRes.body;
    expect(ch).toMatchObject({ status: 'pending', annualCtc: '726000.00' });
    // The pay guard: without the entity in this transaction's pay scope the package is invisible, even inside company A.
    expect(await inA((tx) => tx.compensationPackage.count())).toBe(0);
    // Its values change only in Payroll (the breakup goes with them).
    expect((await api('payAdmin', 'put', `/people/changes/${ch.changeId}`).send({ payload: { compensation: { annualCtc: '900000.00' } } }).expect(409)).body.message).toMatch(/Payroll/);

    await stepUp('payAdmin');
    await api('payAdmin', 'post', `/people/changes/${ch.changeId}/approve`).send({}).expect(403);
    await stepUp('payApprover');
    const ok = await api('payApprover', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true });
    expect([ok.status, ok.body.message]).toEqual([201, undefined]);

    const mine = (await api('emp', 'get', `/payroll/employees/${ids.empEmp}/compensation`).expect(200)).body;
    expect(mine).toMatchObject({ annualCtc: '726000.00', package: { entryMode: 'ctc' } });
    expect(mine.lines.length).toBeGreaterThan(5);
    expect((await api('payAdmin', 'get', `/payroll/employees/${ids.empEmp}/compensation`).expect(200)).body.changeId).toBe(ch.changeId);
    await api('hrAdmin', 'get', `/payroll/employees/${ids.empEmp}/compensation`).expect(404);
    await api('payAdminB', 'get', `/payroll/employees/${ids.empEmp}/compensation`).expect(404);
    await api('emp', 'get', `/payroll/employees/${ids.payAdminEmp}/compensation`).expect(404);

    // The revision letter: typed confirmation, once.
    await api('payAdmin', 'post', `/payroll/compensation-changes/${ch.changeId}/letter`).send({ signatory: 'Asha Rao', confirmation: { phrase: 'ISSUE', impact: [] } }).expect(400);
    await stepUp('payAdmin');
    await api('payAdmin', 'post', `/payroll/compensation-changes/${ch.changeId}/letter`).send({ signatory: 'Asha Rao' }).expect(400);
    const letter = (await api('payAdmin', 'post', `/payroll/compensation-changes/${ch.changeId}/letter`).send({ signatory: 'Asha Rao', confirmation: { phrase: 'ISSUE RL', impact: [] } }).expect(201)).body;
    expect(letter.referenceNo).toMatch(/RL/);
    await api('payAdmin', 'post', `/payroll/compensation-changes/${ch.changeId}/letter`).send({ signatory: 'Asha Rao', confirmation: { phrase: 'ISSUE RL', impact: [] } }).expect(409);
  });

  // ------------------------------------------------------------------------------------------ statutory profile (PAY-2.10)

  it('statutory profile: defaults from the employment type; only what the law leaves open can differ; dated rows', async () => {
    const got = (await api('payAdmin', 'get', `/payroll/employees/${ids.empEmp}/statutory-profile`).expect(200)).body;
    expect(got.defaults).toMatchObject({ 'IN.PF': 'mandatory', 'IN.ESI': 'by_wage' });
    const path = `/payroll/employees/${ids.empEmp}/statutory-profile`;
    const base = { validFrom: thisMonth, pf: 'yes', esi: 'by_wage', reason: 'Joining forms received' };
    await api('payAdmin', 'put', path).send({ ...base, pf: 'no' }).expect(400);
    await api('payAdmin', 'put', path).send({ ...base, esi: 'no' }).expect(400);
    await api('payAdmin', 'put', path).send({ ...base, higherPension: true }).expect(400);
    await api('payAdmin', 'put', path).send({ ...base, vpfPercent: '5' }).expect(200);
    await api('payAdmin', 'put', path).send({ ...base, validFrom: hired }).expect(409);
    await api('hrAdmin', 'put', path).send(base).expect(403);
    expect(await inA((tx) => tx.employeeStatutory.count())).toBe(0);
  });

  // ------------------------------------------------------------------------------------------ imports (PAY-2.12)

  it('imports: errors listed by row and block the commit; a clean as-paid batch lands and locks its month; the go-live check lists what is missing', async () => {
    const bad = (await api('payAdmin', 'post', '/payroll/imports').send({ legalEntityId: ids.entityA, kind: 'as_paid_lines', rows: [{ employeeCode: 'P5B-001', month: firstPaidMonth, componentCode: 'basic', amount: '24200' }, { employeeCode: 'NOPE', month: firstPaidMonth, componentCode: 'basic', amount: '1' }, { employeeCode: 'P5B-001', month: firstPaidMonth, componentCode: 'mystery', amount: '1' }] }).expect(201)).body;
    expect(bad.errors.map((e: { row: number }) => e.row)).toEqual([2, 3]);
    await api('payAdmin', 'post', `/payroll/imports/${bad.id}/commit`).expect(409);
    await api('payAdminB', 'post', `/payroll/imports/${bad.id}/commit`).expect(404);

    const good = (await api('payAdmin', 'post', '/payroll/imports').send({ legalEntityId: ids.entityA, kind: 'as_paid_lines', rows: [{ employeeCode: 'P5B-001', month: firstPaidMonth, componentCode: 'basic', amount: '24200' }] }).expect(201)).body;
    expect((await api('payAdmin', 'post', `/payroll/imports/${good.id}/commit`).expect(200)).body).toMatchObject({ status: 'committed', lockedMonths: [firstPaidMonth] });
    await api('payAdmin', 'post', `/payroll/imports/${good.id}/commit`).expect(409);
    const period = await inA((tx) => tx.payPeriod.findFirst({ where: { legalEntityId: ids.entityA, periodStart: new Date(`${firstPaidMonth}-01T00:00:00Z`) } }));
    expect(period?.stage).toBe('locked');

    const f12 = (await api('payAdmin', 'post', '/payroll/imports').send({ legalEntityId: ids.entityA, kind: 'form12b', rows: [{ employeeCode: 'P5B-001', fy: '2026-27', employerTan: 'BLRA12345B', gross: '300000', tds: '5000' }, { employeeCode: 'P5B-001', fy: '2026-27', employerTan: 'bad', gross: '1' }] }).expect(201)).body;
    expect(f12.errors).toEqual([{ row: 2, message: expect.stringMatching(/TAN/) }]);

    const check = (await api('payAdmin', 'post', '/payroll/imports/go-live-check').send({ legalEntityId: ids.entityA, goLiveMonth: today.slice(0, 7) }).expect(200)).body;
    expect(check.missing).not.toContainEqual({ employeeCode: 'P5B-001', month: firstPaidMonth });
  });

  // ------------------------------------------------------------------------------------------ payslip layout (PAY-2.13)

  it('payslip layout: mandatory wage-slip fields stay shown; English only for now; preview before activate; one active', async () => {
    const path = `/payroll/entities/${ids.entityA}/payslip-layout`;
    const { mandatory } = (await api('payAdmin', 'get', path).expect(200)).body as { mandatory: string[] };
    expect(mandatory).toContain('netPay');
    const blocks = mandatory.map((key) => ({ key, shown: true }));
    expect((await api('payAdmin', 'put', path).send({ blocks: blocks.map((b) => (b.key === 'netPay' ? { ...b, shown: false } : b)), languages: ['en'] }).expect(400)).body.message).toMatch(/netPay/);
    // 5b-D2: English always, plus at most one regional language.
    await api('payAdmin', 'put', path).send({ blocks, languages: ['ta'] }).expect(400);
    await api('payAdmin', 'put', path).send({ blocks, languages: ['en', 'ta', 'hi'] }).expect(400);
    await api('payAdmin', 'put', path).send({ blocks, languages: ['en'] }).expect(200);
    await api('payAdmin', 'put', path).send({ blocks, languages: ['en', 'ta'] }).expect(200);
    await api('payAdmin', 'post', `${path}/activate`).expect(409);
    const pdf = await api('payAdmin', 'post', `${path}/preview`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(pdf.body as Buffer).toString('latin1')).toMatch(/NotoSansTamil/);
    await api('payAdmin', 'post', `${path}/activate`).expect(200);
    await api('payAdmin', 'put', path).send({ blocks, languages: ['en'] }).expect(200);
    const v2 = (await api('payAdmin', 'get', path).expect(200)).body.layouts;
    expect(v2.map((l: { version: number; status: string }) => [l.version, l.status])).toEqual([[2, 'draft'], [1, 'active']]);
  });

  // ------------------------------------------------------------------------------------------ coverage (PAY-2.11) and set-up state

  it('coverage monitor: the daily check records each entity against the thresholds; the set-up state shows what is left', async () => {
    await (globalThis as { paySetup?: PaySetupService }).paySetup!.evaluateCoverage(today);
    const rows = (await api('payAdmin', 'get', '/payroll/coverage').expect(200)).body as { legalEntityId: string; statute: string; status: string; headcount: number }[];
    expect(rows.filter((r) => r.legalEntityId === ids.entityA).map((r) => [r.statute, r.status, r.headcount])).toEqual([['IN.ESI', 'not_covered', 2], ['IN.PF', 'not_covered', 2]]);
    expect((await api('payAdminB', 'get', '/payroll/coverage').expect(200)).body.some((r: { legalEntityId: string }) => r.legalEntityId === ids.entityA)).toBe(false);
    const state = (await api('payAdmin', 'get', `/payroll/entities/${ids.entityA}/setup`).expect(200)).body;
    expect(state.steps.map((s: { key: string; done: boolean }) => [s.key, s.done])).toEqual([['registrations', false], ['pay_groups', true], ['components', true], ['templates', true], ['payslip_layout', true]]);
  });
});
