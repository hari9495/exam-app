-- YukthiX console C-8, YX-12: the in-app nudge copy YukthiX staff write per feature switch (C-4, answer 1049). A nudge
-- either suggests a feature that is on ("suggest") or explains how to switch on one YukthiX allows but the company has
-- off ("switch_on"). A second staff member (never the writer) approves each before it goes live; one live nudge per
-- feature and kind. Companies get only the one meant for the person through /help/nudge: never for a feature YukthiX
-- killed or has off for the company, never to someone who cannot act on it, and at most
-- `nudges.weekly_limit_per_person` a week (platform setting, default 2).
-- Writes data (the key), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "feature_nudges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature_key" VARCHAR(60) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "heading" VARCHAR(80) NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "written_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(300),
    "retired_by" UUID,
    "retired_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "feature_nudges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feature_nudges_feature_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature_flags"("key"),
    CONSTRAINT "feature_nudges_written_by_fkey" FOREIGN KEY ("written_by") REFERENCES "users"("id"),
    CONSTRAINT "feature_nudges_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id"),
    CONSTRAINT "feature_nudges_retired_by_fkey" FOREIGN KEY ("retired_by") REFERENCES "users"("id"),
    CONSTRAINT "feature_nudges_kind_check" CHECK ("kind" IN ('suggest', 'switch_on')),
    CONSTRAINT "feature_nudges_status_check" CHECK ("status" IN ('pending', 'live', 'sent_back', 'retired')),
    CONSTRAINT "feature_nudges_heading_check" CHECK (char_length(btrim("heading")) BETWEEN 3 AND 80),
    CONSTRAINT "feature_nudges_body_check" CHECK (char_length(btrim("body")) BETWEEN 10 AND 300),
    -- The approver is never the writer.
    CONSTRAINT "feature_nudges_four_eyes_check" CHECK ("reviewed_by" IS NULL OR "reviewed_by" <> "written_by")
);
-- One live nudge per feature and kind.
CREATE UNIQUE INDEX "feature_nudges_one_live" ON "feature_nudges" ("feature_key", "kind") WHERE "status" = 'live';
ALTER TABLE "feature_nudges" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY feature_nudges_platform ON "feature_nudges" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "feature_nudges" FROM app_runtime;

CREATE TABLE "nudge_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nudge_id" UUID NOT NULL,
    "shown_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed_at" TIMESTAMPTZ(3),
    CONSTRAINT "nudge_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nudge_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "nudge_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "nudge_views_nudge_id_fkey" FOREIGN KEY ("nudge_id") REFERENCES "feature_nudges"("id")
);
CREATE UNIQUE INDEX "nudge_views_user_id_nudge_id_key" ON "nudge_views" ("user_id", "nudge_id");
CREATE INDEX "nudge_views_organization_id_user_id_shown_at_idx" ON "nudge_views" ("organization_id", "user_id", "shown_at");
ALTER TABLE "nudge_views" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "nudge_views"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "nudge_views" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

-- The console key (also in prisma/seed.ts). Staff role (answers 1058, 1086): Customer success.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.nudges.write', 'Write and approve the in-app nudges for each feature switch (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "platform_role_keys" ("role", "key") VALUES ('customer_success', 'platform.nudges.write') ON CONFLICT DO NOTHING;
