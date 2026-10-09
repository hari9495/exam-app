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
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Payroll batch 5e end to end against the real database: the employee's tax workspace (the regime only until the cut-off,
// then HR with a reason), declarations (landlord PAN above the limit), proofs in the window verified line by line by
// someone else (never the employee, also in the database), the TDS on the payslip and the tax sheet being the same
// projection, the regime comparison, PAN status, perquisites, the year-end Form 130 (Part A from TRACES, Part B issued as
// a pay document with step-up and the phrase), the pay guard and another company kept apart.
describe('Payroll batch 5e (income tax)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'emp1' | 'emp2' | 'payAdminB';
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
  const stepDown = (who: Who) =>
    tenantPrisma.forTenant(SUPER, (tx) =>
      tx.session.update({ where: { id: (JSON.parse(Buffer.from(token[who].split('.')[1], 'base64url').toString()) as { sid: string }).sid }, data: { assuranceLevel: 'aal1', mfaVerifiedAt: null } }),
    );
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const ty = (() => {
    const y = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  })();
  const short = () => `P5E-${run}`.toUpperCase();
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
  const setting = (key: string, value: string) => inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'legal_entity', scopeId: ids.entity, key, value } }));

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
      const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-tax.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, sets, await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    planId = (await prisma.plan.create({ data: { name: `pay5e-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay5E Org ${k}`, slug: `pay5e-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
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
          tx.user.create({ data: { organizationId: o, email: `${who}@pay5e-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@pay5e-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay5E Mills', shortName: `P5E-${run}`, isDefault: true } })).id;
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
            workEmail: `${who}@pay5e-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P5E-001');
    ids.emp2 = await hire('emp2', 'P5E-002');
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    const version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp1, ids.emp2], from: first })
      .expect(201);
    for (const [emp, ctc] of [
      [ids.emp1, '2400000'],
      [ids.emp2, '480000'],
    ]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: first, templateVersionId: version, entryMode: 'ctc', annualCtc: ctc, reason: 'Joining salary' })
          .expect(201)
      ).body;
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
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every 5e table has forced RLS, tenant isolation, the support exclusion and the pay guard', async () => {
    const tables = ['tax_workspaces', 'tax_declaration_lines', 'tds_projections', 'perquisites', 'tax_certificates'];
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

  it('workspace: the regime is the employee’s until the cut-off; after it only payroll changes it, with a reason', async () => {
    const ws = (await api('emp1', 'get', '/tax/me/workspace').expect(200)).body;
    expect(ws).toMatchObject({ taxYear: ty, regime: 'new', lawVersion: Number(ty.slice(0, 4)) >= 2026 ? 'IT-2025' : 'IT-1961' });
    ids.ws1 = ws.id;
    const pastCutoff = today > ws.dates.regimeCutoff;
    if (pastCutoff) expect((await api('emp1', 'patch', '/tax/me/workspace').send({ regime: 'old' }).expect(409)).body.message).toMatch(/Ask payroll/);
    await api('emp1', 'post', `/tax/workspaces/${ws.id}/regime`).send({ regime: 'old', reason: 'Asked by the employee' }).expect(403);
    await api('payAdminB', 'post', `/tax/workspaces/${ws.id}/regime`).send({ regime: 'old', reason: 'Another company' }).expect(404);
    expect((await api('payAdmin', 'post', `/tax/workspaces/${ws.id}/regime`).send({ regime: 'old', reason: 'Employee asked in writing on time' }).expect(200)).body).toMatchObject({
      regime: 'old',
      regimeOverridden: true,
    });
    expect(
      (
        await api('emp1', 'patch', '/tax/me/workspace')
          .send({ otherIncome: [{ kind: 'interest', amount: '12000' }] })
          .expect(200)
      ).body.otherIncome,
    ).toEqual([{ kind: 'interest', amount: '12000' }]);
    // 5e-D3: a treaty claim is kept and flagged for payroll to handle by hand (a run check too).
    expect(
      (
        await api('emp2', 'patch', '/tax/me/workspace')
          .send({ dtaaCountry: 'SG', trcValidTo: `${Number(ty.slice(0, 4)) + 1}-03-31` })
          .expect(200)
      ).body,
    ).toMatchObject({ dtaaCountry: 'SG', treatyHandledByHand: true });
    expect((await api('payAdminB', 'get', '/tax/workspaces').expect(200)).body).toEqual([]);
  });

  it('declarations: known subjects only; rent above the limit needs the landlord’s PAN (kept encrypted)', async () => {
    const y = Number(ty.slice(0, 4));
    const rent = { subjectKey: 'hra', amount: '30000', rentFrom: `${y}-04`, rentTo: `${y + 1}-03`, metro: true };
    await api('emp1', 'post', '/tax/me/declarations')
      .send({ lines: [{ subjectKey: 'lottery', amount: '1' }] })
      .expect(400);
    expect(
      (
        await api('emp1', 'post', '/tax/me/declarations')
          .send({ lines: [rent] })
          .expect(400)
      ).body.message,
    ).toMatch(/landlord's PAN/);
    await api('emp1', 'post', '/tax/me/declarations')
      .send({
        lines: [
          { ...rent, landlordName: 'R Iyer', landlordPan: 'ABCPI1234K' },
          { subjectKey: 'sec80c', amount: '150000' },
        ],
      })
      .expect(200);
    const d = (await api('emp1', 'get', '/tax/me/declarations').expect(200)).body;
    expect(d.lines.map((l: { subjectKey: string; landlordPan: string | null }) => [l.subjectKey, l.landlordPan])).toEqual([
      ['hra', '••••••234K'],
      ['sec80c', null],
    ]);
    const raw = await scoped((tx) => tx.taxDeclarationLine.findFirstOrThrow({ where: { employeeId: ids.emp1, subjectKey: 'hra' } }));
    expect(raw.landlordPanEnc).not.toContain('ABCPI1234K');
    ids.line80c = d.lines.find((l: { subjectKey: string }) => l.subjectKey === 'sec80c').id;
  });

  it('proofs: only in the window; verified line by line by someone else (the database refuses the employee)', async () => {
    const closed = await api('emp1', 'post', `/tax/me/proofs/${ids.line80c}`).attach('file', PDF, 'ppf.pdf');
    if (closed.status === 409) await setting('tax.proof_window_opens', '10-01');
    await api('emp1', 'post', `/tax/me/proofs/${ids.line80c}`).attach('file', Buffer.from('not a proof'), 'x.txt').expect(400);
    if (closed.status === 409) await api('emp1', 'post', `/tax/me/proofs/${ids.line80c}`).attach('file', PDF, 'ppf.pdf').expect(201);
    const queue = (await api('payAdmin', 'get', '/tax/proofs').expect(200)).body;
    expect(queue).toEqual([expect.objectContaining({ id: ids.line80c, workspaceId: ids.ws1, proofStatus: 'pending' })]);
    await api('emp1', 'get', '/tax/proofs').expect(403);
    const f = await binary(api('payAdmin', 'get', `/tax/proofs/${ids.ws1}/lines/${ids.line80c}/files/0`)).expect(200);
    expect(Buffer.from(f.body as Buffer).equals(PDF)).toBe(true);
    await api('payAdmin', 'post', `/tax/proofs/${ids.ws1}/lines/${ids.line80c}/decision`).send({ decision: 'partly', amount: '200000', comment: 'More than declared' }).expect(400);
    await api('payAdmin', 'post', `/tax/proofs/${ids.ws1}/lines/${ids.line80c}/decision`).send({ decision: 'reject' }).expect(400);
    expect(
      (await api('payAdmin', 'post', `/tax/proofs/${ids.ws1}/lines/${ids.line80c}/decision`).send({ decision: 'partly', amount: '100000', comment: 'One receipt is for last year' }).expect(200)).body,
    ).toMatchObject({ proofStatus: 'partly', approvedAmount: '100000.00' });
    await api('payAdmin', 'post', `/tax/proofs/${ids.ws1}/lines/${ids.line80c}/decision`).send({ decision: 'approve' }).expect(409);
    await expect(scoped((tx) => tx.taxDeclarationLine.update({ where: { id: ids.line80c }, data: { verifierId: users.emp1 } }))).rejects.toThrow(/YX_TAX_SELF_VERIFY/);
  });

  it('the payslip’s TDS is the tax sheet’s figure; the regime comparison runs the same function', async () => {
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${ids.run}/readiness`).expect(200)).body;
    expect(ready.checks).toEqual(expect.arrayContaining([expect.objectContaining({ checkKey: 'tax_dtaa', employeeId: ids.emp2, severity: 'warn' })]));
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
    const slip = await scoped((tx) => tx.payslip.findFirstOrThrow({ where: { runId: ids.run, employeeId: ids.emp1, status: 'approved' } }));
    const tdsLine = await scoped((tx) => tx.payslipLine.findFirstOrThrow({ where: { payslipId: slip.id, componentCode: 'tds' } }));
    expect(Number(tdsLine.amount)).toBeGreaterThan(0);
    const sheet = (await api('emp1', 'get', '/tax/me/tax-sheet').expect(200)).body;
    expect(sheet).toMatchObject({ payslipId: slip.id, sheet: { monthTds: tdsLine.amount.toFixed(2), regime: 'old' } });
    // Before the proof cut-off the declared 80C counts (the partly approved amount only after it).
    expect(sheet.sheet.deductions).toEqual([expect.objectContaining({ key: 'sec80c', allowed: '150000.00' })]);
    expect(Number(sheet.sheet.exemptions.hra)).toBeGreaterThan(0);
    const cmp = (await api('emp1', 'post', '/tax/me/regime-compare').expect(200)).body;
    expect(cmp.regimes.map((r: { regime: string }) => r.regime)).toEqual(['new', 'old']);
    expect(cmp.regimes[1].annualTax).toBe(sheet.sheet.tax.total);
    // No PAN on file: never a block; the higher of the slab tax (nil here) and the no-PAN rate (PAY-5.05).
    const two = (await api('emp2', 'get', '/tax/me/tax-sheet').expect(200)).body.sheet;
    expect(two.tax).toMatchObject({ noPanApplied: true });
    expect(two.notes.join(' ')).toMatch(/No PAN on file/);
  });

  it('PAN status, perquisites (Form 12BA): payroll only, never about themselves', async () => {
    await api('emp1', 'post', `/tax/workspaces/${ids.ws1}/pan-status`).send({ status: 'inoperative', reason: 'Not linked' }).expect(403);
    expect((await api('payAdmin', 'post', `/tax/workspaces/${ids.ws1}/pan-status`).send({ status: 'inoperative', reason: 'Not linked with Aadhaar' }).expect(200)).body.panStatus).toBe('inoperative');
    const p = (
      await api('payAdmin', 'post', '/tax/perquisites').send({ employeeId: ids.emp1, taxYear: ty, kind: 'car', annualValue: '28800', description: 'Company car, also private use' }).expect(201)
    ).body;
    expect((await api('payAdmin', 'get', `/tax/perquisites?employeeId=${ids.emp1}`).expect(200)).body).toEqual([expect.objectContaining({ id: p.id, kind: 'car', annualValue: '28800.00' })]);
    expect((await api('payAdminB', 'get', '/tax/perquisites').expect(200)).body).toEqual([]);
  });

  it('year-end certificate: Part B from the year, Part A from TRACES, issued with step-up and the phrase; the employee gets it', async () => {
    const form = Number(ty.slice(0, 4)) >= 2026 ? 'form130' : 'form16';
    const c = (await api('payAdmin', 'post', '/tax/certificates').send({ employeeId: ids.emp1, taxYear: ty }).expect(201)).body;
    expect(c).toMatchObject({ form, partA: false, partB: { regime: 'old' } });
    await stepUp('payAdmin');
    expect(
      (
        await api('payAdmin', 'post', `/tax/certificates/${c.id}/issue`)
          .send({ confirmation: { phrase: `ISSUE ${form.toUpperCase()} ${ty}`, impact: [] } })
          .expect(409)
      ).body.message,
    ).toMatch(/Part A/);
    await api('payAdmin', 'post', `/tax/certificates/${c.id}/part-a`).attach('file', Buffer.from('nope'), 'a.pdf').expect(400);
    await api('payAdmin', 'post', `/tax/certificates/${c.id}/part-a`).attach('file', PDF, 'part-a.pdf').expect(200);
    await stepDown('payAdmin');
    expect(
      (
        await api('payAdmin', 'post', `/tax/certificates/${c.id}/issue`)
          .send({ confirmation: { phrase: `ISSUE ${form.toUpperCase()} ${ty}`, impact: [] } })
          .expect(403)
      ).body.code,
    ).toBe('STEP_UP_REQUIRED');
    await stepUp('payAdmin');
    await api('payAdmin', 'post', `/tax/certificates/${c.id}/issue`)
      .send({ confirmation: { phrase: 'ISSUE', impact: [] } })
      .expect(400);
    const issued = (
      await api('payAdmin', 'post', `/tax/certificates/${c.id}/issue`)
        .send({ confirmation: { phrase: `ISSUE ${form.toUpperCase()} ${ty}`, impact: [] } })
        .expect(200)
    ).body;
    expect(issued.payDocumentId).toBeTruthy();
    const mine = (await api('emp1', 'get', '/tax/me/certificates').expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ id: c.id, form, payDocumentId: issued.payDocumentId })]);
    const docs = (await api('emp1', 'get', '/payroll/me/documents').expect(200)).body;
    expect(JSON.stringify(docs)).toContain(issued.payDocumentId);
    const a = await binary(api('emp1', 'get', `/tax/me/certificates/${c.id}/part-a`)).expect(200);
    expect(Buffer.from(a.body as Buffer).equals(PDF)).toBe(true);
    await api('emp2', 'get', `/tax/me/certificates/${c.id}/part-a`).expect(404);
  });
});
