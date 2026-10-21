import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { BlobStorageService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { todayIst } from '../src/org-structure/org-validation';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Contract labour part 2 (founder decision 21 Oct 2026): workers' identifiers (sealed, masked, audited reveal), vendor
// compliance (proofs and their checks, maker-checker, bill holds, alerts, documents), registers and returns from the
// records, reports; the keys and their reach (site scope read only), and never another company.
describe('Contract labour part 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  // Last month: its proofs are due by the 15th of this month (overdue once that has passed).
  const month = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'clerkA' | 'siteA' | 'hrB';
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const binary = (r: request.Test) =>
    r.buffer(true).parse((res, cb) => {
      const c: Buffer[] = [];
      res.on('data', (x: Buffer) => c.push(x));
      res.on('end', () => cb(null, Buffer.concat(c)));
    });
  const ALL = ['employee.profile.view', 'clra.worker.view', 'clra.worker.manage', 'clra.compliance.manage', 'clra.identity.view'];
  const AADHAAR = '548550001073';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `clb2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLB2 ${k}`, slug: `clb2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      await tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Plant ${k}`, shortName: `C2${k}${run}`, isDefault: true } })).id;
        const loc = (name: string, code: string, state: string, zone: string | null) => tx.location.create({ data: { ...o, legalEntityId: ids[`le${k}`], name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata', minWageZone: zone } });
        if (k === 'A') {
          ids.hosur = (await loc('Hosur plant', 'HSR', 'IN-TN', null)).id;
          ids.blr = (await loc('Bengaluru office', 'BLR', 'IN-KA', '1')).id;
        } else ids.siteB = (await loc('Hosur plant', 'HSR', 'IN-TN', null)).id;
      });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string[] | null][] = [
      ['hrA', 'A', ALL],
      ['clerkA', 'A', ['clra.worker.view', 'clra.worker.manage']],
      ['siteA', 'A', null],
      ['hrB', 'B', ALL],
    ];
    for (const [name, k, keys] of roster) {
      const permissionProfileId = keys ? (await tenantPrisma.forTenant(ctx(k), (tx) => tx.permissionProfile.create({ data: { organizationId: org[k].id, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `${name}-${run}@clb2.test`, name: `${name} Person`, passwordHash, role: 'panel', permissionProfileId } }))).id;
    }
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const role = await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `plant-${run}`, permissionsJson: JSON.stringify(['clra.worker.view', 'clra.identity.view']) } });
      await tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.siteA, permissionProfileId: role.id, scopeType: 'location', locationId: ids.hosur, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Plant HR', grantedBy: users.hrA } });
    });
    for (const [name, k] of roster) token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${name}-${run}@clb2.test`, password: PASSWORD }).expect(200)).body.accessToken;

    const contractor = async (name: string, site: string, state: string, no: string) => {
      const id = (await api('hrA', 'post', '/contract-labour/contractors').send({ legalEntityId: ids.leA, name, work: 'Housekeeping', licence: { licenceNo: `${no}/${run}`, locationId: site, states: [state], maxWorkers: 10, validFrom: day(-200), validTo: day(300) } }).expect(201)).body.id;
      const licence = (await api('hrA', 'get', '/contract-labour/contractors').expect(200)).body.find((k: { id: string }) => k.id === id).licences[0].id;
      return { id, licence };
    };
    const sri = await contractor('Sri Lakshmi Facility Services', ids.hosur, 'IN-TN', 'TN');
    const anna = await contractor('Annapoorna Canteen Services', ids.blr, 'IN-KA', 'KA');
    Object.assign(ids, { sri: sri.id, sriLic: sri.licence, anna: anna.id, annaLic: anna.licence });
    const deploy = async (k: { id: string; licence: string }, site: string, given: string, extra: Record<string, unknown> = {}) => {
      const w = (await api('hrA', 'post', '/contract-labour/workers').send({ contractorId: k.id, licenceId: k.licence, locationId: site, givenName: given, dateOfBirth: '1990-01-01', work: 'Housekeeping', skill: 'unskilled', wage: '12000', fromOn: `${month}-01`, ...extra }).expect(201)).body;
      await api('hrA', 'post', `/contract-labour/workers/${w.id}/approve`).expect(200);
      return w.id as string;
    };
    ids.murugan = await deploy(sri, ids.hosur, 'Murugan', { aadhaar: AADHAAR, uan: '101355001371', esic: '3100771211', gatePass: `GP-${run}` });
    ids.selvi = await deploy(sri, ids.hosur, 'Selvi');
    ids.geetha = await deploy(anna, ids.blr, 'Geetha');
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        for (const o of [org.A.id, org.B.id]) {
          await tx.contractDeployment.deleteMany({ where: { organizationId: o } });
          await tx.contractorLicence.deleteMany({ where: { organizationId: o } });
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('keeps Aadhaar, UAN and ESI sealed: masked in lists and exports, in full only through a recorded reveal', async () => {
    const res = await api('hrA', 'get', '/contract-labour/workers').expect(200);
    expect(res.text).not.toContain(AADHAAR);
    expect(res.body.find((w: { id: string }) => w.id === ids.murugan)).toMatchObject({ aadhaarLast4: '1073', uanLast4: '1371', esicLast4: '1211', gatePass: `GP-${run}` });
    expect((await api('hrA', 'post', `/contract-labour/workers/${ids.murugan}/reveal`).send({ field: 'aadhaar' }).expect(200)).body).toEqual({ field: 'aadhaar', value: AADHAAR });
    const logged = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'clra.worker.identity_viewed', entityId: ids.murugan } }));
    expect(logged?.metadataJson).toContain('aadhaar');
    await api('clerkA', 'post', `/contract-labour/workers/${ids.murugan}/reveal`).send({ field: 'aadhaar' }).expect(403);
    await api('hrB', 'post', `/contract-labour/workers/${ids.murugan}/reveal`).send({ field: 'aadhaar' }).expect(404);
    // The same Aadhaar is never on two open deployments.
    await api('hrA', 'patch', `/contract-labour/workers/${ids.selvi}/identifiers`).send({ aadhaar: AADHAAR }).expect(409);
    const csv = await binary(api('hrA', 'get', '/contract-labour/workers/export?format=csv')).expect(200);
    expect(csv.body.toString()).toContain('XXXX XXXX 1073');
    expect(csv.body.toString()).not.toContain(AADHAAR);
  });

  it('gives the minimum wage of a site and skill from the published table, or says why there is none', async () => {
    const blr = (await api('hrA', 'get', `/contract-labour/minimum-wage?locationId=${ids.blr}&skill=unskilled&on=${today}`).expect(200)).body;
    expect(Number(blr.monthly)).toBeGreaterThan(10000);
    expect((await api('hrA', 'get', `/contract-labour/minimum-wage?locationId=${ids.hosur}&skill=unskilled&on=${today}`).expect(200)).body).toMatchObject({ monthly: null });
  });

  it('checks proofs, keeps maker and checker apart, holds the bill and raises alerts with their liability', async () => {
    const esi = (await api('clerkA', 'post', '/contract-labour/proofs').field('contractorId', ids.sri).field('month', month).field('proofType', 'esi').field('reference', '26091544901').field('amount', '650').field('workersCovered', '1').expect(201)).body.id;
    const proof = (await api('hrA', 'get', `/contract-labour/proofs/${esi}`).expect(200)).body;
    expect(proof.checks.find((c: { id: string }) => c.id === 'covered')).toMatchObject({ status: 'fail', detail: expect.stringContaining('Short by 1') });
    expect((await api('hrA', 'post', `/contract-labour/proofs/${esi}/decision`).send({ decision: 'verified' }).expect(409)).body.code).toBe('CHECKS_FAILED');
    await api('hrA', 'post', `/contract-labour/proofs/${esi}/decision`).send({ decision: 'discrepancy', note: 'Covers 1 worker; 2 were deployed.' }).expect(200);
    await api('clerkA', 'post', `/contract-labour/proofs/${esi}/decision`).send({ decision: 'verified' }).expect(403);
    // hrA hands one in and may not verify it.
    const pf = (await api('hrA', 'post', '/contract-labour/proofs').field('contractorId', ids.sri).field('month', month).field('proofType', 'pf').field('workersCovered', '2').expect(201)).body.id;
    expect((await api('hrA', 'post', `/contract-labour/proofs/${pf}/decision`).send({ decision: 'verified' }).expect(403)).body.message).toMatch(/someone else/);
    const view = (await api('hrA', 'get', `/contract-labour/compliance?month=${month}`).expect(200)).body;
    const row = view.matrix.find((m: { contractorId: string }) => m.contractorId === ids.sri);
    expect(row.workers).toBe(2);
    expect(row.statuses.map((s: { status: string }) => s.status)).toEqual(['submitted', 'discrepancy', ...(today > view.dueOn ? ['overdue', 'overdue', 'overdue'] : ['open', 'open', 'open'])]);
    expect(row.held).toBe(true);
    const short = view.alerts.find((a: { type: string; contractorId: string }) => a.type === 'Short ESI challan' && a.contractorId === ids.sri);
    // One worker short at ₹12,000: ESI is 4% of the wage.
    expect(short).toMatchObject({ liability: 480, severity: 'High' });
    // Releasing the bill needs compliance and a reason; the alert stays open until it is closed with a note.
    await api('clerkA', 'post', '/contract-labour/bill-releases').send({ contractorId: ids.sri, month, reason: 'Cash register seen on site.' }).expect(403);
    await api('hrA', 'post', '/contract-labour/bill-releases').send({ contractorId: ids.sri, month, reason: 'short' }).expect(400);
    await api('hrA', 'post', '/contract-labour/bill-releases').send({ contractorId: ids.sri, month, reason: 'Cash payment register seen on site on 6th.' }).expect(201);
    await api('hrA', 'post', '/contract-labour/alerts/resolve').send({ key: short.key, note: 'Supplementary challan promised.' }).expect(200);
    const after = (await api('hrA', 'get', `/contract-labour/compliance?month=${month}`).expect(200)).body;
    expect(after.matrix.find((m: { contractorId: string }) => m.contractorId === ids.sri).released).toMatchObject({ reason: 'Cash payment register seen on site on 6th.' });
    expect(after.alerts.some((a: { key: string }) => a.key === short.key)).toBe(false);
  });

  it('tracks contractor documents with expiry, checked by someone else', async () => {
    const id = (await api('clerkA', 'post', `/contract-labour/contractors/${ids.sri}/documents`).field('kind', 'insurance').field('number', 'EC/2026/1').field('validTo', day(20)).expect(201)).body.id;
    await api('clerkA', 'post', `/contract-labour/documents/${id}/decision`).send({ decision: 'verified' }).expect(403);
    await api('hrA', 'post', `/contract-labour/documents/${id}/decision`).send({ decision: 'verified' }).expect(200);
    const row = (await api('hrA', 'get', `/contract-labour/compliance?month=${month}`).expect(200)).body.matrix.find((m: { contractorId: string }) => m.contractorId === ids.sri);
    expect(row.documents).toEqual({ total: 1, verified: 1, expiring: 1, expired: 0 });
  });

  it('generates the registers and the annual return from the records, and says what the others need', async () => {
    const reg = (await api('hrA', 'get', `/contract-labour/registers?month=${month}`).expect(200)).body;
    const hosur = reg.registers.filter((r: { siteId: string }) => r.siteId === ids.hosur);
    expect(hosur.map((r: { kind: string; status: string; rows: number }) => [r.kind, r.status, r.rows])).toEqual([
      ['contractors', 'ready', 1],
      ['workmen', 'ready', 2],
      ['muster', 'no_data', 0],
      ['wages', 'no_data', 0],
      ['deductions', 'no_data', 0],
      ['overtime', 'no_data', 0],
    ]);
    const file = await binary(api('hrA', 'get', `/contract-labour/registers/file?kind=workmen&siteId=${ids.hosur}&contractorId=${ids.sri}&month=${month}`)).expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.body);
    const cells = book.worksheets[0].getSheetValues().flat().map(String).join('|');
    expect(cells).toContain('Murugan');
    expect(cells).toContain('Selvi');
    expect(cells).toContain('XXXXXXXX1371');
    expect(cells).not.toContain('101355001371');
    await api('hrA', 'get', `/contract-labour/registers/file?kind=contractors&siteId=${ids.hosur}&month=${month}`).expect(200);
    const pack = await binary(api('hrA', 'get', `/contract-labour/registers/inspection-pack?siteId=${ids.hosur}&month=${month}`)).expect(200);
    expect(Object.keys((await JSZip.loadAsync(pack.body)).files).sort()).toEqual(['README.txt', `register-of-contractors-${month}.xlsx`, `register-of-workmen-sri-lakshmi-facility-services-${month}.xlsx`]);
    const year = Number(month.slice(0, 4));
    const ret = (await api('hrA', 'get', `/contract-labour/returns?year=${year}`).expect(200)).body.find((r: { siteId: string }) => r.siteId === ids.hosur);
    expect(ret).toMatchObject({ contractors: 1, workers: 2, maxOnAnyDay: 2, daysWorked: null, dueOn: `${year + 1}-02-15` });
    const rep = (await api('hrA', 'get', `/contract-labour/reports?month=${month}`).expect(200)).body;
    expect(rep.headcount.find((h: { contractorId: string }) => h.contractorId === ids.sri).values.at(-1)).toBe(2);
  });

  it('a site-scoped plant HR sees only their site, read only', async () => {
    const view = (await api('siteA', 'get', `/contract-labour/compliance?month=${month}`).expect(200)).body;
    expect(view.matrix.map((m: { contractorId: string }) => m.contractorId)).toEqual([ids.sri]);
    const reg = (await api('siteA', 'get', `/contract-labour/registers?month=${month}`).expect(200)).body;
    expect([...new Set(reg.registers.map((r: { siteId: string }) => r.siteId))]).toEqual([ids.hosur]);
    await api('siteA', 'get', `/contract-labour/registers/file?kind=contractors&siteId=${ids.blr}&month=${month}`).expect(404);
    await api('siteA', 'post', '/contract-labour/proofs').field('contractorId', ids.sri).field('month', month).field('proofType', 'wage_register').expect(403);
    await api('siteA', 'post', `/contract-labour/workers/${ids.geetha}/reveal`).send({ field: 'aadhaar' }).expect(404);
  });

  it("never shows or changes another company's compliance, registers or proofs", async () => {
    const b = (await api('hrB', 'get', `/contract-labour/compliance?month=${month}`).expect(200)).body;
    expect([b.matrix, b.alerts]).toEqual([[], []]);
    expect((await api('hrB', 'get', `/contract-labour/registers?month=${month}`).expect(200)).body.registers).toEqual([]);
    await api('hrB', 'get', `/contract-labour/registers/file?kind=contractors&siteId=${ids.hosur}&month=${month}`).expect(404);
    await api('hrB', 'get', `/contract-labour/contractors/${ids.sri}/documents`).expect(404);
    await api('hrB', 'post', '/contract-labour/proofs').field('contractorId', ids.sri).field('month', month).field('proofType', 'pf').expect(404);
    await api('hrB', 'post', '/contract-labour/bill-releases').send({ contractorId: ids.sri, month, reason: 'Not our contractor at all.' }).expect(404);
  });
});
