import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles } from './fixtures/staff-roles';
import { CsFollowupService } from '../src/platform/cs-followup.service';
import { dayPlus, istDay } from '../src/platform/customer-success.service';

// Console 1165 (answers 1082, 1083), against the real database (forced RLS, app role): the nightly health snapshot
// (idempotent within an India day, purged after cs.snapshot.keep_days), the 30-day change, a Customer success owner per
// company (only active staff with the Customer success role), and alert follow-up (owner, status, outreach, audited;
// resolved by itself when the alert clears). Only staff with the Customer success key; companies never see any of it.
describe('Console 1165: health history and account follow-up', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let followup: CsFollowupService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const org: Record<string, string> = {};
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  let planId: string;
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const at = (day: string) => new Date(`${day}T00:00:00Z`);
  const snaps = (organizationId: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.csHealthSnapshot.findMany({ where: { organizationId }, orderBy: { day: 'asc' } }));
  type Alert = { id: string; organizationId: string; rule: string; status: string; owner: { id: string } | null; autoResolved: boolean; version: number; notes: { note: string }[] };
  const alertsOf = async (k: string) => ((await api('cs', 'get', '/platform/customers/alerts').expect(200)).body as Alert[]).filter((a) => a.organizationId === org[k]);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    followup = app.get(CsFollowupService);
    const passwordHash = await argon2.hash(PASSWORD);
    for (const [who, roles, status] of [['cs', ['customer_success'], 'active'], ['cs2', ['customer_success'], 'active'], ['csGone', ['customer_success'], 'inactive'], ['agent', ['support_agent'], 'active']] as const) {
      const email = `${who.toLowerCase()}-${runId}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!, roles);
      if (status === 'active') {
        token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
        await markSteppedUp(tenantPrisma, token[who]!);
      } else await tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users[who] }, data: { status: 'inactive' } }));
    }
    planId = (await prisma.plan.create({ data: { name: `cs-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const o = await prisma.organization.create({ data: { name: `CS Company ${k} ${runId}`, slug: `cs-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = o.id;
      users[`admin${k}`] = (await tenantPrisma.forTenant({ organizationId: o.id, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o.id, email: `admin-${k.toLowerCase()}-${runId}@cs.test`, passwordHash, role: 'org_admin' } }))).id;
    }
    token.adminA = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: `cs-a-${runId}`, email: `admin-a-${runId}@cs.test`, password: PASSWORD }).expect(200)).body.accessToken;
    // The admin's sign-in counts as a recent System Admin sign-in; clear it so the "never signed in" alert fires.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users.adminA }, data: { lastLoginAt: null } }));
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only staff with the Customer success key: a Support agent and a company admin are refused', async () => {
    await api('agent', 'get', '/platform/customers/alerts').expect(403);
    await api('agent', 'put', `/platform/customers/companies/${org.A}/owner`).send({ ownerUserId: users.cs }).expect(403);
    await api('adminA', 'get', '/platform/customers/health').expect(403);
  });

  it('an owner must be active staff holding the Customer success role', async () => {
    const owners = (await api('cs', 'get', '/platform/customers/owners').expect(200)).body as { id: string }[];
    expect(owners.map((o) => o.id)).toEqual(expect.arrayContaining([users.cs, users.cs2]));
    expect(owners.map((o) => o.id)).not.toContain(users.agent);
    expect(owners.map((o) => o.id)).not.toContain(users.csGone);
    await api('cs', 'put', `/platform/customers/companies/${org.A}/owner`).send({ ownerUserId: users.agent }).expect(400);
    await api('cs', 'put', `/platform/customers/companies/${org.A}/owner`).send({ ownerUserId: users.csGone }).expect(400);
    await api('cs', 'put', `/platform/customers/companies/${org.A}/owner`).send({ ownerUserId: users.cs2 }).expect(200);
    const rows = (await api('cs', 'get', '/platform/customers/health').expect(200)).body.rows as { id: string; owner: { id: string } | null }[];
    expect(rows.find((r) => r.id === org.A)?.owner?.id).toBe(users.cs2);
    const [audit] = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { action: 'platform.cs.owner_set', entityId: org.A } }));
    expect(JSON.parse(audit!.metadataJson!)).toMatchObject({ before: null, after: users.cs2 });
  });

  it('the nightly snapshot is one row per company per India day; a rerun the same day replaces it', async () => {
    const now = new Date();
    await followup.nightly(now, [org.A, org.B]);
    await followup.nightly(new Date(now.getTime() + 60_000), [org.A, org.B]);
    const rows = await snaps(org.A);
    expect(rows.filter((r) => r.day.toISOString().slice(0, 10) === istDay(now))).toHaveLength(1);
    expect(['healthy', 'watch', 'at_risk']).toContain(rows[0]!.band);
  });

  it('the list shows the 30-day change, the band and the churn risk from the snapshot of 30 days before', async () => {
    const today = istDay();
    await tenantPrisma.forTenant(SUPER, (tx) => tx.csHealthSnapshot.create({ data: { organizationId: org.A, day: at(dayPlus(today, -30)), score: 10, band: 'at_risk' } }));
    const rows = (await api('cs', 'get', '/platform/customers/health').expect(200)).body.rows as { id: string; health: number; trend: number | null; band: string; churn: string }[];
    const a = rows.find((r) => r.id === org.A)!;
    expect(a.trend).toBe(a.health - 10);
    expect(rows.find((r) => r.id === org.B)!.trend).toBeNull();
    expect(['low', 'medium', 'high']).toContain(a.churn);
  });

  it('the purge keeps cs.snapshot.keep_days (400) and deletes older', async () => {
    const today = istDay();
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.csHealthSnapshot.create({ data: { organizationId: org.A, day: at(dayPlus(today, -400)), score: 50, band: 'watch' } });
      await tx.csHealthSnapshot.create({ data: { organizationId: org.A, day: at(dayPlus(today, -401)), score: 50, band: 'watch' } });
    });
    await followup.nightly(new Date(), [org.A]);
    const days = (await snaps(org.A)).map((r) => r.day.toISOString().slice(0, 10));
    expect(days).toContain(dayPlus(today, -400));
    expect(days).not.toContain(dayPlus(today, -401));
  });

  it('alerts open with the company owner; Log outreach is audited and marks it contacted; status and owner change', async () => {
    const [idle] = (await alertsOf('A')).filter((x) => x.rule === 'admin_idle' && x.status !== 'resolved');
    expect(idle).toMatchObject({ status: 'open', owner: { id: users.cs2 } });
    await api('cs', 'post', `/platform/customers/alerts/${idle!.id}/outreach`).send({ note: ' ' }).expect(400);
    await api('cs', 'post', `/platform/customers/alerts/${idle!.id}/outreach`).send({ note: 'Called the HR head; they will sign in this week.' }).expect(201);
    const after = (await alertsOf('A')).find((x) => x.id === idle!.id)!;
    expect(after).toMatchObject({ status: 'contacted', notes: [{ note: 'Called the HR head; they will sign in this week.' }] });
    const [audit] = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { action: 'platform.cs.outreach_logged', entityId: idle!.id } }));
    expect(audit).toMatchObject({ actorUserId: users.cs });
    expect(JSON.parse(audit!.metadataJson!)).toMatchObject({ note: 'Called the HR head; they will sign in this week.' });
    await api('cs', 'put', `/platform/customers/alerts/${idle!.id}`).send({ version: after.version, ownerUserId: users.agent }).expect(400);
    await api('cs', 'put', `/platform/customers/alerts/${idle!.id}`).send({ version: 99, ownerUserId: users.cs }).expect(409);
    await api('cs', 'put', `/platform/customers/alerts/${idle!.id}`).send({ version: after.version, ownerUserId: users.cs, status: 'open' }).expect(200);
  });

  it('an alert that clears by itself is resolved automatically', async () => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.user.update({ where: { id: users.adminA }, data: { lastLoginAt: new Date() } }));
    await followup.nightly(new Date(), [org.A]);
    const idle = (await alertsOf('A')).filter((x) => x.rule === 'admin_idle');
    expect(idle.every((x) => x.status === 'resolved')).toBe(true);
    expect(idle.some((x) => x.autoResolved)).toBe(true);
  });

  it('companies never read the snapshots, owners or alerts (RLS)', async () => {
    const ctx = { organizationId: org.A, isSuperAdmin: false };
    expect(await tenantPrisma.forTenant(ctx, (tx) => tx.csHealthSnapshot.count())).toBe(0);
    expect(await tenantPrisma.forTenant(ctx, (tx) => tx.csAlert.count())).toBe(0);
    expect(await tenantPrisma.forTenant(ctx, (tx) => tx.csAccount.count())).toBe(0);
  });
});
