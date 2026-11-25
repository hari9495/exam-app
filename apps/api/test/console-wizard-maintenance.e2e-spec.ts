import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { BLOCK_DATES_DEFAULT, BLOCK_DATES_KEY, MAINTENANCE_SETTINGS } from '../src/platform/maintenance.service';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

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
  /** The trial plan the wizard needs (seed data elsewhere); made here when the database has none, removed after. */
  let trialPlanMade = '';
  const settingsBefore: { key: string; value: string }[] = [];
  /** Windows already waiting or scheduled when the suite starts (another run's leftovers): our times never overlap them. */
  const busy: { startsAt: Date; endsAt: Date }[] = [];
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]!);
  const down = async (who: string) => {
    const { sid } = JSON.parse(Buffer.from(token[who]!.split('.')[1]!, 'base64url').toString()) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 3_600_000) } }));
  };
  const inOrg = <T>(id: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: false }, fn);
  // Staff roles (answer 1058): staff without a key = without every role that holds it (restored straight after).
  const withoutKey = async (key: string, fn: () => Promise<void>) => {
    const keep = await rolesWithout(key);
    for (const who of ['staff', 'staff2']) await giveStaffRoles(users[who]!, keep);
    try {
      await fn();
    } finally {
      for (const who of ['staff', 'staff2']) await giveStaffRoles(users[who]!);
    }
  };
  /**
   * The next India day at least `minHours` ahead that passes the default rules (8th to month end less 3, not 15 or 20),
   * 01:00 IST, whose 01:00-06:00 never overlaps a window left waiting or scheduled by another run (so the suite reruns).
   */
  // The first `first` and last `last` days of the month are blocked (defaults 7 and 3, as the platform settings).
  const goodStart = (minHours = 80, first = 7, last3 = 3) => {
    for (let t = Date.now() + minHours * 3_600_000; ; t += 86_400_000) {
      const d = new Date(t + 330 * 60_000);
      const day = d.getUTCDate();
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 1) - 330 * 60_000);
      const end = new Date(start.getTime() + 5 * 3_600_000);
      const free = !busy.some((w) => w.startsAt < end && w.endsAt > start);
      if (free && day > first && day <= last - last3 && ![7, 15, 20].includes(day) && start.getTime() >= Date.now() + minHours * 3_600_000) return start;
    }
  };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    settingsBefore.push(...(await tenantPrisma.forTenant(SUPER, (tx) => tx.platformSetting.findMany({ where: { key: { startsWith: 'maintenance.' } }, select: { key: true, value: true } }))));
    // An earlier run that stopped before its clean-up may have left windows (written by e2e staff, @platform.test): cancel
    // them, or their banner shows in this run. Any other window stays; the times this run picks never overlap it.
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      const e2eStaff = (await tx.user.findMany({ where: { organizationId: null, email: { endsWith: '@platform.test' } }, select: { id: true } })).map((u) => u.id);
      await tx.maintenanceWindow.updateMany({ where: { writtenBy: { in: e2eStaff }, status: { not: 'cancelled' } }, data: { status: 'cancelled', cancelReason: 'e2e clean-up of an earlier run', cancelledAt: new Date() } });
    });
    busy.push(...(await tenantPrisma.forTenant(SUPER, (tx) => tx.maintenanceWindow.findMany({ where: { status: { not: 'cancelled' } }, select: { startsAt: true, endsAt: true } }))));
    // The wizard creates the company on the trial plan: make one when this database has none.
    if (!(await prisma.plan.findFirst({ where: { name: 'trial' } }))) trialPlanMade = (await prisma.plan.create({ data: { name: 'trial', candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staff2', 'staffNoKey'] as const) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!);
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
    // Each step in its own transaction, so one failure never undoes the others; failures are reported, not hidden.
    const step = async (what: string, fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      await tenantPrisma.forTenant(SUPER, fn).catch((e: unknown) => console.warn(`clean-up: ${what}:`, (e as Error).message));
    };
    // Every window this run made (by its staff) is cancelled first: windows are never deleted, and a left one blocks reruns.
    await step('cancel windows', (tx) => tx.maintenanceWindow.updateMany({ where: { writtenBy: { in: [users.staff, users.staff2].filter((x): x is string => Boolean(x)) }, status: { not: 'cancelled' } }, data: { status: 'cancelled', cancelReason: 'e2e clean-up', cancelledAt: new Date() } }));
    // Platform settings are never deleted: each maintenance value goes back to what it was, or to its default.
    await step('settings', async (tx) => {
      const now = await tx.platformSetting.findMany({ where: { key: { startsWith: 'maintenance.' } }, select: { key: true } });
      const defaults: Record<string, string> = { ...Object.fromEntries(Object.entries(MAINTENANCE_SETTINGS).map(([k, d]) => [k, String(d.default)])), [BLOCK_DATES_KEY]: BLOCK_DATES_DEFAULT };
      for (const { key } of now) {
        const value = settingsBefore.find((b) => b.key === key)?.value ?? defaults[key];
        if (value !== undefined) await tx.platformSetting.update({ where: { key }, data: { value } });
      }
    });
    const ids = Object.values(users);
    await step('sessions', async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await tx.session.deleteMany({ where: { userId: { in: ids } } });
    });
    await step('companies', (tx) => tx.organization.deleteMany({ where: { id: { in: Object.values(org).filter(Boolean) } } }));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    if (trialPlanMade) await prisma.plan.delete({ where: { id: trialPlanMade } }).catch((e: unknown) => console.warn('clean-up: trial plan:', (e as Error).message));
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
      // Staff roles (answer 1058): without the manage key they still see the windows (Customer success's view key).
      await api('staff', 'get', '/platform/maintenance').expect(200);
      await api('staff', 'post', '/platform/maintenance').send({ title: 'Database upgrade', startsAt: goodStart().toISOString(), hours: 2 }).expect(403);
    });
    await withoutKey('platform.maintenance.view', async () => {
      for (const who of ['staff', 'staff2']) await giveStaffRoles(users[who]!, (await rolesWithout('platform.maintenance.manage')).filter((r) => r !== 'customer_success'));
      await api('staff', 'get', '/platform/maintenance').expect(403);
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
    // Answer 1183: the rules change only on Console › Platform settings (security key and a reason), within their ranges.
    await api('staff', 'put', '/platform/maintenance/settings').send({ values: { 'maintenance.banner_hours': 48 } }).expect(404);
    await api('staff', 'put', '/platform/settings/maintenance.notice_hours').send({ value: '10', reason: 'Testing the rules' }).expect(400);
    await api('staff', 'put', '/platform/settings/maintenance.block_dates').send({ value: '30', reason: 'Testing the rules' }).expect(400);
    await api('staff', 'put', '/platform/settings/maintenance.unknown').send({ value: '5', reason: 'Testing the rules' }).expect(404);
  });

  let windowId = '';
  it('maintenance: waits for a second staff member (never the scheduler); companies see nothing until then', async () => {
    // A 168-hour banner, so the window below is already inside the banner time.
    await up('staff');
    await api('staff', 'put', '/platform/settings/maintenance.banner_hours').send({ value: '168', reason: 'A week of banner for the test' }).expect(200);
    // Saved on Platform settings, shown on the maintenance page.
    const rules = (await api('staff', 'get', '/platform/maintenance').expect(200)).body.settings.numbers as { key: string; value: number }[];
    expect(rules.find((n) => n.key === 'maintenance.banner_hours')?.value).toBe(168);
    // The blocked first 7 and last 3 days can push the first legal start past the 168 hours (from 25 Nov it was 8 Dec),
    // so this test frees them; 7, 15 and 20 stay blocked, and 80-168 hours always holds a day that is none of them.
    for (const k of ['block_first_days', 'block_last_days']) await api('staff', 'put', `/platform/settings/maintenance.${k}`).send({ value: '0', reason: 'Room for the banner test' }).expect(200);
    const start = goodStart(80, 0, 0);
    expect(start.getTime()).toBeLessThan(Date.now() + 160 * 3_600_000);
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
    await api('staff', 'put', '/platform/settings/maintenance.banner_hours').send({ value: '24', reason: 'Back to the default' }).expect(200);
    for (const [k, v] of [['block_first_days', '7'], ['block_last_days', '3']]) await api('staff', 'put', `/platform/settings/maintenance.${k}`).send({ value: v, reason: 'Back to the default' }).expect(200);
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
