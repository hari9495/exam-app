-- P12 Part 1b: tenant security policy (YX-IAM-06/08/09, Q8) and the fail-open breached-password flag.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_recheck_pending" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tenant_security_policies" (
    "organization_id" UUID NOT NULL,
    "mfa_scope" VARCHAR(16) NOT NULL DEFAULT 'sensitive_roles',
    "allowed_factors" VARCHAR(16)[] DEFAULT ARRAY['passkey', 'totp']::VARCHAR(16)[],
    "session_idle_minutes" INTEGER,
    "session_absolute_minutes" INTEGER,
    "max_concurrent_sessions" INTEGER,
    "password_min_length" INTEGER NOT NULL DEFAULT 12,
    "ip_allowlist_desk" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ip_allowlist_admin" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ip_allowlist_api" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sso_only" BOOLEAN NOT NULL DEFAULT false,
    "break_glass_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" UUID,

    CONSTRAINT "tenant_security_policies_pkey" PRIMARY KEY ("organization_id")
);

-- AddForeignKey
ALTER TABLE "tenant_security_policies" ADD CONSTRAINT "tenant_security_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The YukthiX floor (P12 Q8), enforced by the database as well as the API, so no code path can
-- store a laxer value. Keep in step with TENANT_SECURITY_FLOOR (packages/shared).
ALTER TABLE "tenant_security_policies"
  ADD CONSTRAINT "tsp_mfa_scope_check" CHECK ("mfa_scope" IN ('sensitive_roles', 'all')),
  ADD CONSTRAINT "tsp_allowed_factors_check" CHECK (
    "allowed_factors" IS NOT NULL
    AND "allowed_factors" <@ ARRAY['passkey', 'totp', 'otp']::VARCHAR(16)[]
    AND "allowed_factors" && ARRAY['passkey', 'totp']::VARCHAR(16)[]),
  ADD CONSTRAINT "tsp_session_idle_check" CHECK ("session_idle_minutes" IS NULL OR "session_idle_minutes" BETWEEN 5 AND 480),
  ADD CONSTRAINT "tsp_session_absolute_check" CHECK ("session_absolute_minutes" IS NULL OR "session_absolute_minutes" BETWEEN 30 AND 720),
  ADD CONSTRAINT "tsp_idle_within_absolute_check" CHECK (
    "session_idle_minutes" IS NULL OR "session_absolute_minutes" IS NULL OR "session_idle_minutes" <= "session_absolute_minutes"),
  ADD CONSTRAINT "tsp_concurrent_sessions_check" CHECK ("max_concurrent_sessions" IS NULL OR "max_concurrent_sessions" BETWEEN 1 AND 100),
  ADD CONSTRAINT "tsp_password_min_length_check" CHECK ("password_min_length" BETWEEN 12 AND 128),
  ADD CONSTRAINT "tsp_ip_allowlists_check" CHECK (
    "ip_allowlist_desk" IS NOT NULL AND cardinality("ip_allowlist_desk") <= 100
    AND "ip_allowlist_admin" IS NOT NULL AND cardinality("ip_allowlist_admin") <= 100
    AND "ip_allowlist_api" IS NOT NULL AND cardinality("ip_allowlist_api") <= 100),
  ADD CONSTRAINT "tsp_break_glass_check" CHECK (
    "break_glass_user_ids" IS NOT NULL AND cardinality("break_glass_user_ids") <= 10
    AND (NOT "sso_only" OR cardinality("break_glass_user_ids") >= 2));

-- Tenant isolation: same forced RLS + tenant_isolation policy as every other organization_id table.
ALTER TABLE "tenant_security_policies" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_security_policies"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
