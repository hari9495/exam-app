import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaModule, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { randomUUID } from 'crypto';

// Proves tenant isolation is enforced by PostgreSQL itself, connected exactly as the app is
// (DATABASE_URL = the NOSUPERUSER NOBYPASSRLS role that owns nothing) -- not by app-level
// `where` clauses. Every check here goes through raw SQL or an unfiltered delegate on purpose.

// Pay, identity and bank tables also carry the RESTRICTIVE support_session_excluded policy (step 3, P02 Q8).
const SUPPORT_EXCLUDED = ['compensations', 'grade_pay_ranges', 'employee_identifiers', 'employee_bank_accounts', 'employee_profile_requests'];
// Payroll batch 5a: every payroll table too (payroll-5a.e2e-spec.ts checks them, and the pay guard, from the catalogue).
const PAYROLL_SUPPORT_EXCLUDED = ['pay_periods', 'period_lock_events', 'period_reopen_requests', 'pay_corrections', 'device_backfills', 'held_punches', 'payroll_feed_rows', 'exchange_files', 'exchange_file_links', 'pay_documents', 'pay_document_counters', 'pay_document_nominees', 'pay_portal_sessions',
  // Batch 5b.
  'statutory_registrations', 'entity_statutory_options', 'pay_groups', 'pay_group_members', 'pay_components', 'salary_templates', 'salary_template_versions', 'salary_template_lines', 'compensation_packages', 'compensation_lines', 'employee_statutory', 'establishment_coverage', 'pay_import_batches', 'opening_balances', 'as_paid_lines', 'previous_employment_income', 'payslip_layouts',
  // Batch 5c.
  'payroll_runs', 'run_employees', 'run_validations', 'payslips', 'payslip_lines', 'payslip_snapshots', 'lop_inputs', 'one_time_pays', 'special_days', 'variance_flags', 'payroll_withholds', 'pay_carry_forwards', 'court_orders', 'loans', 'loan_repayments', 'loan_schedule_changes', 'journals', 'employee_cost_rates',
  // Batch 5d.
  'bank_files', 'payment_records', 'employee_payment_modes', 'disbursements', 'payslip_queries', 'payslip_links',
  // Batch 5e.
  'tax_workspaces', 'tax_declaration_lines', 'tds_projections', 'perquisites', 'tax_certificates',
  // GP-PAY-1 ledger mapping.
  'ledger_mappings',
  // Batch 5f.
  'statutory_filings', 'statutory_penalty_lines', 'tds_challans', 'tds_returns', 'statutory_registers', 'register_rows', 'inspection_packs', 'advisory_reviews'];
// Lifecycle batch 6a: people's files and documents, and joiners' planned jobs.
const LIFECYCLE_SUPPORT_EXCLUDED = ['files', 'documents', 'document_versions', 'preboardings', 'preboarding_portal_sessions', 'consent_records', 'bgv_checks', 'letter_issues', 'signature_requests', 'exit_cases', 'exit_case_hr', 'clearance_items', 'exit_interviews', 'exit_interview_answers', 'probation_reviews', 'exit_deprovisioning', 'exit_settlement_inputs', 'alumni_sessions', 'employee_nominations', 'exit_payees', 'absconding_timelines'];
// Founder decision 5a-D4: compensations also carry the RESTRICTIVE pay guard (5b).
const policiesOf = (table: string) => BigInt((SUPPORT_EXCLUDED.includes(table) ? 2 : 1) + (table === 'compensations' ? 1 : 0));

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

  // P01 organisation structure (YX-ORG-14): every new table is a forced-RLS tenant table, and the composite
  // (organization_id, id) foreign keys mean a row can never point at another company's row (P01 §5 #5).
  const ORG_TABLES = ['cost_centres', 'departments', 'designations', 'employment_types', 'grade_pay_ranges', 'grades', 'legal_entities', 'locations', 'settings'];

  it('the organisation-structure tables are forced-RLS tenant tables', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ANY(${ORG_TABLES}) ORDER BY c.relname`;
    expect(rows).toEqual(ORG_TABLES.map((table) => ({ table, forced: true, policies: policiesOf(table) })));
  });

  it("(b) org A cannot read, change, remove or plant org B's organisation structure, nor point at it", async () => {
    const asB = { organizationId: orgB, isSuperAdmin: false };
    const b = await tenantPrisma.forTenant(asB, async (tx) => {
      const entity = await tx.legalEntity.create({ data: { organizationId: orgB, name: 'B Ltd', shortName: `B-${randomUUID().slice(0, 8)}`, pan: 'AABCB1234B' } });
      const location = await tx.location.create({
        data: { organizationId: orgB, legalEntityId: entity.id, name: 'B site', code: 'B-SITE', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' },
      });
      const deptId = randomUUID();
      const department = await tx.department.create({ data: { id: deptId, organizationId: orgB, name: 'B dept', code: 'B-DEPT', path: `/${deptId}/` } });
      const grade = await tx.grade.create({ data: { organizationId: orgB, name: 'B grade', code: 'B-G', rank: 1 } });
      await tx.gradePayRange.create({ data: { organizationId: orgB, gradeId: grade.id, legalEntityId: entity.id, currency: 'INR', min: 1, mid: 2, max: 3, validFrom: new Date('2026-04-01T00:00:00Z') } });
      await tx.costCentre.create({ data: { organizationId: orgB, legalEntityId: entity.id, name: 'B cc', code: 'B-CC' } });
      await tx.designation.create({ data: { organizationId: orgB, name: 'B role', code: 'B-R' } });
      await tx.employmentType.create({ data: { organizationId: orgB, name: 'B type', code: 'B-T', category: 'permanent' } });
      await tx.setting.create({ data: { organizationId: orgB, scopeType: 'tenant', scopeId: orgB, key: 'employee_code.scope', value: 'tenant' } });
      return { entity: entity.id, location: location.id, department: department.id, grade: grade.id };
    });
    try {
      const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => {
        const counts: Record<string, number> = {};
        for (const t of ORG_TABLES) {
          const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}" WHERE organization_id = $1::uuid`, orgB);
          counts[t] = Number(n);
        }
        return {
          ...counts,
          pan: await tx.$executeRaw`UPDATE legal_entities SET pan = 'ZZZZZ9999Z' WHERE id = ${b.entity}::uuid`,
          pay: await tx.$executeRaw`UPDATE grade_pay_ranges SET max = 999999999 WHERE grade_id = ${b.grade}::uuid`,
          setting: await tx.$executeRaw`UPDATE settings SET value = '"legal_entity"' WHERE organization_id = ${orgB}::uuid`,
          removed: await tx.$executeRaw`DELETE FROM locations WHERE id = ${b.location}::uuid`,
        };
      });
      expect(seenByA).toEqual({ ...Object.fromEntries(ORG_TABLES.map((t) => [t, 0])), pan: 0, pay: 0, setting: 0, removed: 0 });
      // Planting a row in B is refused by the policy.
      await expect(tenantPrisma.forTenant(asA(), (tx) => tx.legalEntity.create({ data: { organizationId: orgB, name: 'planted', shortName: 'PLANTED' } }))).rejects.toThrow(RLS_VIOLATION);
      // An own row pointing at B's entity, department or grade is refused by the composite keys, even with
      // the platform's bypass on: the referenced (organization, id) pair does not exist.
      const aEntity = await tenantPrisma.forTenant(asA(), (tx) => tx.legalEntity.create({ data: { organizationId: orgA, name: 'A Ltd', shortName: `A-${randomUUID().slice(0, 8)}` } }));
      for (const ctx of [asA(), SUPER]) {
        await expect(
          tenantPrisma.forTenant(ctx, (tx) => tx.location.create({ data: { organizationId: orgA, legalEntityId: b.entity, name: 'stray', code: 'STRAY', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })),
        ).rejects.toThrow(/locations_legal_entity_fkey|Foreign key/);
        const id = randomUUID();
        await expect(tenantPrisma.forTenant(ctx, (tx) => tx.department.create({ data: { id, organizationId: orgA, name: 'stray', code: 'STRAY', parentId: b.department, path: `/${id}/` } }))).rejects.toThrow(/departments_parent_fkey|Foreign key/);
        await expect(
          tenantPrisma.forTenant(ctx, (tx) => tx.gradePayRange.create({ data: { organizationId: orgA, gradeId: b.grade, legalEntityId: aEntity.id, currency: 'INR', min: 1, mid: 1, max: 1, validFrom: new Date('2026-04-01T00:00:00Z') } })),
        ).rejects.toThrow(/grade_pay_ranges_grade_fkey|Foreign key/);
      }
      const still = await tenantPrisma.forTenant(SUPER, (tx) => tx.legalEntity.findUniqueOrThrow({ where: { id: b.entity } }));
      expect(still.pan).toBe('AABCB1234B');
    } finally {
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        for (const t of ['settings', 'grade_pay_ranges', 'cost_centres', 'locations', 'departments', 'designations', 'employment_types', 'grades', 'legal_entities']) {
          await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organization_id = ANY($1::uuid[])`, [orgA, orgB]);
        }
      });
    }
  });

  // P01 §4.4 employee core + P06 dated facts (YX-ORG-14, YX-HIS-01/07): forced-RLS tenant tables whose
  // composite keys stop a row pointing at another company's row; dated rows come only from approved changes
  // and are never rewritten or removed by the app role.
  const HISTORY_TABLES = ['assignment_cost_centres', 'compensations', 'employee_assignments', 'employee_changes', 'employees', 'employment_status_periods', 'employments'];

  it('the employee and history tables are forced-RLS tenant tables', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ANY(${HISTORY_TABLES}) ORDER BY c.relname`;
    expect(rows).toEqual(HISTORY_TABLES.map((table) => ({ table, forced: true, policies: policiesOf(table) })));
  });

  it("(b) org A cannot read or change org B's employees and history, nor point at them; dated rows are immutable", async () => {
    const asB = { organizationId: orgB, isSuperAdmin: false };
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    // B's company with one employee written the way the service writes: an approved change, then its rows.
    const b = await tenantPrisma.forTenant(asB, async (tx) => {
      const entity = await tx.legalEntity.create({ data: { organizationId: orgB, name: 'B Ltd', shortName: `B-${randomUUID().slice(0, 8)}` } });
      const location = await tx.location.create({ data: { organizationId: orgB, legalEntityId: entity.id, name: 'B site', code: 'B-SITE', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } });
      const deptId = randomUUID();
      const department = await tx.department.create({ data: { id: deptId, organizationId: orgB, name: 'B dept', code: 'B-DEPT', path: `/${deptId}/` } });
      const designation = await tx.designation.create({ data: { organizationId: orgB, name: 'B role', code: 'B-R' } });
      const type = await tx.employmentType.create({ data: { organizationId: orgB, name: 'B type', code: 'B-T', category: 'permanent' } });
      const person = await tx.person.create({ data: { organizationId: orgB, givenName: 'Bea' } });
      const employee = await tx.employee.create({ data: { organizationId: orgB, personId: person.id, givenName: 'Bea' } });
      const employment = await tx.employment.create({ data: { organizationId: orgB, employeeId: employee.id, legalEntityId: entity.id, employeeCode: 'B1', codeScopeKey: entity.id, joinedOn: day('2026-04-01') } });
      const change = (status: string) =>
        tx.employeeChange.create({ data: { organizationId: orgB, employeeId: employee.id, employmentId: employment.id, changeType: 'join', effectiveDate: day('2026-04-01'), status, payload: {}, reason: 'join', ...(status === 'effective' ? { appliedAt: new Date() } : {}) } });
      const join = await change('effective');
      const pending = await change('pending');
      const assignment = await tx.employeeAssignment.create({
        data: { organizationId: orgB, legalEntityId: entity.id, employeeId: employee.id, employmentId: employment.id, validFrom: day('2026-04-01'), locationId: location.id, departmentId: department.id, designationId: designation.id, employmentTypeId: type.id, changeId: join.id },
      });
      // Pay rows sit behind the pay guard: the fixture opens it for B's entity, as payroll does.
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${entity.id}}`}, true)`;
      await tx.compensation.create({ data: { organizationId: orgB, employmentId: employment.id, validFrom: day('2026-04-01'), currency: 'INR', annualCtc: 500000, changeId: join.id } });
      await tx.employmentStatusPeriod.create({ data: { organizationId: orgB, employmentId: employment.id, validFrom: day('2026-04-01'), status: 'confirmed', changeId: join.id } });
      return { entity: entity.id, location: location.id, department: department.id, designation: designation.id, type: type.id, person: person.id, employee: employee.id, employment: employment.id, join: join.id, pending: pending.id, assignment: assignment.id };
    });
    const rowB = { organizationId: orgB, legalEntityId: b.entity, employeeId: b.employee, employmentId: b.employment, locationId: b.location, departmentId: b.department, designationId: b.designation, employmentTypeId: b.type };

    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => {
      const counts: Record<string, number> = {};
      for (const t of HISTORY_TABLES) {
        const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}" WHERE organization_id = $1::uuid`, orgB);
        counts[t] = Number(n);
      }
      return {
        ...counts,
        pay: await tx.$executeRaw`UPDATE compensations SET superseded_at = now(), superseded_by_change_id = ${b.join}::uuid WHERE employment_id = ${b.employment}::uuid`,
        change: await tx.$executeRaw`UPDATE employee_changes SET status = 'cancelled' WHERE id = ${b.pending}::uuid`,
        name: await tx.$executeRaw`UPDATE employees SET given_name = 'Hacked' WHERE id = ${b.employee}::uuid`,
      };
    });
    expect(seenByA).toEqual({ ...Object.fromEntries(HISTORY_TABLES.map((t) => [t, 0])), pay: 0, change: 0, name: 0 });
    await expect(tenantPrisma.forTenant(asA(), (tx) => tx.employee.create({ data: { organizationId: orgB, personId: b.person, givenName: 'planted' } }))).rejects.toThrow(RLS_VIOLATION);

    // A's own employee can neither sit at B's location nor hang off B's employee, even with the platform's bypass.
    const a = await tenantPrisma.forTenant(asA(), async (tx) => {
      const entity = await tx.legalEntity.create({ data: { organizationId: orgA, name: 'A Ltd', shortName: `A-${randomUUID().slice(0, 8)}` } });
      const person = await tx.person.create({ data: { organizationId: orgA, givenName: 'Ann' } });
      const employee = await tx.employee.create({ data: { organizationId: orgA, personId: person.id, givenName: 'Ann' } });
      const employment = await tx.employment.create({ data: { organizationId: orgA, employeeId: employee.id, legalEntityId: entity.id, employeeCode: 'A1', codeScopeKey: entity.id, joinedOn: day('2026-04-01') } });
      const join = await tx.employeeChange.create({
        data: { organizationId: orgA, employeeId: employee.id, employmentId: employment.id, changeType: 'join', effectiveDate: day('2026-04-01'), status: 'effective', appliedAt: new Date(), payload: {}, reason: 'join' },
      });
      return { entity: entity.id, employee: employee.id, employment: employment.id, join: join.id };
    });
    for (const ctx of [asA(), SUPER]) {
      await expect(
        tenantPrisma.forTenant(ctx, (tx) =>
          tx.employeeAssignment.create({ data: { ...rowB, organizationId: orgA, legalEntityId: a.entity, employeeId: a.employee, employmentId: a.employment, validFrom: day('2026-04-01'), changeId: a.join } }),
        ),
      ).rejects.toThrow(/employee_assignments_location_fkey|Foreign key/);
      await expect(
        tenantPrisma.forTenant(ctx, (tx) => tx.employment.create({ data: { organizationId: orgA, employeeId: b.employee, legalEntityId: a.entity, employeeCode: 'A2', codeScopeKey: a.entity, joinedOn: day('2026-04-01') } })),
      ).rejects.toThrow(/employments_employee_fkey|Foreign key/);
    }

    // YX-HIS-01: in B's own context, a dated row from a change that is not approved is refused ...
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.employeeAssignment.create({ data: { ...rowB, validFrom: day('2026-05-01'), changeId: b.pending } }))).rejects.toThrow(/approved employee changes/);
    // ... and YX-HIS-07: the app role can neither rewrite nor remove one; superseding happens once.
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE employee_assignments SET valid_from = '2026-03-01' WHERE id = ${b.assignment}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`DELETE FROM compensations WHERE employment_id = ${b.employment}::uuid`)).rejects.toThrow(/permission denied/);
    await tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE employee_assignments SET superseded_at = now(), superseded_by_change_id = ${b.join}::uuid WHERE id = ${b.assignment}::uuid`);
    await expect(
      tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE employee_assignments SET superseded_at = now(), superseded_by_change_id = ${b.pending}::uuid WHERE id = ${b.assignment}::uuid`),
    ).rejects.toThrow(/stays as it was/);
    // GiST exclusion (YX-HIS-02): two current rows of one employment never overlap.
    await expect(
      tenantPrisma.forTenant(asB, async (tx) => {
        await tx.employeeAssignment.create({ data: { ...rowB, validFrom: day('2026-04-01'), changeId: b.join } });
        await tx.employeeAssignment.create({ data: { ...rowB, validFrom: day('2026-06-01'), changeId: b.join } });
      }),
    ).rejects.toThrow(/employee_assignments_no_overlap|exclusion|23P01/);
    const name = await tenantPrisma.forTenant(asB, (tx) => tx.employee.findUniqueOrThrow({ where: { id: b.employee } }));
    expect(name.givenName).toBe('Bea');
    // A's employee record can never belong to B's person (P01 §4.5a, YX-ORG-26), even with the bypass.
    for (const ctx of [asA(), SUPER]) {
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.employee.create({ data: { organizationId: orgA, personId: b.person, givenName: 'Borrowed' } }))).rejects.toThrow(/employees_person_fkey|Foreign key/);
    }
    // afterAll removes both companies; their rows go with them (FK cascades run as the table owner).
  });

  // People core (step 2c): persons and their roles (P01 §4.5a), dotted-line managers (M01 Q5), probation
  // plans (M01 §3.4) and bulk change batches (M01 §3.3): forced-RLS tenant tables with composite keys.
  const PEOPLE_TABLES = ['assignment_dotted_line_managers', 'employee_change_batches', 'person_link_log', 'person_roles', 'persons', 'probations'];

  it('the people-core tables are forced-RLS tenant tables', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ANY(${PEOPLE_TABLES}) ORDER BY c.relname`;
    expect(rows).toEqual(PEOPLE_TABLES.map((table) => ({ table, forced: true, policies: BigInt(1) })));
  });

  it("(b) org A cannot read, change or point at org B's persons, roles, probations, batches and dotted lines", async () => {
    const asB = { organizationId: orgB, isSuperAdmin: false };
    const day = (d: string) => new Date(`${d}T00:00:00Z`);
    const b = await tenantPrisma.forTenant(asB, async (tx) => {
      const o = { organizationId: orgB };
      const entity = await tx.legalEntity.create({ data: { ...o, name: 'B People', shortName: `BP-${randomUUID().slice(0, 8)}` } });
      const location = await tx.location.create({ data: { ...o, legalEntityId: entity.id, name: 'B office', code: `BO-${randomUUID().slice(0, 6)}`, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } });
      const deptId = randomUUID();
      const department = await tx.department.create({ data: { ...o, id: deptId, name: `B ops ${deptId.slice(0, 6)}`, code: `BOPS-${deptId.slice(0, 6)}`, path: `/${deptId}/` } });
      const designation = await tx.designation.create({ data: { ...o, name: `B lead ${deptId.slice(0, 6)}`, code: `BL-${deptId.slice(0, 6)}` } });
      const type = await tx.employmentType.create({ data: { ...o, name: `B perm ${deptId.slice(0, 6)}`, code: `BP-${deptId.slice(0, 6)}`, category: 'permanent' } });
      const hire = async (name: string, code: string) => {
        const person = await tx.person.create({ data: { ...o, givenName: name, primaryEmail: `${code.toLowerCase()}@b.test` } });
        const employee = await tx.employee.create({ data: { ...o, personId: person.id, givenName: name } });
        const employment = await tx.employment.create({ data: { ...o, employeeId: employee.id, legalEntityId: entity.id, employeeCode: code, codeScopeKey: entity.id, joinedOn: day('2026-04-01') } });
        const role = await tx.personRole.create({ data: { ...o, personId: person.id, roleType: 'employee', sourceTable: 'employments', sourceId: employment.id, startOn: day('2026-04-01') } });
        return { person: person.id, employee: employee.id, employment: employment.id, role: role.id, email: person.primaryEmail! };
      };
      const boss = await hire('Bo', `BB-${deptId.slice(0, 6)}`);
      const worker = await hire('Bi', `BW-${deptId.slice(0, 6)}`);
      const join = await tx.employeeChange.create({
        data: { ...o, employeeId: worker.employee, employmentId: worker.employment, changeType: 'join', effectiveDate: day('2026-04-01'), status: 'effective', appliedAt: new Date(), payload: {}, reason: 'join' },
      });
      const assignment = await tx.employeeAssignment.create({
        data: { ...o, legalEntityId: entity.id, employeeId: worker.employee, employmentId: worker.employment, validFrom: day('2026-04-01'), locationId: location.id, departmentId: department.id, designationId: designation.id, employmentTypeId: type.id, managerEmployeeId: boss.employee, changeId: join.id },
      });
      await tx.assignmentDottedLineManager.create({ data: { ...o, employeeId: worker.employee, assignmentId: assignment.id, managerEmployeeId: boss.employee } });
      const probation = await tx.probation.create({ data: { ...o, employmentId: worker.employment, startOn: day('2026-04-01'), originalEndOn: day('2026-09-30'), plannedEndOn: day('2026-09-30') } });
      const batch = await tx.employeeChangeBatch.create({ data: { ...o, source: 'csv', reason: 'Reorg', rowCount: 1 } });
      const log = await tx.personLinkLog.create({ data: { ...o, action: 'confirmed', personId: worker.person, basis: 'hr_confirmed' } });
      return { ...worker, boss: boss.employee, assignment: assignment.id, probation: probation.id, batch: batch.id, log: log.id, join: join.id };
    });

    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => {
      const counts: Record<string, number> = {};
      for (const t of PEOPLE_TABLES) {
        const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}" WHERE organization_id = $1::uuid`, orgB);
        counts[t] = Number(n);
      }
      return {
        ...counts,
        person: await tx.$executeRaw`UPDATE persons SET given_name = 'Hacked' WHERE id = ${b.person}::uuid`,
        probation: await tx.$executeRaw`UPDATE probations SET planned_end_on = '2030-01-01' WHERE id = ${b.probation}::uuid`,
        batch: await tx.$executeRaw`UPDATE employee_change_batches SET status = 'approved' WHERE id = ${b.batch}::uuid`,
        role: await tx.$executeRaw`DELETE FROM person_roles WHERE id = ${b.role}::uuid`,
      };
    });
    expect(seenByA).toEqual({ ...Object.fromEntries(PEOPLE_TABLES.map((t) => [t, 0])), person: 0, probation: 0, batch: 0, role: 0 });
    await expect(tenantPrisma.forTenant(asA(), (tx) => tx.person.create({ data: { organizationId: orgB, givenName: 'planted' } }))).rejects.toThrow(RLS_VIOLATION);

    // A's rows can never hang off B's person, employment, assignment or batch, even with the platform bypass.
    const a = await tenantPrisma.forTenant(asA(), async (tx) => {
      const person = await tx.person.create({ data: { organizationId: orgA, givenName: 'Ann' } });
      return { person: person.id };
    });
    for (const ctx of [asA(), SUPER]) {
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.personRole.create({ data: { organizationId: orgA, personId: b.person, roleType: 'login', sourceTable: 'users', sourceId: randomUUID(), startOn: day('2026-04-01') } }))).rejects.toThrow(/person_roles_person_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.probation.create({ data: { organizationId: orgA, employmentId: b.employment, startOn: day('2026-04-01'), originalEndOn: day('2026-09-30'), plannedEndOn: day('2026-09-30') } }))).rejects.toThrow(/probations_employment_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.personLinkLog.create({ data: { organizationId: orgA, action: 'merge', personId: a.person, otherPersonId: b.person, basis: 'x' } }))).rejects.toThrow(/person_link_log_other_fkey|Foreign key/);
    }

    // In B's own context: the link log is append-only, and an assignment's dotted lines are written with it,
    // never added later (YX-ORG-27, YX-HIS-07).
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE person_link_log SET reason = 'x' WHERE id = ${b.log}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`DELETE FROM person_link_log WHERE id = ${b.log}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`DELETE FROM assignment_dotted_line_managers WHERE assignment_id = ${b.assignment}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(
      tenantPrisma.forTenant(asB, (tx) => tx.assignmentDottedLineManager.create({ data: { organizationId: orgB, employeeId: b.employee, assignmentId: b.assignment, managerEmployeeId: b.employee } })),
    ).rejects.toThrow(/self_check|written with it/);
    // One email per live person in a company (YX-ORG-27 deterministic key).
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.person.create({ data: { organizationId: orgB, givenName: 'Twin', primaryEmail: b.email.toUpperCase() } }))).rejects.toThrow(/Unique constraint|persons_email_key/);
    const name = await tenantPrisma.forTenant(asB, (tx) => tx.person.findUniqueOrThrow({ where: { id: b.person } }));
    expect(name.givenName).toBe('Bi');
  });

  // Access, visibility and privacy (step 2d): scoped role grants (P02 §4.2–4.3), Personal details, encrypted
  // identifiers and bank accounts (§4.4), identity / bank change requests (§4.5).
  const ACCESS_TABLES = ['employee_bank_accounts', 'employee_identifiers', 'employee_personal_details', 'employee_profile_requests', 'role_grants'];

  it('the access and privacy tables are forced-RLS tenant tables', async () => {
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ANY(${ACCESS_TABLES}) ORDER BY c.relname`;
    expect(rows).toEqual(ACCESS_TABLES.map((table) => ({ table, forced: true, policies: policiesOf(table) })));
  });

  // Step 3, the platform console: the company tables are forced-RLS tenant tables; support sessions are never deleted
  // by the app; inside a support session pay, identity and bank rows are out of reach (RESTRICTIVE, P02 Q8).
  it('the platform console tables are forced-RLS tenant tables, and support sessions keep their history', async () => {
    const CONSOLE_TABLES = ['organization_products', 'support_sessions'];
    const rows = await prisma.$queryRaw<{ table: string; forced: boolean; policies: bigint; can_delete: boolean }[]>`
      SELECT c.relname AS table, (c.relrowsecurity AND c.relforcerowsecurity) AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
             has_table_privilege('app_runtime', c.oid, 'DELETE') AS can_delete
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ANY(${CONSOLE_TABLES}) ORDER BY c.relname`;
    expect(rows).toEqual([
      { table: 'organization_products', forced: true, policies: BigInt(1), can_delete: true },
      { table: 'support_sessions', forced: true, policies: BigInt(1), can_delete: false },
    ]);
    const restrictive = await prisma.$queryRaw<{ table: string }[]>`
      SELECT c.relname AS table FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE p.polname = 'support_session_excluded' AND NOT p.polpermissive ORDER BY c.relname`;
    expect(restrictive.map((r) => r.table)).toEqual([...SUPPORT_EXCLUDED, ...PAYROLL_SUPPORT_EXCLUDED, ...LIFECYCLE_SUPPORT_EXCLUDED].sort());
  });

  it("(b) org A cannot read, change or point at org B's grants, personal data, identifiers, bank accounts or requests", async () => {
    const asB = { organizationId: orgB, isSuperAdmin: false };
    const tag = randomUUID().slice(0, 8);
    const b = await tenantPrisma.forTenant(asB, async (tx) => {
      const o = { organizationId: orgB };
      const entity = await tx.legalEntity.create({ data: { ...o, name: `B Access ${tag}`, shortName: `BA-${tag}` } });
      const profile = await tx.permissionProfile.create({ data: { ...o, name: `B HR ${tag}`, permissionsJson: '["employee.profile.view"]' } });
      const grant = await tx.roleGrant.create({ data: { ...o, userId: userB, permissionProfileId: profile.id, scopeType: 'legal_entity', legalEntityId: entity.id, validFrom: new Date('2026-10-01T00:00:00Z'), status: 'active', reason: 'B HR' } });
      const person = await tx.person.create({ data: { ...o, givenName: 'Bea' } });
      const employee = await tx.employee.create({ data: { ...o, personId: person.id, givenName: 'Bea' } });
      await tx.employeePersonalDetails.create({ data: { ...o, employeeId: employee.id, personalEmail: `bea-${tag}@b.test` } });
      await tx.employeeIdentifiers.create({ data: { ...o, employeeId: employee.id, legalName: 'Bea B', panEnc: 'x.y.z', panHash: 'a'.repeat(64), panLast4: '123F' } });
      const bank = await tx.employeeBankAccount.create({ data: { ...o, employeeId: employee.id, purpose: 'salary', holderName: 'Bea', accountEnc: 'x.y.z', accountHash: 'b'.repeat(64), accountLast4: '6789', ifsc: 'HDFC0001234', usableFrom: new Date() } });
      const request = await tx.employeeProfileRequest.create({ data: { ...o, employeeId: employee.id, kind: 'pan', proposedEnc: 'x.y.z', proposedDisplay: {}, reason: 'new PAN', requestedBy: userB } });
      return { entity: entity.id, profile: profile.id, grant: grant.id, employee: employee.id, bank: bank.id, request: request.id };
    });

    const seenByA = await tenantPrisma.forTenant(asA(), async (tx) => {
      const counts: Record<string, number> = {};
      for (const t of ACCESS_TABLES) {
        const [{ n }] = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t}" WHERE organization_id = $1::uuid`, orgB);
        counts[t] = Number(n);
      }
      return {
        ...counts,
        grant: await tx.$executeRaw`UPDATE role_grants SET status = 'revoked' WHERE id = ${b.grant}::uuid`,
        personal: await tx.$executeRaw`UPDATE employee_personal_details SET personal_email = 'x@a.test' WHERE employee_id = ${b.employee}::uuid`,
        ids: await tx.$executeRaw`UPDATE employee_identifiers SET legal_name = 'Hacked' WHERE employee_id = ${b.employee}::uuid`,
        request: await tx.$executeRaw`UPDATE employee_profile_requests SET status = 'approved' WHERE id = ${b.request}::uuid`,
      };
    });
    expect(seenByA).toEqual({ ...Object.fromEntries(ACCESS_TABLES.map((t) => [t, 0])), grant: 0, personal: 0, ids: 0, request: 0 });
    // B's rows cannot be planted from A, nor A's rows point at B's user, role, entity or employee, even with the bypass.
    await expect(tenantPrisma.forTenant(asA(), (tx) => tx.employeeIdentifiers.create({ data: { organizationId: orgB, employeeId: b.employee } }))).rejects.toThrow(RLS_VIOLATION);
    const a = await tenantPrisma.forTenant(asA(), async (tx) => {
      const user = await tx.user.findFirstOrThrow({ where: { organizationId: orgA } });
      const profile = await tx.permissionProfile.create({ data: { organizationId: orgA, name: `A HR ${tag}`, permissionsJson: '[]' } });
      return { user: user.id, profile: profile.id };
    });
    const day = new Date('2026-10-01T00:00:00Z');
    for (const ctx of [asA(), SUPER]) {
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.roleGrant.create({ data: { organizationId: orgA, userId: userB, permissionProfileId: a.profile, scopeType: 'tenant', validFrom: day, status: 'active', reason: 'x' } }))).rejects.toThrow(/role_grants_user_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.roleGrant.create({ data: { organizationId: orgA, userId: a.user, permissionProfileId: b.profile, scopeType: 'tenant', validFrom: day, status: 'active', reason: 'x' } }))).rejects.toThrow(/role_grants_profile_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.roleGrant.create({ data: { organizationId: orgA, userId: a.user, permissionProfileId: a.profile, scopeType: 'legal_entity', legalEntityId: b.entity, validFrom: day, status: 'active', reason: 'x' } }))).rejects.toThrow(/role_grants_entity_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.employeePersonalDetails.create({ data: { organizationId: orgA, employeeId: b.employee } }))).rejects.toThrow(/employee_personal_details_employee_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.employeeBankAccount.create({ data: { organizationId: orgA, employeeId: b.employee, purpose: 'salary', holderName: 'x', accountEnc: 'x', accountHash: 'c'.repeat(64), accountLast4: '0000', ifsc: 'HDFC0001234', usableFrom: day } }))).rejects.toThrow(/employee_bank_accounts_employee_fkey|Foreign key/);
      await expect(tenantPrisma.forTenant(ctx, (tx) => tx.employeeProfileRequest.create({ data: { organizationId: orgA, employeeId: b.employee, kind: 'pan', proposedEnc: 'x', proposedDisplay: {}, reason: 'x', requestedBy: a.user } }))).rejects.toThrow(/employee_profile_requests_employee_fkey|Foreign key/);
    }
    // In B's own context the database keeps the rules: a scope names exactly its target, nobody decides their
    // own grant or request (YX-SEC-11), grants and bank history are never deleted, a bank row is only closed.
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.roleGrant.create({ data: { organizationId: orgB, userId: userB, permissionProfileId: b.profile, scopeType: 'tenant', legalEntityId: b.entity, validFrom: day, status: 'active', reason: 'x' } }))).rejects.toThrow(/role_grants_target_check/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE role_grants SET decided_by = user_id WHERE id = ${b.grant}::uuid`)).rejects.toThrow(/role_grants_four_eyes_check/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE employee_profile_requests SET status = 'approved', decided_by = requested_by WHERE id = ${b.request}::uuid`)).rejects.toThrow(/four_eyes_check/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`DELETE FROM role_grants WHERE id = ${b.grant}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`DELETE FROM employee_bank_accounts WHERE id = ${b.bank}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE employee_bank_accounts SET account_last4 = '0000' WHERE id = ${b.bank}::uuid`)).rejects.toThrow(/permission denied/);
    expect(await tenantPrisma.forTenant(asB, (tx) => tx.$executeRaw`UPDATE employee_bank_accounts SET valid_to = now() WHERE id = ${b.bank}::uuid`)).toBe(1);
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
