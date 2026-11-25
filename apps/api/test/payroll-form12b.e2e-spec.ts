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
import { buildTaxInputs } from '../src/payroll/tax.service';
import { projectTax } from '../src/payroll/tax';
import type { CalcComponent, Segment } from '../src/payroll/calc';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Founder decision 6 end to end against the real database: the employee enters previous-employer income (Form 12B, a
// PDF) in the tax workspace, may change it until payroll has checked it, and payroll checks it in the queue (never
// their own, also refused by the database); only an approved Form 12B counts in the tax projection.
describe('Form 12B entered by the employee (founder decision 6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let rules: StatutoryRulesService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'emp1' | 'emp2' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const ty = (() => {
    const y = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  })();
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
  const PDF2 = Buffer.from('%PDF-1.4\n% second copy\n%%EOF\n');
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
  const send = (who: Who, f: Record<string, string>, file: Buffer | null = PDF, name = 'form12b.pdf') => {
    let r = api(who, 'post', '/tax/me/form12b');
    for (const [k, v] of Object.entries(f)) r = r.field(k, v);
    return file ? r.attach('file', file, name) : r;
  };
  const good = { employerName: 'Old Mills Pvt Ltd', employerTan: 'BLRA12345B', gross: '300000', exemptions: '20000.50', tds: '30000' };
  // The previous-employer block of emp1's tax inputs, built the way a payroll run builds it.
  const previousOf = () =>
    inA((tx) =>
      buildTaxInputs(
        tx,
        { organizationId: org.A.id, isSuperAdmin: false },
        {
          employeeId: ids.emp1,
          employmentId: ids.emp1Employment,
          legalEntityId: ids.entity,
          month,
          periodStart: new Date(`${first}T00:00:00Z`),
          exitedOn: null,
          segment: { from: first, to: first, days: 30, lines: [{ code: 'basic', monthly: '100000' }], payBasis: 'monthly' } as unknown as Segment,
          components: [{ code: 'basic', kind: 'earning', statutory: null }] as unknown as CalcComponent[],
          age: 30,
        },
      ),
    );

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
    rules = moduleRef.get(StatutoryRulesService);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', 'in-tax.json'), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, sets, await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    planId = (await prisma.plan.create({ data: { name: `pay12b-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Pay12B Org ${k}`, slug: `pay12b-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
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
          tx.user.create({ data: { organizationId: o, email: `${who.toLowerCase()}@pay12b-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who.toLowerCase()}@pay12b-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Pay12B Mills', shortName: `P12-${run}`, isDefault: true } })).id;
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
            workEmail: `${who.toLowerCase()}@pay12b-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'P12-001');
    ids.emp2 = await hire('emp2', 'P12-002');
    ids.payAdminEmp = await hire('payAdmin', 'P12-003');
    ids.emp1Employment = (await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: ids.emp1 } }))).id;
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

  it('the table has forced RLS, tenant isolation, the support exclusion and the pay guard; the app cannot delete', async () => {
    const [r] = await prisma.$queryRaw<{ ok: boolean; del: boolean }[]>`
      SELECT (c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation')
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'support_session_excluded' AND NOT p.polpermissive)
        AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'pay_guard' AND NOT p.polpermissive)) AS ok,
        has_table_privilege('app_runtime', 'form12b_submissions', 'DELETE') AS del
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' WHERE c.relname = 'form12b_submissions'`;
    expect(r).toEqual({ ok: true, del: false });
  });

  it('the employee sees an empty, open Form 12B with the proof cut-off', async () => {
    const r = (await api('emp1', 'get', '/tax/me/form12b').expect(200)).body;
    expect(r).toEqual({ taxYear: ty, open: true, closesOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), submission: null });
    expect(r.closesOn > today).toBe(true);
  });

  it('bad input is refused in plain words', async () => {
    expect((await send('emp1', good, null).expect(400)).body.message).toBe('Attach your Form 12B as a PDF.');
    expect((await send('emp1', good, Buffer.from('just text'), 'form12b.txt').expect(400)).body.message).toBe('Form 12B must be a PDF file.');
    expect((await send('emp1', { ...good, employerTan: 'BLR12345B' }).expect(400)).body.message).toMatch(/^Enter the previous employer's TAN/);
    expect((await send('emp1', { ...good, tds: '300000.01' }).expect(400)).body.message).toBe('The tax deducted cannot be more than the gross salary.');
    expect((await send('emp1', { ...good, gross: '-5' }).expect(400)).body.message).toMatch(/^Enter the gross salary in rupees/);
    await send('emp1', { ...good, extra: 'x' }).expect(400);
    expect((await api('emp1', 'get', '/tax/me/form12b').expect(200)).body.submission).toBeNull();
  });

  it('sent, then changed while pending (the same entry, back to pending); the TAN is kept in capitals', async () => {
    const a = (await send('emp1', { ...good, employerTan: 'blra12345b' }).expect(201)).body;
    expect(a).toMatchObject({ employerName: 'Old Mills Pvt Ltd', employerTan: 'BLRA12345B', gross: '300000.00', exemptions: '20000.50', tds: '30000.00', status: 'pending', comment: null, file: { name: 'form12b.pdf', size: PDF.length } });
    ids.f1 = a.id;
    const b = (await send('emp1', { employerTan: 'BLRA12345B', gross: '310000', tds: '31000' }, PDF2, 'corrected.pdf').expect(201)).body;
    expect(b).toMatchObject({ id: ids.f1, employerName: null, gross: '310000.00', exemptions: '0.00', tds: '31000.00', status: 'pending', file: { name: 'corrected.pdf', size: PDF2.length } });
    ids.f1Bytes = PDF2.toString('base64');
  });

  it('the employee neither lists nor decides; another company gets "not found"', async () => {
    await api('emp1', 'get', '/tax/form12b').expect(403);
    await api('emp1', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'approve' }).expect(403);
    await api('emp1', 'get', `/tax/form12b/${ids.f1}/file`).expect(403);
    expect((await api('payAdminB', 'get', '/tax/form12b').expect(200)).body).toEqual([]);
    await api('payAdminB', 'get', `/tax/form12b/${ids.f1}/file`).expect(404);
    await api('payAdminB', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'approve' }).expect(404);
    await api('payAdmin', 'post', `/tax/form12b/${randomUUID()}/decision`).send({ decision: 'approve' }).expect(404);
  });

  it('payroll lists and downloads it; a rejection needs a reason; the employee fixes it and it waits again', async () => {
    const q = (await api('payAdmin', 'get', '/tax/form12b').expect(200)).body;
    expect(q).toEqual([
      {
        id: ids.f1,
        employeeId: ids.emp1,
        employeeName: `emp1 ${run}`,
        legalEntityId: ids.entity,
        taxYear: ty,
        employerName: null,
        employerTan: 'BLRA12345B',
        gross: '310000.00',
        exemptions: '0.00',
        tds: '31000.00',
        status: 'pending',
        comment: null,
        file: { name: 'corrected.pdf', size: PDF2.length, at: expect.any(String) },
        submittedAt: expect.any(String),
      },
    ]);
    const f = await binary(api('payAdmin', 'get', `/tax/form12b/${ids.f1}/file`)).expect(200);
    expect(Buffer.from(f.body as Buffer).equals(PDF2)).toBe(true);
    await api('payAdmin', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'reject' }).expect(400);
    await api('payAdmin', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'maybe' }).expect(400);
    expect((await api('payAdmin', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'reject', comment: 'The TDS does not match Part B' }).expect(200)).body).toMatchObject({
      status: 'rejected',
      comment: 'The TDS does not match Part B',
      verifiedAt: expect.any(String),
    });
    await api('payAdmin', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'approve' }).expect(409);
    expect((await api('emp1', 'get', '/tax/me/form12b').expect(200)).body.submission).toMatchObject({ status: 'rejected', comment: 'The TDS does not match Part B' });
    expect((await api('payAdmin', 'get', '/tax/form12b?status=rejected').expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.f1]);
    expect((await send('emp1', good).expect(201)).body).toMatchObject({ id: ids.f1, status: 'pending', comment: null, verifiedAt: null, gross: '300000.00' });
    await api('payAdmin', 'get', '/tax/form12b?status=done').expect(400);
  });

  it('only an approved Form 12B counts in the projection, exactly; after approval the employee cannot change it', async () => {
    // Pending: not counted.
    expect((await previousOf()).previous).toEqual({ gross: '0.00', exemptions: '0.00', tds: '0.00', pt: '0.00' });
    const before = await previousOf();
    expect((await api('payAdmin', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'approve' }).expect(200)).body.status).toBe('approved');
    const after = await previousOf();
    expect(after.previous).toEqual({ gross: '300000.00', exemptions: '20000.50', tds: '30000.00', pt: '0.00' });
    const published = await rules.published();
    const m = { month, gross: '100000', basic: '100000', hra: '0', pt: '0' };
    const a = projectTax(before, published, m);
    const b = projectTax(after, published, m);
    expect(b.income.previousEmployers).toBe('300000.00');
    expect(Number(b.taxable) - Number(a.taxable)).toBe(300000);
    expect(Number(b.monthTds)).not.toBe(Number(a.monthTds));
    expect((await send('emp1', good).expect(409)).body.message).toBe('Payroll has already checked your Form 12B. Ask payroll to change it.');
    expect((await api('emp1', 'get', '/tax/me/form12b').expect(200)).body.submission).toMatchObject({ status: 'approved', verifiedAt: expect.any(String) });
    await api('payAdmin', 'post', `/tax/form12b/${ids.f1}/decision`).send({ decision: 'reject', comment: 'Changed my mind' }).expect(409);
  });

  it('payroll never checks their own Form 12B (the database refuses it too)', async () => {
    const own = (await send('payAdmin', good).expect(201)).body;
    expect((await api('payAdmin', 'get', '/tax/form12b').expect(200)).body.map((r: { id: string }) => r.id)).not.toContain(own.id);
    expect((await api('payAdmin', 'post', `/tax/form12b/${own.id}/decision`).send({ decision: 'approve' }).expect(403)).body.message).toBe('Someone else checks your own Form 12B.');
    await api('payAdmin', 'get', `/tax/form12b/${own.id}/file`).expect(403);
    await expect(scoped((tx) => tx.form12bSubmission.update({ where: { id: own.id }, data: { verifierId: users.payAdmin, status: 'approved' } }))).rejects.toThrow(/YX_TAX_SELF_VERIFY/);
    // Another employee's row is never readable by an employee (pay guard).
    const seen = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: users.emp2 } as TenantContext, (tx) => tx.form12bSubmission.findMany({ where: { id: ids.f1 } }));
    expect(seen).toEqual([]);
  });
});
