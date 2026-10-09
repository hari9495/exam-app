-- P12 Part 1c: MFA factors, recovery codes, session assurance and step-up, MFA-reset approvals
-- (YX-IAM-01/02/03/11, Q1).

-- Existing accounts keep working: anyone MFA is required for gets 14 days to enrol (P12 §8).
-- Reset to now() by an approved MFA reset, so the user must enrol again at their next sign-in.
ALTER TABLE "users" ADD COLUMN "mfa_enrolment_due_at" TIMESTAMPTZ(3) NOT NULL DEFAULT (now() + interval '14 days');

-- When (and with which factor) the session last proved AAL2: sign-in second factor, enrolment
-- or step-up. Step-up actions need this inside the step-up window (YX-IAM-02).
ALTER TABLE "sessions" ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(3), ADD COLUMN "mfa_method" VARCHAR(32);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_aal2_verified_check"
  CHECK ("assurance_level" = 'aal1' OR "mfa_verified_at" IS NOT NULL);

-- CreateTable
CREATE TABLE "authenticators" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "credential_id" VARCHAR(1024),
    "public_key" BYTEA,
    "sign_count" BIGINT NOT NULL DEFAULT 0,
    "transports" VARCHAR(32)[] DEFAULT ARRAY[]::VARCHAR(32)[],
    "secret_encrypted" TEXT,
    "totp_last_step" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "authenticators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_reset_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "mfa_reset_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "authenticators_credential_id_key" ON "authenticators"("credential_id");
CREATE INDEX "authenticators_user_id_idx" ON "authenticators"("user_id");
CREATE UNIQUE INDEX "recovery_codes_user_id_code_hash_key" ON "recovery_codes"("user_id", "code_hash");
CREATE INDEX "mfa_reset_requests_organization_id_status_idx" ON "mfa_reset_requests"("organization_id", "status");
-- At most one open request per user.
CREATE UNIQUE INDEX "mfa_reset_requests_one_pending_per_target" ON "mfa_reset_requests"("target_user_id") WHERE "status" = 'pending';

ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_reset_requests" ADD CONSTRAINT "mfa_reset_requests_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Shapes the app must never get wrong, enforced by the database.
ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_shape_check" CHECK (
  ("type" = 'passkey' AND "credential_id" IS NOT NULL AND "public_key" IS NOT NULL AND "secret_encrypted" IS NULL)
  OR ("type" = 'totp' AND "secret_encrypted" IS NOT NULL AND "credential_id" IS NULL AND "public_key" IS NULL));
ALTER TABLE "mfa_reset_requests"
  ADD CONSTRAINT "mfa_reset_requests_status_check" CHECK ("status" IN ('pending', 'completed', 'expired')),
  -- Nobody resets their own MFA, and the second approver is a different person from both.
  ADD CONSTRAINT "mfa_reset_requests_people_check" CHECK (
    "requested_by_user_id" <> "target_user_id"
    AND ("approved_by_user_id" IS NULL
         OR ("approved_by_user_id" <> "requested_by_user_id" AND "approved_by_user_id" <> "target_user_id")));

-- Tenant isolation: the standard forced RLS + tenant_isolation policy. Platform staff factors
-- (organization_id NULL) are visible to the super-admin context only.
ALTER TABLE "authenticators" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "authenticators"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "recovery_codes" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recovery_codes"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "mfa_reset_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mfa_reset_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Factors are revoked (revoked_at), never deleted, and reset requests are a record: the app may
-- not delete either (user deletion still cascades -- referential actions run as the owner).
REVOKE DELETE, TRUNCATE ON TABLE "authenticators" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "mfa_reset_requests" FROM app_runtime;
