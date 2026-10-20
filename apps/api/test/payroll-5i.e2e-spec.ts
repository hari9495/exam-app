import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { hashValue, sealValue } from '../src/people/profile.service';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5i end to end against the real database: special pay sent to payroll as postings approved by someone
// who neither made them nor is paid in them (piece-rate with the minimum-wage top-up, incentives, union dues and the
// remittance statement, VRS with the lifetime limit, lay-off pay); a weekly pay group whose periods have their own runs
// (monthly items wait for the run that ends the month, which also locks it); earned wage access within the earned share,
// paid by payroll and recovered in the month; equity grants within the pool, vesting, an exercise taxed as a perquisite;
// the actuarial census and a provision journal posted by someone else; a UAE entity paid only once its country pack is
// switched on; the database guards and another company kept apart.
describe('Payroll batch 5i', () => {
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
  type Who = 'adminA' | 'payAdmin' | 'payAdmin2' | 'approver1' | 'approver2' | 'emp1' | 'emp2' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
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
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const prevMonth = (() => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const short = () => `P5I-${run}`.toUpperCase();
  const decide = async (who: Who, titlePart: RegExp, decision: 'approve' | 'reject' = 'approve') => {
    const task = ((await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string }[]).find((t) => titlePart.test(t.title));
    if (!task) throw new Error(`no task ${titlePart} for ${who}`);
    await api(who, 'post', `/workflow/approvals/tasks/${task.taskId}/decide`).send({ decision }).expect(200);
  };
  const oneTimes = (source: string) => scoped((tx) => tx.oneTimePay.findMany({ where: { organizationId: org.A.id, source, status: 'approved' } }));
  const waitFor = async (id: string, status: string) => {
    for (let i = 0; i < 160; i++) {
      const r = (await api('payAdmin', 'get', `/payroll/runs/${id}`).expect(200)).body;
      if (r.status === status) return r;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`run never reached ${status}`);
  };
  const approveRun = async (runId: string) => {
    await api('payAdmin', 'post', `/payroll/runs/${runId}/calculate`).expect(202);
    await waitFor(runId, 'calculated');
    await api('payAdmin', 'post', `/payroll/runs/${runId}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${runId}/decision`).send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } }).expect(200);
    }
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
    crypto = moduleRef.get(OrgSecretsCryptoService);
    // The 5i rule data (lay-off share, the UAE and US packs) published by two staff (kept if the seed has it).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      for (const pack of ['in-exit.json', 'ae.json', 'us.json']) {
        const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', pack), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
        await loadRuleSets(tx, sets, await staff('super@platform.test'), await staff('rules@platform.test'));
      }
    });
    planId = (await prisma.plan.create({ data: { name: `pay5i-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5I Org ${k}`, slug: `pay5i-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Raising a pay change needs the job-change key, which the Payroll Admin template no longer holds (founder 21 Oct
    // 2026; who changes pay is still open): these pay tests give it to their payroll fixture.
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['payAdmin2', 'A', 'panel', template('payroll_admin')],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys
        ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id
        : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pay5i-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pay5i-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5I Works', shortName: `P5I-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Peenya', code: 'PNY', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Stitching', code: 'STI', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Tailor', code: 'TL' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.uae = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5I Gulf', shortName: `P5IAE-${run}`, country: 'AE', currency: 'AED' } })).id;
    });
    const hire = async (who: Who, code: string, joinedOn: string) => {
      const res = await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, employeeCode: code, joinedOn, userId: users[who], workEmail: `${who}@pay5i-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null, skillClass: 'skilled' } });
      if (res.status !== 201) throw new Error(`hire ${who}: ${JSON.stringify(res.body)}`);
      return res.body.id as string;
    };
    // Hired from the start of the tax year (inside the retro limit); then their joining day is set three years back.
    const joined = `${Number(month.slice(5, 7)) >= 4 ? month.slice(0, 4) : Number(month.slice(0, 4)) - 1}-04-01`;
    ids.emp1 = await hire('emp1', 'P5I-001', joined);
    ids.emp2 = await hire('emp2', 'P5I-002', joined);
    for (const [emp, number] of [[ids.emp1, '000111222333'], [ids.emp2, '000444555666']] as const)
      await inA((tx) => tx.employeeBankAccount.create({ data: { organizationId: org.A.id, employeeId: emp, purpose: 'salary', holderName: 'Account Holder', ifsc: 'HDFC0001234', accountEnc: sealValue(crypto, org.A.id, emp, number), accountHash: hashValue(crypto, org.A.id, 'bank', `HDFC0001234:${number}`), accountLast4: number.slice(-4), validFrom: new Date(Date.now() - 86_400_000 * 400), usableFrom: new Date(Date.now() - 86_400_000) } }));
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.weekly = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Weekly', cutOffDay: 25, payDay: 0, frequency: 'weekly', anchorDate: first }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.weekly}/members`).send({ employeeIds: [ids.emp1, ids.emp2], from: joined }).expect(201);
    for (const emp of [ids.emp1, ids.emp2]) {
      const ch = (await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`).send({ employeeId: emp, effectiveDate: joined, templateVersionId: version, entryMode: 'ctc', annualCtc: '480000', reason: 'Joining salary' }).expect(201)).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
    await tenantPrisma.forTenant(SUPER, (tx) => tx.employment.updateMany({ where: { organizationId: org.A.id, employeeId: { in: [ids.emp1, ids.emp2] } }, data: { joinedOn: new Date(`${Number(month.slice(0, 4)) - 3}-${month.slice(5)}-01T00:00:00Z`) } }));
  }, 400_000);

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

  it('every 5i table has forced RLS, tenant isolation, the support exclusion and the pay guard', async () => {
    const tables = ['special_postings', 'piece_rate_cards', 'piece_outputs', 'unions', 'union_authorisations', 'wage_settlements', 'layoff_days', 'vrs_payouts', 'incentive_plans', 'incentive_results', 'incentive_clawbacks', 'tip_pools', 'tip_shares', 'oncall_rules', 'oncall_slots', 'ewa_policies', 'ewa_draws', 'equity_plans', 'equity_valuations', 'equity_grants', 'vesting_events', 'equity_exercises', 'actuarial_census_exports', 'actuarial_valuations', 'entity_country_packs', 'wps_employee_ids', 'wps_files', 'eosb_provisions', 'contractor_tax_forms'];
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

  it('piece-rate: the rate on each date, a minimum-wage top-up, approved by someone else into one-time pay', async () => {
    await api('payAdmin', 'post', '/payroll/special/rate-cards').send({ legalEntityId: ids.entity, operationCode: 'stitch', name: 'Stitch a shirt', unit: 'piece', rate: '2.50', validFrom: `${prevMonth}-01` }).expect(201);
    await api('payAdmin', 'post', '/payroll/special/outputs').send({ legalEntityId: ids.entity, rows: [{ employeeId: ids.emp1, workDate: first, operationCode: 'STITCH', quantity: '10' }, { employeeId: ids.emp2, workDate: first, operationCode: 'STITCH', quantity: '400' }] }).expect(201);
    await api('payAdmin', 'post', '/payroll/special/outputs').send({ legalEntityId: ids.entity, rows: [{ employeeId: ids.emp1, workDate: first, operationCode: 'NOPE', quantity: '1' }] }).expect(201);
    // An output with no rate card in force is never paid at a guess.
    await api('payAdmin', 'post', '/payroll/special/piece/post').send({ legalEntityId: ids.entity, month }).expect(400);
    await scoped((tx) => tx.pieceOutput.deleteMany({ where: { organizationId: org.A.id, operationCode: 'NOPE' } }));
    const p = (await api('payAdmin', 'post', '/payroll/special/piece/post').send({ legalEntityId: ids.entity, month }).expect(201)).body.posting;
    const lines = p.lines as { employeeId: string; componentCode: string; amount: string }[];
    expect(lines.find((l) => l.employeeId === ids.emp1 && l.componentCode === 'piece_pay')!.amount).toBe('25.00');
    expect(lines.some((l) => l.employeeId === ids.emp1 && l.componentCode === 'min_wage_topup')).toBe(true);
    expect(lines.some((l) => l.employeeId === ids.emp2 && l.componentCode === 'min_wage_topup')).toBe(false);
    // The same month again is refused while this one is live; the maker is not an approver.
    await api('payAdmin', 'post', '/payroll/special/piece/post').send({ legalEntityId: ids.entity, month }).expect(409);
    expect(((await api('payAdmin', 'get', '/workflow/approvals/inbox').expect(200)).body as { title: string }[]).some((t) => /Piece-rate/.test(t.title))).toBe(false);
    await decide('approver1', /Piece-rate pay/);
    expect((await oneTimes('piece')).map((o) => o.componentCode).sort()).toEqual(['min_wage_topup', 'piece_pay', 'piece_pay']);
    // Output of a month already sent is refused.
    await api('payAdmin', 'post', '/payroll/special/outputs').send({ legalEntityId: ids.entity, rows: [{ employeeId: ids.emp1, workDate: first, operationCode: 'STITCH', quantity: '11' }] }).expect(409);
  });

  it('incentives: the tiers with an accelerator; a worker reads only their own statement', async () => {
    const plan = (await api('payAdmin', 'post', '/payroll/special/plans').send({ legalEntityId: ids.entity, name: 'Line bonus', kind: 'production', metric: 'pieces', targetAmount: '1000', tiers: [{ from: 0, multiplier: 1 }, { from: 100, multiplier: 1.5 }], clawbackDays: 30 }).expect(201)).body.id;
    const r = (await api('payAdmin', 'post', `/payroll/special/plans/${plan}/results`).send({ month, rows: [{ employeeId: ids.emp1, quota: '100', actual: '120' }, { employeeId: ids.emp2, quota: '100', actual: '50' }] }).expect(200)).body as { employeeId: string; amount: string }[];
    expect(r.find((x) => x.employeeId === ids.emp1)!.amount).toBe('1300.00');
    expect(r.find((x) => x.employeeId === ids.emp2)!.amount).toBe('500.00');
    await api('payAdmin', 'post', `/payroll/special/plans/${plan}/post`).send({ month }).expect(201);
    await decide('approver2', /Incentives/);
    expect((await oneTimes('incentive')).length).toBe(2);
    const mine = (await api('emp1', 'get', '/payroll/special/me/incentives').expect(200)).body;
    expect(mine.results).toEqual([expect.objectContaining({ plan: 'Line bonus', amount: '1300.00', sentToPayroll: true })]);
    await api('emp1', 'get', '/payroll/special/plans').query({ legalEntityId: ids.entity }).expect(403);
  });

  it('IR pay: union dues only with an authorisation, the remittance statement; VRS within the lifetime limit; lay-off pay', async () => {
    const union = (await api('payAdmin', 'post', '/payroll/special/unions').send({ legalEntityId: ids.entity, name: 'Garment Workers Union', registrationNo: 'KA-123' }).expect(201)).body.id;
    await api('payAdmin', 'post', '/payroll/special/union-authorisations').send({ unionId: union, employeeId: ids.emp1, duesKind: 'fixed', duesValue: '50', validFrom: first }).expect(201);
    await api('payAdmin', 'post', '/payroll/special/union-authorisations').send({ unionId: union, employeeId: ids.emp1, duesKind: 'fixed', duesValue: '60', validFrom: first }).expect(409);
    const p = (await api('payAdmin', 'post', '/payroll/special/union/post').send({ legalEntityId: ids.entity, month }).expect(201)).body.posting;
    expect(p.lines).toEqual([expect.objectContaining({ employeeId: ids.emp1, componentCode: 'union_dues', amount: '50.00' })]);
    await decide('approver1', /Union dues/);
    expect((await api('payAdmin', 'get', `/payroll/special/unions/${union}/remittance`).query({ month }).expect(200)).body).toMatchObject({ approved: true, total: '50.00', members: [{ employeeId: ids.emp1, amount: '50.00' }] });
    // VRS: 8,00,000 with 2,00,000 claimed before → what is left of the limit is exempt, the rest taxed.
    const vrs = (await api('payAdmin', 'post', `/payroll/special/entities/${ids.entity}/vrs`).send({ employeeId: ids.emp2, month, amount: '800000', priorExemption: '200000' }).expect(201)).body.posting;
    expect(vrs.lines.map((l: { componentCode: string; amount: string }) => [l.componentCode, l.amount])).toEqual([['vrs_exempt', '300000.00'], ['vrs_taxable', '500000.00']]);
    await api('payAdmin', 'post', `/payroll/special/entities/${ids.entity}/vrs`).send({ employeeId: ids.emp2, month, amount: '1000', priorExemption: '0' }).expect(409);
    await api('payAdmin', 'post', `/payroll/special/entities/${ids.entity}/layoff-days`).send({ employeeId: ids.emp1, month, days: '2' }).expect(200);
    const lay = (await api('payAdmin', 'post', '/payroll/special/layoff/post').send({ legalEntityId: ids.entity, month }).expect(201)).body.posting;
    expect(lay.lines[0]).toMatchObject({ employeeId: ids.emp1, componentCode: 'layoff_comp' });
    expect(Number(lay.lines[0].amount)).toBeGreaterThan(0);
  });

  it('weekly pay: each period its own run; monthly items and the lock wait for the run that ends the month', async () => {
    await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.weekly, month }).expect(400);
    const r1 = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.weekly, month, subPeriod: 1 }).expect(201)).body;
    expect(r1).toMatchObject({ subPeriod: 1, range: { from: first, to: `${month}-07` } });
    await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.weekly, month, subPeriod: 1 }).expect(409);
    await approveRun(r1.id);
    const s1 = await scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: r1.id, employeeId: ids.emp1, status: 'approved' } }));
    const l1 = await scoped((tx) => tx.payslipLine.findMany({ where: { payslipId: s1.id } }));
    // A part of the month: no one-time pay yet (it waits for the last run), basic for 7 days.
    expect(l1.some((l) => l.componentCode === 'piece_pay' || l.componentCode === 'incentive')).toBe(false);
    expect(l1.find((l) => l.componentCode === 'basic')!.explanation).toMatch(/× 7 of/);
    expect(s1.subPeriod).toBe(1);
    // The month is not locked by its first period.
    const p1 = await scoped((tx) => tx.payPeriod.findFirst({ where: { organizationId: org.A.id, legalEntityId: ids.entity, payGroupId: null, periodStart: new Date(`${first}T00:00:00Z`) } }));
    expect(p1?.stage).not.toBe('locked');
  }, 300_000);

  it('earned wage access: within the earned share; paid by someone else; recovered in the month', async () => {
    await api('payAdmin', 'post', '/payroll/ewa/policies').send({ legalEntityId: ids.entity, validFrom: `${prevMonth}-01`, enabled: true, percentAvailable: '50', minAmount: '100', maxAmount: '20000', drawsPerMonth: 1, blackoutDays: 0, fee: '49', feePayer: 'employee' }).expect(201);
    // The cut-off of the weekly group is the 25th: draws close on and after it.
    const me = (await api('emp1', 'get', '/payroll/me/ewa').expect(200)).body;
    if (Number(today.slice(8)) >= 25) {
      expect(me.open).toBe(false);
      return;
    }
    expect(me.open).toBe(true);
    const available = Number(me.quote.available);
    expect(available).toBeGreaterThan(0);
    await api('emp1', 'post', '/payroll/me/ewa/draws').send({ amount: String(available + 1), acceptDisclosure: true }).expect(400);
    await api('emp1', 'post', '/payroll/me/ewa/draws').send({ amount: '100', acceptDisclosure: false }).expect(400);
    const d = (await api('emp1', 'post', '/payroll/me/ewa/draws').send({ amount: '100', acceptDisclosure: true }).expect(201)).body;
    // One draw a month.
    await api('emp1', 'post', '/payroll/me/ewa/draws').send({ amount: '100', acceptDisclosure: true }).expect(409);
    await api('payAdmin', 'post', `/payroll/ewa/draws/${d.id}/paid`).send({ reference: 'NEFT-0001' }).expect(200);
    const rec = await oneTimes('ewa');
    expect(rec).toEqual([expect.objectContaining({ componentCode: 'ewa_recovery', employeeId: ids.emp1 })]);
    expect(rec[0].amount.toFixed(2)).toBe('149.00');
  });

  it('weekly pay: the run that ends the month pays the items of the month and locks it', async () => {
    const periods = Math.ceil(Number(lastDay.slice(8)) / 7);
    const rl = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.weekly, month, subPeriod: periods }).expect(201)).body;
    expect(rl.range.to).toBe(lastDay);
    await approveRun(rl.id);
    const sl = await scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: rl.id, employeeId: ids.emp1, status: 'approved' } }));
    const ll = await scoped((tx) => tx.payslipLine.findMany({ where: { payslipId: sl.id } }));
    expect(ll.some((l) => l.componentCode === 'piece_pay')).toBe(true);
    expect(ll.some((l) => l.componentCode === 'union_dues')).toBe(true);
    if (Number(today.slice(8)) < 25) expect(ll.some((l) => l.componentCode === 'ewa_recovery')).toBe(true);
    const snap = await scoped((tx) => tx.payslipSnapshot.findFirstOrThrow({ where: { payslipId: sl.id } }));
    expect((snap.inputs as { sub: { final: boolean; mtd: { taxable: string } } }).sub).toMatchObject({ final: true, mtd: { taxable: expect.any(String) } });
    const p2 = await scoped((tx) => tx.payPeriod.findFirst({ where: { organizationId: org.A.id, legalEntityId: ids.entity, payGroupId: null, periodStart: new Date(`${first}T00:00:00Z`) } }));
    expect(p2?.stage).toBe('locked');
  }, 300_000);

  it('equity: a grant within the pool approved by another holder; vested units exercised; the perquisite to tax', async () => {
    const plan = (await api('payAdmin', 'post', '/payroll/equity/plans').send({ legalEntityId: ids.entity, name: 'ESOP 2024', kind: 'ESOP', poolUnits: 1000, exitWindowDays: 90 }).expect(201)).body.id;
    await api('payAdmin', 'post', '/payroll/equity/valuations').send({ legalEntityId: ids.entity, valuedOn: `${prevMonth}-01`, fmv: '250', basis: 'merchant_banker' }).expect(201);
    const grantedOn = `${Number(month.slice(0, 4)) - 2}-${month.slice(5)}-01`;
    await api('payAdmin', 'post', '/payroll/equity/grants').send({ planId: plan, employeeId: ids.emp1, grantedOn, units: 1200, exercisePrice: '100', cliffMonths: 12, vestingMonths: 48, everyMonths: 12 }).expect(409);
    await api('payAdmin', 'post', '/payroll/equity/grants').send({ planId: plan, employeeId: ids.emp1, grantedOn, units: 800, exercisePrice: '100', cliffMonths: 12, vestingMonths: 48, everyMonths: 12 }).expect(201);
    await decide('payAdmin2', /ESOP 2024/);
    const mine = (await api('emp1', 'get', '/payroll/me/equity').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ units: 800, vested: 400, exercisable: 400, plan: expect.objectContaining({ name: 'ESOP 2024' }) })]);
    await api('emp1', 'post', '/payroll/me/equity/exercises').send({ grantId: mine[0].id, units: 401 }).expect(400);
    await api('emp1', 'post', '/payroll/me/equity/exercises').send({ grantId: mine[0].id, units: 100 }).expect(201);
    await api('emp2', 'post', '/payroll/me/equity/exercises').send({ grantId: mine[0].id, units: 1 }).expect(404);
    await decide('payAdmin', /Exercise 100 units/);
    const perq = await scoped((tx) => tx.perquisite.findMany({ where: { organizationId: org.A.id, employeeId: ids.emp1, kind: 'esop' } }));
    expect(perq.map((p) => p.annualValue.toFixed(2))).toEqual(['15000.00']);
    const cap = await api('payAdmin', 'get', `/payroll/equity/plans/${plan}/cap-table`).expect(200);
    expect(cap.text).toContain('POOL LEFT,,200');
  });

  it('actuarial: the census as a file; the provision journal posted by someone other than its recorder', async () => {
    const cen = (await api('payAdmin', 'post', '/payroll/actuarial/census').send({ legalEntityId: ids.entity, asOf: lastDay, standard: 'IND_AS_19' }).expect(201)).body;
    expect(cen.rows).toBe(2);
    const v = (await api('payAdmin', 'post', '/payroll/actuarial/valuations').field('legalEntityId', ids.entity).field('asOf', lastDay).field('standard', 'IND_AS_19').field('kind', 'gratuity').field('censusId', cen.id).field('closing', '125000').expect(201)).body;
    expect(v.journal).toEqual([
      { account: 'Gratuity expense (actuarial)', debit: '125000.00' },
      { account: 'Provision for gratuity', credit: '125000.00' },
    ]);
    await api('payAdmin', 'post', `/payroll/actuarial/valuations/${v.id}/post`).expect(403);
    await api('payAdmin2', 'post', `/payroll/actuarial/valuations/${v.id}/post`).expect(200);
  });

  it('country packs: a UAE entity is paid only once its pack is switched on after the completeness check', async () => {
    const g = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.uae, name: 'Dubai monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: g, month }).expect(409);
    const st = (await api('payAdmin', 'get', '/payroll/country-packs').query({ legalEntityId: ids.uae }).expect(200)).body;
    expect(st).toMatchObject({ country: 'AE', needed: true, switchedOn: false });
    expect(st.missing.length).toBeGreaterThan(0);
    await api('payAdmin', 'post', '/payroll/country-packs').send({ legalEntityId: ids.uae, settings: { establishmentId: '123' } }).expect(409);
    await api('payAdmin', 'post', '/payroll/country-packs').send({ legalEntityId: ids.uae, settings: { establishmentId: '1234567890123', agentRoutingCode: '987654321' } }).expect(200);
    await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: g, month }).expect(201);
    // India needs no pack; the W-9 is for a US entity's contractors only.
    expect((await api('payAdmin', 'get', '/payroll/country-packs').query({ legalEntityId: ids.entity }).expect(200)).body).toMatchObject({ country: 'IN', needed: false });
    await api('payAdminB', 'get', '/payroll/country-packs').query({ legalEntityId: ids.uae }).expect(404);
  });

  it('another company sees none of it, and a posting is approved only by someone not paid in it', async () => {
    await api('payAdminB', 'get', '/payroll/special/postings').query({ legalEntityId: ids.entity }).expect(404);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.specialPosting.count())).toBe(0);
    // Sending special pay needs payroll.special.manage.
    await api('approver1', 'post', '/payroll/special/union/post').send({ legalEntityId: ids.entity, month }).expect(403);
  });
});
