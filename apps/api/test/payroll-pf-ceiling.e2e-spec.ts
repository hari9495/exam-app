import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { StatutoryRulesService } from '../src/statutory/statutory.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// The PF wage and EPS ceilings are dated rule values (S.O. 5109(E)): 15,000 for periods before 17 Sep 2026 and
// 25,000 from then (IN.PF 2026-v2, still to verify). A run on each side of the date, and the statutory arrears proposal
// for a month already paid on the old ceiling.
describe('Payroll: the PF ceiling from 17 Sep 2026', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  let hidePf2026 = false;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'emp1' | 'emp2' | 'emp3' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (d: string, n: number) => iso(new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000));
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const prevMonth = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1))).slice(0, 7);
  const prevFirst = `${prevMonth}-01`;
  const short = () => `PPF-${run}`.toUpperCase();

  /** Waive missing bank details and calculate. */
  const calculate = async (runId: string) => {
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${runId}/readiness`).expect(200)).body;
    for (const b of ready.checks.filter((c: { checkKey: string; waived: boolean }) => c.checkKey === 'bank_missing' && !c.waived))
      await api('payAdmin', 'post', `/payroll/runs/${runId}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${runId}/calculate`).expect(202);
    let r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    for (let i = 0; i < 160 && r.status === 'calculating'; i++) {
      await new Promise((ok) => setTimeout(ok, 250));
      r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    }
    if (r.status !== 'calculated') throw new Error(`run ${runId}: ${JSON.stringify((await api('payAdmin', 'get', `/payroll/runs/${runId}/progress`)).body)}`);
    return r;
  };
  /** Calculate, submit, and both approvers approve with the phrase. */
  const approveRun = async (runId: string) => {
    const r = await calculate(runId);
    // A second month flags pay changes against the first; payroll confirms them before submitting.
    for (const f of (await api('payAdmin', 'get', `/payroll/runs/${runId}/variances`).expect(200)).body as { id: string }[]) await api('payAdmin', 'post', `/payroll/runs/${runId}/variances/${f.id}/ack`).send({}).expect(200);
    const sent = await api('payAdmin', 'post', `/payroll/runs/${runId}/submit`).send({});
    if (sent.status !== 200) throw new Error(`submit ${runId}: ${sent.status} ${JSON.stringify(sent.body)}`);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${runId}/decision`)
        .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${r.month}`, impact: [] } })
        .expect(200);
    }
    return (await api('payAdmin', 'get', `/payroll/runs/${runId}/payslips`).expect(200)).body as { id: string; employeeId: string; net: string; held: boolean; status: string }[];
  };
  const linesOf = (payslipId: string) => api('payAdmin', 'get', `/payroll/payslips/${payslipId}`).expect(200);

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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, [...pack('in-tax.json'), ...pack('in-exit.json'), ...pack('in-bank-formats.json')], await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    (moduleRef.get(StatutoryRulesService) as unknown as { cache: null }).cache = null;
    planId = (await prisma.plan.create({ data: { name: `paypf-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayPF Org ${k}`, slug: `paypf-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Founder 21 Oct 2026 (option A): only HR changes pay. These pay tests' payroll fixture also plays the HR person who
    // sets the pay (the job-change key); payroll itself is refused a pay change (people-increment.e2e-spec.ts).
    // Founder 28 Oct 2026: only HR approves job changes; the approver fixture also plays the HR approver who sees pay
    // (payroll itself is refused: employee-history.e2e-spec.ts).
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
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
          tx.user.create({ data: { organizationId: o, email: `${who}@paypf-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@paypf-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'PayPF Mills', shortName: `PPF-${run}`, isDefault: true } })).id;
      ids.loc = (
        await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })
      ).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string, joinedOn: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({
            legalEntityId: ids.entity,
            status: 'confirmed',
            reason: 'Joined',
            givenName: who,
            familyName: run,
            employeeCode: code,
            joinedOn,
            userId: users[who],
            workEmail: `${who}@paypf-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'PPF-001', '2026-08-01');
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    ids.version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`).send({ employeeIds: [ids.emp1], from: '2026-08-01' }).expect(201);
    // Basic 40,000 a month: above the old 15,000 and the new 25,000 ceilings.
    const ch = (
      await api('payAdmin', 'post', `/payroll/employees/${ids.emp1}/compensation-changes`)
        .send({ employeeId: ids.emp1, effectiveDate: '2026-08-01', templateVersionId: ids.version, entryMode: 'ctc', annualCtc: '1200000', reason: 'Joining salary' })
        .expect(201)
    ).body;
    await stepUp('approver1');
    await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    // A run made before the new rule was loaded: the rules service can hide the 2026 PF version for one run.
    const rules = moduleRef.get(StatutoryRulesService);
    const published = rules.published.bind(rules);
    rules.published = async () => (await published()).filter((r) => !(hidePf2026 && r.statute === 'IN.PF' && r.version === '2026-v2'));
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

  const pfOf = async (runId: string) => {
    const slip = ((await api('payAdmin', 'get', `/payroll/runs/${runId}/payslips`).expect(200)).body as { id: string; employeeId: string }[]).find((x) => x.employeeId === ids.emp1)!;
    const full = (await linesOf(slip.id)).body as { lines: { code: string; amount: string; explanation: string }[]; ruleVersions?: Record<string, string> };
    return { id: slip.id, pf: full.lines.find((l) => l.code === 'pf_employee')!, eps: full.lines.find((l) => l.code === 'eps_employer') };
  };
  const monthRun = async (month: string) => {
    const id = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id as string;
    await approveRun(id);
    return id;
  };

  it('a run on each side of 17 Sep 2026: August on the 15,000 ceiling, October on 25,000 (the version is recorded)', async () => {
    ids.aug = await monthRun('2026-08');
    const aug = await pfOf(ids.aug);
    expect(aug.pf.amount).toBe('1800.00');
    expect(aug.eps?.amount).toBe('1250.00');
    // September is paid as if before the new rule was loaded (the 15,000 ceiling), to prove the arrears proposal below.
    hidePf2026 = true;
    ids.sep = await monthRun('2026-09');
    hidePf2026 = false;
    expect((await pfOf(ids.sep)).pf.amount).toBe('1800.00');
    ids.oct = await monthRun('2026-10');
    const oct = await pfOf(ids.oct);
    expect(oct.pf.amount).toBe('3000.00');
    expect(oct.eps?.amount).toBe('2083.00');
    const versions = (id: string) => scoped(async (tx) => (await tx.payslip.findUniqueOrThrow({ where: { id } })).ruleVersions as Record<string, string>);
    expect((await versions(aug.id))['IN.PF|IN']).toBe('2025-v1');
    expect((await versions(oct.id))['IN.PF|IN']).toBe('2026-v2');
  });

  it('the arrears proposal finds the September run paid on the old ceiling (not August, not October); accepted, it works out the PF owed', async () => {
    const list = (await api('approver1', 'get', '/statutory/arrears-proposals').expect(200)).body as { id: string; statute: string; ruleVersion: string; periods: string[]; employeeCount: number; status: string }[];
    const p = list.find((x) => x.statute === 'IN.PF' && x.ruleVersion === '2026-v2')!;
    expect(p).toMatchObject({ periods: ['2026-09'], employeeCount: 1, status: 'open' });
    // Negative: another company sees none of it; a person without the arrears key is refused.
    expect(((await api('payAdminB', 'get', '/statutory/arrears-proposals').expect(200)).body as unknown[]).length).toBe(0);
    await api('emp1', 'get', '/statutory/arrears-proposals').expect(403);
    await api('approver1', 'post', `/statutory/arrears-proposals/${p.id}/accept`).expect(200);
    const sheet = await scoped((tx) => tx.arrearsWorksheet.findFirstOrThrow({ where: { employeeId: ids.emp1, sourceRef: p.id } }));
    const lines = await scoped((tx) => tx.arrearsWorksheetLine.findMany({ where: { worksheetId: sheet.id } }));
    const pf = lines.find((l) => l.componentCode === 'pf_employee')!;
    expect([pf.asPaid?.toFixed(2), pf.corrected.toFixed(2), pf.difference?.toFixed(2)]).toEqual(['1800.00', '3000.00', '1200.00']);
  });
});
