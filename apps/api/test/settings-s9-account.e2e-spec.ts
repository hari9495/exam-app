import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { gunzipSync } from 'zlib';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { PlatformService } from '../src/platform/platform.service';

// Settings S-9 (answers 1328, 1332), against the real database: the plan, usage and invoices read-only; the
// whole-company export (System Admins with the security key; the link works the platform's hours, 24 by default; only
// that company's rows; audited); and closing the account (the company only asks; YukthiX staff close it, and the data is
// kept the platform's days, 30 by default).
describe('Settings S-9: billing read-only, data export and closing the account', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<'A' | 'B', { id: string; slug: string; name: string }> = {} as never;
  let planId = '';
  let staff = '';
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);
  const audits = (action: string) => inOrg('A', (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s9-plan-${run}`, candidateLimit: 10, aiCreditLimit: 100, proctoringMinutesLimit: 60, seatLimit: 25, priceLabel: '₹99 a person a month' } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `s9${k.toLowerCase()}-${run}`;
      const name = `S9 ${k} Foods ${run}`;
      org[k] = { id: (await prisma.organization.create({ data: { name, slug, planId } })).id, slug, name };
      await inOrg(k, (tx) => tx.legalEntity.create({ data: { organizationId: org[k].id, name: `Entity ${k} ${run}`, shortName: `E${k}`, isDefault: true } }));
    }
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organizationProduct.create({ data: { organizationId: org.A.id, productCode: 'hrms' } }));
    const people: [string, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['admin2', 'A', 'org_admin', null],
      ['billing', 'A', 'panel', ['org:manage_billing']],
      ['hr', 'A', 'panel', ['org.settings.manage', 'org.structure.view']],
      ['finance', 'A', 'panel', ['billing.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of people) {
      const permissionProfileId = keys ? (await inOrg(k, (tx) => tx.permissionProfile.create({ data: { organizationId: org[k].id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      const email = `${who}-${run}@s9.test`;
      users[who] = (await inOrg(k, (tx) => tx.user.create({ data: { organizationId: org[k].id, email, name: `Person ${who}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
    staff = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email: `staff-${run}@s9.test`, name: 'Staff S9', passwordHash, role: 'super_admin', organizationId: null } }))).id;
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = [...Object.values(users), staff];
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('8.1 to 8.3: the System Admin reads the plan, products, usage and invoices; nothing to pay here', async () => {
    const b = (await api('admin', 'get', '/account/billing').expect(200)).body;
    expect(b.plan).toMatchObject({ name: `s9-plan-${run}`, priceLabel: '₹99 a person a month' });
    expect(b.products).toEqual([expect.objectContaining({ code: 'hrms', name: 'YukthiX HR' })]);
    expect(b.usage.seats).toMatchObject({ limit: 25 });
    expect(Array.isArray(b.invoices) || b.invoices === null).toBe(true);
  });

  // Answer 1884: billing.view reads the plan, usage and invoices, and nothing else of group 8.
  it('1884: a finance person with billing.view reads the plan; negative: not the data page, an export or closing', async () => {
    expect((await api('finance', 'get', '/account/billing').expect(200)).body.plan).toMatchObject({ name: `s9-plan-${run}` });
    await api('finance', 'get', '/account/data').expect(403);
    await api('finance', 'post', '/account/exports').expect(403);
    await api('finance', 'post', '/account/closure').send({ companyName: org.A.name, reason: 'Not mine to close' }).expect(403);
  });

  it('negative: without the billing key the plan, usage and the data page are refused', async () => {
    await api('hr', 'get', '/account/billing').expect(403);
    await api('hr', 'get', '/account/data').expect(403);
    await api('hr', 'post', '/account/exports').expect(403);
  });

  let exportId = '';
  it('a System Admin exports the whole company: the link works 24 hours, audited, and holds only this company', async () => {
    const before = Date.now();
    const out = (await api('admin', 'post', '/account/exports').expect(201)).body as { id: string; expiresAt: string; tables: number; rows: number };
    exportId = out.id;
    expect(Math.round((new Date(out.expiresAt).getTime() - before) / 3_600_000)).toBe(24);
    expect(out.tables).toBeGreaterThan(2);
    const res = await api('admin', 'get', `/account/exports/${exportId}/file`).buffer(true).parse(binary).expect(200);
    const file = JSON.parse(gunzipSync(res.body as Buffer).toString()) as { manifest: { organizationId: string }; tables: Record<string, Record<string, unknown>[]> };
    expect(file.manifest.organizationId).toBe(org.A.id);
    expect(file.tables.legal_entities!.map((r) => r.name)).toEqual([`Entity A ${run}`]);
    const all = Object.values(file.tables).flat();
    expect(all.every((r) => r.organization_id === org.A.id)).toBe(true);
    // Negative: nothing of company B, and no secrets.
    const text = JSON.stringify(file);
    expect(text).not.toContain(org.B.id);
    expect(text).not.toContain(`Entity B ${run}`);
    expect(text).not.toContain('password_hash');
    expect(file.tables.users?.[0]).not.toHaveProperty('password_hash');
    expect((await audits('account.export.created'))).toHaveLength(1);
    expect((await audits('account.export.downloaded'))).toHaveLength(1);
    const data = (await api('admin', 'get', '/account/data').expect(200)).body;
    expect(data).toMatchObject({ linkHours: 24, keepDays: 30, exports: [expect.objectContaining({ id: exportId, open: true, downloads: 1 })] });
  }, 150_000);

  it('negative: after 24 hours the link no longer works', async () => {
    await inOrg('A', (tx) => tx.companyExport.update({ where: { id: exportId }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000), expiresAt: new Date(Date.now() - 3_600_000) } }));
    expect((await api('admin', 'get', `/account/exports/${exportId}/file`).expect(410)).body.message).toMatch(/expired/);
    expect((await api('admin', 'get', '/account/data').expect(200)).body.exports[0]).toMatchObject({ open: false });
  });

  it('negative: someone with the billing key who is not a System Admin cannot export or download; another company cannot see it', async () => {
    expect((await api('billing', 'post', '/account/exports').expect(403)).body.message).toMatch(/System Admin/);
    await api('billing', 'get', `/account/exports/${exportId}/file`).expect(403);
    await api('adminB', 'get', `/account/exports/${exportId}/file`).expect(404);
  });

  it('closing: the company only asks (company name typed); it stays open until YukthiX staff close it', async () => {
    expect((await api('admin', 'post', '/account/closure').send({ companyName: 'Someone else', reason: 'Moving to another tool' }).expect(400)).body.message).toMatch(/company name/);
    await api('billing', 'post', '/account/closure').send({ companyName: org.A.name, reason: 'Moving to another tool' }).expect(403);
    await api('admin', 'post', '/account/closure').send({ companyName: org.A.name.toUpperCase(), reason: 'Moving to another tool' }).expect(201);
    await api('admin2', 'post', '/account/closure').send({ companyName: org.A.name, reason: 'Again' }).expect(409);
    const o = await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.findUniqueOrThrow({ where: { id: org.A.id }, select: { lifecycle: true } }));
    expect(o.lifecycle).not.toBe('closed');
    // Negative: the company cannot close itself, through the console route or the database.
    await api('admin', 'post', `/platform/companies/${org.A.id}/lifecycle`).send({ action: 'close', reason: 'We asked' }).expect(403);
    await expect(inOrg('A', (tx) => tx.accountClosureRequest.updateMany({ where: { organizationId: org.A.id, status: 'requested' }, data: { status: 'closed', keepUntil: new Date() } }))).rejects.toThrow();
    expect((await audits('account.closure.requested'))).toHaveLength(1);
  });

  it('YukthiX staff close it: the request is answered and the data is kept 30 days', async () => {
    await app.get(PlatformService).changeLifecycle(staff, org.A.id, { action: 'close', reason: 'The company asked (S-9 test)' } as never);
    const r = await tenantPrisma.forTenant(SUPER, (tx) => tx.accountClosureRequest.findFirstOrThrow({ where: { organizationId: org.A.id } }));
    expect(r.status).toBe('closed');
    const days = Math.round((r.keepUntil!.getTime() - Date.parse(`${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    expect(days).toBe(30);
    const detail = await app.get(PlatformService).company(staff, org.A.id);
    expect(detail.closureRequest).toMatchObject({ status: 'closed', reason: 'Moving to another tool' });
  });
});
