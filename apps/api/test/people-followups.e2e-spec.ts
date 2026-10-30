import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { ErasureService } from '../src/people/erasure.service';
import { createFakeBlobStorage, FAKE_BLOB_CONTAINER_URL } from './fixtures/fake-blob-storage';

// People follow-ups (founder 30 Oct 2026, items 10, 11 and 12) against the real database (forced RLS): Possible same
// person stays in the menu for 90 days after a merge; HR sets what happens when a fixed-term contract ends; the
// Special data erasure (dry run, off by default, only past the period, one company at a time). Each with the wrong
// role, another company and bad input.
describe('People follow-ups', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let erasure: ErasureService;
  const blobs = createFakeBlobStorage();
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'emp' | 'plantHr';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const TODAY = '2026-10-30';
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inOrg = <T>(k: 'A' | 'B', fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(blobs)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    erasure = moduleRef.get(ErasureService);

    planId = (await prisma.plan.create({ data: { name: `followups-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Followups Org ${k}`, slug: `followups-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', tpl('hr_admin')],
      ['emp', 'A', 'panel', null],
      ['plantHr', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await inOrg(k, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(k, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@followups-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    for (const k of ['A', 'B'] as const) {
      await inOrg(k, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Followups ${k}`, shortName: `FU${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      });
    }
    // A plant HR: the HR keys over one legal entity only.
    await inOrg('A', async (tx) => {
      const profile = (await tx.user.findFirstOrThrow({ where: { id: users.hr }, select: { permissionProfileId: true } })).permissionProfileId!;
      await tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.plantHr, permissionProfileId: profile, scopeType: 'legal_entity', legalEntityId: ids.entityA, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Plant HR' } });
    });
    for (const [who, k] of Object.entries({ adminA: 'A', adminB: 'B', hr: 'A', emp: 'A', plantHr: 'A' }) as [Who, 'A' | 'B'][]) {
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@followups-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 240_000);

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

  /** An employee (person, employee, one employment) with an Aadhaar on record, an Aadhaar copy, and a background check. */
  const person = async (k: 'A' | 'B', name: string, exitedOn: string | null) =>
    inOrg(k, async (tx) => {
      const o = { organizationId: org[k].id };
      const p = await tx.person.create({ data: { ...o, givenName: name, familyName: run } });
      const e = await tx.employee.create({ data: { ...o, personId: p.id, givenName: name, familyName: run } });
      const job = await tx.employment.create({ data: { ...o, employeeId: e.id, legalEntityId: ids[`entity${k}`], employeeCode: `${name}-${run}`, codeScopeKey: ids[`entity${k}`], joinedOn: new Date('2020-01-06T00:00:00Z'), exitedOn: exitedOn ? new Date(`${exitedOn}T00:00:00Z`) : null } });
      await tx.employeeIdentifiers.create({ data: { ...o, employeeId: e.id, legalName: name, aadhaarEnc: 'sealed', aadhaarHash: 'a'.repeat(64), aadhaarLast4: '9012' } });
      const key = `org/${org[k].id}/documents/${randomUUID()}`;
      await blobs.upload(key, Buffer.from('sealed'), 'application/octet-stream');
      const file = await tx.file.create({ data: { ...o, area: 'documents', storageRef: `${FAKE_BLOB_CONTAINER_URL}/${key}`, fileName: 'aadhaar.pdf', mime: 'application/pdf', size: 6, sha256: 'b'.repeat(64), uploadedVia: 'staff' } });
      const doc = await tx.document.create({ data: { ...o, personId: p.id, typeKey: 'aadhaar', status: 'verified' } });
      const v = await tx.documentVersion.create({ data: { ...o, documentId: doc.id, fileId: file.id, version: 1 } });
      await tx.document.update({ where: { id: doc.id }, data: { currentVersionId: v.id } });
      // A passport is Confidential, not Special: it stays.
      const pass = await tx.document.create({ data: { ...o, personId: p.id, typeKey: 'passport', status: 'verified' } });
      const pre = await tx.preboarding.create({ data: { ...o, personId: p.id, source: 'direct', joiningOn: new Date('2020-01-06T00:00:00Z'), legalEntityId: ids[`entity${k}`], locationId: ids[`loc${k}`], hrOwnerUserId: users[k === 'A' ? 'adminA' : 'adminB'], status: 'joined' } });
      const consent = await tx.consentRecord.create({ data: { ...o, personId: p.id, purpose: 'bgv', noticeVersion: 'v1', itemsShown: [], evidence: {} } });
      await tx.bgvCheck.create({ data: { ...o, preboardingId: pre.id, consentId: consent.id, checkType: 'criminal', status: 'clear', note: 'Police record: none found', resultDocumentId: doc.id } });
      return { personId: p.id, employeeId: e.id, employmentId: job.id, blobKey: key, passportId: pass.id };
    });

  const special = (k: 'A' | 'B', x: { personId: string; employeeId: string }) =>
    inOrg(k, async (tx) => ({
      aadhaar: await tx.employeeIdentifiers.findFirstOrThrow({ where: { employeeId: x.employeeId }, select: { aadhaarEnc: true, aadhaarHash: true, aadhaarLast4: true, legalName: true } }),
      docs: (await tx.document.findMany({ where: { personId: x.personId }, select: { typeKey: true } })).map((d) => d.typeKey).sort(),
      bgv: await tx.bgvCheck.findMany({
        where: { preboardingId: { in: (await tx.preboarding.findMany({ where: { personId: x.personId }, select: { id: true } })).map((r) => r.id) } },
        select: { note: true, status: true, checkType: true },
      }),
    }));

  // ------------------------------------------------------------------------------------------ item 10: same person menu

  it('Possible same person: no count with nothing waiting; a merge in the last 90 days keeps it (count 0); an older merge does not', async () => {
    expect((await api('hr', 'get', '/workspace/counts').expect(200)).body.possibleSamePerson).toBeUndefined();
    const merged = (k: 'A' | 'B', daysAgo: number) =>
      inOrg(k, async (tx) => {
        const o = { organizationId: org[k].id };
        const into = await tx.person.create({ data: { ...o, givenName: 'Meera', familyName: run } });
        const old = await tx.person.create({ data: { ...o, givenName: 'Meera', familyName: 'Desk', status: 'merged', mergedInto: into.id } });
        await tx.personLinkLog.create({ data: { ...o, action: 'merge', personId: old.id, otherPersonId: into.id, basis: 'hr_confirmed', decidedBy: users[k === 'A' ? 'adminA' : 'adminB'], reason: 'Same login', createdAt: new Date(Date.now() - daysAgo * 86_400_000) } });
      });
    await merged('A', 89);
    await merged('B', 91);
    expect((await api('hr', 'get', '/workspace/counts').expect(200)).body.possibleSamePerson).toBe(0);
    // Not for someone without the page's key; another company's merge 91 days ago no longer keeps it.
    expect((await api('emp', 'get', '/workspace/counts').expect(200)).body.possibleSamePerson).toBeUndefined();
    expect((await api('adminB', 'get', '/workspace/counts').expect(200)).body.possibleSamePerson).toBeUndefined();
  });

  // ------------------------------------------------------------------------------------------ item 11: contract end action

  it('When a fixed-term contract ends: HR sets it per company or employment type; only listed values; not an employee, not another company', async () => {
    const put = (who: Who, body: Record<string, unknown>) => api(who, 'put', '/org/settings').send({ key: 'contract_end.action', ...body });
    await put('emp', { scopeType: 'tenant', value: 'auto_exit' }).expect(403);
    await put('hr', { scopeType: 'tenant', value: 'convert' }).expect(400);
    await put('hr', { scopeType: 'location', scopeId: ids.locA, value: 'auto_exit' }).expect(400);
    await put('hr', { scopeType: 'tenant', value: 'auto_exit' }).expect(200);
    const mine = (await api('hr', 'get', '/org/settings').expect(200)).body;
    expect(mine.registry['contract_end.action']).toMatchObject({ values: ['alert', 'auto_exit'], default: 'alert' });
    expect(mine.overrides.filter((r: { key: string }) => r.key === 'contract_end.action').map((r: { value: unknown }) => r.value)).toEqual(['auto_exit']);
    const b = (await api('adminB', 'get', '/org/settings').expect(200)).body;
    expect(b.overrides.filter((r: { key: string }) => r.key === 'contract_end.action')).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------ item 12: Special data erasure

  it('erasure: off by default; HR reads the dry run (counts only); nothing is deleted while it is off', async () => {
    ids.oldA = JSON.stringify(await person('A', 'Ravi', '2024-01-31')); // left 2024: past the 1-year default
    ids.recentA = JSON.stringify(await person('A', 'Asha', '2026-03-31')); // left 7 months ago: kept
    ids.workingA = JSON.stringify(await person('A', 'Kiran', null)); // still working: kept
    ids.oldB = JSON.stringify(await person('B', 'Divya', '2023-06-30')); // another company, also past its period
    await api('emp', 'get', '/people/privacy-erasure').expect(403);
    // Company-wide work: an HR who manages one legal entity's settings does not see it, nor turn it on.
    await api('plantHr', 'get', '/people/privacy-erasure').expect(403);
    await api('plantHr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'on' }).expect(403);
    const dry = (await api('hr', 'get', '/people/privacy-erasure').expect(200)).body;
    expect(dry).toEqual({
      enabled: false,
      due: { people: 1, aadhaar: 1, documents: 1, backgroundChecks: 1, disability: 0 },
      who: [{ name: `Ravi ${run}`, employeeCode: `Ravi-${run}`, day: '2024-01-31', neverJoined: false }],
      lastRun: null,
    });
    // Who, never what: no Aadhaar digits, no check note.
    expect(JSON.stringify(dry)).not.toMatch(/9012|Police|sealed/);
    expect((await api('adminB', 'get', '/people/privacy-erasure').expect(200)).body.due).toEqual({ people: 1, aadhaar: 1, documents: 1, backgroundChecks: 1, disability: 0 });
    expect(await erasure.sweep(TODAY)).toBe(0);
    expect((await special('A', JSON.parse(ids.oldA))).aadhaar.aadhaarLast4).toBe('9012');
  });

  it('erasure: only a company-wide value; HR turns it on; the run deletes only data past its period, in this company only, and audits counts', async () => {
    await api('emp', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'on' }).expect(403);
    await api('hr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'yes' }).expect(400);
    await api('hr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'legal_entity', scopeId: ids.entityA, value: 'on' }).expect(400);
    await api('hr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'on' }).expect(200);
    expect(await erasure.sweep(TODAY)).toBe(1);

    const gone = await special('A', JSON.parse(ids.oldA));
    expect(gone.aadhaar).toEqual({ aadhaarEnc: null, aadhaarHash: null, aadhaarLast4: null, legalName: 'Ravi' });
    expect(gone.docs).toEqual(['passport']);
    expect(gone.bgv).toEqual([{ note: null, status: 'clear', checkType: 'criminal' }]);
    expect(blobs.blobs.has(JSON.parse(ids.oldA).blobKey)).toBe(false);
    // Younger than the period, or still working: untouched.
    for (const k of ['recentA', 'workingA']) {
      const kept = await special('A', JSON.parse(ids[k]));
      expect(kept.aadhaar.aadhaarLast4).toBe('9012');
      expect(kept.docs).toEqual(['aadhaar', 'passport']);
      expect(kept.bgv[0].note).toBe('Police record: none found');
      expect(blobs.blobs.has(JSON.parse(ids[k]).blobKey)).toBe(true);
    }
    // Another company (its job is off) is untouched.
    const other = await special('B', JSON.parse(ids.oldB));
    expect(other.aadhaar.aadhaarLast4).toBe('9012');
    expect(other.docs).toEqual(['aadhaar', 'passport']);

    // The audit holds counts, never the values.
    const logs = await inOrg('A', (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { in: ['privacy.special.erased', 'privacy.erasure.run'] } }, orderBy: { createdAt: 'asc' } }));
    expect(logs.map((l) => l.action)).toEqual(['privacy.special.erased', 'privacy.erasure.run']);
    expect(logs[0].entityId).toBe(JSON.parse(ids.oldA).personId);
    expect(JSON.parse(logs[0].metadataJson!)).toEqual({ aadhaar: 1, documents: 1, backgroundChecks: 1, disability: 0, keptYears: 1 });
    expect(logs.map((l) => l.metadataJson).join(' ')).not.toMatch(/9012|Police|sealed|Ravi/);
    const report = (await api('hr', 'get', '/people/privacy-erasure').expect(200)).body;
    expect(report).toMatchObject({ enabled: true, due: { people: 0, aadhaar: 0, documents: 0, backgroundChecks: 0 }, lastRun: { people: 1, aadhaar: 1, documents: 1, backgroundChecks: 1, failed: 0 } });
  });

  it('erasure: running again changes nothing (idempotent); two runs at once erase once', async () => {
    expect(await erasure.sweep(TODAY)).toBe(0);
    const again = await Promise.all([erasure.run({ organizationId: org.A.id, isSuperAdmin: false, userId: null }, TODAY), erasure.run({ organizationId: org.A.id, isSuperAdmin: false, userId: null }, TODAY)]);
    expect(again.map((r) => r.people)).toEqual([0, 0]);
    const erased = await inOrg('A', (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'privacy.special.erased' } }));
    expect(erased).toBe(1);
  });

  it('erasure: a shorter period reaches more people; turning it off stops it', async () => {
    // HR's access admin shortens Special data to "delete when they leave": Asha (left in March) is now due.
    await api('adminA', 'put', '/org/settings').send({ key: 'privacy.retention.special_years', scopeType: 'tenant', value: '0' }).expect(200);
    expect((await api('hr', 'get', '/people/privacy-erasure').expect(200)).body.due).toEqual({ people: 1, aadhaar: 1, documents: 1, backgroundChecks: 1, disability: 0 });
    await api('hr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'off' }).expect(200);
    expect(await erasure.sweep(TODAY)).toBe(0);
    expect((await erasure.run({ organizationId: org.A.id, isSuperAdmin: false, userId: null }, TODAY)).people).toBe(0);
    expect((await special('A', JSON.parse(ids.recentA))).aadhaar.aadhaarLast4).toBe('9012');
    await api('hr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'on' }).expect(200);
    expect(await erasure.sweep(TODAY)).toBe(1);
    expect((await special('A', JSON.parse(ids.recentA))).aadhaar.aadhaarLast4).toBeNull();
    expect((await special('A', JSON.parse(ids.workingA))).aadhaar.aadhaarLast4).toBe('9012');
  });

  it('erasure: the database function refuses another company and someone still working', async () => {
    const working = JSON.parse(ids.workingA);
    await expect(inOrg('A', (tx) => tx.$queryRaw`SELECT erase_special_documents(${org.B.id}::uuid, ${working.personId}::uuid)`)).rejects.toThrow(/own company/);
    await expect(inOrg('A', (tx) => tx.$queryRaw`SELECT erase_special_documents(${org.A.id}::uuid, ${working.personId}::uuid)`)).rejects.toThrow(/former employee/);
  });

  it('erasure: the database function itself refuses notice-period staff, a period not yet passed, and a company with erasure off', async () => {
    const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const call = (k: 'A' | 'B', personId: string) => inOrg(k, (tx) => tx.$queryRaw`SELECT erase_special_documents(${org[k].id}::uuid, ${personId}::uuid)`);
    await api('hr', 'put', '/org/settings').send({ key: 'privacy.erasure.enabled', scopeType: 'tenant', value: 'on' }).expect(200);
    // Serving notice: the last day is still ahead, so they are not "former" yet (the first version allowed this).
    const notice = await person('A', 'Notice', day(10));
    await expect(call('A', notice.personId)).rejects.toThrow(/former employee/);
    // Left a month ago with a 3-year period: too early, whatever the app asks.
    await api('adminA', 'put', '/org/settings').send({ key: 'privacy.retention.special_years', scopeType: 'tenant', value: '3' }).expect(200);
    const recent = await person('A', 'Recent', day(-30));
    await expect(call('A', recent.personId)).rejects.toThrow(/period has not passed/);
    // Company B never switched erasure on: refused even for someone long gone.
    const gone = await person('B', 'Gone', '2021-01-31');
    await expect(call('B', gone.personId)).rejects.toThrow(/switched off/);
  });

  // ------------------------------------------------- founder answers 30 Oct 2026: what Special data erasure deletes

  const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const crypto = () => app.get(OrgSecretsCryptoService);
  const callFn = (k: 'A' | 'B', personId: string) => inOrg(k, (tx) => tx.$queryRaw<{ n: number }[]>`SELECT erase_special_documents(${org[k].id}::uuid, ${personId}::uuid) AS n`);
  const scope: Record<string, { personId: string; employeeId?: string; employmentId?: string; preboardingId?: string; payslipId?: string; filingId?: string }> = {};

  /** A declared disability (sealed details, a certificate document). */
  const disabled = (k: 'A' | 'B', x: { personId: string; employeeId: string }) =>
    inOrg(k, async (tx) => {
      const o = { organizationId: org[k].id };
      const cert = await tx.document.create({ data: { ...o, personId: x.personId, typeKey: 'disability_certificate', status: 'verified' } });
      await tx.disabilityDeclaration.create({ data: { ...o, employeeId: x.employeeId, answer: 'yes', detailsEnc: 'sealed-details', certificateDocumentId: cert.id, consentAt: new Date('2022-01-01T00:00:00Z') } });
    });

  // Pay tables are open only to a session holding the entity's pay key (pay_guard); the erasure job never holds one.
  const payEntity = (tx: Tx, k: 'A' | 'B') => tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids[`entity${k}`]}}`}, true)`;
  /** A payslip whose snapshot and a PF filing whose basis carry the Aadhaar (payroll keeps its own period). */
  const payRecords = (k: 'A' | 'B', x: { employeeId: string; employmentId: string }) =>
    inOrg(k, async (tx) => {
      const o = { organizationId: org[k].id, legalEntityId: ids[`entity${k}`] };
      await payEntity(tx, k);
      const slip = await tx.payslip.create({ data: { ...o, employmentId: x.employmentId, employeeId: x.employeeId, periodStart: new Date('2023-12-01T00:00:00Z'), calcVersion: 1, gross: 1000, deductions: 0, net: 1000, employerCost: 1000, ruleVersions: {}, snapshotHash: 'c'.repeat(64), resultHash: 'd'.repeat(64), source: 'import' } });
      await tx.payslipSnapshot.create({ data: { ...o, payslipId: slip.id, employeeId: x.employeeId, inputs: { aadhaar: '234567899012' }, ruleVersions: {}, engineVersion: 'test', inputsHash: 'e'.repeat(64) } });
      const filing = await tx.statutoryFiling.create({ data: { ...o, statute: 'IN.PF', periodStart: new Date('2023-12-01T00:00:00Z'), formatVersion: 'ecr-2', basis: { rows: [{ employeeId: x.employeeId, aadhaar: '234567899012' }] }, createdBy: users.adminA } });
      return { payslipId: slip.id, filingId: filing.id };
    });

  /** An offer that never joined: the joining was cancelled on `cancelledOn`; portal answers hold an Aadhaar; a copy, a consent and a check. */
  const neverJoined = (k: 'A' | 'B', name: string, cancelledOn: string) =>
    inOrg(k, async (tx) => {
      const o = { organizationId: org[k].id };
      const p = await tx.person.create({ data: { ...o, givenName: name, familyName: run } });
      const answersEnc = crypto().encrypt(JSON.stringify({ identity: { legalName: name, pan: 'ABCPE1234F', aadhaar: '234567890124' }, personal: { city: 'Pune' } }));
      const pre = await tx.preboarding.create({ data: { ...o, personId: p.id, source: 'direct', joiningOn: new Date(`${cancelledOn}T00:00:00Z`), legalEntityId: ids[`entity${k}`], locationId: ids[`loc${k}`], hrOwnerUserId: users[k === 'A' ? 'adminA' : 'adminB'], status: 'cancelled', outcome: 'reneged', cancelledOn: new Date(`${cancelledOn}T00:00:00Z`), answersEnc } });
      const doc = await tx.document.create({ data: { ...o, personId: p.id, typeKey: 'aadhaar', status: 'verified' } });
      const consent = await tx.consentRecord.create({ data: { ...o, personId: p.id, purpose: 'bgv', noticeVersion: 'v1', itemsShown: [], evidence: {} } });
      await tx.bgvCheck.create({ data: { ...o, preboardingId: pre.id, consentId: consent.id, checkType: 'education', status: 'discrepancy', note: 'Degree not found', resultDocumentId: doc.id } });
      return { personId: p.id, preboardingId: pre.id };
    });

  const kept = (k: 'A' | 'B', personId: string) =>
    inOrg(k, async (tx) => {
      const pre = await tx.preboarding.findMany({ where: { personId }, select: { id: true, answersEnc: true } });
      return {
        docs: (await tx.document.findMany({ where: { personId }, select: { typeKey: true } })).map((d) => d.typeKey).sort(),
        bgv: await tx.bgvCheck.findMany({ where: { preboardingId: { in: pre.map((r) => r.id) } }, select: { note: true, status: true } }),
        consents: await tx.consentRecord.count({ where: { personId } }),
        answers: pre.filter((r) => r.answersEnc).map((r) => JSON.parse(crypto().decrypt(r.answersEnc!))),
      };
    });

  it('scope: the dry run lists who (name, code, last day or cancellation day), is never audited, and skips the young, notice staff and other companies', async () => {
    await api('adminA', 'put', '/org/settings').send({ key: 'privacy.retention.special_years', scopeType: 'tenant', value: '1' }).expect(200);
    const lata = await person('A', 'Lata', '2024-01-31');
    await disabled('A', lata);
    Object.assign(scope, { lata: { ...lata, ...(await payRecords('A', lata)) } });
    scope.nora = await neverJoined('A', 'Nora', '2024-02-01');
    scope.neel = await neverJoined('A', 'Neel', day(-30)); // cancelled a month ago: younger than the period
    const noor = await person('A', 'Noor', day(10)); // serving notice
    await disabled('A', noor);
    scope.noor = noor;
    scope.bina = await neverJoined('B', 'Bina', '2024-02-01'); // another company
    const audits = () => inOrg('A', (tx) => tx.auditLog.count({ where: { organizationId: org.A.id } }));
    const before = await audits();
    const dry = (await api('hr', 'get', '/people/privacy-erasure').expect(200)).body;
    expect(dry.who).toEqual([
      { name: `Lata ${run}`, employeeCode: `Lata-${run}`, day: '2024-01-31', neverJoined: false },
      { name: `Nora ${run}`, employeeCode: null, day: '2024-02-01', neverJoined: true },
    ]);
    // Lata: Aadhaar, its copy and the certificate, a check, the disability details. Nora: the portal Aadhaar, a copy, a check.
    expect(dry.due).toEqual({ people: 2, aadhaar: 2, documents: 3, backgroundChecks: 2, disability: 1 });
    expect(JSON.stringify(dry)).not.toMatch(/9012|0124|Degree|Police|sealed/);
    expect(await audits()).toBe(before);
    // Company-wide settings managers only; B sees its own never-joined offer, never A's people.
    await api('emp', 'get', '/people/privacy-erasure').expect(403);
    await api('plantHr', 'get', '/people/privacy-erasure').expect(403);
    const b = (await api('adminB', 'get', '/people/privacy-erasure').expect(200)).body;
    expect(b.who.map((w: { name: string }) => w.name)).toEqual([`Gone ${run}`, `Divya ${run}`, `Bina ${run}`]);
  });

  it('scope: the run deletes the disability details and certificate (the answer stays) and a never-joined offer\'s Special data; consent, the check result and Aadhaar in pay records and filings stay', async () => {
    expect(await erasure.sweep(TODAY)).toBe(2);
    // Disability: yes stays for the register; the details and the certificate go.
    const decl = await inOrg('A', (tx) => tx.disabilityDeclaration.findFirstOrThrow({ where: { employeeId: scope.lata.employeeId! } }));
    expect(decl).toMatchObject({ answer: 'yes', detailsEnc: null, certificateDocumentId: null, withdrawnAt: null });
    expect(decl.erasedAt).toBeInstanceOf(Date);
    const lata = await kept('A', scope.lata.personId);
    expect(lata.docs).toEqual(['passport']);
    // Kept: consent records; the check's result (clear); Aadhaar inside pay records and filings.
    expect(lata.consents).toBe(1);
    expect(lata.bgv).toEqual([{ note: null, status: 'clear' }]);
    const pay = await inOrg('A', async (tx) => {
      await payEntity(tx, 'A');
      return {
        snapshot: await tx.payslipSnapshot.findUniqueOrThrow({ where: { payslipId: scope.lata.payslipId! } }),
        filing: await tx.statutoryFiling.findUniqueOrThrow({ where: { id: scope.lata.filingId! } }),
      };
    });
    expect(pay.snapshot.inputs).toEqual({ aadhaar: '234567899012' });
    expect(JSON.stringify(pay.filing.basis)).toContain('234567899012');
    // Never joined: counted from the cancellation day; the portal Aadhaar goes, the other answers stay sealed.
    const nora = await kept('A', scope.nora.personId);
    expect(nora.docs).toEqual([]);
    expect(nora.bgv).toEqual([{ note: null, status: 'discrepancy' }]);
    expect(nora.consents).toBe(1);
    expect(nora.answers).toEqual([{ identity: { legalName: 'Nora', pan: 'ABCPE1234F' }, personal: { city: 'Pune' } }]);
    const log = await inOrg('A', (tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'privacy.special.erased', entityId: scope.nora.personId } }));
    expect(JSON.parse(log.metadataJson!)).toEqual({ aadhaar: 1, documents: 1, backgroundChecks: 1, disability: 0, keptYears: 1 });
    // Untouched: a cancellation younger than the period; notice-period staff; another company.
    const neel = await kept('A', scope.neel.personId);
    expect(neel.docs).toEqual(['aadhaar']);
    expect(neel.bgv[0].note).toBe('Degree not found');
    expect(neel.answers[0].identity.aadhaar).toBe('234567890124');
    const noor = await inOrg('A', (tx) => tx.disabilityDeclaration.findFirstOrThrow({ where: { employeeId: scope.noor.employeeId! } }));
    expect(noor).toMatchObject({ detailsEnc: 'sealed-details', erasedAt: null });
    expect((await kept('A', scope.noor.personId)).docs).toEqual(['aadhaar', 'disability_certificate', 'passport']);
    const bina = await kept('B', scope.bina.personId);
    expect(bina.docs).toEqual(['aadhaar']);
    expect(bina.answers[0].identity.aadhaar).toBe('234567890124');
  });

  it('scope: the database function accepts a never-joined offer past the period; refuses one younger, notice staff, a stranger, someone joining again, and company B (off)', async () => {
    expect((await callFn('A', scope.nora.personId))[0].n).toBe(0);
    await expect(callFn('A', scope.neel.personId)).rejects.toThrow(/period has not passed/);
    await expect(callFn('A', scope.noor.personId)).rejects.toThrow(/former employee/);
    const stranger = await inOrg('A', (tx) => tx.person.create({ data: { organizationId: org.A.id, givenName: 'Stranger', familyName: run } }));
    await expect(callFn('A', stranger.id)).rejects.toThrow(/former employee/);
    const again = await neverJoined('A', 'Omar', '2023-01-31');
    await inOrg('A', (tx) => tx.preboarding.create({ data: { organizationId: org.A.id, personId: again.personId, source: 'direct', joiningOn: new Date(`${day(20)}T00:00:00Z`), legalEntityId: ids.entityA, locationId: ids.locA, hrOwnerUserId: users.adminA, status: 'invited' } }));
    await expect(callFn('A', again.personId)).rejects.toThrow(/former employee/);
    expect((await api('hr', 'get', '/people/privacy-erasure').expect(200)).body.who.map((w: { name: string }) => w.name)).not.toContain(`Omar ${run}`);
    await expect(callFn('B', scope.bina.personId)).rejects.toThrow(/switched off/);
  });
});
