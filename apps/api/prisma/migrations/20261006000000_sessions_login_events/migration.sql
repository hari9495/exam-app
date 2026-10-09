-- P12 Part 1a: server-side sessions (YX-IAM-06) and append-only login events (YX-IAM-07/10).

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "assurance_level" VARCHAR(16) NOT NULL DEFAULT 'aal1',
    "device_id_hash" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "ip_address" VARCHAR(64),
    "geo" VARCHAR(128),
    "idle_timeout_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(64),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "user_id" UUID,
    "identifier" VARCHAR(320),
    "result" VARCHAR(16) NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(64),
    "session_id" UUID,
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "device_id_hash" VARCHAR(64),
    "geo" VARCHAR(128),
    "new_device" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sessions_organization_id_last_seen_at_idx" ON "sessions"("organization_id", "last_seen_at");

-- CreateIndex
CREATE INDEX "login_events_organization_id_created_at_idx" ON "login_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Closed vocabularies, enforced by the database rather than trusted to the app.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_assurance_level_check" CHECK ("assurance_level" IN ('aal1', 'aal2'));
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_result_check" CHECK ("result" IN ('success', 'failed', 'locked', 'mfa_failed'));

-- Tenant isolation: same forced RLS + tenant_isolation policy as every other organization_id
-- table (see 20261005000001_tenant_rls). Null-org rows (platform super-admin sessions/attempts
-- against unknown organisations) are visible to the super-admin context only.
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sessions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "login_events" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "login_events"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- login_events is append-only for the app (P08 pattern, as audit_logs). Default privileges
-- granted SELECT/INSERT/UPDATE/DELETE on creation; take the mutating ones back.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "login_events" FROM app_runtime;
