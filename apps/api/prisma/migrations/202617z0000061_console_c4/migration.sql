-- YukthiX console C-4 (founder answers 1049 and 1050, 12 Nov 2026).
-- 1049: feature switches. One default for every company, an override per company; the kill switch turns a feature off
--       for everyone (security key and a reason); turning it back on is a second staff member's. The first switches are
--       features that already exist as company settings (the company's own setting still applies under the switch).
-- 1050: contain a company (YX-18): everyone signed out, connected apps revoked, exports, bank-detail changes and payouts
--       held at the server, a banner for the company; lifting takes two different staff members. Breach reminders are
--       platform settings with defaults (CERT-In 6 hours; DPDP Rules 2025 detailed Board report 72 hours, marked verify).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.company.contain', 'Contain a company after a suspected compromise, and lift it (YukthiX staff, two people to lift)'),
  (gen_random_uuid(), 'platform.flags.manage', 'Set feature switches for every company or one company, and use the kill switch (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" IN ('platform.company.contain', 'platform.flags.manage')
ON CONFLICT DO NOTHING;

-- Platform settings: YukthiX-wide values with defaults (staff only).
CREATE TABLE "platform_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "verify" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
INSERT INTO "platform_settings" ("key", "value", "label", "verify") VALUES
  ('breach.certin_hours', '6', 'CERT-In: report a cyber security incident within (hours)', false),
  ('breach.dpdp_board_report_hours', '72', 'DPDP Rules 2025: detailed report of a personal data breach to the Data Protection Board within (hours); the Board and the people affected are told without delay', true);
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_only ON "platform_settings" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "platform_settings" FROM app_runtime;

-- Feature switches: read by every company (the app decides with them), written only by staff.
CREATE TABLE "feature_flags" (
    "key" VARCHAR(60) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "setting_key" VARCHAR(100),
    "default_on" BOOLEAN NOT NULL DEFAULT true,
    "killed_at" TIMESTAMPTZ(3),
    "killed_by" UUID,
    "kill_reason" VARCHAR(500),
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "feature_flags_kill_check" CHECK (("killed_at" IS NULL) = ("killed_by" IS NULL) AND ("killed_at" IS NULL) = ("kill_reason" IS NULL))
);
INSERT INTO "feature_flags" ("key", "label", "description", "setting_key") VALUES
  ('help.tours', 'First-run tours', 'Help › Tours: the first-run tours on each person''s first sign-in', 'help.tours.show'),
  ('help.whats_new', 'What''s new', 'Help › What''s new: the entries YukthiX writes for each release', 'help.whats_new.show'),
  ('access.requests', 'Access requests', 'Request access from a "You don''t have access" page', 'access.request.allowed'),
  ('policy.ai_writer', 'Write policies with AI', 'Helpdesk › Write policies with AI uses the company''s AI; off falls back to the YukthiX starters', 'policy.ai_writer');
ALTER TABLE "feature_flags" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY read_all ON "feature_flags" FOR SELECT USING (true);
CREATE POLICY staff_write ON "feature_flags" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "feature_flags" FROM app_runtime;

CREATE TABLE "feature_flag_overrides" (
    "organization_id" UUID NOT NULL,
    "flag_key" VARCHAR(60) NOT NULL,
    "is_on" BOOLEAN NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("organization_id", "flag_key"),
    CONSTRAINT "feature_flag_overrides_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "feature_flag_overrides_flag_fkey" FOREIGN KEY ("flag_key") REFERENCES "feature_flags"("key"),
    CONSTRAINT "feature_flag_overrides_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "feature_flag_overrides" FOR SELECT USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY staff_write ON "feature_flag_overrides" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));

-- Containment: one open per company; the company reads its own (the banner and the holds), only staff write.
CREATE TABLE "company_containments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "contained_by" UUID NOT NULL,
    "contained_by_name" VARCHAR(200) NOT NULL,
    "contained_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certin_due_at" TIMESTAMPTZ(3) NOT NULL,
    "dpdp_due_at" TIMESTAMPTZ(3) NOT NULL,
    "signed_out" INTEGER NOT NULL DEFAULT 0,
    "apps_revoked" INTEGER NOT NULL DEFAULT 0,
    "lift_requested_by" UUID,
    "lift_requested_by_name" VARCHAR(200),
    "lift_requested_at" TIMESTAMPTZ(3),
    "lift_reason" VARCHAR(500),
    "lifted_by" UUID,
    "lifted_by_name" VARCHAR(200),
    "lifted_at" TIMESTAMPTZ(3),
    CONSTRAINT "company_containments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_containments_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "company_containments_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500),
    CONSTRAINT "company_containments_request_check" CHECK (("lift_requested_at" IS NULL) = ("lift_requested_by" IS NULL) AND ("lift_requested_at" IS NULL) = ("lift_reason" IS NULL)),
    CONSTRAINT "company_containments_lift_check" CHECK (("lifted_at" IS NULL) = ("lifted_by" IS NULL) AND ("lifted_at" IS NULL OR "lift_requested_at" IS NOT NULL)),
    -- Lifting takes two different staff members.
    CONSTRAINT "company_containments_two_people_check" CHECK ("lifted_by" IS NULL OR "lifted_by" <> "lift_requested_by")
);
CREATE UNIQUE INDEX "company_containments_open_key" ON "company_containments"("organization_id") WHERE "lifted_at" IS NULL;
ALTER TABLE "company_containments" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "company_containments" FOR SELECT USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY staff_write ON "company_containments" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "company_containments" FROM app_runtime;
