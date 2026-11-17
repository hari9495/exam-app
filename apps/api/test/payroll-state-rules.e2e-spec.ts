import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { StatutoryRulesService } from '../src/statutory/statutory.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Batch H: state payroll rules as dated rule data (docs/yukthix/reference/statutory/india-state-rules-2026-27.md §7).
// Every new set is verify (a CA checks it before go-live). Positive and negative paths per item.
describe('Payroll: state statutory rules (batch H)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'payAdmin' | 'approver1' | 'emp1' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  // The states a person is paid in (one each); every batch H item reads the same two runs (September and October 2026).
  const STATES = ['IN-HR', 'IN-AP', 'IN-GJ', 'IN-WB', 'IN-OD'];
  const emp: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const addPlace = (state: string, code: string) =>
    inA(async (tx) => (await tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, name: `${state} office`, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } })).id);

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
    // The side packs load through the console's two-person flow (as the seed does); sets already there are skipped.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, [...pack('in-dues.json'), ...pack('in-tax.json')], await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    (moduleRef.get(StatutoryRulesService) as unknown as { cache: null }).cache = null;
    planId = (await prisma.plan.create({ data: { name: `payst-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PaySt Org ${k}`, slug: `payst-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // As in the other pay tests: the payroll fixture also sets pay (HR's job-change key), the approver approves it.
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
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
          tx.user.create({ data: { organizationId: o, email: `${who}@payst-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@payst-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.entity = (await inA((tx) => tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'PaySt Traders', shortName: `PST-${run}`, isDefault: true } }))).id;
    ids['IN-KA'] = await addPlace('IN-KA', 'BLR');
    ids['IN-HR'] = await addPlace('IN-HR', 'GGN');
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    ids.version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    // One person per state on 3,00,000 a year (25,000 a month gross), paid from August 2026.
    for (const st of STATES) emp[st] = await hireIn(st, '300000');
    // emp1 signs in as an employee (own tax declarations).
    ids.emp1 = await hireIn('IN-KA', '600000', users.emp1);
  }, 600_000);

  /** Hires someone at a place in a state on a yearly CTC from 1 Aug 2026, in the monthly pay group. */
  const hireIn = async (state: string, annualCtc: string, userId?: string) => {
    ids[state] ??= await addPlace(state, state.slice(3));
    const id = (
      await api('adminA', 'post', '/people/employees')
        .send({
          legalEntityId: ids.entity,
          status: 'confirmed',
          reason: 'Joined',
          givenName: state,
          familyName: run,
          employeeCode: `PST-${state}${userId ? '-U' : ''}`,
          ...(userId ? { userId, workEmail: `emp1@payst-${run}.test` } : {}),
          joinedOn: '2026-08-01',
          assignment: { locationId: ids[state], departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
        })
        .expect(201)
    ).body.id as string;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`).send({ employeeIds: [id], from: '2026-08-01' }).expect(201);
    const ch = (
      await api('payAdmin', 'post', `/payroll/employees/${id}/compensation-changes`)
        .send({ employeeId: id, effectiveDate: '2026-08-01', templateVersionId: ids.version, entryMode: 'ctc', annualCtc, reason: 'Joining salary' })
        .expect(201)
    ).body;
    await markSteppedUp(tenantPrisma, token.approver1);
    await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    return id;
  };
  type Pt = { pt: string | null; explanation: string | null; version: string | null; versions: Record<string, string>; lines: { code: string; amount: string }[] };
  const runs: Record<string, Promise<Record<string, Pt>>> = {};
  /** A month's run, calculated once (bank details waived): each person's PT line and the PT rule version used. */
  const calcMonth = (month: string) => (runs[month] ??= calcOnce(month));
  const calcOnce = async (month: string) => {
    const runId = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id as string;
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${runId}/readiness`).expect(200)).body;
    for (const b of ready.checks.filter((c: { checkKey: string; waived: boolean }) => c.checkKey === 'bank_missing' && !c.waived))
      await api('payAdmin', 'post', `/payroll/runs/${runId}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${runId}/calculate`).expect(202);
    let r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    for (let i = 0; i < 240 && r.status === 'calculating'; i++) {
      await new Promise((ok) => setTimeout(ok, 250));
      r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    }
    if (r.status !== 'calculated') throw new Error(`run ${month}: ${JSON.stringify((await api('payAdmin', 'get', `/payroll/runs/${runId}/progress`)).body)}`);
    const out: Record<string, Pt> = {};
    for (const slip of (await api('payAdmin', 'get', `/payroll/runs/${runId}/payslips`).expect(200)).body as { id: string; employeeId: string }[]) {
      const full = (await api('payAdmin', 'get', `/payroll/payslips/${slip.id}`).expect(200)).body as { lines: { code: string; amount: string; explanation: string }[] };
      const versions = (await inA(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
        return (await tx.payslip.findUniqueOrThrow({ where: { id: slip.id } })).ruleVersions;
      })) as Record<string, string>;
      const line = full.lines.find((l) => l.code === 'pt');
      const ptKey = Object.keys(versions).find((k) => k.startsWith('IN.PT|IN-'));
      out[slip.employeeId] = { pt: line?.amount ?? null, explanation: line?.explanation ?? null, version: ptKey ? `${ptKey.slice(6)} ${versions[ptKey]}` : null, versions, lines: full.lines };
    }
    return out;
  };

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

  const rulesOf = async (statute: string, jurisdiction: string) =>
    ((await api('payAdmin', 'get', `/payroll/statutory/rules?entityId=${ids.entity}`).expect(200)).body as { statute: string; jurisdiction: string; version: string; validFrom: string; validTo: string | null; verify: boolean; source: string; values: Record<string, unknown> }[]).filter(
      (r) => r.statute === statute && r.jurisdiction === jurisdiction,
    );
  const missing = async () => ((await api('payAdmin', 'get', `/payroll/entities/${ids.entity}/statutory-registrations`).expect(200)).body as { completeness: { missing: string[] } }).completeness.missing;

  describe('H8: states with no professional tax', () => {
    it('Haryana has an explicit "none" set (verify, with its source); no PT registration is asked for there, but Karnataka still asks', async () => {
      const hr = await rulesOf('IN.PT', 'IN-HR');
      expect(hr).toEqual([expect.objectContaining({ version: '2025-v1', verify: true, values: expect.objectContaining({ slabs: [] }) })]);
      expect(hr[0].source).toMatch(/CA checklist item 23/);
      const m = await missing();
      expect(m).toContain('IN.PT IN-KA: say whether the entity is registered');
      expect(m.some((x) => x.startsWith('IN.PT IN-HR'))).toBe(false);
    });

    it('negatives: an employee is refused, another company sees nothing, a registration for a state with no place is a 400 and nothing is saved', async () => {
      await api('emp1', 'get', `/payroll/entities/${ids.entity}/statutory-registrations`).expect(403);
      await api('emp1', 'get', `/payroll/statutory/rules?entityId=${ids.entity}`).expect(403);
      await api('payAdminB', 'get', `/payroll/entities/${ids.entity}/statutory-registrations`).expect(404);
      await api('payAdminB', 'get', `/payroll/statutory/rules?entityId=${ids.entity}`).expect(404);
      await markSteppedUp(tenantPrisma, token.payAdmin);
      await api('payAdmin', 'put', `/payroll/entities/${ids.entity}/statutory-registrations`)
        .send({ registrations: [{ statute: 'IN.PT', state: 'IN-UP', status: 'off', responsiblePerson: 'Asha', responsibleDesignation: 'HR' }] })
        .expect(400);
      expect(await inA((tx) => tx.statutoryRegistration.count({ where: { legalEntityId: ids.entity } }))).toBe(0);
    });
  });

  describe('H5: Andhra Pradesh and Gujarat professional tax', () => {
    it('the rules and due dates are published, verify, with the official source and CA items; both now ask for their PT registration', async () => {
      expect(await rulesOf('IN.PT', 'IN-AP')).toEqual([expect.objectContaining({ version: '2025-v1', verify: true, source: expect.stringMatching(/apct\.gov\.in.*checklist items 3 and 24/) })]);
      expect(await rulesOf('IN.PT', 'IN-GJ')).toEqual([expect.objectContaining({ version: '2025-v1', verify: true, source: expect.stringMatching(/commercialtax\.gujarat\.gov\.in.*checklist items 7 and 24/) })]);
      expect((await rulesOf('IN.CALENDAR', 'IN-GJ'))[0]).toMatchObject({ version: 'GJ-2025-v1', verify: true });
      expect(await missing()).toEqual(expect.arrayContaining(['IN.PT IN-AP: say whether the entity is registered', 'IN.PT IN-GJ: say whether the entity is registered']));
    });

    it('a run charges each place by its own state: 25,000 a month gross is 200 in both; Haryana charges none', async () => {
      const oct = await calcMonth('2026-10');
      expect(oct[emp['IN-AP']]).toMatchObject({ pt: '200.00', version: 'IN-AP 2025-v1' });
      expect(oct[emp['IN-AP']].explanation).toMatch(/^IN-AP professional tax/);
      expect(oct[emp['IN-GJ']]).toMatchObject({ pt: '200.00', version: 'IN-GJ 2025-v1' });
      expect(oct[emp['IN-HR']]).toMatchObject({ pt: null, version: 'IN-HR 2025-v1' });
    });
  });

  describe('H3: West Bengal professional tax, old and new schedules', () => {
    it('both versions are published with their dates, verify, and CA item 6', async () => {
      const wb = await rulesOf('IN.PT', 'IN-WB');
      expect(wb.map((r) => [r.version, r.validFrom, r.validTo, r.verify])).toEqual([
        ['2026-v2', '2026-10-01', null, true],
        ['2014-v1', '2014-04-01', '2026-09-30', true],
      ]);
      expect(wb[0].source).toMatch(/CA checklist item 6/);
      expect((await rulesOf('IN.CALENDAR', 'IN-WB'))[0]).toMatchObject({ version: 'WB-2014-v1', verify: true });
    });

    it('the same pay is 130 in September (2014 schedule) and 100 in October (new schedule), each with its version', async () => {
      const [sep, oct] = [await calcMonth('2026-09'), await calcMonth('2026-10')];
      expect(sep[emp['IN-WB']]).toMatchObject({ pt: '130.00', version: 'IN-WB 2014-v1' });
      expect(oct[emp['IN-WB']]).toMatchObject({ pt: '100.00', version: 'IN-WB 2026-v2' });
    });
  });

  describe('H4: Odisha repealed professional tax from April 2026', () => {
    it('no PT on an October run (the "none" version is recorded) and no PT registration is asked for', async () => {
      expect((await calcMonth('2026-10'))[emp['IN-OD']]).toMatchObject({ pt: null, version: 'IN-OD 2026-v1' });
      expect((await missing()).some((x) => x.startsWith('IN.PT IN-OD'))).toBe(false);
      expect(await rulesOf('IN.PT', 'IN-OD')).toEqual([expect.objectContaining({ validFrom: '2026-04-01', verify: true })]);
    });
  });

  describe('H13: statutory bonus under the Code on Wages', () => {
    it('an October 2026 run uses the Code version (2025-v2) for the bonus provision', async () => {
      const r = (await calcMonth('2026-10'))[emp['IN-AP']];
      expect(r.versions['IN.BONUS|IN']).toBe('2025-v2');
      expect(r.lines.some((l) => l.code === 'bonus_provision' && Number(l.amount) > 0)).toBe(true);
    });

    it('negatives: a bonus rate above 20% is a 400 with nothing saved; an employee is refused; another company gets 404', async () => {
      const put = (who: Who, value: string) => api(who, 'put', `/payroll/entities/${ids.entity}/legal-options`).send({ optionKey: 'bonus.rate', value, validFrom: '2026-10-01' });
      await markSteppedUp(tenantPrisma, token.payAdmin);
      expect((await put('payAdmin', '0.25').expect(400)).body.message).toBe('The bonus rate is between 0.0833 and 0.2, as the law allows.');
      await put('payAdmin', 'abc').expect(400);
      await put('emp1', '0.1').expect(403);
      await markSteppedUp(tenantPrisma, token.payAdminB);
      await put('payAdminB', '0.1').expect(404);
      expect(await inA((tx) => tx.entityStatutoryOption.count({ where: { legalEntityId: ids.entity } }))).toBe(0);
      // Positive: a rate inside the range is kept from its date.
      await put('payAdmin', '0.1').expect(200);
      expect(await inA((tx) => tx.entityStatutoryOption.count({ where: { legalEntityId: ids.entity, optionKey: 'bonus.rate' } }))).toBe(1);
    });
  });

  describe('H14: Income-tax Act 2025 sections for declarations', () => {
    it('a 2026-27 declaration names Form No. 124 and the new sections with the old ones in brackets; unmapped subjects stay "verify number"', async () => {
      const d = (await api('emp1', 'get', '/tax/me/declarations').expect(200)).body as { taxYear: string; form: string; subjects: { key: string; section: string | null }[] };
      expect([d.taxYear, d.form]).toEqual(['2026-27', 'Form No. 124']);
      const section = (k: string) => d.subjects.find((x) => x.key === k)?.section;
      expect([section('sec80c'), section('sec80d_parents'), section('hra'), section('sec80ccd1b')]).toEqual(['s.123, Sch XV (old 80C)', 's.126 (old 80D)', 's.11, Sch III Sl. 11 (old 10(13A))', 's.124(3) (old 80CCD(1B))']);
      expect(section('sec80e')).toBe('verify number');
    });

    it('negatives: someone with no employment gets 404; a subject the rules do not list is a 400 and nothing is saved', async () => {
      await api('payAdminB', 'get', '/tax/me/declarations').expect(404);
      await api('emp1', 'post', '/tax/me/declarations').send({ lines: [{ subjectKey: 'sec80zz', amount: '1000.00' }] }).expect(400);
      expect(await inA((tx) => tx.taxDeclarationLine.count({ where: { employeeId: ids.emp1 } }))).toBe(0);
    });
  });
});
