import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { pdfText } from './fixtures/pdf-text';

// Contract labour CL-8 end to end (CLB-06 … 08, founder answers 638, 639): we are the contractor. A staffing client's
// site carries the client's registration number; our own licences sit in contractor_licences with our legal entity as
// the owner; Staffing › placement create blocks our employee past the licence maximum (the 3rd of 2 here), and with no
// licence at the state's threshold (IN.CLRA, Karnataka 50). The month's client pack is the wage register and muster
// made through the payroll registers from approved payslips and attendance; the portal upload is recorded by hand, with
// the acknowledgement making it accepted. Refused: without the key 403, acting 403, another company 404, bad input 400,
// repeats 409.

jest.setTimeout(240_000);

describe('Contract labour CL-8: we are the contractor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const asSuper = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const month = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const monthStart = `${month}-01`;
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const pdf = (tag: string) => Buffer.from(`%PDF-1.7\n${run} ${tag}\n%%EOF`);
  const binary = (req: request.Test) => req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  const licence = (who: Who, f: Record<string, string>, file: Buffer | null = pdf('lic')) => {
    const r = api(who, 'post', '/contract-labour/own-licences');
    for (const [k, v] of Object.entries(f)) if (v !== undefined) r.field(k, v);
    return file ? r.attach('file', file, { filename: 'licence.pdf', contentType: 'application/pdf' }) : r;
  };
  const place = (who: Who, sub: string, site: string | null) => api(who, 'post', '/staffing/placements').send({ submissionId: ids[sub], startOn: monthStart, endOn: `${year + 1}-03-31`, ...(site ? { clientSiteId: ids[site] } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService).useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `cl8-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CL8 Org ${k} ${run}`, slug: `cl8-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      // The staffing account manager who also owns contract labour compliance.
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view', 'ats.staffing.manage', 'ats.staffing.view']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@cl8-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@cl8-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Staffing Pvt Ltd', shortName: `KS8-${run}`, isDefault: true } })).id;
      for (const [k, given, family] of [['arun', 'Arun', 'Kumar'], ['bhavna', 'Bhavna', 'Rao'], ['chitra', 'Chitra', 'Iyer'], ['dev', 'Dev', 'Nair']] as const) {
        const person = await tx.person.create({ data: { ...x, givenName: given, familyName: family } });
        ids[k] = (await tx.employee.create({ data: { ...x, personId: person.id, givenName: given, familyName: family } })).id;
        ids[`${k}Emp`] = (await tx.employment.create({ data: { ...x, employeeId: ids[k]!, legalEntityId: ids.entity, employeeCode: `${k.toUpperCase()}-${run}`, codeScopeKey: ids.entity, joinedOn: day('2025-04-01') } })).id;
      }
    });
    await api('owner', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }).expect(want(200));
    await api('adminB', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }).expect(want(200));
    ids.client = (await api('owner', 'post', '/staffing/clients').send({ name: `Nilgiri Pharma ${run}`, legalName: 'Nilgiri Pharma Ltd', state: 'IN-TN', billingAddress: 'Ambattur, Chennai', status: 'active', contractStart: `${year - 1}-04-01`, contractEnd: `${year + 1}-03-31`, noticeDays: 30, slaFirstSubmissionDays: 3, slaFeedbackDays: 2 }).expect(want(201))).body.id;
    ids.contact = (await api('owner', 'post', `/staffing/clients/${ids.client}/contacts`).send({ name: 'Meera Pillai', role: 'HR head', email: `meera-${run}@nilgiri.test`, billing: true }).expect(want(201))).body.id;
    await api('owner', 'post', `/staffing/clients/${ids.client}/rates`).send({ role: 'Security guard', skill: 'Guarding', location: 'Chennai', unit: 'month', billRate: '30000', payRate: '20000', validFrom: today }).expect(want(201));
    ids.line = (await inA((tx) => tx.staffingRate.findFirstOrThrow({ where: { clientId: ids.client } }))).lineId;
    // The rate card was agreed last month (the API takes only today or later for a new rate).
    await inA((tx) => tx.staffingRate.updateMany({ where: { clientId: ids.client }, data: { validFrom: day(monthStart) } }));
    ids.job = (await api('owner', 'post', `/staffing/clients/${ids.client}/jobs`).send({ lineId: ids.line, headcount: 4 }).expect(want(201))).body.id;
    // The client selected all four of our employees.
    await inA(async (tx) => {
      for (const k of ['arun', 'bhavna', 'chitra', 'dev']) ids[`sub_${k}`] = (await tx.staffingSubmission.create({ data: { organizationId: org.A.id, clientId: ids.client!, jobId: ids.job!, lineId: ids.line!, employeeId: ids[k]!, contactId: ids.contact!, billRatePaise: 3_000_000n, stage: 'selected' } })).id;
    });
  }, 300_000);

  afterAll(async () => {
    await asSuper(async (tx) => {
      const all = Object.values(users) as string[];
      await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
      await tx.session.deleteMany({ where: { userId: { in: all } } });
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      await tx.clientPack.deleteMany({ where: { organizationId: org.A.id } });
      await tx.staffingPlacement.deleteMany({ where: { organizationId: org.A.id } });
      await tx.contractorLicence.deleteMany({ where: { organizationId: org.A.id } });
      await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
    }).catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('CLB-06: a client site carries the client’s registration number; refused without the key, acting, or for another company’s client', async () => {
    const site = { clientId: ids.client, name: 'Ambattur unit', state: 'IN-TN', principalName: 'Nilgiri Pharma Ltd', registrationNo: 'TN/OSH/REG/2025/77410', packChannel: 'Client vendor portal', packDueDay: 10 };
    await api('reader', 'post', '/contract-labour/client-sites').send(site).expect(403);
    await api('acting', 'post', '/contract-labour/client-sites').send(site).expect(403);
    await api('adminB', 'post', '/contract-labour/client-sites').send(site).expect(404);
    for (const bad of [{ registrationNo: 'x' }, { state: 'Tamil Nadu' }, { packDueDay: 31 }, { name: '<b>x</b>' }, { clientId: 'nope' }]) await api('owner', 'post', '/contract-labour/client-sites').send({ ...site, ...bad }).expect(400);
    ids.tn = (await api('owner', 'post', '/contract-labour/client-sites').send(site).expect(want(201))).body.id;
    await api('owner', 'post', '/contract-labour/client-sites').send(site).expect(409);
    ids.ka = (await api('owner', 'post', '/contract-labour/client-sites').send({ ...site, name: 'Peenya warehouse', state: 'IN-KA', registrationNo: 'KA/OSH/REG/2025/31207', packChannel: 'Email to HR' }).expect(want(201))).body.id;
    const list = (await api('reader', 'get', '/contract-labour/client-sites').expect(200)).body;
    expect(list.canManage).toBe(false);
    expect(list.sites).toEqual(expect.arrayContaining([expect.objectContaining({ id: ids.tn, registrationNo: 'TN/OSH/REG/2025/77410', deployed: 0, max: 0, licenceNo: null })]));
    expect((await api('adminB', 'get', '/contract-labour/client-sites').expect(200)).body.sites).toEqual([]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'clra.client_site.added' } }))).toBe(2);
  });

  it('CLB-07: our own licence, held by our legal entity, for the site; bad input 400; the copy is required', async () => {
    const f = { legalEntityId: ids.entity!, clientSiteId: ids.tn!, licenceNo: 'TN/OSH/CL/2026/2211', scope: 'Security guards', maxWorkers: '2', validFrom: `${year - 1}-01-01`, validTo: `${year + 1}-12-31`, issuedBy: 'Joint Commissioner of Labour, Chennai' };
    await licence('reader', f).expect(403);
    await licence('acting', f).expect(403);
    await licence('adminB', f).expect(404);
    await licence('owner', f, null).expect(400);
    await licence('owner', { ...f, validTo: `${year - 1}-06-30` }).expect(400);
    await licence('owner', { ...f, maxWorkers: '0' }).expect(400);
    const { clientSiteId: _site, ...noSite } = f;
    await licence('owner', noSite).expect(400); // neither a site nor states
    ids.lic = (await licence('owner', f).expect(want(201))).body.id;
    const row = await inA((tx) => tx.contractorLicence.findUniqueOrThrow({ where: { id: ids.lic } }));
    expect(row).toMatchObject({ legalEntityId: ids.entity, agencyId: null, locationId: null, clientSiteId: ids.tn, states: ['IN-TN'], maxWorkers: 2, status: 'verified' });
    const list = (await api('reader', 'get', '/contract-labour/own-licences').expect(200)).body;
    expect(list.licences).toEqual([expect.objectContaining({ id: ids.lic, licenceNo: 'TN/OSH/CL/2026/2211', site: 'Ambattur unit', maxWorkers: 2, deployed: 0, entity: 'Kaveri Staffing Pvt Ltd' })]);
    expect((await api('adminB', 'get', '/contract-labour/own-licences').expect(200)).body.licences).toEqual([]);
    // Our licences never show among the contractors' licences at our own sites.
    expect((await api('reader', 'get', '/contract-labour/contractors').expect(200)).body).not.toEqual(expect.objectContaining({ licences: expect.arrayContaining([expect.objectContaining({ id: ids.lic })]) }));
  });

  it('placement create: the 3rd of a licence of 2 is blocked; with no licence, blocked at the state threshold', async () => {
    await place('owner', 'sub_arun', 'tn').expect(want(201));
    await place('owner', 'sub_bhavna', 'tn').expect(want(201));
    const full = (await place('owner', 'sub_chitra', 'tn').expect(400)).body;
    expect(full).toMatchObject({ code: 'LICENCE_MAXIMUM' });
    expect(full.message).toMatch(/allows 2 at Ambattur unit; 2 are placed/);
    expect(await inA((tx) => tx.staffingPlacement.count({ where: { submissionId: ids.sub_chitra } }))).toBe(0);
    // Another client's site, or another company, never fits.
    await place('adminB', 'sub_chitra', 'tn').expect(404);
    // Karnataka with no licence of ours: the first is fine, the 50th (the state's threshold) is blocked.
    await place('owner', 'sub_chitra', 'ka').expect(want(201));
    await inA(async (tx) => {
      for (let i = 0; i < 48; i++) await tx.staffingPlacement.create({ data: { organizationId: org.A.id, clientId: ids.client!, lineId: ids.line!, supply: 'own', employeeId: randomUUID(), workerName: `Filler ${i}`, startOn: day(monthStart), endOn: day(`${year + 1}-03-31`), clientSiteId: ids.ka } });
    });
    const none = (await place('owner', 'sub_dev', 'ka').expect(400)).body;
    expect(none).toMatchObject({ code: 'NO_LICENCE' });
    expect(none.message).toMatch(/No licence of ours covers Peenya warehouse, and 50 placed would reach the licence threshold \(50\)/);
    // Answer 822: once the client has sites, our own employee is placed at one.
    expect((await place('owner', 'sub_dev', null).expect(400)).body).toMatchObject({ code: 'SITE_REQUIRED', message: 'Choose the client site where they will work.' });
    const sites = (await api('owner', 'get', '/contract-labour/client-sites').expect(200)).body.sites;
    expect(sites.find((s: { id: string }) => s.id === ids.tn)).toMatchObject({ deployed: 2, max: 2 });
    expect(sites.find((s: { id: string }) => s.id === ids.ka)).toMatchObject({ deployed: 49, max: 0 });
  });

  it('CLB-08: the month’s pack waits for approved payroll, then is made from payslips and attendance', async () => {
    const make = (who: Who, b: Record<string, unknown> = {}) => api(who, 'post', '/contract-labour/client-packs').send({ clientSiteId: ids.tn, month, ...b });
    await make('reader').expect(403);
    await make('acting').expect(403);
    await make('adminB').expect(404);
    await make('owner', { month: today.slice(0, 7) }).expect(400); // not ended
    await make('owner', { month: '2026-13' }).expect(400);
    expect((await make('owner').expect(409)).body.message).toMatch(/Payroll for .* is not approved yet for Arun Kumar, Bhavna Rao/);
    // Payroll approved for both; attendance for the month (Arun 20 present + 1 half day + 2 leave, Bhavna 18 + 3 absent).
    await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      for (const [k, days, gross] of [['arun', '21', 20000], ['bhavna', '18', 18000]] as const) {
        const slip = await tx.payslip.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, employmentId: ids[`${k}Emp`]!, employeeId: ids[k]!, periodStart: day(monthStart), calcVersion: 1, status: 'approved', gross, deductions: 1800, net: gross - 1800, employerCost: gross + 2000, ruleVersions: {}, snapshotHash: 'a'.repeat(64), resultHash: 'b'.repeat(64) } });
        await tx.payslipLine.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, employeeId: ids[k]!, payslipId: slip.id, position: 1, componentCode: 'basic', name: 'Basic', kind: 'earning', amount: gross, quantity: days, explanation: 'Basic for days paid' } });
      }
      const mark = (k: string, n: number, status: string, from: number) => Array.from({ length: n }, (_, i) => ({ organizationId: org.A.id, employeeId: ids[k]!, workOn: day(`${month}-${String(from + i).padStart(2, '0')}`), mode: 'punch', status }));
      await tx.attendanceDay.createMany({ data: [...mark('arun', 20, 'present', 1), ...mark('arun', 1, 'half_day', 21), ...mark('arun', 2, 'leave', 22), ...mark('bhavna', 18, 'present', 1), ...mark('bhavna', 3, 'absent', 19)] });
      // Answer 821: registered for PF and ESI; the month's PF return is filed (TRRN), ESI not yet.
      for (const [statute, no] of [['IN.PF', 'TNMAS0012345000'], ['IN.ESI', '51000123450001001']] as const) await tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, statute, registrationNo: no, status: 'on' } });
      await tx.statutoryFiling.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, statute: 'IN.PF', periodStart: day(monthStart), formatVersion: 'ecr-2', status: 'filed', reference: `TRRN${run}`, amount: 4810, uploadedBy: users.owner!, uploadedAt: new Date(), filedBy: users.owner!, filedAt: new Date(), createdBy: users.owner! } });
      // Answer 841: PT for the site's state (Tamil Nadu) is filed and goes in; Karnataka's PT (another state) stays out.
      for (const [state, no] of [['IN-TN', 'PTTN998877'], ['IN-KA', 'PTKA112233']] as const) await tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, statute: 'IN.PT', state, registrationNo: no, status: 'on' } });
      for (const [state, ref, amount] of [['IN-TN', `PTTN-${run}`, 416], ['IN-KA', `PTKA-${run}`, 400]] as const) await tx.statutoryFiling.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, statute: 'IN.PT', state, periodStart: day(monthStart), formatVersion: 'pt-1', status: 'filed', reference: ref, amount, uploadedBy: users.owner!, uploadedAt: new Date(), filedBy: users.owner!, filedAt: new Date(), createdBy: users.owner! } });
    });
    const made = (await make('owner').expect(want(201))).body;
    expect(made).toMatchObject({ employees: 2, version: 1, missing: ['ESI challan'] });
    ids.pack = made.id;
    await make('owner').expect(400); // a remake needs a reason
    expect((await make('owner', { reason: 'Attendance corrected' }).expect(want(201))).body).toMatchObject({ id: ids.pack, version: 2 });
    // The pack is two payroll registers (never in payroll's own list), held by the licence's entity.
    const regs = await asSuper(async (tx) => (await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`, tx.statutoryRegister.findMany({ where: { organizationId: org.A.id }, orderBy: [{ registerType: 'asc' }, { version: 'asc' }] })));
    expect(regs.map((r) => `${r.registerType} v${r.version}`)).toEqual(['clpk_challans v1', 'clpk_challans v2', 'clpk_muster v1', 'clpk_muster v2', 'clpk_wages v1', 'clpk_wages v2']);
    expect(regs.every((r) => r.legalEntityId === ids.entity && r.locationId === null)).toBe(true);
    const list = (await api('reader', 'get', '/contract-labour/client-packs').expect(200)).body;
    expect(list.packs).toEqual([expect.objectContaining({ id: ids.pack, month, employees: 2, due: `${today.slice(0, 7)}-10`, channel: 'Client vendor portal', uploadedOn: null, missing: ['ESI challan'], challans: true })]);
    expect(['Generated', 'Overdue']).toContain(list.packs[0].status);
    expect((await api('adminB', 'get', '/contract-labour/client-packs').expect(200)).body.packs).toEqual([]);
    // The ZIP: a cover with the fingerprints, the wage register and the muster with the days from attendance.
    const zip = await JSZip.loadAsync((await binary(api('reader', 'get', `/contract-labour/client-packs/${ids.pack}/file`)).expect(200)).body as Buffer);
    expect(Object.keys(zip.files).sort()).toEqual(['clpk_challans-' + month + '-v2.pdf', 'clpk_muster-' + month + '-v2.pdf', 'clpk_wages-' + month + '-v2.pdf', 'cover.txt']);
    const cover = await zip.file('cover.txt')!.async('string');
    expect(cover).toMatch(/clpk_wages v2 SHA-256 [0-9a-f]{64}/);
    expect(cover).toMatch(/Not in this pack yet: ESI challan/);
    const challans = pdfText(await zip.file(`clpk_challans-${month}-v2.pdf`)!.async('nodebuffer'));
    expect(challans).toMatch(new RegExp(`PF TNMAS0012345000 TRRN${run} 4810\\.00 \\d{4}-\\d{2}-\\d{2} Filed`));
    expect(challans).toMatch(/ESI 51000123450001001 Not filed yet/);
    expect(challans).toMatch(new RegExp(`PT PTTN998877 PTTN-${run} 416\\.00 \\d{4}-\\d{2}-\\d{2} Filed`));
    expect(challans).not.toMatch(/PTKA/);
    const muster = pdfText(await zip.file(`clpk_muster-${month}-v2.pdf`)!.async('nodebuffer'));
    expect(muster).toMatch(/Arun Kumar 20\.5 2 0/);
    expect(muster).toMatch(/Bhavna Rao 18 0 3/);
    expect(muster).toMatch(/TN\/OSH\/REG\/2025\/77410/);
    const wages = pdfText(await zip.file(`clpk_wages-${month}-v2.pdf`)!.async('nodebuffer'));
    expect(wages).toMatch(/Arun Kumar 21 20,?000/);
    await api('adminB', 'get', `/contract-labour/client-packs/${ids.pack}/file`).expect(404);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'clra.client_pack.downloaded' } }))).toBe(1);
  });

  it('CLB-08: the portal upload is recorded once (day, reference); the acknowledgement makes it accepted; then final', async () => {
    const up = (who: Who, f: Record<string, string>, file: Buffer | null = null) => {
      const r = api(who, 'post', `/contract-labour/client-packs/${ids.pack}/upload`);
      for (const [k, v] of Object.entries(f)) r.field(k, v);
      return file ? r.attach('file', file, { filename: 'ack.pdf', contentType: 'application/pdf' }) : r;
    };
    const ack = (who: Who, file: Buffer | null) => {
      const r = api(who, 'post', `/contract-labour/client-packs/${ids.pack}/acknowledgement`);
      return file ? r.attach('file', file, { filename: 'ack.pdf', contentType: 'application/pdf' }) : r;
    };
    const f = { uploadedOn: today, reference: 'NPL/VEND/118' };
    await ack('owner', pdf('early')).expect(409); // not uploaded yet
    await up('reader', f).expect(403);
    await up('acting', f).expect(403);
    await up('adminB', f).expect(404);
    await up('owner', { ...f, uploadedOn: `${year + 1}-01-01` }).expect(400);
    await up('owner', { ...f, uploadedOn: `${year - 2}-01-01` }).expect(400);
    await up('owner', { ...f, reference: 'x' }).expect(400);
    expect((await up('owner', f).expect(want(200))).body).toEqual({ uploaded: true, accepted: false });
    await up('owner', f).expect(409);
    expect((await api('reader', 'get', '/contract-labour/client-packs').expect(200)).body.packs[0]).toMatchObject({ status: 'Uploaded', uploadedOn: today, reference: 'NPL/VEND/118' });
    await ack('owner', null).expect(400);
    await ack('acting', pdf('ack')).expect(403);
    await ack('adminB', pdf('ack')).expect(404);
    expect((await ack('owner', pdf('ack')).expect(want(200))).body).toEqual({ accepted: true });
    await ack('owner', pdf('ack2')).expect(409);
    expect((await api('reader', 'get', '/contract-labour/client-packs').expect(200)).body.packs[0].status).toBe('Accepted');
    // Uploaded is final: no new version.
    expect((await api('owner', 'post', '/contract-labour/client-packs').send({ clientSiteId: ids.tn, month, reason: 'again' }).expect(409)).body.message).toMatch(/final/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: { in: ['clra.client_pack.made', 'clra.client_pack.uploaded', 'clra.client_pack.accepted'] } } }))).toBe(4);
  });
});
