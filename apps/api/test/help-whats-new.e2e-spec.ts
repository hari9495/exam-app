import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';
import { sixMonthsBefore } from '../src/help/whats-new.service';

// Help H-4, founder answer 943: What's new. YukthiX staff write the entries in the console (staff only, audited,
// platform data that a company can read but never write); each person sees the published entries for their role and
// their company's products, with their own read marks (forced RLS); the company can turn the list off.
describe("Help H-4: What's new (943)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org = { A: '', B: '' };
  const entries: string[] = [];
  let planId = '';
  const today = todayIst();
  const api = (who: string, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const up = (who: string) => markSteppedUp(tenantPrisma, token[who]!);
  const titles = (body: { entries: { title: string }[] }) => body.entries.map((e) => e.title).sort();
  const t = (s: string) => `${s} ${run}`;

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const who of ['staff', 'staffNoKey'] as const) {
      const email = `${who.toLowerCase()}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await up('staff');
    planId = (await prisma.plan.create({ data: { name: `wn-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    // Company A uses YukthiX HR; company B only the Service Desk.
    for (const [k, product] of [['A', 'hrms'], ['B', 'service_desk']] as const) {
      const slug = `wn-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `WN ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, fn);
      await at((tx) => tx.organizationProduct.create({ data: { organizationId: org[k], productCode: product } }));
      const people: [string, string, string[] | null][] = k === 'A' ? [['adminA', 'org_admin', null], ['plainA', 'panel', []], ['hrA', 'panel', ['leave.settings.manage', 'leave.view']]] : [['adminB', 'org_admin', null]];
      for (const [who, role, keys] of people) {
        const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k], name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
        const email = `${who.toLowerCase()}-${run}@wn.test`;
        users[who] = (await at((tx) => tx.user.create({ data: { organizationId: org[k], email, name: who, passwordHash, role, permissionProfileId } }))).id;
        token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    await up('adminA');
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.whatsNewRead.deleteMany({ where: { userId: { in: ids } } });
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A, org.B].filter(Boolean) } } });
        await tx.user.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    // Entries are never deleted by the app (no DELETE for the runtime role); the test withdraws its own.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.whatsNewEntry.updateMany({ where: { id: { in: entries } }, data: { withdrawnAt: new Date() } })).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  const entry = (over: Record<string, unknown> = {}) => ({ title: t('Press ? for shortcuts'), body: 'Every page lists the shortcuts that work for you.', products: ['hrms'], audiences: ['everyone'], publishOn: today, ...over });

  it('staff only: a company admin, a staff session without its security key and no session are refused', async () => {
    await api('adminA', 'get', '/platform/whats-new').expect(403);
    await api('adminA', 'post', '/platform/whats-new').send(entry()).expect(403);
    expect((await api('staffNoKey', 'get', '/platform/whats-new').expect(403)).body.code).toBe('MFA_REQUIRED');
    await request(server()).get('/api/v1/platform/whats-new').expect(401);
    const list = (await api('staff', 'get', '/platform/whats-new').expect(200)).body;
    expect(list.products.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['hrms', 'service_desk']));
  });

  it('staff write entries: each field checked; every entry audited on the platform log', async () => {
    await api('staff', 'post', '/platform/whats-new').send(entry({ title: 'ab' })).expect(400);
    await api('staff', 'post', '/platform/whats-new').send(entry({ title: 'Hello <script>' })).expect(400);
    await api('staff', 'post', '/platform/whats-new').send(entry({ products: [] })).expect(400);
    await api('staff', 'post', '/platform/whats-new').send(entry({ products: ['payroll_pro'] })).expect(400);
    await api('staff', 'post', '/platform/whats-new').send(entry({ audiences: ['ceo'] })).expect(400);
    await api('staff', 'post', '/platform/whats-new').send(entry({ publishOn: '2026-02-30' })).expect(400);
    await api('staff', 'post', '/platform/whats-new').send({ ...entry(), extra: 1 }).expect(400);
    const add = async (over: Record<string, unknown>) => {
      const body = (await api('staff', 'post', '/platform/whats-new').send(entry(over)).expect(201)).body;
      const row = body.entries.find((e: { title: string }) => e.title === (over.title ?? entry().title));
      entries.push(row.id);
      return row;
    };
    expect(await add({})).toMatchObject({ state: 'published', products: ['hrms'], audiences: ['everyone'], version: 1 });
    await add({ title: t('Leave rules for HR'), audiences: ['hr'] });
    expect(await add({ title: t('Coming next week'), publishOn: addDays(today, 5) })).toMatchObject({ state: 'scheduled' });
    await add({ title: t('Desk only'), products: ['service_desk'] });
    const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: null, action: 'platform.whats_new.created', entityId: { in: entries } } }));
    expect(audit).toHaveLength(4);
    expect(audit[0]).toMatchObject({ actorUserId: users.staff, entityType: 'whats_new_entry' });
  });

  it('people see the published entries for their role and company products, unread marked; another company sees its own', async () => {
    const plain = (await api('plainA', 'get', '/help/whats-new').expect(200)).body;
    expect(titles(plain).filter((x: string) => x.endsWith(run))).toEqual([t('Press ? for shortcuts')]);
    expect(plain.entries.find((e: { title: string }) => e.title === t('Press ? for shortcuts'))).toMatchObject({ product: 'YukthiX HR', unread: true, date: today });
    expect(titles((await api('hrA', 'get', '/help/whats-new').expect(200)).body).filter((x: string) => x.endsWith(run))).toEqual([t('Leave rules for HR'), t('Press ? for shortcuts')]);
    // The other company uses only the Service Desk: never the HR entries.
    expect(titles((await api('adminB', 'get', '/help/whats-new').expect(200)).body).filter((x: string) => x.endsWith(run))).toEqual([t('Desk only')]);
    await request(server()).get('/api/v1/help/whats-new').expect(401);
  });

  it('read marks are per person and only for entries the person sees', async () => {
    await api('plainA', 'post', '/help/whats-new/read').send({ ids: ['not-a-uuid'] }).expect(400);
    // The HR-only entry is not plainA's: marking it does nothing.
    const hrOnly = entries[1]!;
    await api('plainA', 'post', '/help/whats-new/read').send({ ids: [hrOnly] }).expect(200);
    expect(await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.whatsNewRead.count({ where: { userId: users.plainA, entryId: hrOnly } }))).toBe(0);
    const after = (await api('plainA', 'post', '/help/whats-new/read').send({}).expect(200)).body;
    expect(after.entries.filter((e: { title: string; unread: boolean }) => e.title.endsWith(run) && e.unread)).toEqual([]);
    const hr = (await api('hrA', 'get', '/help/whats-new').expect(200)).body;
    expect(hr.entries.filter((e: { title: string; unread: boolean }) => e.title.endsWith(run) && e.unread)).toHaveLength(2);
    // Another company never sees company A's read marks (forced RLS).
    expect(await tenantPrisma.forTenant({ organizationId: org.B, isSuperAdmin: false }, (tx) => tx.whatsNewRead.count({ where: { organizationId: org.A } }))).toBe(0);
  });

  it('answer 994: only entries from the last 6 months reach people', async () => {
    const make = async (title: string, publishOn: string) => {
      const row = (await api('staff', 'post', '/platform/whats-new').send(entry({ title: t(title), publishOn })).expect(201)).body.entries.find((e: { title: string }) => e.title === t(title));
      entries.push(row.id);
    };
    await make('Five months ago', addDays(sixMonthsBefore(today), 30));
    await make('Seven months ago', addDays(sixMonthsBefore(today), -30));
    const seen = titles((await api('hrA', 'get', '/help/whats-new').expect(200)).body);
    expect(seen).toContain(t('Five months ago'));
    expect(seen).not.toContain(t('Seven months ago'));
    // Staff still see every entry in the console.
    expect((await api('staff', 'get', '/platform/whats-new').expect(200)).body.entries.map((e: { title: string }) => e.title)).toContain(t('Seven months ago'));
  });

  it('a company can read entries but never write them (RLS)', async () => {
    const asA = { organizationId: org.A, isSuperAdmin: false };
    await expect(tenantPrisma.forTenant(asA, (tx) => tx.whatsNewEntry.create({ data: { title: 'Fake news', body: 'x', products: ['hrms'], audiences: ['everyone'], publishOn: new Date() } }))).rejects.toThrow();
    expect(await tenantPrisma.forTenant(asA, (tx) => tx.whatsNewEntry.updateMany({ where: { id: entries[0]! }, data: { title: 'Changed by a company' } }))).toEqual({ count: 0 });
    expect(await tenantPrisma.forTenant(asA, (tx) => tx.whatsNewEntry.count({ where: { id: entries[0]! } }))).toBe(1);
  });

  it('changing needs the current version; withdrawing removes it from Help at once and is final; both audited', async () => {
    const id = entries[0]!;
    await api('staff', 'patch', `/platform/whats-new/${id}`).send({ ...entry(), title: t('Press ? anywhere'), version: 9 }).expect(409);
    const changed = (await api('staff', 'patch', `/platform/whats-new/${id}`).send({ ...entry(), title: t('Press ? anywhere'), version: 1 }).expect(200)).body;
    expect(changed.entries.find((e: { id: string }) => e.id === id)).toMatchObject({ title: t('Press ? anywhere'), version: 2 });
    await api('staff', 'post', `/platform/whats-new/${randomUUID()}/withdraw`).expect(404);
    await api('staff', 'post', `/platform/whats-new/${id}/withdraw`).expect(200);
    await api('staff', 'post', `/platform/whats-new/${id}/withdraw`).expect(409);
    await api('staff', 'patch', `/platform/whats-new/${id}`).send({ ...entry(), version: 3 }).expect(409);
    expect(titles((await api('plainA', 'get', '/help/whats-new').expect(200)).body)).not.toContain(t('Press ? anywhere'));
    const actions = (await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: null, entityId: id }, select: { action: true } }))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['platform.whats_new.created', 'platform.whats_new.updated', 'platform.whats_new.withdrawn']));
  });

  it("the company setting 'Show what's new' off hides it for everyone there; acting for someone is refused", async () => {
    await api('adminA', 'put', '/org/settings').send({ key: 'help.whats_new.show', scopeType: 'tenant', value: 'maybe' }).expect(400);
    await api('adminA', 'put', '/org/settings').send({ key: 'help.whats_new.show', scopeType: 'tenant', value: 'off' }).expect(200);
    expect((await api('hrA', 'get', '/help/whats-new').expect(200)).body).toEqual({ show: false, unread: 0, entries: [] });
    expect((await api('adminB', 'get', '/help/whats-new').expect(200)).body.show).toBe(true);
    await api('adminA', 'put', '/org/settings').send({ key: 'help.whats_new.show', scopeType: 'tenant', value: 'on' }).expect(200);
    expect((await api('hrA', 'get', '/help/whats-new').expect(200)).body.show).toBe(true);
    token.acting = (await api('adminA', 'post', `/auth/impersonate/${users.plainA}`).expect(200)).body.accessToken;
    await api('acting', 'get', '/help/whats-new').expect(403);
    await api('acting', 'post', '/help/whats-new/read').send({}).expect(403);
  });
});
