import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaModule, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { randomUUID } from 'crypto';

// Proves tenant isolation is enforced by PostgreSQL itself, connected exactly as the app is
// (DATABASE_URL = the NOSUPERUSER NOBYPASSRLS role that owns nothing) -- not by app-level
// `where` clauses. Every check here goes through raw SQL or an unfiltered delegate on purpose.
describe('PostgreSQL row-level security (app role)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgA: string;
  let orgB: string;
  let userB: string;
  const asA = () => ({ organizationId: orgA, isSuperAdmin: false });
  const SUPER = { organizationId: null, isSuperAdmin: true };

  // Postgres: 'new row violates row-level security policy for table "users"' (SQLSTATE 42501).
  const RLS_VIOLATION = /row-level security policy/;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: 'rls-plan', candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    orgA = (await prisma.organization.create({ data: { name: 'RLS A', slug: `rls-a-${randomUUID()}`, planId } })).id;
    orgB = (await prisma.organization.create({ data: { name: 'RLS B', slug: `rls-b-${randomUUID()}`, planId } })).id;
    await tenantPrisma.forTenant(asA(), (tx) =>
      tx.user.create({ data: { organizationId: orgA, email: `a-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
    );
    userB = (
      await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) =>
        tx.user.create({ data: { organizationId: orgB, email: `b-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
      )
    ).id;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await tx.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('connects as a NOSUPERUSER NOBYPASSRLS role that owns no table', async () => {
    const [role] = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; owned: bigint }[]>`
      SELECT r.rolsuper, r.rolbypassrls,
             (SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid AND c.relkind IN ('r', 'p')) AS owned
      FROM pg_roles r WHERE r.rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, owned: BigInt(0) });
  });

  it('every table with organization_id has RLS enabled AND forced, with a policy', async () => {
    const unprotected = await prisma.$queryRaw<{ table: string }[]>`
      SELECT c.relname AS table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p')
        AND NOT (c.relrowsecurity AND c.relforcerowsecurity
                 AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))`;
    expect(unprotected).toEqual([]);
  });

  // P12 Part 1a tables: named explicitly so dropping either from the policy loop (or the table
  // itself) fails here, not just silently shrinks the generic check above.
  it('sessions and login_events are forced-RLS tenant tables, and login_events is append-only', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint; can_update: boolean; can_delete: boolean }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
             has_table_privilege(c.oid, 'UPDATE') AS can_update, has_table_privilege(c.oid, 'DELETE') AS can_delete
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname IN ('sessions', 'login_events') ORDER BY c.relname`;
    expect(rows).toEqual([
      { table: 'login_events', forced: true, policies: BigInt(1), can_update: false, can_delete: false },
      { table: 'sessions', forced: true, policies: BigInt(1), can_update: true, can_delete: true },
    ]);
  });

  // P12 Part 1b: the company security policy (IP allow-lists, SSO-only, session limits) is tenant data.
  it('tenant_security_policies is a forced-RLS tenant table', async () => {
    const [row] = await prisma.$queryRaw<{ forced: boolean; policies: bigint }[]>`
      SELECT (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = 'tenant_security_policies'`;
    expect(row).toEqual({ forced: true, policies: BigInt(1) });
  });

  it("(b) org A cannot read, change or plant org B's security policy", async () => {
    await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) =>
      tx.tenantSecurityPolicy.create({ data: { organizationId: orgB, ipAllowlistDesk: ['203.0.113.0/24'] } }),
    );
    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
      read: await tx.tenantSecurityPolicy.count({ where: { organizationId: orgB } }),
      opened: await tx.$executeRaw`UPDATE tenant_security_policies SET ip_allowlist_desk = '{}' WHERE organization_id = ${orgB}::uuid`,
      deleted: await tx.$executeRaw`DELETE FROM tenant_security_policies WHERE organization_id = ${orgB}::uuid`,
    }));
    expect(seenByA).toEqual({ read: 0, opened: 0, deleted: 0 });
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.tenantSecurityPolicy.upsert({ where: { organizationId: orgB }, create: { organizationId: orgB }, update: {} })),
    ).rejects.toThrow(RLS_VIOLATION);
    const b = await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.findUnique({ where: { organizationId: orgB } }));
    expect(b?.ipAllowlistDesk).toEqual(['203.0.113.0/24']);
  });

  // P12 Part 1c: second factors, recovery codes and MFA-reset requests are tenant data; factors and
  // reset requests are never deleted by the app (revoked / completed instead).
  it('authenticators, recovery_codes and mfa_reset_requests are forced-RLS tenant tables', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint; can_update: boolean; can_delete: boolean }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
             has_table_privilege(c.oid, 'UPDATE') AS can_update, has_table_privilege(c.oid, 'DELETE') AS can_delete
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname IN ('authenticators', 'recovery_codes', 'mfa_reset_requests') ORDER BY c.relname`;
    expect(rows).toEqual([
      { table: 'authenticators', forced: true, policies: BigInt(1), can_update: true, can_delete: false },
      { table: 'mfa_reset_requests', forced: true, policies: BigInt(1), can_update: true, can_delete: false },
      { table: 'recovery_codes', forced: true, policies: BigInt(1), can_update: true, can_delete: true },
    ]);
  });

  it("(b) org A cannot read, revoke, burn or plant org B's factors, recovery codes or reset requests", async () => {
    await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, async (tx) => {
      await tx.authenticator.create({ data: { organizationId: orgB, userId: userB, type: 'totp', label: 'B phone', secretEncrypted: 'x.y.z' } });
      await tx.recoveryCode.create({ data: { organizationId: orgB, userId: userB, codeHash: 'b'.repeat(64) } });
    });
    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
      factors: await tx.authenticator.count({ where: { userId: userB } }),
      codes: await tx.recoveryCode.count({ where: { userId: userB } }),
      revoked: await tx.$executeRaw`UPDATE authenticators SET revoked_at = now() WHERE user_id = ${userB}::uuid`,
      burnt: await tx.$executeRaw`UPDATE recovery_codes SET used_at = now() WHERE user_id = ${userB}::uuid`,
      wiped: await tx.$executeRaw`DELETE FROM recovery_codes WHERE user_id = ${userB}::uuid`,
    }));
    expect(seenByA).toEqual({ factors: 0, codes: 0, revoked: 0, burnt: 0, wiped: 0 });
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.authenticator.create({ data: { organizationId: orgB, userId: userB, type: 'totp', label: 'planted', secretEncrypted: 'x.y.z' } })),
    ).rejects.toThrow(RLS_VIOLATION);
    await expect(
      tenantPrisma.forTenant(asA(), (tx) =>
        tx.mfaResetRequest.create({ data: { organizationId: orgB, targetUserId: userB, requestedByUserId: randomUUID(), reason: 'cross-tenant', expiresAt: new Date() } }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
    // Even inside its own tenant the app cannot delete a factor: it may only revoke one.
    await expect(
      tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) => tx.$executeRaw`DELETE FROM authenticators WHERE user_id = ${userB}::uuid`),
    ).rejects.toThrow(/permission denied/);
  });

  // P12 Part 1d: a verified mobile number signs in by one-time code, so it is tenant data like the
  // rest of the user row -- and unique only within one company.
  it("(b) org A can neither find nor change org B's verified mobile numbers; the same number may verify in each company", async () => {
    const MOBILE = '+919876500001';
    await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) =>
      tx.user.update({ where: { id: userB }, data: { mobileNumber: MOBILE, mobileVerifiedAt: new Date() } }),
    );
    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
      found: await tx.user.count({ where: { mobileNumber: MOBILE } }),
      cleared: await tx.$executeRaw`UPDATE users SET mobile_number = NULL, mobile_verified_at = NULL WHERE id = ${userB}::uuid`,
    }));
    expect(seenByA).toEqual({ found: 0, cleared: 0 });
    // Org A's own user verifies the same number: allowed (uniqueness is per company).
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.user.updateMany({ where: { organizationId: orgA }, data: { mobileNumber: MOBILE, mobileVerifiedAt: new Date() } })),
    ).resolves.toEqual({ count: 1 });
    // Only E.164 is ever stored, and "verified" needs a number.
    await expect(
      tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) => tx.$executeRaw`UPDATE users SET mobile_number = '98765 00001' WHERE id = ${userB}::uuid`),
    ).rejects.toThrow(/users_mobile_number_e164_check/);
    await expect(
      tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, (tx) => tx.$executeRaw`UPDATE users SET mobile_number = NULL WHERE id = ${userB}::uuid`),
    ).rejects.toThrow(/users_mobile_verified_check/);
  });

  // P12 Part 1e: a company's sign-in identity providers (with OIDC client secrets) and the email
  // domains routed to them are tenant data.
  it('identity_providers and identity_provider_domains are forced-RLS tenant tables', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname IN ('identity_providers', 'identity_provider_domains') ORDER BY c.relname`;
    expect(rows).toEqual([
      { table: 'identity_provider_domains', forced: true, policies: BigInt(1) },
      { table: 'identity_providers', forced: true, policies: BigInt(1) },
    ]);
  });

  it("(b) org A cannot read, change, remove, plant or borrow org B's identity providers and domains", async () => {
    const DOMAIN = `b-${randomUUID().slice(0, 8)}.test`;
    const providerB = await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, async (tx) => {
      const p = await tx.identityProvider.create({
        data: { organizationId: orgB, type: 'oidc_google', name: 'B Google', status: 'active', oidcIssuer: 'https://accounts.google.com', oidcClientId: 'b', oidcClientSecretEncrypted: 'x.y.z' },
      });
      await tx.identityProviderDomain.create({ data: { organizationId: orgB, domain: DOMAIN, identityProviderId: p.id } });
      return p;
    });
    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
      providers: await tx.identityProvider.count({ where: { id: providerB.id } }),
      domains: await tx.identityProviderDomain.count({ where: { domain: DOMAIN } }),
      disabled: await tx.$executeRaw`UPDATE identity_providers SET status = 'disabled' WHERE id = ${providerB.id}::uuid`,
      removed: await tx.$executeRaw`DELETE FROM identity_providers WHERE id = ${providerB.id}::uuid`,
      unmapped: await tx.$executeRaw`DELETE FROM identity_provider_domains WHERE domain = ${DOMAIN}`,
    }));
    expect(seenByA).toEqual({ providers: 0, domains: 0, disabled: 0, removed: 0, unmapped: 0 });
    await expect(
      tenantPrisma.forTenant(asA(), (tx) =>
        tx.identityProvider.create({ data: { organizationId: orgB, type: 'oidc_google', name: 'planted', oidcIssuer: 'https://accounts.google.com' } }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.identityProviderDomain.create({ data: { organizationId: orgB, domain: `x-${DOMAIN}`, identityProviderId: providerB.id } })),
    ).rejects.toThrow(RLS_VIOLATION);
    // Org A cannot route its own domain to org B's provider (composite key: same company only).
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.identityProviderDomain.create({ data: { organizationId: orgA, domain: `y-${DOMAIN}`, identityProviderId: providerB.id } })),
    ).rejects.toThrow(/identity_provider_domains_provider_fkey|Foreign key constraint/);
    // The same domain may be mapped in each company.
    const providerA = await tenantPrisma.forTenant(asA(), (tx) =>
      tx.identityProvider.create({ data: { organizationId: orgA, type: 'oidc_google', name: 'A Google', oidcIssuer: 'https://accounts.google.com' } }),
    );
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.identityProviderDomain.create({ data: { organizationId: orgA, domain: DOMAIN, identityProviderId: providerA.id } })),
    ).resolves.toEqual(expect.objectContaining({ domain: DOMAIN }));
    const b = await tenantPrisma.forTenant(SUPER, (tx) => tx.identityProvider.findUniqueOrThrow({ where: { id: providerB.id } }));
    expect(b.status).toBe('active');
  });

  it('the identity-provider floor is enforced by the database: JIT never grants an admin role, Google and Entra issuers are pinned', async () => {
    const inA = (sql: Prisma.Sql) => tenantPrisma.forTenant(asA(), (tx) => tx.$executeRaw(sql));
    await expect(
      inA(Prisma.sql`INSERT INTO identity_providers (id, organization_id, type, name, oidc_issuer, jit_enabled, jit_role)
                     VALUES (gen_random_uuid(), ${orgA}::uuid, 'oidc_google', 'x', 'https://accounts.google.com', true, 'org_admin')`),
    ).rejects.toThrow(/identity_providers_jit_check/);
    await expect(
      inA(Prisma.sql`INSERT INTO identity_providers (id, organization_id, type, name, oidc_issuer)
                     VALUES (gen_random_uuid(), ${orgA}::uuid, 'oidc_google', 'x', 'https://evil.example.com')`),
    ).rejects.toThrow(/identity_providers_issuer_check/);
    await expect(
      inA(Prisma.sql`INSERT INTO identity_providers (id, organization_id, type, name, oidc_issuer, entra_tenant_id)
                     VALUES (gen_random_uuid(), ${orgA}::uuid, 'oidc_entra', 'x', 'https://login.microsoftonline.com/common/v2.0', ${randomUUID()}::uuid)`),
    ).rejects.toThrow(/identity_providers_issuer_check/);
    await expect(
      inA(Prisma.sql`INSERT INTO identity_providers (id, organization_id, type, name, status) VALUES (gen_random_uuid(), ${orgA}::uuid, 'saml', 'x', 'active')`),
    ).rejects.toThrow(/identity_providers_shape_check/);
  });

  it("(b) org A cannot read org B's sessions or login events", async () => {
    const absolute = new Date(Date.now() + 3_600_000);
    await tenantPrisma.forTenant({ organizationId: orgB, isSuperAdmin: false }, async (tx) => {
      await tx.session.create({
        data: { organizationId: orgB, userId: userB, method: 'password', idleTimeoutSeconds: 60, idleExpiresAt: absolute, absoluteExpiresAt: absolute },
      });
      await tx.loginEvent.create({ data: { organizationId: orgB, userId: userB, result: 'success', method: 'password' } });
    });
    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
      sessions: await tx.session.count({ where: { userId: userB } }),
      events: await tx.loginEvent.count({ where: { userId: userB } }),
      revoked: await tx.$executeRaw`UPDATE sessions SET revoked_at = now() WHERE user_id = ${userB}::uuid`,
    }));
    expect(seenByA).toEqual({ sessions: 0, events: 0, revoked: 0 });
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.loginEvent.create({ data: { organizationId: orgB, result: 'failed', method: 'password' } })),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it('(a) no context => zero rows, even though rows exist', async () => {
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM users WHERE organization_id IN (${orgA}::uuid, ${orgB}::uuid)`;
    expect(n).toBe(BigInt(0));
    expect(await prisma.user.count({ where: { organizationId: { in: [orgA, orgB] } } })).toBe(0);
    const superCount = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.count({ where: { organizationId: { in: [orgA, orgB] } } }));
    expect(superCount).toBe(2);
  });

  // W-006: the re-check columns of verified_domains sit under the same tenant policy.
  it("org A cannot read, restore, lapse or plant org B's verified email domains", async () => {
    const asB = { organizationId: orgB, isSuperAdmin: false };
    const domain = `rls-${randomUUID().slice(0, 8)}.test`;
    await tenantPrisma.forTenant(asB, (tx) => tx.verifiedDomain.create({ data: { organizationId: orgB, domain, failedChecks: 3, lapsedAt: new Date() } }));
    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
      seen: await tx.verifiedDomain.count({ where: { organizationId: orgB } }),
      restored: await tx.$executeRaw`UPDATE verified_domains SET lapsed_at = NULL, failed_checks = 0 WHERE organization_id = ${orgB}::uuid`,
      removed: await tx.$executeRaw`DELETE FROM verified_domains WHERE organization_id = ${orgB}::uuid`,
    }));
    expect(seenByA).toEqual({ seen: 0, restored: 0, removed: 0 });
    await expect(tenantPrisma.forTenant(asA(), (tx) => tx.verifiedDomain.create({ data: { organizationId: orgB, domain: `x-${domain}` } }))).rejects.toThrow(RLS_VIOLATION);
    expect(await tenantPrisma.forTenant(asB, (tx) => tx.verifiedDomain.findMany({ where: { organizationId: orgB } }))).toEqual([
      expect.objectContaining({ domain, failedChecks: 3, lapsedAt: expect.any(Date) }),
    ]);
  });

  // P04 SMS channel: gateway accounts (NULL organisation = the YukthiX shared account, platform only), the
  // delivery log (never deleted by the app), consents (append-only), the notification policy and metering.
  it('the SMS channel tables are forced-RLS tenant tables; consents and deliveries cannot be deleted', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint; can_update: boolean; can_delete: boolean }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
             has_table_privilege(c.oid, 'UPDATE') AS can_update, has_table_privilege(c.oid, 'DELETE') AS can_delete
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname IN ('channel_accounts', 'notification_deliveries', 'channel_consents', 'tenant_notification_policies', 'sms_usage_monthly')
      ORDER BY c.relname`;
    expect(rows).toEqual([
      { table: 'channel_accounts', forced: true, policies: BigInt(1), can_update: true, can_delete: true },
      // Only withdrawn_at / withdrawal_source are updatable (column grant), once (trigger).
      { table: 'channel_consents', forced: true, policies: BigInt(1), can_update: false, can_delete: false },
      { table: 'notification_deliveries', forced: true, policies: BigInt(1), can_update: true, can_delete: false },
      { table: 'sms_usage_monthly', forced: true, policies: BigInt(1), can_update: true, can_delete: true },
      { table: 'tenant_notification_policies', forced: true, policies: BigInt(1), can_update: true, can_delete: true },
    ]);
  });

  it("(b) org A cannot read, change or plant org B's SMS accounts, deliveries, consents, policy or usage; nor the shared account", async () => {
    const asB = { organizationId: orgB, isSuperAdmin: false };
    const ids = await tenantPrisma.forTenant(asB, async (tx) => {
      const account = await tx.channelAccount.create({ data: { organizationId: orgB, provider: 'dev', name: 'B gateway', configEncrypted: 'x.y.z' } });
      const delivery = await tx.notificationDelivery.create({
        data: { organizationId: orgB, channel: 'sms', kind: 'otp', idempotencyKey: `rls-${randomUUID()}`, addressMasked: '+91••••••••10', addressHash: 'b'.repeat(64), channelAccountId: account.id, status: 'sent' },
      });
      const consent = await tx.channelConsent.create({
        data: { organizationId: orgB, recipientType: 'user', recipientId: userB, channel: 'sms', addressHash: 'b'.repeat(64), source: 'otp_prompt', textVersion: 'v1' },
      });
      await tx.tenantNotificationPolicy.create({ data: { organizationId: orgB, smsMonthlyCap: 100 } });
      await tx.smsUsageMonthly.create({ data: { organizationId: orgB, month: new Date('2026-10-01T00:00:00Z'), sentCount: 7 } });
      return { account: account.id, delivery: delivery.id, consent: consent.id };
    });
    const shared = await tenantPrisma.forTenant(SUPER, (tx) => tx.channelAccount.create({ data: { organizationId: null, provider: 'dev', name: 'Shared (rls test)', configEncrypted: 'x.y.z' } }));
    try {
      const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => ({
        accounts: await tx.channelAccount.count({ where: { id: { in: [ids.account, shared.id] } } }),
        deliveries: await tx.notificationDelivery.count({ where: { id: ids.delivery } }),
        consents: await tx.channelConsent.count({ where: { id: ids.consent } }),
        policy: await tx.tenantNotificationPolicy.count({ where: { organizationId: orgB } }),
        usage: await tx.smsUsageMonthly.count({ where: { organizationId: orgB } }),
        redirected: await tx.$executeRaw`UPDATE channel_accounts SET config_encrypted = 'stolen' WHERE id IN (${ids.account}::uuid, ${shared.id}::uuid)`,
        delivered: await tx.$executeRaw`UPDATE notification_deliveries SET status = 'delivered' WHERE id = ${ids.delivery}::uuid`,
        withdrawn: await tx.$executeRaw`UPDATE channel_consents SET withdrawn_at = now(), withdrawal_source = 'hr' WHERE id = ${ids.consent}::uuid`,
        uncapped: await tx.$executeRaw`UPDATE tenant_notification_policies SET sms_monthly_cap = NULL WHERE organization_id = ${orgB}::uuid`,
        reset: await tx.$executeRaw`UPDATE sms_usage_monthly SET sent_count = 0 WHERE organization_id = ${orgB}::uuid`,
        removed: await tx.$executeRaw`DELETE FROM channel_accounts WHERE id IN (${ids.account}::uuid, ${shared.id}::uuid)`,
      }));
      expect(seenByA).toEqual({ accounts: 0, deliveries: 0, consents: 0, policy: 0, usage: 0, redirected: 0, delivered: 0, withdrawn: 0, uncapped: 0, reset: 0, removed: 0 });
      // A company can't create a "shared" account or plant rows in another company.
      await expect(tenantPrisma.forTenant(asA(), (tx) => tx.channelAccount.create({ data: { organizationId: null, provider: 'dev', name: 'fake shared', configEncrypted: 'x' } }))).rejects.toThrow(RLS_VIOLATION);
      await expect(tenantPrisma.forTenant(asA(), (tx) => tx.channelAccount.create({ data: { organizationId: orgB, provider: 'dev', name: 'planted', configEncrypted: 'x' } }))).rejects.toThrow(RLS_VIOLATION);
      // Even org B itself never sees the shared account.
      expect(await tenantPrisma.forTenant(asB, (tx) => tx.channelAccount.count({ where: { id: shared.id } }))).toBe(0);
      const b = await tenantPrisma.forTenant(SUPER, (tx) => tx.notificationDelivery.findUniqueOrThrow({ where: { id: ids.delivery } }));
      expect(b.status).toBe('sent');
    } finally {
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        await tx.channelAccount.deleteMany({ where: { id: { in: [ids.account, shared.id] } } });
        await tx.tenantNotificationPolicy.deleteMany({ where: { organizationId: orgB } });
        await tx.smsUsageMonthly.deleteMany({ where: { organizationId: orgB } });
      });
    }
  });

  it('(a) no context => writes are rejected', async () => {
    await expect(
      prisma.user.create({ data: { organizationId: orgA, email: `x-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it("(b) org A cannot read org B's rows", async () => {
    const seen = await tenantPrisma.forTenant(asA(), (tx) =>
      tx.$queryRaw<{ organization_id: string }[]>`SELECT organization_id::text FROM users WHERE organization_id IN (${orgA}::uuid, ${orgB}::uuid)`,
    );
    expect(seen.length).toBe(1);
    expect(seen.every((r) => r.organization_id === orgA)).toBe(true);
  });

  it("(b) org A cannot update or delete org B's rows (they are invisible)", async () => {
    const result = await tenantPrisma.forTenant(asA(), async (tx) => ({
      updated: await tx.$executeRaw`UPDATE users SET name = 'pwned' WHERE id = ${userB}::uuid`,
      deleted: await tx.$executeRaw`DELETE FROM users WHERE id = ${userB}::uuid`,
    }));
    expect(result).toEqual({ updated: 0, deleted: 0 });
    const b = await tenantPrisma.forTenant(SUPER, (tx) => tx.user.findUnique({ where: { id: userB } }));
    expect(b?.name).not.toBe('pwned');
  });

  it("(b) WITH CHECK rejects INSERT with another org's id", async () => {
    await expect(
      tenantPrisma.forTenant(asA(), (tx) =>
        tx.user.create({ data: { organizationId: orgB, email: `c-${randomUUID()}@rls.test`, passwordHash: 'x', role: 'org_admin' } }),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it("(b) WITH CHECK rejects UPDATE moving an own row into another org", async () => {
    await expect(
      tenantPrisma.forTenant(asA(), (tx) => tx.$executeRaw`UPDATE users SET organization_id = ${orgB}::uuid WHERE organization_id = ${orgA}::uuid`),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it('(c) context does not leak to the next transaction on the same pooled connection', async () => {
    // A one-connection pool forces both units of work onto the same physical connection.
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('connection_limit', '1');
    const single = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try {
      const scoped = new TenantPrismaService(single as unknown as PrismaService);
      const first = await scoped.forTenant(asA(), async (tx) => {
        const [row] = await tx.$queryRaw<{ pid: number; org: string; n: bigint }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org,
                 (SELECT count(*) FROM users WHERE organization_id = ${orgA}::uuid) AS n`;
        return row;
      });
      expect(first.org).toBe(orgA);
      expect(first.n).toBe(BigInt(1));

      // Next transaction, same connection, no context set.
      const next = await single.$transaction((tx) =>
        tx.$queryRaw<{ pid: number; org: string | null; admin: string | null; n: bigint }[]>`
          SELECT pg_backend_pid() AS pid, current_setting('app.current_org', true) AS org,
                 current_setting('app.is_super_admin', true) AS admin,
                 (SELECT count(*) FROM users WHERE organization_id = ${orgA}::uuid) AS n`,
      );
      expect(next[0].pid).toBe(first.pid);
      expect(next[0].org || null).toBeNull();
      expect(next[0].admin === 'on').toBe(false);
      expect(next[0].n).toBe(BigInt(0));

      // A rolled-back unit of work must not leak either.
      await expect(
        scoped.forTenant(SUPER, async () => {
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      const [afterRollback] = await single.$queryRaw<{ admin: string | null }[]>(
        Prisma.sql`SELECT current_setting('app.is_super_admin', true) AS admin`,
      );
      expect(afterRollback.admin === 'on').toBe(false);
    } finally {
      await single.$disconnect();
    }
  });
});
