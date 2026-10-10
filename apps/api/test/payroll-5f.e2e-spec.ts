import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import JSZip from 'jszip';
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

// Payroll batch 5f end to end against the real database: the statutory hub; PF ECR, ESI, PT files from the approved
// payslips (UAN, IP numbers and PANs decrypted only into the files, downloaded through audited single-use links); a new
// file only with a reason; uploaded and filed by the compliance owner with step-up and the phrase, which locks the month;
// a supplementary filing for what changed after; an excess recorded; the TDS challan pre-filled and deposited; the
// quarterly return reconciled to zero, its annexure, filed, and a correction; registers generated, frozen (never changed
// again), the signature checked, each employee seeing only their own row, a new version with a reason and the inspection
// pack; Part A from a TRACES ZIP matched by PAN and Form 130 / 16 issued in bulk; the advisory feed; another company apart.
describe('Payroll batch 5f (statutory files, returns, registers)', () => {
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
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'compliance' | 'approver1' | 'approver2' | 'emp1' | 'emp2' | 'payAdminB';
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
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const ty = (() => {
    const y = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  })();
  const quarter = Math.floor(((Number(month.slice(5)) + 8) % 12) / 3) + 1;
  const short = () => `P5F-${run}`.toUpperCase();
  const PAN1 = 'ABCPE1234F';
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
  const download = async (who: Who, fileId: string) => {
    const link = (await api(who, 'post', `/payroll/files/${fileId}/link`).expect(200)).body;
    return (await binary(api(who, 'get', link.path)).expect(200)).body as Buffer;
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      const advisory: RuleFileSet = {
        statute: 'IN.ADVISORY',
        jurisdiction: 'IN-KA',
        version: `ADV-${run}`,
        validFrom: '2026-01-01',
        validTo: null,
        lawVersion: 'CODE',
        verify: true,
        source: 'Test advisory for the e2e suite.',
        values: { kind: 'advisory', code: `KA-TEST-${run}`, title: 'Karnataka test advisory', summary: 'A change the company should look at.', action: 'Check the PT slabs used.' },
        golden: [{ name: 'code', fn: 'advisory', input: {}, expected: { code: `KA-TEST-${run}` } }],
      };
      await loadRuleSets(tx, [...pack('in-tax.json'), ...pack('in-filing.json'), advisory], await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    planId = (await prisma.plan.create({ data: { name: `pay5f-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5F Org ${k}`, slug: `pay5f-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['compliance', 'A', 'panel', template('compliance_owner')],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
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
          tx.user.create({ data: { organizationId: o, email: `${who}@pay5f-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@pay5f-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5F Mills', shortName: `P5F-${run}`, isDefault: true } })).id;
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
            workEmail: `${who}@pay5f-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P5F-001');
    ids.emp2 = await hire('emp2', 'P5F-002');
    // Identifiers as P02 stores them: sealed values and keyed hashes.
    for (const [emp, uan, esic, pan] of [
      [ids.emp1, '100200300400', '0012345678', PAN1],
      [ids.emp2, '100200300401', '0012345679', null],
    ] as const) {
      await inA((tx) =>
        tx.employeeIdentifiers.create({
          data: {
            organizationId: org.A.id,
            employeeId: emp,
            uanEnc: sealValue(crypto, org.A.id, emp, uan),
            uanHash: hashValue(crypto, org.A.id, 'uan', uan),
            uanLast4: uan.slice(-4),
            esicEnc: sealValue(crypto, org.A.id, emp, esic),
            esicHash: hashValue(crypto, org.A.id, 'esic', esic),
            esicLast4: esic.slice(-4),
            ...(pan ? { panEnc: sealValue(crypto, org.A.id, emp, pan), panHash: hashValue(crypto, org.A.id, 'pan', pan), panLast4: pan.slice(-4) } : {}),
          },
        }),
      );
    }
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp1, ids.emp2], from: first })
      .expect(201);
    for (const [emp, ctc] of [
      [ids.emp1, '4800000'],
      [ids.emp2, '240000'],
    ]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: ctc, reason: 'Joining salary' })
          .expect(201)
      ).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/readiness`).expect(200)).body;
    for (const b of ready.checks.filter((c: { checkKey: string }) => c.checkKey === 'bank_missing'))
      await api('payAdmin', 'post', `/payroll/runs/${ids.run}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/calculate`).expect(202);
    for (let i = 0; i < 120 && (await api('payAdmin', 'get', `/payroll/runs/${ids.run}`)).body.status !== 'calculated'; i++) await new Promise((ok) => setTimeout(ok, 250));
    await api('payAdmin', 'post', `/payroll/runs/${ids.run}/submit`).send({}).expect(200);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${ids.run}/decision`)
        .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${month}`, impact: [] } })
        .expect(200);
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

  it('every 5f table has forced RLS, tenant isolation, the support exclusion and the pay guard', async () => {
    const tables = ['statutory_filings', 'statutory_penalty_lines', 'tds_challans', 'tds_returns', 'statutory_registers', 'register_rows', 'inspection_packs', 'advisory_reviews'];
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

  it('the hub: each statute with its amount and due date; another company and the employee see nothing', async () => {
    const hub = (await api('payAdmin', 'get', `/statutory/hub?entityId=${ids.entity}&month=${month}`).expect(200)).body;
    expect(hub.cards.map((c: { statute: string; state: string | null }) => `${c.statute}${c.state ? `:${c.state}` : ''}`)).toEqual(expect.arrayContaining(['IN.PF', 'IN.ESI', 'IN.PT:IN-KA']));
    expect(hub.cards.find((c: { statute: string }) => c.statute === 'IN.PF')).toMatchObject({ status: 'not_generated', dueOn: expect.stringMatching(/-15$/) });
    expect(Number(hub.tds.amount)).toBeGreaterThan(0);
    await api('payAdminB', 'get', `/statutory/hub?entityId=${ids.entity}&month=${month}`).expect(404);
    await api('emp1', 'get', `/statutory/hub?entityId=${ids.entity}&month=${month}`).expect(403);
  });

  it('PF, ESI and PT files from the approved payslips; a new file needs a reason; downloads are audited single-use links', async () => {
    const pf = (await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month }).expect(201)).body;
    expect(pf).toMatchObject({ rows: 2, formatVersion: 'EPFO-ECR-2.0', missing: [] });
    const ecr = (await download('payAdmin', pf.fileId)).toString();
    expect(ecr).toMatch(/^100200300400#~#EMP1 /m);
    expect(ecr.trim().split('\n')).toHaveLength(2);
    expect((await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month }).expect(400)).body.message).toMatch(/Say why/);
    ids.pf = (await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month, reason: 'UAN corrected for one person' }).expect(201)).body.id;
    const esi = (await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.ESI', month }).expect(201)).body;
    expect(esi.rows).toBe(1);
    await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PT', month }).expect(400);
    expect((await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PT', state: 'IN-KA', month }).expect(201)).body.rows).toBeGreaterThan(0);
    const list = (await api('compliance', 'get', `/statutory/filings?entityId=${ids.entity}&month=${month}`).expect(200)).body;
    expect(
      list
        .filter((f: { statute: string; status: string }) => f.statute === 'IN.PF')
        .map((f: { status: string }) => f.status)
        .sort(),
    ).toEqual(['generated', 'superseded']);
    // A partner path is not connected yet.
    expect((await api('payAdmin', 'post', `/statutory/filings/${ids.pf}/transmit`).expect(409)).body.code).toBe('NO_FILING_PARTNER');
  });

  it('uploaded and filed by the compliance owner with step-up and the phrase; the month locks as filed', async () => {
    await api('payAdmin', 'post', `/statutory/filings/${ids.pf}/uploaded`).send({ reference: 'TRRN-5554443' }).expect(403);
    await stepUp('compliance');
    await api('compliance', 'post', `/statutory/filings/${ids.pf}/filed`)
      .send({ confirmation: { phrase: `FILED PF ${month}`, impact: [] } })
      .expect(409);
    await api('compliance', 'post', `/statutory/filings/${ids.pf}/uploaded`).send({ reference: 'TRRN-5554443' }).expect(200);
    await api('compliance', 'post', `/statutory/filings/${ids.pf}/filed`)
      .send({ confirmation: { phrase: 'FILED', impact: [] } })
      .expect(400);
    expect(
      (
        await api('compliance', 'post', `/statutory/filings/${ids.pf}/filed`)
          .send({ confirmation: { phrase: `FILED PF ${month}`, impact: [] } })
          .expect(200)
      ).body,
    ).toMatchObject({ status: 'filed' });
    const period = await inA((tx) => tx.payPeriod.findFirst({ where: { legalEntityId: ids.entity, periodStart: new Date(`${first}T00:00:00Z`), payGroupId: null } }));
    expect(period?.stage).toBe('filed');
    expect((await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month, reason: 'Try again' }).expect(409)).body.message).toMatch(/supplementary/);
  });

  it('supplementary: what changed after the filed return, as its own file; an excess is recorded', async () => {
    await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month, kind: 'supplementary', reason: 'Nothing new' }).expect(409);
    // An off-cycle payment approved after the return (batch 5g makes these; here it is written directly).
    await scoped(async (tx) => {
      const base = await tx.payslip.findFirstOrThrow({ where: { runId: ids.run, employeeId: ids.emp1, status: 'approved' } });
      const s = await tx.payslip.create({
        data: {
          organizationId: org.A.id,
          legalEntityId: ids.entity,
          runType: 'offcycle',
          employmentId: base.employmentId,
          employeeId: ids.emp1,
          periodStart: base.periodStart,
          calcVersion: 1,
          gross: 10000,
          deductions: 1200,
          net: 8800,
          employerCost: 11200,
          ruleVersions: base.ruleVersions as object,
          snapshotHash: 'a'.repeat(64),
          resultHash: 'b'.repeat(64),
        },
      });
      await tx.payslipLine.createMany({
        data: [
          { code: 'arrears', kind: 'earning', amount: 10000 },
          { code: 'pf_employee', kind: 'deduction', amount: 1200 },
          { code: 'pf_employer', kind: 'employer', amount: 1200 },
        ].map((l, i) => ({
          organizationId: org.A.id,
          legalEntityId: ids.entity,
          employeeId: ids.emp1,
          payslipId: s.id,
          position: i,
          componentCode: l.code,
          name: l.code,
          kind: l.kind,
          amount: l.amount,
          explanation: 'Arrears paid after the return.',
        })),
      });
      await tx.payslip.update({ where: { id: s.id }, data: { status: 'approved', approvedAt: new Date() } });
    });
    const sup = (
      await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month, kind: 'supplementary', reason: 'Arrears paid after the return' }).expect(201)
    ).body;
    expect(sup).toMatchObject({ kind: 'supplementary', difference: '2400.00' });
    expect((await download('payAdmin', sup.fileId)).toString().trim().split('\n')).toHaveLength(1);
    await api('payAdmin', 'post', '/statutory/filings').send({ legalEntityId: ids.entity, statute: 'IN.PF', month, kind: 'excess_adjustment' }).expect(400);
    expect(
      (
        await api('payAdmin', 'post', '/statutory/filings')
          .send({ legalEntityId: ids.entity, statute: 'IN.PF', month, kind: 'excess_adjustment', amount: '150', reason: 'Paid twice for one person' })
          .expect(201)
      ).body,
    ).toMatchObject({ status: 'recorded' });
  });

  it('TDS: the challan pre-filled and deposited; the quarterly return reconciled to zero, its annexure, filed; a correction', async () => {
    const ch = (await api('payAdmin', 'post', '/statutory/challans').send({ entityId: ids.entity, month }).expect(201)).body;
    expect(Number(ch.tds)).toBeGreaterThan(0);
    await api('payAdmin', 'patch', `/statutory/challans/${ch.id}`).send({ tds: '1.00' }).expect(400);
    const ret = (await api('payAdmin', 'post', '/statutory/tds-returns').send({ entityId: ids.entity, taxYear: ty, quarter }).expect(201)).body;
    expect(ret).toMatchObject({ formCode: Number(ty.slice(0, 4)) >= 2026 ? '138' : '24Q', status: 'draft' });
    expect(ret.deductees.find((d: { employeeCode: string }) => d.employeeCode === 'P5F-001')).toMatchObject({ panLast4: '234F', noPan: false });
    expect(ret.deductees.find((d: { employeeCode: string }) => d.employeeCode === 'P5F-002')).toMatchObject({ panLast4: null, noPan: true });
    expect(JSON.stringify(ret)).not.toContain(PAN1);
    expect((await api('payAdmin', 'post', `/statutory/tds-returns/${ret.id}/reconcile`).expect(200)).body.reconciliation.ok).toBe(false);
    await api('payAdmin', 'post', `/statutory/tds-returns/${ret.id}/file`).expect(409);
    await api('payAdmin', 'patch', `/statutory/challans/${ch.id}`).send({ challanNo: '00042', bsrCode: '0510308', depositDate: today }).expect(200);
    expect((await api('payAdmin', 'post', `/statutory/tds-returns/${ret.id}/reconcile`).expect(200)).body).toMatchObject({ status: 'reconciled', reconciliation: { ok: true } });
    // 5f-D1: the official e-TDS file needs the deductor's details first.
    expect((await api('payAdmin', 'post', `/statutory/tds-returns/${ret.id}/file`).expect(400)).body.problems).toEqual(expect.arrayContaining([expect.stringMatching(/TAN/)]));
    await inA(async (tx) => {
      await tx.legalEntity.update({
        where: { id: ids.entity },
        data: { tan: 'BLRP12345E', pan: 'AAACP1234F', registeredAddress: { lines: ['12 MG Road'], city: 'Bengaluru', state: 'IN-KA', postalCode: '560001', country: 'IN' } },
      });
      await tx.statutoryRegistration.create({
        data: { organizationId: org.A.id, legalEntityId: ids.entity, statute: 'IN.TDS', registrationNo: 'BLRP12345E', responsiblePerson: 'Divya R', responsibleDesignation: 'Director', status: 'on' },
      });
    });
    const file = (await api('payAdmin', 'post', `/statutory/tds-returns/${ret.id}/file`).expect(200)).body;
    // No FVU in this environment: the development fake checks the structure and says it is not the FVU.
    expect(file.validation).toMatchObject({ validator: 'fake', ok: true, errors: [] });
    const etds = (await download('payAdmin', file.fileId)).toString();
    expect(etds).toContain(PAN1);
    expect(etds.split('\r\n')[0]).toMatch(/^1\^FH\^NS1\^R\^/);
    await stepUp('compliance');
    const phrase = `FILED ${ret.formCode} Q${quarter} ${ty}`;
    expect(
      (
        await api('compliance', 'post', `/statutory/tds-returns/${ret.id}/filed`)
          .send({ tokenNo: 'TKN123456', confirmation: { phrase, impact: [] } })
          .expect(200)
      ).body.status,
    ).toBe('filed');
    expect((await api('payAdmin', 'post', `/statutory/tds-returns/${ret.id}/correction`).expect(201)).body).toMatchObject({ kind: 'correction', correctsId: ret.id });
  });

  it('registers: made from the payslips, frozen (never changed again), the signature checked; each person sees only their own row', async () => {
    const made = (await api('payAdmin', 'post', '/statutory/registers').send({ entityId: ids.entity, month }).expect(201)).body;
    expect(made.registers.map((r: { type: string }) => r.type).sort()).toEqual(['deductions', 'muster', 'wages']);
    const wages = made.registers.find((r: { type: string }) => r.type === 'wages');
    await api('payAdmin', 'post', `/statutory/registers/${wages.id}/freeze`).expect(403);
    await stepUp('compliance');
    await api('compliance', 'post', `/statutory/registers/${wages.id}/freeze`).expect(200);
    await expect(scoped((tx) => tx.statutoryRegister.update({ where: { id: wages.id }, data: { rowCount: 99 } }))).rejects.toThrow(/YX_REGISTER_FROZEN/);
    expect((await api('compliance', 'post', `/statutory/registers/${wages.id}/sign`).attach('file', Buffer.from('%PDF-1.4 not signed'), 'w.pdf').expect(400)).body.code).toBe('SIGNATURE_REFUSED');
    const mine = (await api('emp1', 'get', '/statutory/me/registers').expect(200)).body as { cells: string[] }[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.cells[0] === 'P5F-001')).toBe(true);
    expect(await inA((tx) => tx.registerRow.count())).toBe(0);
    const pack = (await api('compliance', 'post', '/statutory/inspection-packs').send({ entityId: ids.entity, month }).expect(201)).body;
    const zip = await JSZip.loadAsync(await download('compliance', pack.fileId));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['cover.txt', `wages-${month}-v1.pdf`]));
    await api('payAdmin', 'post', '/statutory/registers').send({ entityId: ids.entity, month }).expect(400);
    const v2 = (await api('payAdmin', 'post', '/statutory/registers').send({ entityId: ids.entity, month, reason: 'Arrears added after the first version' }).expect(201)).body;
    expect(v2.registers.every((r: { version: number }) => r.version === 2)).toBe(true);
  });

  it('Part A from a TRACES ZIP matched by PAN; Form 130 / 16 issued in bulk with step-up and the phrase', async () => {
    const zip = new JSZip();
    zip.file(`${PAN1}_${ty}.pdf`, Buffer.from('%PDF-1.4\n%%EOF\n'));
    zip.file('ZZZZZ9999Z_unknown.pdf', Buffer.from('%PDF-1.4\n%%EOF\n'));
    const imported = (
      await api('payAdmin', 'post', '/statutory/tds-returns/part-a')
        .field('entityId', ids.entity)
        .field('taxYear', ty)
        .attach('file', await zip.generateAsync({ type: 'nodebuffer' }), 'part-a.zip')
        .expect(200)
    ).body;
    expect(imported).toMatchObject({ files: 2, matched: 1 });
    const form = Number(ty.slice(0, 4)) >= 2026 ? 'FORM130' : 'FORM16';
    await stepUp('compliance');
    expect(
      (
        await api('compliance', 'post', '/statutory/form130/batch')
          .send({ entityId: ids.entity, taxYear: ty, confirmation: { phrase: `ISSUE ${form} ${ty}`, impact: [] } })
          .expect(200)
      ).body,
    ).toMatchObject({ issued: 1, failed: [] });
    expect((await api('emp1', 'get', '/tax/me/certificates').expect(200)).body).toHaveLength(1);
  });

  it('the advisory feed for the entity’s states; reviewed once', async () => {
    const list = (await api('compliance', 'get', `/statutory/advisories?entityId=${ids.entity}`).expect(200)).body;
    const a = list.find((x: { code: string }) => x.code === `KA-TEST-${run}`);
    expect(a).toMatchObject({ jurisdiction: 'IN-KA', reviewed: null });
    await api('payAdmin', 'post', `/statutory/advisories/${a.code}/review`).send({ entityId: ids.entity, note: 'Checked the PT slabs' }).expect(403);
    await api('compliance', 'post', `/statutory/advisories/${a.code}/review`).send({ entityId: ids.entity, note: 'Checked the PT slabs' }).expect(201);
    await api('compliance', 'post', `/statutory/advisories/${a.code}/review`).send({ entityId: ids.entity, note: 'Again' }).expect(409);
  });
});
