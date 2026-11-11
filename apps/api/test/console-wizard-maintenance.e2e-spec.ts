import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// YukthiX console C-5 (answers 948, 1053), end to end: the company wizard's create (staff only, step-up, audited; the
// first System Admin gets one invite and nothing else) and planned maintenance (staff schedule, a second staff member
// approves; every company sees the banner only the day before and during a window; it never blocks sign-in).
describe('Console C-5: company wizard and planned maintenance', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const sent: { to: string; subject: string }[] = [];
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '', W: '' };
  let planId = '';
  const settingsBefore: { key: string; value: string }[] = [];
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]!);
  const down = async (who: string) => {
    const { sid } = JSON.parse(Buffer.from(token[who]!.split('.')[1]!, 'base64url').toString()) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 3_600_000) } }));
  };
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  const withoutKey = async (key: string, fn: () => Promise<void>) => {
    const p = await tenantPrisma.forTenant(SUPER, (tx) => tx.permission.findUniqueOrThrow({ where: { key } }));
    await tenantPrisma.forTenant(SUPER, (tx) => tx.rolePermission.deleteMany({ where: { role: 'super_admin', permissionId: p.id } }));
    try {
      await fn();
    } finally {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.rolePermission.create({ data: { role: 'super_admin', permissionId: p.id } }));
    }
  };
  /** The next India day at least `minHours` ahead that passes the default rules (8th to month end less 3, not 15 or 20), 01:00 IST. */
  const goodStart = (minHours = 80) => {
    for (let t = Date.now() + minHours * 3_600_000; ; t += 86_400_000) {
      const d = new Date(t + 330 * 60_000);
      const day = d.getUTCDate();
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 1) - 330 * 60_000);
      if (day > 7 && day <= last - 3 && ![15, 20].includes(day) && start.getTime() >= Date.now() + minHours * 3_600_000) return start;
    }
  };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    settingsBefore.push(...(await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findMany({ where: { key: { startsWith: 'maintenance.' } }, select: { key: true, value: true } }))));
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2', 'staffNoKey'] as const) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await up('staff');
    await up('staff2');
    planId = (await prisma.plan.create({ data: { name: `c5-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `c5-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `C5 ${k} ${run}`, slug, planId } })).id;
      const email = `admin-${k.toLowerCase()}-${run}@c5.test`;
      users[`admin${k}`] = (await inOrg(org[k], (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }))).id;
      token[`admin${k}`] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.maintenanceWindow.updateMany({ where: { writtenBy: { in: [users.staff!, users.staff2!].filter(Boolean) }, status: { not: 'cancelled' } }, data: { status: 'cancelled', cancelReason: 'e2e clean-up', cancelledAt: new Date() } });
        await tx.platformSetting.deleteMany({ where: { key: { startsWith: 'maintenance.' } } });
        for (const s of settingsBefore) await tx.platformSetting.create({ data: s });
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org).filter(Boolean) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ the company wizard
  const company = (over: Record<string, unknown> = {}) => ({ name: `Tunga Textiles ${run}`, slug: `tunga-${run}`, adminName: 'Meena Pillai', adminEmail: `meena-${run}@tunga.test`, products: ['hrms'], legalEntity: { name: `Tunga Textiles Pvt Ltd ${run}`, pan: 'AAECT1234F', gstin: '29AAECT1234F1Z5' }, ...over });

  it('wizard: only staff with the companies key and a fresh step-up may create', async () => {
    await api('adminA', 'post', '/platform/companies').send(company()).expect(403);
    expect((await api('staffNoKey', 'post', '/platform/companies').send(company()).expect(403)).body.code).toBe('MFA_REQUIRED');
    await withoutKey('platform.companies.manage', async () => {
      await api('staff', 'post', '/platform/companies').send(company()).expect(403);
    });
    await down('staff');
    await api('staff', 'post', '/platform/companies').send(company()).expect(403);
    await up('staff');
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.count({ where: { slug: `tunga-${run}` } }))).toBe(0);
  });

  it('wizard: a bad email, a bad PAN, a GSTIN without the PAN, or a taken company code are refused', async () => {
    await api('staff', 'post', '/platform/companies').send(company({ adminEmail: 'meena-at-tunga' })).expect(400);
    await api('staff', 'post', '/platform/companies').send(company({ legalEntity: { name: 'Tunga', pan: 'AAECT1234' } })).expect(400);
    expect((await api('staff', 'post', '/platform/companies').send(company({ legalEntity: { name: 'Tunga', pan: 'AAECT1234F', gstin: '29AAECX9999F1Z5' } })).expect(400)).body.message).toBe('The GSTIN does not contain this PAN. Check both.');
    await api('staff', 'post', '/platform/companies').send(company({ slug: `c5-a-${run}` })).expect(409);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.count({ where: { slug: `tunga-${run}` } }))).toBe(0);
  });

  it('wizard: creates the company in trial with its legal entity; the first System Admin gets one invite and nothing else; audited', async () => {
    sent.length = 0;
    org.W = (await api('staff', 'post', '/platform/companies').send(company()).expect(201)).body.id;
    const le = await inOrg(org.W, (tx) => tx.legalEntity.findMany({ where: { organizationId: org.W } }));
    expect(le).toHaveLength(1);
    expect(le[0]).toMatchObject({ name: `Tunga Textiles Pvt Ltd ${run}`, pan: 'AAECT1234F', gstin: '29AAECT1234F1Z5', isDefault: true });
    const people = await inOrg(org.W, (tx) => tx.user.findMany({ where: { organizationId: org.W }, select: { email: true, role: true } }));
    expect(people).toEqual([{ email: `meena-${run}@tunga.test`, role: 'org_admin' }]);
    await new Promise((r) => setTimeout(r, 300)); // the welcome email goes after the response
    expect(sent).toEqual([{ to: `meena-${run}@tunga.test`, subject: `Tunga Textiles ${run} is ready on YukthiX` }]);
    expect(await inOrg(org.W, (tx) => tx.userNotification.count())).toBe(0);
    const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirst({ where: { organizationId: org.W, action: 'platform.company.created' } }));
    expect(audit).toMatchObject({ actorUserId: users.staff });
    expect(JSON.parse(audit!.metadataJson!)).toMatchObject({ products: ['hrms'], legalEntity: `Tunga Textiles Pvt Ltd ${run}`, pan: true, gstin: true });
    expect((await api('staff', 'get', `/platform/companies/${org.W}`).expect(200)).body).toMatchObject({ lifecycle: 'trial', products: ['hrms'] });
  });

  // ------------------------------------------------------------------------------------------ planned maintenance
  it('maintenance: staff only, with the maintenance key', async () => {
    await api('adminA', 'get', '/platform/maintenance').expect(403);
    await api('adminA', 'post', '/platform/maintenance').send({ title: 'Database upgrade', startsAt: goodStart().toISOString(), hours: 2 }).expect(403);
    expect((await api('staffNoKey', 'get', '/platform/maintenance').expect(403)).body.code).toBe('MFA_REQUIRED');
    await withoutKey('platform.maintenance.manage', async () => {
      await api('staff', 'get', '/platform/maintenance').expect(403);
      await api('staff', 'post', '/platform/maintenance').send({ title: 'Database upgrade', startsAt: goodStart().toISOString(), hours: 2 }).expect(403);
    });
    await request(server()).get('/api/v1/availability').expect(401);
  });

  it('maintenance: the drawn checks, from the settings; out-of-range settings are refused', async () => {
    const schedule = (startsAt: Date, hours = 2) => api('staff', 'post', '/platform/maintenance').send({ title: `Database upgrade ${run}`, startsAt: startsAt.toISOString(), hours });
    expect((await schedule(new Date(Date.now() + 48 * 3_600_000)).expect(400)).body.message).toMatch(/hours' notice/);
    expect((await schedule(goodStart(), 5).expect(400)).body.message).toMatch(/at most 4 hours/);
    const start = goodStart();
    const d = new Date(start.getTime() + 330 * 60_000);
    const firstOfNext = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 3, 1) - 330 * 60_000);
    expect((await schedule(firstOfNext).expect(400)).body.message).toMatch(/payroll-critical/);
    const fifteenth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15, 1) - 330 * 60_000);
    expect((await schedule(fifteenth).expect(400)).body.message).toMatch(/15th is a statutory due date/);
    await api('staff', 'put', '/platform/maintenance/settings').send({ values: { 'maintenance.notice_hours': 10 } }).expect(400);
    await api('staff', 'put', '/platform/maintenance/settings').send({ blockDates: [30] }).expect(400);
    await api('staff', 'put', '/platform/maintenance/settings').send({ values: { 'maintenance.unknown': 5 } }).expect(400);
  });

  let windowId = '';
  it('maintenance: waits for a second staff member (never the scheduler); companies see nothing until then', async () => {
    // A 168-hour banner, so the window below is already inside the banner time.
    await api('staff', 'put', '/platform/maintenance/settings').send({ values: { 'maintenance.banner_hours': 168 } }).expect(200);
    const start = goodStart();
    const body = (await api('staff', 'post', '/platform/maintenance').send({ title: `Database upgrade ${run}`, startsAt: start.toISOString(), hours: 2 }).expect(201)).body;
    const w = body.windows.find((x: { title: string }) => x.title === `Database upgrade ${run}`);
    windowId = w.id;
    expect(w).toMatchObject({ status: 'pending_approval', mine: true, version: 1 });
    expect((await api('adminA', 'get', '/availability').expect(200)).body).toEqual({ maintenance: null, incident: null });
    expect((await api('staff', 'post', `/platform/maintenance/${windowId}/approve`).send({ version: 1 }).expect(403)).body.message).toBe('You scheduled this window. Another staff member approves it.');
    await api('staff2', 'post', `/platform/maintenance/${windowId}/approve`).send({ version: 9 }).expect(409);
    expect((await api('staff2', 'post', `/platform/maintenance/${windowId}/approve`).send({ version: 1 }).expect(200)).body.windows.find((x: { id: string }) => x.id === windowId)).toMatchObject({ status: 'scheduled', decidedBy: 'Staff staff2' });
    await api('staff', 'post', '/platform/maintenance').send({ title: 'Overlapping work', startsAt: new Date(start.getTime() + 3_600_000).toISOString(), hours: 2 }).expect(409);
    // Every company sees the same banner, with no company's data in it.
    const a = (await api('adminA', 'get', '/availability').expect(200)).body;
    const b = (await api('adminB', 'get', '/availability').expect(200)).body;
    expect(a).toEqual(b);
    expect(a).toEqual({ maintenance: { phase: 'upcoming', title: `Database upgrade ${run}`, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString() }, incident: null });
    // Back to the 24-hour banner: the window is days away, so nothing shows yet.
    await api('staff', 'put', '/platform/maintenance/settings').send({ values: { 'maintenance.banner_hours': 24 } }).expect(200);
    expect((await api('adminA', 'get', '/availability').expect(200)).body).toEqual({ maintenance: null, incident: null });
    const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: windowId }, select: { action: true } }));
    expect(audit.map((x) => x.action).sort()).toEqual(['platform.maintenance.approved', 'platform.maintenance.scheduled']);
  });

  it('maintenance: during a window the banner says so and sign-in still works; cancelling needs a reason and ends the banner', async () => {
    const now = Date.now();
    const live = await tenantPrisma.forTenant(SUPER, (tx) => tx.maintenanceWindow.create({ data: { title: `Index rebuild ${run}`, startsAt: new Date(now - 30 * 60_000), endsAt: new Date(now + 30 * 60_000), status: 'scheduled', writtenBy: users.staff!, decidedBy: users.staff2!, decidedAt: new Date() } }));
    expect((await api('adminB', 'get', '/availability').expect(200)).body.maintenance).toMatchObject({ phase: 'now', title: `Index rebuild ${run}` });
    await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `c5-a-${run}`, email: `admin-a-${run}@c5.test`, password: PASSWORD }).expect(200);
    await api('staff', 'post', `/platform/maintenance/${live.id}/cancel`).send({ version: 1 }).expect(400);
    await api('staff', 'post', `/platform/maintenance/${live.id}/cancel`).send({ version: 1, reason: 'Finished early' }).expect(200);
    expect((await api('adminB', 'get', '/availability').expect(200)).body).toEqual({ maintenance: null, incident: null });
    await api('staff', 'post', `/platform/maintenance/${live.id}/cancel`).send({ version: 2, reason: 'Again' }).expect(409);
  });

  it('maintenance: a company can read windows but never write them (RLS)', async () => {
    await expect(inOrg(org.A, (tx) => tx.maintenanceWindow.create({ data: { title: 'Fake', startsAt: new Date(), endsAt: new Date(Date.now() + 1000), status: 'scheduled', writtenBy: users.adminA! } }))).rejects.toThrow();
    expect(await inOrg(org.A, (tx) => tx.maintenanceWindow.updateMany({ where: { id: windowId }, data: { title: 'Changed' } }))).toEqual({ count: 0 });
    await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.maintenanceWindow.update({ where: { id: windowId }, data: { decidedBy: users.staff } }))).rejects.toThrow();
  });
});
