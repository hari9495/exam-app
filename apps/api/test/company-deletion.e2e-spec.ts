import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AuditService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { FileStore } from '../src/documents/file-store';
import { FILE_LIKE_COLUMN, NOT_STORED_FILES, STORED_FILE_COLUMNS } from '../src/platform/stored-files';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';

// Answers 1882, 1972, 1973, 1975, against the real database, on throwaway companies only: after a closed company's kept
// days, one YukthiX staff member asks and a second confirms (both with the security key). Everything of that company,
// and only that company, is deleted except its statutory records, which stay read-only for their legal period; its
// stored files are dropped; a deletion certificate (what went, what was kept, why, until when) can be downloaded.
// The database function refuses on its own without a confirmed request, before the kept days, or for an open company.
describe('Deleting a closed company (1882, 1972, 1973, 1975)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let store: FileStore;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<'T' | 'K' | 'O' | 'H' | 'N' | 'E', string> = { T: '', K: '', O: '', H: '', N: '', E: '' };
  const refs: string[] = [];
  let planId = '';
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const sup = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const codeOf = (r: request.Response) => (r.body as { code?: string }).code;
  // Closing stamps lifecycle_changed_at itself; the day is moved back in a second step.
  const close = async (id: string, daysAgo: number) => {
    await sup((tx) => tx.organization.update({ where: { id }, data: { lifecycle: 'closed' } }));
    await sup((tx) => tx.organization.update({ where: { id }, data: { lifecycleChangedAt: new Date(Date.now() - daysAgo * 86_400_000) } }));
  };
  const purgeDirect = (id: string) => sup((tx) => tx.$queryRaw`SELECT purge_company(${id}::uuid)`);
  /** Every row of a company, table by table (what must not change for another company). */
  const footprint = (id: string) =>
    tenantPrisma.forTenant(SUPER, async (tx) => {
      const tables = await tx.$queryRaw<{ t: string }[]>`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables x ON x.table_name = c.table_name AND x.table_schema = c.table_schema AND x.table_type = 'BASE TABLE' WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' ORDER BY 1`;
      const out: Record<string, number> = {};
      for (const { t } of tables) {
        const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}" WHERE organization_id = $1::uuid`, id);
        if (Number(n)) out[t] = Number(n);
      }
      return out;
    }, { timeout: 120_000 });

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    store = app.get(FileStore);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['s1', 's2', 'cold'] as const) {
      const email = `${who}-${run}@deletion.test`;
      users[who] = (await sup((tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'cold') await markSteppedUp(tenantPrisma, token[who]!);
    }
    planId = (await prisma.plan.create({ data: { name: `del-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['T', 'K', 'O', 'H', 'N', 'E'] as const) {
      const slug = `del-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `Throwaway ${k} ${run}`, slug, planId } })).id;
      const ctx = { organizationId: org[k], isSuperAdmin: false };
      await tenantPrisma.forTenant(ctx, async (tx) => {
        await tx.legalEntity.create({ data: { organizationId: org[k], name: `Entity ${k}`, shortName: `E${k}`, isDefault: true } });
        await tx.setting.create({ data: { organizationId: org[k], scopeType: 'tenant', scopeId: org[k], key: 'leave.send_back', value: 'on' } });
        await tx.documentType.create({ data: { organizationId: org[k], key: `c_badge_${k.toLowerCase()}`, name: `Badge ${k}`, sensitivity: 'internal', requiresVerification: false, allowedMime: ['application/pdf'], maxMb: 5, expiryTracked: false, uploadBy: ['hr'] } });
        users[`admin${k}`] = (await tx.user.create({ data: { organizationId: org[k], email: `admin-${k.toLowerCase()}-${run}@deletion.test`, name: `Admin ${k}`, passwordHash, role: 'org_admin' } })).id;
        await AuditService.recordIn(tx, ctx, { actorUserId: users[`admin${k}`]!, action: 'organization.settings_changed', entityType: 'organization', entityId: org[k] });
      });
      await sup((tx) => tx.organizationProduct.create({ data: { organizationId: org[k], productCode: 'hrms' } }));
    }
    // T's stored files (1972): a document file and a company export, really stored.
    for (const area of ['documents', 'export'] as const) refs.push(await store.put(`test/deletion-${run}/${area}.bin`, Buffer.from(`file ${area} ${run}`)));
    await tenantPrisma.forTenant({ organizationId: org.T, isSuperAdmin: false }, async (tx) => {
      await tx.file.create({ data: { organizationId: org.T, area: 'documents', storageRef: refs[0]!, fileName: 'a.bin', mime: 'application/octet-stream', size: 10, sha256: '0'.repeat(64), uploadedVia: 'staff' } });
      await tx.companyExport.create({ data: { organizationId: org.T, requestedBy: users.adminT!, fileRef: refs[1]!, sizeBytes: BigInt(10), tables: 1, rows: 1, expiresAt: new Date(Date.now() + 3_600_000) } });
    });
    token.adminK = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `del-k-${run}`, email: `admin-k-${run}@deletion.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await markSteppedUp(tenantPrisma, token.adminK!);
  }, 180_000);

  afterAll(async () => {
    // Kept records are read-only for the app; cleaning the throwaway companies needs the owner's connection and
    // app.retention_release (the only way past the read-only rule).
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    await owner
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true), set_config('app.retention_release', 'on', true)`;
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.companyDeletion.deleteMany({ where: { organizationId: { in: Object.values(org) } } }).catch(() => undefined);
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      }, { timeout: 120_000 })
      .catch((e: Error) => console.warn(`cleanup: ${e.message}`));
    await owner.$disconnect();
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('negative: an open company cannot be deleted', async () => {
    expect((await api('s1', 'post', `/platform/companies/${org.O}/deletion`).send({ reason: 'Trying an open one' }).expect(409)).body.message).toMatch(/Only a closed company/);
  });

  it('negative: a closed company is refused before its kept days (30) are over', async () => {
    await close(org.T, 5);
    expect((await api('s1', 'post', `/platform/companies/${org.T}/deletion`).send({ reason: 'Too early' }).expect(409)).body.message).toMatch(/kept until/);
  });

  it('negative: under a legal hold the data stays, kept days or not', async () => {
    await close(org.H, 60);
    await tenantPrisma.forTenant({ organizationId: org.H, isSuperAdmin: false }, (tx) => tx.auditLegalHold.create({ data: { organizationId: org.H, caseRef: 'CASE-1', fromAt: new Date(Date.now() - 86_400_000), toAt: new Date(Date.now() + 86_400_000 * 365), reason: 'Litigation', setBy: users.adminH! } }));
    expect((await api('s1', 'post', `/platform/companies/${org.H}/deletion`).send({ reason: 'Past the kept days' }).expect(409)).body.message).toMatch(/legal hold/);
  });

  it('negative: a company admin, and staff without the security key, cannot ask', async () => {
    await close(org.T, 40);
    await api('adminK', 'post', `/platform/companies/${org.T}/deletion`).send({ reason: 'Not mine' }).expect(403);
    const r = await api('cold', 'post', `/platform/companies/${org.T}/deletion`).send({ reason: 'No security key' });
    // A staff account with no passkey yet is stopped one step earlier (MFA_REQUIRED); either way, refused.
    expect(r.status).toBe(403);
    expect(['STEP_UP_REQUIRED', 'MFA_REQUIRED']).toContain(codeOf(r));
  });

  it('one staff member asks; negative: the same person cannot confirm, and nobody asks twice', async () => {
    await api('s1', 'post', `/platform/companies/${org.T}/deletion`).send({ reason: 'Closed at their request; kept days over' }).expect(201);
    expect((await api('s1', 'post', `/platform/companies/${org.T}/deletion/confirm`).expect(403)).body.message).toMatch(/second staff member/);
    await api('s2', 'post', `/platform/companies/${org.T}/deletion`).send({ reason: 'Again' }).expect(409);
    const detail = (await api('s2', 'get', `/platform/companies/${org.T}`).expect(200)).body;
    expect(detail.deletion).toMatchObject({ mine: false, reason: 'Closed at their request; kept days over' });
    const r = await api('cold', 'post', `/platform/companies/${org.T}/deletion/confirm`);
    expect(r.status).toBe(403);
    expect(['STEP_UP_REQUIRED', 'MFA_REQUIRED']).toContain(codeOf(r));
  });

  // Defence in depth (1882): the database function itself refuses, whatever the app does.
  it('negative: purge_company called directly is refused with no request, with an unconfirmed one, and before the kept days', async () => {
    await close(org.N, 60);
    const beforeN = await footprint(org.N);
    await expect(purgeDirect(org.N)).rejects.toThrow(/confirmed by a second staff member/);
    const asked = await api('s1', 'post', `/platform/companies/${org.N}/deletion`).send({ reason: 'Asked, not confirmed' });
    expect([asked.status, asked.body.message]).toEqual([201, undefined]);
    await expect(purgeDirect(org.N)).rejects.toThrow(/confirmed by a second staff member/);
    // Confirmed by the asker themself: the table refuses it (four eyes) before the function is even reached.
    await expect(sup((tx) => tx.companyDeletion.updateMany({ where: { organizationId: org.N, status: 'requested' }, data: { approvedBy: users.s1 } }))).rejects.toThrow();
    expect(await footprint(org.N)).toEqual({ ...beforeN, company_deletions: 1 });

    // E: closed 5 days ago with a request confirmed by a second person written straight into the table.
    await close(org.E, 5);
    const beforeE = await footprint(org.E);
    await sup((tx) => tx.companyDeletion.create({ data: { organizationId: org.E, companyName: 'E', companySlug: 'e', reason: 'Too early', requestedBy: users.s1!, approvedBy: users.s2! } }));
    await expect(purgeDirect(org.E)).rejects.toThrow(/kept 30 days after closing/);
    expect(await footprint(org.E)).toEqual({ ...beforeE, company_deletions: 1 });
    expect((await sup((tx) => tx.organization.findUniqueOrThrow({ where: { id: org.E }, select: { recordsKeptUntil: true } }))).recordsKeptUntil).toBeNull();
  });

  it('a second staff member confirms: only that company is deleted, its statutory records kept read-only, its files dropped; another company is untouched', async () => {
    const before = await footprint(org.K);
    expect(Object.keys(before).length).toBeGreaterThan(3);
    const done = await api('s2', 'post', `/platform/companies/${org.T}/deletion/confirm`);
    expect([done.status, done.status === 200 ? '' : JSON.stringify(done.body)]).toEqual([200, '']);
    const out = done.body as {
      certificate: { rows: number; tables: Record<string, number>; company: { id: string }; kept: { table: string; rows: number; why: string; keptUntil: string }[]; recordsKeptUntil: string; storedFiles: { dropped: number; keptWithRecords: number } };
      certificateSha256: string;
      storedFilesDropped: number;
    };
    expect(out.certificate.company.id).toBe(org.T);
    expect(out.certificate.tables).toMatchObject({ settings: 1, document_types: 1, organization_products: 1, files: 1, company_exports: 1 });
    expect(out.certificate.tables).not.toHaveProperty('audit_logs');
    // Kept (1975): the audit log, and the rows the kept records need (the legal entity, the company's people).
    const kept = Object.fromEntries(out.certificate.kept.map((k) => [k.table, k]));
    const in8 = new Date(Date.now() + 8 * 365.25 * 86_400_000).toISOString().slice(0, 7);
    expect(kept.audit_logs).toMatchObject({ why: expect.stringMatching(/s\.128\(5\)/) });
    expect(kept.audit_logs!.keptUntil.slice(0, 7)).toBe(in8);
    expect(kept).toHaveProperty('legal_entities');
    expect(kept).toHaveProperty('users');
    expect(out.certificate.recordsKeptUntil.slice(0, 7)).toBe(in8);
    // The certificate is stored exactly as returned, with its SHA-256.
    const row = await sup((tx) => tx.companyDeletion.findFirstOrThrow({ where: { organizationId: org.T, status: 'done' } }));
    expect(row.approvedBy).toBe(users.s2);
    expect(JSON.parse(row.certificate!)).toEqual(out.certificate);
    expect(out.certificateSha256).toBe(createHash('sha256').update(row.certificate!).digest('hex'));

    // The company row stays (it owns the kept records), suspended; its people cannot sign in.
    const o = await sup((tx) => tx.organization.findUniqueOrThrow({ where: { id: org.T }, select: { lifecycle: true, status: true, recordsKeptUntil: true } }));
    expect(o).toMatchObject({ lifecycle: 'closed', status: 'suspended' });
    const person = await sup((tx) => tx.user.findUniqueOrThrow({ where: { id: users.adminT! }, select: { passwordHash: true, status: true } }));
    expect(person).toEqual({ passwordHash: '!', status: 'deactivated' });
    const left = await footprint(org.T);
    expect(Object.keys(left).sort()).toEqual(['audit_logs', 'company_deletions', 'legal_entities', 'users']);
    // (A refused sign-in writes its own login event, after the deletion.)
    await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `del-t-${run}`, email: `admin-t-${run}@deletion.test`, password: PASSWORD }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));

    // Read-only: nobody the app runs as can change or remove a kept record.
    await expect(sup((tx) => tx.legalEntity.updateMany({ where: { organizationId: org.T }, data: { name: 'Changed' } }))).rejects.toThrow(/kept read-only until/);
    await expect(sup((tx) => tx.user.deleteMany({ where: { organizationId: org.T } }))).rejects.toThrow(/kept read-only until/);
    await expect(sup((tx) => tx.organization.update({ where: { id: org.T }, data: { lifecycle: 'active' } }))).rejects.toThrow(/kept read-only until/);

    // Stored files (1972): dropped.
    expect(out.storedFilesDropped).toBe(2);
    expect(out.certificate.storedFiles).toEqual({ dropped: 2, keptWithRecords: 0 });
    for (const ref of refs) await expect(store.get(ref)).rejects.toThrow();

    // Another company: not one row changed.
    expect(await footprint(org.K)).toEqual(before);
    const list = (await api('s1', 'get', '/platform/deletions').expect(200)).body as { organizationId: string; status: string; certificateSha256: string }[];
    expect(list.find((d) => d.organizationId === org.T)).toMatchObject({ status: 'done', certificateSha256: out.certificateSha256 });
    const audit = await sup((tx) => tx.auditLog.findFirst({ where: { action: 'platform.company.deleted', entityType: 'company_deletion' }, orderBy: { createdAt: 'desc' } }));
    expect(audit).toMatchObject({ organizationId: null, actorUserId: users.s2 });
  });

  it('1973: the console shows the deletion and downloads the certificate (audited); negative: no certificate before deletion, none for a company admin', async () => {
    const detail = (await api('s1', 'get', `/platform/companies/${org.T}`).expect(200)).body;
    expect(detail.deleted).toMatchObject({ recordsKeptUntil: expect.any(String), certificateSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const got = (await api('s1', 'get', `/platform/companies/${org.T}/deletion/certificate`).expect(200)).body as { fileName: string; certificate: string; certificateSha256: string };
    expect(got.fileName).toBe(`yukthix-deletion-certificate-del-t-${run}.json`);
    expect(createHash('sha256').update(got.certificate).digest('hex')).toBe(got.certificateSha256);
    expect(await sup((tx) => tx.auditLog.count({ where: { action: 'platform.company.deletion_certificate_downloaded', actorUserId: users.s1 } }))).toBeGreaterThan(0);
    await api('s1', 'get', `/platform/companies/${org.K}/deletion/certificate`).expect(404);
    await api('adminK', 'get', `/platform/companies/${org.T}/deletion/certificate`).expect(403);
  });

  it('negative: a deleted company cannot be deleted again', async () => {
    expect((await api('s1', 'post', `/platform/companies/${org.T}/deletion`).send({ reason: 'Again' }).expect(409)).body.message).toMatch(/already deleted/);
  });

  it('negative: the database alone refuses to delete an open company', async () => {
    await expect(purgeDirect(org.O)).rejects.toThrow(/Only a closed company/);
    expect(Object.keys(await footprint(org.O)).length).toBeGreaterThan(3);
  });

  // 1972: no file column is missed. Every column that looks like a file is either dropped (listed) or named as not a file.
  it('every column that looks like a stored file is listed, and every listed one exists', async () => {
    const cols = await sup((tx) => tx.$queryRawUnsafe<{ k: string }[]>(`SELECT c.table_name || '.' || c.column_name AS k FROM information_schema.columns c JOIN information_schema.tables x ON x.table_schema = c.table_schema AND x.table_name = c.table_name AND x.table_type = 'BASE TABLE' WHERE c.table_schema = 'public' AND c.column_name ~ $1`, FILE_LIKE_COLUMN));
    const found = new Set(cols.map((c) => c.k));
    const listed = new Set([...STORED_FILE_COLUMNS.map((c) => `${c.table}.${c.column}`), ...Object.keys(NOT_STORED_FILES)]);
    expect([...found].filter((k) => !listed.has(k) && !k.startsWith('proctoring_events.'))).toEqual([]);
    expect([...listed].filter((k) => !found.has(k) && k !== 'proctoring_events.metadata_json')).toEqual([]);
  });

  it('every kept table carries the read-only rule', async () => {
    const missing = await sup((tx) => tx.$queryRaw<{ t: string }[]>`SELECT DISTINCT r.table_name AS t FROM company_retained_tables() r WHERE NOT EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgname = 'company_records_read_only' AND g.tgrelid = r.table_name::regclass)`);
    expect(missing).toEqual([]);
  });
});
