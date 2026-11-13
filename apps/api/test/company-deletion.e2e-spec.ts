import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';

// Answer 1882, against the real database, on throwaway companies only: after a closed company's kept days, one YukthiX
// staff member asks and a second confirms (both with the security key); the company's rows, and only its rows, are
// deleted; a deletion certificate is kept. Refused for an open company, before the kept days, under a legal hold, without
// a second person, and for a company admin.
describe('Deleting a closed company (1882)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<'T' | 'K' | 'O' | 'H', string> = { T: '', K: '', O: '', H: '' };
  let planId = '';
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const sup = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const codeOf = (r: request.Response) => (r.body as { code?: string }).code;
  const close = (id: string, daysAgo: number) => sup((tx) => tx.organization.update({ where: { id }, data: { lifecycle: 'closed', lifecycleChangedAt: new Date(Date.now() - daysAgo * 86_400_000) } }));
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
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['s1', 's2', 'cold'] as const) {
      const email = `${who}-${run}@deletion.test`;
      users[who] = (await sup((tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      if (who !== 'cold') await markSteppedUp(tenantPrisma, token[who]!);
    }
    planId = (await prisma.plan.create({ data: { name: `del-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['T', 'K', 'O', 'H'] as const) {
      const slug = `del-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `Throwaway ${k} ${run}`, slug, planId } })).id;
      await tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, async (tx) => {
        await tx.legalEntity.create({ data: { organizationId: org[k], name: `Entity ${k}`, shortName: `E${k}`, isDefault: true } });
        await tx.setting.create({ data: { organizationId: org[k], scopeType: 'tenant', scopeId: org[k], key: 'leave.send_back', value: 'on' } });
        await tx.documentType.create({ data: { organizationId: org[k], key: `c_badge_${k.toLowerCase()}`, name: `Badge ${k}`, sensitivity: 'internal', requiresVerification: false, allowedMime: ['application/pdf'], maxMb: 5, expiryTracked: false, uploadBy: ['hr'] } });
        users[`admin${k}`] = (await tx.user.create({ data: { organizationId: org[k], email: `admin-${k.toLowerCase()}-${run}@deletion.test`, name: `Admin ${k}`, passwordHash, role: 'org_admin' } })).id;
      });
      await sup((tx) => tx.organizationProduct.create({ data: { organizationId: org[k], productCode: 'hrms' } }));
    }
    token.adminK = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `del-k-${run}`, email: `admin-k-${run}@deletion.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await markSteppedUp(tenantPrisma, token.adminK!);
  }, 180_000);

  afterAll(async () => {
    await sup(async (tx) => {
      const u = Object.values(users);
      await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
      await tx.session.deleteMany({ where: { userId: { in: u } } });
      await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
      await tx.user.deleteMany({ where: { id: { in: u } } });
    }).catch(() => undefined);
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

  it('a second staff member confirms: only that company is deleted, with a certificate; another company is untouched', async () => {
    const before = await footprint(org.K);
    expect(Object.keys(before).length).toBeGreaterThan(3);
    const out = (await api('s2', 'post', `/platform/companies/${org.T}/deletion/confirm`).expect(200)).body as { certificate: { rows: number; tables: Record<string, number>; company: { id: string } }; certificateSha256: string };
    expect(out.certificate.company.id).toBe(org.T);
    expect(out.certificate.tables).toMatchObject({ legal_entities: 1, settings: 1, document_types: 1, users: 1, organization_products: 1 });
    expect(out.certificateSha256).toBe(createHash('sha256').update(JSON.stringify(out.certificate)).digest('hex'));
    expect(await prisma.organization.count({ where: { id: org.T } })).toBe(0);
    // Only the deletion record itself remains (it keeps the certificate; it is YukthiX's, not the company's).
    expect(await footprint(org.T)).toEqual({ company_deletions: 1 });
    expect(await footprint(org.K)).toEqual(before);
    const list = (await api('s1', 'get', '/platform/deletions').expect(200)).body as { organizationId: string; status: string; certificateSha256: string }[];
    expect(list.find((d) => d.organizationId === org.T)).toMatchObject({ status: 'done', certificateSha256: out.certificateSha256 });
    const audit = await sup((tx) => tx.auditLog.findFirst({ where: { action: 'platform.company.deleted', entityType: 'company_deletion' }, orderBy: { createdAt: 'desc' } }));
    expect(audit).toMatchObject({ organizationId: null, actorUserId: users.s2 });
  });

  it('negative: the database alone refuses to delete an open company', async () => {
    await expect(sup((tx) => tx.$queryRaw`SELECT purge_company(${org.O}::uuid)`)).rejects.toThrow(/Only a closed company/);
    expect(Object.keys(await footprint(org.O)).length).toBeGreaterThan(3);
  });
});
