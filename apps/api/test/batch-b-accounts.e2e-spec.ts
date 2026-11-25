import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Batch B item 20 (admin A6, answers 2365 and 2366), against the real database (forced RLS, app role): Login activity ›
// Accounts lists everyone with an account and whether they can sign in; only org:manage_users; one company never sees
// another's people; bad filters are a 400.
describe('Batch B: users and sign-in list (Login activity › Accounts)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Row = { id: string; name: string; status: string; lastLoginAt: string | null; twoStep: boolean; self: boolean; roleLabel: string };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `bb-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `bb-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `BB ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      // admin: manages accounts; plain: nothing; invited: an account that never signs in (no token).
      const people: [string, string[], boolean][] = k === 'A' ? [['admin', ['org:manage_users'], true], ['plain', [], true], ['invited', [], false]] : [['admin', ['org:manage_users'], true]];
      for (const [who, keys, signIn] of people) {
        const permissionProfileId = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
        const email = `${who}-${k.toLowerCase()}-${run}@bb.test`;
        const id = `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
        if (!signIn) continue;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
        await markSteppedUp(tenantPrisma, token[id]!);
      }
    }
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('lists everyone in the company with sign-in state, last sign-in, two-step and the viewer marked as self', async () => {
    const body = (await api('adminA', 'get', '/security/accounts').expect(200)).body as { data: Row[]; total: number };
    expect(body.total).toBe(3);
    const by = Object.fromEntries(body.data.map((r) => [r.id, r]));
    expect(by[users.adminA!]).toEqual(expect.objectContaining({ status: 'active', self: true, roleLabel: `admin-A-${run}`, twoStep: false }));
    expect(by[users.plainA!]!.lastLoginAt).not.toBeNull();
    expect(by[users.invitedA!]).toEqual(expect.objectContaining({ status: 'invited', lastLoginAt: null, self: false }));
  });

  it('filters by sign-in state and by name or email', async () => {
    const invited = (await api('adminA', 'get', '/security/accounts?status=invited').expect(200)).body.data as Row[];
    expect(invited.map((r) => r.id)).toEqual([users.invitedA]);
    const found = (await api('adminA', 'get', `/security/accounts?search=${encodeURIComponent(`plain-a-${run}`)}`).expect(200)).body.data as Row[];
    expect(found.map((r) => r.id)).toEqual([users.plainA]);
  });

  it('turning sign-in off shows as Turned off, signs the person out, and is audited; turning it on restores it', async () => {
    await api('adminA', 'post', `/users/${users.plainA}/deactivate`).expect(200);
    const off = (await api('adminA', 'get', '/security/accounts?status=off').expect(200)).body.data as Row[];
    expect(off.map((r) => r.id)).toEqual([users.plainA]);
    await api('plainA', 'get', '/users/me').expect(401);
    const audited = await tenantPrisma.forTenant({ organizationId: org.A!, isSuperAdmin: false }, (tx) => tx.auditLog.count({ where: { action: 'user.deactivated', entityId: users.plainA! } }));
    expect(audited).toBe(1);
    await api('adminA', 'post', `/users/${users.plainA}/reactivate`).expect(200);
    expect(((await api('adminA', 'get', '/security/accounts?status=off').expect(200)).body.data as Row[])).toEqual([]);
    // Back on: they sign in again as usual (the old session stays ended).
    token.plainA = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `bb-a-${run}`, email: `plain-a-${run}@bb.test`, password: PASSWORD }).expect(200)).body.accessToken;
  });

  it('nobody turns off their own sign-in', async () => {
    await api('adminA', 'post', `/users/${users.adminA}/deactivate`).expect(403);
  });

  it('refused without org:manage_users, and without signing in', async () => {
    await api('plainA', 'get', '/security/accounts').expect(403);
    await api('plainA', 'post', `/users/${users.invitedA}/deactivate`).expect(403);
    await request(server()).get('/api/v1/security/accounts').expect(401);
  });

  it('another company sees none of these people and cannot turn them off', async () => {
    const b = (await api('adminB', 'get', '/security/accounts').expect(200)).body as { data: Row[]; total: number };
    expect(b.total).toBe(1);
    expect(b.data.map((r) => r.id)).toEqual([users.adminB]);
    await api('adminB', 'post', `/users/${users.invitedA}/deactivate`).expect(404);
    const status = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUnique({ where: { id: users.invitedA! }, select: { status: true } }));
    expect(status?.status).toBe('active');
  });

  it('bad filters are a 400', async () => {
    await api('adminA', 'get', '/security/accounts?status=everyone').expect(400);
    await api('adminA', 'get', '/security/accounts?page=abc').expect(400);
    await api('adminA', 'get', `/security/accounts?search=${'x'.repeat(101)}`).expect(400);
  });
});
