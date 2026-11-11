import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, type StaffRole } from './fixtures/staff-roles';

// YukthiX console staff roles (founder answers 1058, 1086), against the real database. Five roles, each a fixed set of
// platform.* keys; nobody holds every key by default; only a Security lead changes roles (security key again, audited),
// never their own; the last Security lead keeps the role; a company role never holds a platform key; existing staff
// were moved to Security lead plus the roles their audit trail shows.
describe('Console staff roles (1058, 1086)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orgId = '';
  let planId = '';
  type Who = 'lead' | 'lead2' | 'rules' | 'cs' | 'none' | 'adminA';
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const roles = (body: { staff: { id: string; roles: string[] }[] }, who: Who) => body.staff.find((s) => s.id === users[who])?.roles;
  const rule = (version: string) => ({
    statute: 'IN.PT',
    jurisdiction: 'IN-ZZ',
    version,
    validFrom: '2099-04-01',
    values: { kind: 'pt', basis: 'monthly', annualCap: '2500', slabs: [{ from: '0', to: '24999.99', amount: '0' }, { from: '25000', to: null, amount: '200' }] },
    source: 'Test state PT Act (e2e only; a jurisdiction no company uses).',
    lawVersion: 'OLD-ACT',
    verify: true,
    golden: [{ name: '25,000 in May: 200', fn: 'pt', input: { ptWage: '25000', month: 5 }, expected: { amount: '200' } }],
  });

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    const staff: [Who, StaffRole[]][] = [['lead', ['security_lead']], ['lead2', ['security_lead']], ['rules', ['rules_editor']], ['cs', ['customer_success']], ['none', []]];
    for (const [who, r] of staff) {
      const email = `sr-${who}-${run}@platform.test`;
      users[who] = (await tenantPrisma.forTenant(SUPER, (tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!, r);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    planId = (await owner.plan.create({ data: { name: `sr-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    await owner.$disconnect();
    const slug = `sr-${run}`;
    orgId = (await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.create({ data: { name: `SR ${run}`, slug, planId } }))).id;
    users.adminA = (await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: orgId, email: `admin-${run}@sr.test`, name: 'Admin', passwordHash, role: 'org_admin' } }))).id;
    token.adminA = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email: `admin-${run}@sr.test`, password: PASSWORD }).expect(200)).body.accessToken;
    await markSteppedUp(tenantPrisma, token.adminA!);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const ids = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: orgId } });
      })
      .catch(() => undefined);
    await app.close();
  });

  it('a Rules editor drafts rules but cannot use Customer success; Customer success the reverse; no role, no console key', async () => {
    await api('rules', 'post', '/platform/statutory/rule-sets').send(rule(`sr${run}`)).expect(201);
    await api('rules', 'get', '/platform/customers/health').expect(403);
    await api('rules', 'get', '/platform/companies').expect(403);
    await api('cs', 'get', '/platform/customers/health').expect(200);
    await api('cs', 'get', '/platform/statutory/rule-sets').expect(403);
    await api('cs', 'post', '/platform/statutory/rule-sets').send(rule(`sc${run}`)).expect(403);
    for (const path of ['/platform/companies', '/platform/statutory/rule-sets', '/platform/customers/health', '/platform/audit', '/platform/staff']) await api('none', 'get', path).expect(403);
    // The web shows buttons by the keys held: each sees only its own.
    const keys = (who: Who) => api(who, 'get', '/rbac/me/permissions?keys=platform.statutory.manage,platform.customers.success,platform.staff.manage,platform.companies.view').expect(200).then((r) => (r.body as string[]).sort());
    expect(await keys('rules')).toEqual(['platform.statutory.manage']);
    expect(await keys('cs')).toEqual(['platform.companies.view', 'platform.customers.success']);
    expect(await keys('none')).toEqual([]);
  });

  it('who holds what: only a Security lead sees and changes roles; a company admin never', async () => {
    const list = (await api('lead', 'get', '/platform/staff').expect(200)).body;
    expect(list.roles.map((r: { label: string }) => r.label)).toEqual(['Support agent', 'Customer success', 'Rules editor', 'Finance', 'Security lead']);
    expect(list.roles.find((r: { role: string }) => r.role === 'rules_editor').keys).toEqual(['platform.statutory.manage']);
    expect(roles(list, 'rules')).toEqual(['rules_editor']);
    expect(list.staff.find((s: { id: string }) => s.id === users.lead).me).toBe(true);
    for (const who of ['rules', 'cs', 'none', 'adminA'] as const) {
      await api(who, 'get', '/platform/staff').expect(403);
      await api(who, 'put', `/platform/staff/${users.none}/roles`).send({ roles: ['finance'], reason: 'Joins finance' }).expect(403);
    }
  });

  it('a Security lead gives roles, with the security key again; bad input refused; audited with before and after', async () => {
    await api('lead', 'put', `/platform/staff/${users.rules}/roles`).send({ roles: ['owner'], reason: 'Wrong role' }).expect(400);
    await api('lead', 'put', `/platform/staff/${users.rules}/roles`).send({ roles: ['customer_success'] }).expect(400);
    await api('lead', 'put', `/platform/staff/${randomUUID()}/roles`).send({ roles: ['finance'], reason: 'Nobody there' }).expect(404);
    // A company account is not a member of staff.
    await api('lead', 'put', `/platform/staff/${users.adminA}/roles`).send({ roles: ['finance'], reason: 'Not staff at all' }).expect(404);
    // Proven 20 minutes ago is not fresh enough to change roles.
    const { sid } = JSON.parse(Buffer.from(token.lead!.split('.')[1]!, 'base64url').toString()) as { sid: string };
    await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(Date.now() - 20 * 60_000) } }));
    expect((await api('lead', 'put', `/platform/staff/${users.rules}/roles`).send({ roles: ['rules_editor', 'customer_success'], reason: 'Covers customer success' }).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
    await markSteppedUp(tenantPrisma, token.lead!);
    expect((await api('lead', 'put', `/platform/staff/${users.rules}/roles`).send({ roles: ['rules_editor', 'customer_success'], reason: 'Covers customer success' }).expect(200)).body).toEqual({ id: users.rules, roles: ['customer_success', 'rules_editor'] });
    await api('rules', 'get', '/platform/customers/health').expect(200);
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { entityId: users.rules, action: 'platform.staff.roles_changed' } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: users.lead });
    expect(JSON.parse(rows[0]!.metadataJson!)).toEqual({ from: ['rules_editor'], to: ['customer_success', 'rules_editor'], reason: 'Covers customer success' });
    // Taken away again: the key goes with the role at once.
    await api('lead', 'put', `/platform/staff/${users.rules}/roles`).send({ roles: ['rules_editor'], reason: 'Back to rules only' }).expect(200);
    await api('rules', 'get', '/platform/customers/health').expect(403);
  });

  it('nobody changes their own roles, not even a Security lead', async () => {
    expect((await api('lead', 'put', `/platform/staff/${users.lead}/roles`).send({ roles: ['security_lead', 'finance'], reason: 'Give myself finance' }).expect(403)).body.message).toMatch(/own roles/);
    await api('lead', 'put', `/platform/staff/${users.lead}/roles`).send({ roles: [], reason: 'Leave the lead role' }).expect(403);
    expect(roles((await api('lead2', 'get', '/platform/staff').expect(200)).body, 'lead')).toEqual(['security_lead']);
  });

  it('the last Security lead keeps the role: only another active lead can take it, and the database refuses the last one', async () => {
    // A lead takes another lead's role (a lead remains).
    await api('lead', 'put', `/platform/staff/${users.lead2}/roles`).send({ roles: ['finance'], reason: 'Moves to finance' }).expect(200);
    // lead2 is no lead any more: cannot give it back to themselves or take lead's.
    await api('lead2', 'put', `/platform/staff/${users.lead}/roles`).send({ roles: [], reason: 'Take it away' }).expect(403);
    // In the database, with every other staff account inactive (rolled back each time), lead is the last Security lead:
    // the lead cannot drop it (own roles) and nobody else may change roles (not a lead), so the last lead always keeps it.
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    const lastLead = (actor: string) =>
      owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`);
        await tx.$executeRawUnsafe(`UPDATE users SET status = 'inactive' WHERE organization_id IS NULL AND role = 'super_admin' AND id NOT IN ($1::uuid, $2::uuid)`, users.lead, actor);
        await tx.$queryRawUnsafe(`SELECT platform_set_staff_roles($1::uuid, ARRAY['finance']::text[], $2::uuid)`, users.lead, actor);
      });
    try {
      await expect(lastLead(users.lead!)).rejects.toThrow(/YX_STAFF_SELF/);
      for (const who of ['lead2', 'rules', 'none'] as const) await expect(lastLead(users[who]!)).rejects.toThrow(/YX_STAFF_NOT_LEAD/);
    } finally {
      await owner.$disconnect();
    }
    // Nothing above stayed (rolled back): lead is still the lead.
    expect(roles((await api('lead', 'get', '/platform/staff').expect(200)).body, 'lead')).toEqual(['security_lead']);
  });

  it('platform keys stay platform-only: a company role can never hold one', async () => {
    await expect(tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `Sneaky ${run}`, permissionsJson: JSON.stringify(['platform.staff.manage']) } }))).rejects.toThrow(/permission_profiles_no_platform_keys/);
    await api('adminA', 'get', '/platform/companies').expect(403);
    // A company account is never given a staff role (database).
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    try {
      await expect(owner.$transaction([owner.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`), owner.$executeRawUnsafe(`INSERT INTO platform_staff_roles (user_id, role) VALUES ($1::uuid, 'security_lead')`, users.adminA)])).rejects.toThrow(/YX_STAFF_ONLY/);
    } finally {
      await owner.$disconnect();
    }
    // The app role can never write staff roles directly; inside a company it cannot even read them.
    await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRawUnsafe(`INSERT INTO platform_staff_roles (user_id, role) VALUES ('${users.none}', 'security_lead')`))).rejects.toThrow(/permission denied/);
    expect(await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.platformStaffRole.count())).toBe(0);
  });

  it('moving existing staff kept them working: every staff account from before is a Security lead; a Security lead alone keeps the console', async () => {
    const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
    try {
      const [{ missing }] = await owner.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`);
        return tx.$queryRawUnsafe<{ missing: number }[]>(`
          SELECT count(*)::int AS missing FROM users u
          WHERE u.organization_id IS NULL AND u.role = 'super_admin'
            AND u.created_at < (SELECT finished_at FROM _prisma_migrations WHERE migration_name = '202617z0000071_console_staff_roles')
            AND NOT EXISTS (SELECT 1 FROM platform_staff_roles r WHERE r.user_id = u.id AND r.role = 'security_lead')`);
      });
      expect(missing).toBe(0);
    } finally {
      await owner.$disconnect();
    }
    // What a moved account can do with Security lead alone: companies, the audit log, staff roles.
    for (const path of ['/platform/companies', '/platform/audit', '/platform/staff']) await api('lead', 'get', path).expect(200);
  });
});
