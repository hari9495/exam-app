-- Console 1165 (answers 1082, 1083; 12 Nov 2026): the nightly health snapshot (score and band only, no HR data), a
-- Customer success owner per company, and alert follow-up (owner, status, outreach notes). All platform data: only the
-- platform (staff) context reads or writes it; companies never see it.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "cs_health_snapshots" (
    "organization_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "band" VARCHAR(10) NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_health_snapshots_pkey" PRIMARY KEY ("organization_id", "day"),
    CONSTRAINT "cs_health_snapshots_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "cs_health_snapshots_score_check" CHECK ("score" BETWEEN 0 AND 100),
    CONSTRAINT "cs_health_snapshots_band_check" CHECK ("band" IN ('healthy', 'watch', 'at_risk'))
);
CREATE INDEX "cs_health_snapshots_day_idx" ON "cs_health_snapshots" ("day");
ALTER TABLE "cs_health_snapshots" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "cs_health_snapshots" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));

CREATE TABLE "cs_accounts" (
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_accounts_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "cs_accounts_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "cs_accounts_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
);
ALTER TABLE "cs_accounts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "cs_accounts" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));

CREATE TABLE "cs_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule" VARCHAR(20) NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "owner_user_id" UUID,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "auto_resolved" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "cs_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cs_alerts_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "cs_alerts_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id"),
    CONSTRAINT "cs_alerts_rule_check" CHECK ("rule" IN ('health_below', 'admin_idle')),
    CONSTRAINT "cs_alerts_status_check" CHECK ("status" IN ('open', 'contacted', 'resolved')),
    CONSTRAINT "cs_alerts_resolved_check" CHECK (("status" = 'resolved') = ("resolved_at" IS NOT NULL))
);
-- One alert of each rule per company until it is resolved.
CREATE UNIQUE INDEX "cs_alerts_live_key" ON "cs_alerts" ("organization_id", "rule") WHERE "status" <> 'resolved';
ALTER TABLE "cs_alerts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "cs_alerts" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "cs_alerts" FROM app_runtime;

CREATE TABLE "cs_alert_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alert_id" UUID NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "written_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cs_alert_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cs_alert_notes_alert_fkey" FOREIGN KEY ("alert_id") REFERENCES "cs_alerts"("id") ON DELETE CASCADE,
    CONSTRAINT "cs_alert_notes_writer_fkey" FOREIGN KEY ("written_by") REFERENCES "users"("id"),
    CONSTRAINT "cs_alert_notes_note_check" CHECK (char_length(btrim("note")) BETWEEN 1 AND 1000)
);
ALTER TABLE "cs_alert_notes" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "cs_alert_notes" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "cs_alert_notes" FROM app_runtime;
