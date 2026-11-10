import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { gstinCheckChar } from '../src/expenses/checks';
import { ContractLabourService } from '../src/contract-labour/contract-labour.service';

// Contract labour CL-1 (answers 621, 623, 627): contractors on the vendor record, licences with the copy, verified
// renewals, the deployment block, expiry alerts once per lead day, Settings 4.9 and the IN.CLRA rule set. The compliance
// owner writes; a reader reads; others 403; acting for someone 403; another company 404.

jest.setTimeout(300_000);

describe('Contract labour CL-1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let svc: ContractLabourService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'hr' | 'other' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const pdf = (tag: string) => Buffer.from(`%PDF-1.7\n${run} ${tag}\n%%EOF`);
  const PAN = 'AAHFV2210K';
  const GSTIN = `33${PAN}1Z` + gstinCheckChar(`33${PAN}1Z`);
  const licence = (who: Who, contractorId: string, f: Record<string, string>, file: Buffer | null = pdf('lic')) => {
    const r = api(who, 'post', `/contract-labour/contractors/${contractorId}/licences`);
    for (const [k, v] of Object.entries(f)) r.field(k, v);
    return file ? r.attach('file', file, { filename: 'licence.pdf', contentType: 'application/pdf' }) : r;
  };
  const renewal = (who: Who, licenceId: string, f: Record<string, string>) => {
    const r = api(who, 'post', `/contract-labour/licences/${licenceId}/renewal`);
    for (const [k, v] of Object.entries(f)) r.field(k, v);
    return r.attach('file', pdf(`ren-${licenceId}`), { filename: 'renewal.pdf', contentType: 'application/pdf' });
  };
  // The scanner may have finished already (a verdict is final); only a pending copy is marked clean here.
  const clean = (licenceId: string) => inA(async (tx) => tx.file.updateMany({ where: { id: (await tx.contractorLicence.findFirstOrThrow({ where: { id: licenceId } })).fileId, scanStatus: 'pending' }, data: { scanStatus: 'clean', scannedAt: new Date() } }));
  const reg = async () => (await api('owner', 'get', '/contract-labour/contractors').expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    svc = moduleRef.get(ContractLabourService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);
    planId = (await prisma.plan.create({ data: { name: `clra1-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLRA1 Org ${k}`, slug: `clra1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view', 'clra.settings.manage']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['hr', 'A', 'panel', ['clra.settings.manage']],
      ['other', 'A', 'panel', ['ats.staffing.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@clra1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@clra1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Foods Pvt Ltd', shortName: `KF-${run}`, isDefault: true } })).id;
      const loc = (name: string, code: string, state: string) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } });
      ids.hosur = (await loc('Hosur plant', `HSR${run}`, 'IN-TN')).id;
      ids.blr = (await loc('Bengaluru head office', `BLR${run}`, 'IN-KA')).id;
      // A staffing vendor already on file: becoming a contractor keeps one record (answer 623).
      ids.vendor = (await tx.agency.create({ data: { organizationId: org.A.id, name: `Vetri Security ${run}`, portalToken: randomUUID(), pan: PAN, tdsSection: '194C' } })).id;
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          await tx.$executeRawUnsafe(`DELETE FROM "contractor_licences" WHERE organization_id = $1::uuid AND renewal_of_id IS NOT NULL`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "contractor_licences" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the IN.CLRA rule set: Tamil Nadu and Karnataka, the 1970 Act then the OSH Code from 21 Nov 2025, all verify', async () => {
    const rows = await prisma.statutoryRuleSet.findMany({ where: { statute: 'IN.CLRA' }, orderBy: [{ jurisdiction: 'asc' }, { validFrom: 'asc' }] });
    expect(rows.map((r) => [r.jurisdiction, r.validFrom.toISOString().slice(0, 10), r.validTo?.toISOString().slice(0, 10) ?? null, (r.values as { registrationThreshold: number }).registrationThreshold, r.verify])).toEqual([
      ['IN-KA', '1971-02-10', '2025-11-20', 20, true],
      ['IN-KA', '2025-11-21', null, 50, true],
      ['IN-TN', '1971-02-10', '2025-11-20', 20, true],
      ['IN-TN', '2025-11-21', null, 50, true],
    ]);
  });

  it('add a contractor: a new one, an existing vendor kept as one record; wrong codes, duplicates and others refused', async () => {
    const body = { name: `Vetri Security ${run}`, work: 'Security', contactEmail: 'ops@vetri.test', pan: PAN, gstin: GSTIN, pfCode: 'TNMAS0081230000', esicCode: '51000812300001001', lin: '1234567890' };
    const r = await api('owner', 'post', '/contract-labour/contractors').send(body).expect(want(201));
    expect(r.body).toEqual({ id: ids.vendor, existingVendor: true });
    const v = await inA((tx) => tx.agency.findFirstOrThrow({ where: { id: ids.vendor } }));
    expect(v).toMatchObject({ contractLabour: true, tdsSection: '194C', pfCode: 'TNMAS0081230000', lin: '1234567890' });
    await api('owner', 'post', '/contract-labour/contractors').send(body).expect(409);
    ids.kaveri = (await api('owner', 'post', '/contract-labour/contractors').send({ name: `Kaveri Loaders ${run}`, work: 'Loading' }).expect(want(201))).body.id;
    await api('owner', 'post', '/contract-labour/contractors').send({ name: 'X', work: 'Y', esicCode: '123' }).expect(400);
    await api('owner', 'post', '/contract-labour/contractors').send({ name: 'X', work: 'Y', pfCode: 'TN/MAS/1' }).expect(400);
    await api('owner', 'post', '/contract-labour/contractors').send({ name: 'X', work: 'Y', pan: 'AAAAA1111A', gstin: GSTIN }).expect(400);
    await api('owner', 'post', '/contract-labour/contractors').send({ name: 'X' }).expect(400);
    for (const who of ['reader', 'hr', 'other'] as const) await api(who, 'post', '/contract-labour/contractors').send({ name: 'Z', work: 'Z' }).expect(403);
    await api('acting', 'post', '/contract-labour/contractors').send({ name: 'Z', work: 'Z' }).expect(403);
    const audits = await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'clra.contractor.created' } }));
    expect(audits).toBe(2);
  });

  it('change a contractor; another company gets 404; a plain vendor is not a contractor', async () => {
    await api('owner', 'put', `/contract-labour/contractors/${ids.kaveri}`).send({ name: `Kaveri Loaders ${run}`, work: 'Loading and unloading', lin: '1-2345-6789-0' }).expect(want(200));
    await api('adminB', 'put', `/contract-labour/contractors/${ids.kaveri}`).send({ name: 'B', work: 'B' }).expect(404);
    const plain = await inA((tx) => tx.agency.create({ data: { organizationId: org.A.id, name: `Plain ${run}`, portalToken: randomUUID() } }));
    await api('owner', 'put', `/contract-labour/contractors/${plain.id}`).send({ name: 'P', work: 'P' }).expect(404);
  });

  it('add a licence: covers the establishment state, needs the copy and good dates; it waits for verification', async () => {
    const f = { locationId: ids.hosur!, licenceNo: `TN/CLRA/${run}/1`, scope: 'Security', states: 'IN-TN,IN-KA', maxWorkers: '20', validFrom: addDays(today, -300), validTo: addDays(today, 30) };
    await licence('owner', ids.vendor!, f, null).expect(400);
    await licence('owner', ids.vendor!, { ...f, states: 'IN-KA' }).expect(400);
    await licence('owner', ids.vendor!, { ...f, states: 'IN-TN,IN-ZZ' }).expect(400);
    await licence('owner', ids.vendor!, { ...f, validTo: addDays(today, -1) }).expect(400);
    await licence('owner', ids.vendor!, { ...f, validFrom: addDays(today, 40) }).expect(400);
    await licence('owner', ids.vendor!, { ...f, maxWorkers: '0' }).expect(400);
    await licence('owner', ids.vendor!, f, Buffer.from('not a pdf')).expect(400);
    await licence('owner', ids.vendor!, { ...f, locationId: randomUUID() }).expect(404);
    await licence('reader', ids.vendor!, f).expect(403);
    await licence('acting', ids.vendor!, f).expect(403);
    await licence('adminB', ids.vendor!, f).expect(404);
    ids.lic = (await licence('owner', ids.vendor!, f).expect(want(201))).body.id;
    await licence('owner', ids.vendor!, f).expect(409);
    const r = await reg();
    const l = r.contractors.find((c: { id: string }) => c.id === ids.vendor).licences[0];
    expect(l).toMatchObject({ status: 'pending', state: 'pending', states: ['IN-TN', 'IN-KA'], max: 20, block: 'The contractor has no verified licence for this establishment.' });
    expect(r.alertDays).toEqual([60, 30, 7]);
  });

  it('verify: only a clean copy, once, by the manage key; then deployment is allowed and the copy opens', async () => {
    // A copy still being scanned is never verified or opened.
    const waiting = await inA(async (tx) => {
      const f = await tx.file.create({ data: { organizationId: org.A.id, area: 'clra-licence', storageRef: `test/${run}`, fileName: 'waiting.pdf', mime: 'application/pdf', size: 1, sha256: 'a'.repeat(64), uploadedVia: 'staff' } });
      return (await tx.contractorLicence.create({ data: { organizationId: org.A.id, agencyId: ids.kaveri!, locationId: ids.hosur!, licenceNo: `W-${run}`, scope: 'Loading', states: ['IN-TN'], maxWorkers: 5, validFrom: new Date(`${today}T00:00:00Z`), validTo: new Date(`${addDays(today, 100)}T00:00:00Z`), fileId: f.id } })).id;
    });
    await api('owner', 'post', `/contract-labour/licences/${waiting}/verify`).expect(409);
    await api('owner', 'get', `/contract-labour/licences/${waiting}/file`).expect(409);
    await api('owner', 'post', `/contract-labour/licences/${waiting}/reject`).send({ reason: 'Wrong establishment' }).expect(want(201));
    await clean(ids.lic!);
    await api('reader', 'post', `/contract-labour/licences/${ids.lic}/verify`).expect(403);
    await api('acting', 'post', `/contract-labour/licences/${ids.lic}/verify`).expect(403);
    await api('adminB', 'post', `/contract-labour/licences/${ids.lic}/verify`).expect(404);
    await api('owner', 'post', `/contract-labour/licences/${ids.lic}/verify`).expect(want(201));
    await api('owner', 'post', `/contract-labour/licences/${ids.lic}/verify`).expect(409);
    await api('owner', 'post', `/contract-labour/licences/${ids.lic}/reject`).send({ reason: 'Too late' }).expect(409);
    const l = (await reg()).contractors.find((c: { id: string }) => c.id === ids.vendor).licences[0];
    expect(l).toMatchObject({ status: 'verified', state: 'expiring', block: null, decided: { by: `owner ${run}` } });
    const file = await api('reader', 'get', `/contract-labour/licences/${ids.lic}/file`).expect(200);
    expect(file.headers['content-disposition']).toContain('licence.pdf');
    await api('other', 'get', `/contract-labour/licences/${ids.lic}/file`).expect(403);
    await api('adminB', 'get', `/contract-labour/licences/${ids.lic}/file`).expect(404);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: { in: ['clra.licence.verified', 'clra.licence.file_opened'] }, entityId: ids.lic } }))).toBe(2);
  });

  it('a renewal: only of a verified licence, ending later, one at a time; rejected with a reason, then verified', async () => {
    const f = { licenceNo: `TN/OSH/${run}/2`, maxWorkers: '25', validFrom: addDays(today, 31), validTo: addDays(today, 395) };
    await renewal('owner', ids.lic!, { ...f, validTo: addDays(today, 10) }).expect(400);
    await renewal('reader', ids.lic!, f).expect(403);
    await renewal('adminB', ids.lic!, f).expect(404);
    ids.ren1 = (await renewal('owner', ids.lic!, f).expect(want(201))).body.id;
    await renewal('owner', ids.lic!, { ...f, licenceNo: `TN/OSH/${run}/3` }).expect(409);
    await renewal('owner', ids.ren1!, f).expect(409);
    await api('owner', 'post', `/contract-labour/licences/${ids.ren1}/reject`).send({ reason: 'x' }).expect(400);
    await api('reader', 'post', `/contract-labour/licences/${ids.ren1}/reject`).send({ reason: 'Copy unreadable' }).expect(403);
    await api('owner', 'post', `/contract-labour/licences/${ids.ren1}/reject`).send({ reason: 'Copy unreadable' }).expect(want(201));
    ids.ren2 = (await renewal('owner', ids.lic!, f).expect(want(201))).body.id;
    await clean(ids.ren2!);
    await api('owner', 'post', `/contract-labour/licences/${ids.ren2}/verify`).expect(want(201));
    const ls = (await reg()).contractors.find((c: { id: string }) => c.id === ids.vendor).licences;
    expect(ls.find((l: { id: string }) => l.id === ids.ren1)).toMatchObject({ status: 'rejected', rejectReason: 'Copy unreadable' });
    expect(ls.find((l: { id: string }) => l.id === ids.ren2)).toMatchObject({ status: 'verified', renewalOfId: ids.lic, state: 'not-started', max: 25, scope: 'Security' });
    // The old licence is no longer "expiring": its renewal is verified.
    expect(ls.find((l: { id: string }) => l.id === ids.lic)).toMatchObject({ state: 'valid' });
  });

  it('expiry alerts: on a lead day only, once, never for a renewed licence; a re-run sends nothing', async () => {
    const f = { locationId: ids.blr!, licenceNo: `KA/CLRA/${run}/9`, scope: 'Loading', states: 'IN-KA', maxWorkers: '10', validFrom: addDays(today, -100), validTo: addDays(today, 7) };
    const id = (await licence('owner', ids.kaveri!, f).expect(want(201))).body.id;
    await clean(id);
    await api('owner', 'post', `/contract-labour/licences/${id}/verify`).expect(want(201));
    expect(await svc.alertOrg(org.A.id, today)).toBe(1);
    expect(await svc.alertOrg(org.A.id, today)).toBe(0);
    // The renewed Hosur licence ends in 30 days (a lead day) but its renewal is verified: no alert.
    expect(await inA((tx) => tx.contractorLicenceAlert.findMany({ select: { licenceId: true, daysBefore: true } }))).toEqual([{ licenceId: id, daysBefore: 7 }]);
    expect(await svc.alertOrg(org.A.id, addDays(today, 1))).toBe(0);
    const bell = await inA((tx) => tx.userNotification.count({ where: { organizationId: org.A.id, recipientUserId: users.owner!, type: 'clra.licence.expiring' } }));
    expect(bell).toBe(1);
  });

  it('reads: the reader sees the register, others 403, another company sees none of ours', async () => {
    const r = (await api('reader', 'get', '/contract-labour/contractors').expect(200)).body;
    expect(r.canManage).toBe(false);
    expect(r.contractors.map((c: { name: string }) => c.name)).toEqual([`Kaveri Loaders ${run}`, `Vetri Security ${run}`]);
    for (const who of ['hr', 'other'] as const) await api(who, 'get', '/contract-labour/contractors').expect(403);
    expect((await api('adminB', 'get', '/contract-labour/contractors').expect(200)).body.contractors).toEqual([]);
  });

  it('Settings 4.9: the law rows and alert days; the settings key changes them, at least one day; others 403', async () => {
    const s = (await api('reader', 'get', '/contract-labour/settings').expect(200)).body;
    expect(s).toMatchObject({ canEdit: false, values: { 'clra.licence_alerts': '60,30,7' }, choices: { 'clra.licence_alerts': ['90', '60', '30', '15', '7'] } });
    expect(s.law).toHaveLength(4);
    await api('other', 'get', '/contract-labour/settings').expect(403);
    await api('reader', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.licence_alerts', value: '30' }] }).expect(403);
    await api('acting', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.licence_alerts', value: '30' }] }).expect(403);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.licence_alerts', value: '' }] }).expect(400);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.licence_alerts', value: '45' }] }).expect(400);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }).expect(400);
    const saved = (await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.licence_alerts', value: '90,15' }] }).expect(want(200))).body;
    expect(saved).toMatchObject({ canEdit: true, values: { 'clra.licence_alerts': '90,15' }, lastChange: { by: `hr ${run}` } });
    expect((await reg()).alertDays).toEqual([90, 15]);
    expect((await api('adminB', 'get', '/contract-labour/settings').expect(200)).body.values['clra.licence_alerts']).toBe('60,30,7');
  });
});
