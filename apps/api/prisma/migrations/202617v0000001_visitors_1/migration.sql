-- Visitors slice 1 (M02 §B11, YX-AT-22; founder answers 601-617): hosts invite visitors; the visitor confirms on a
-- link page (privacy notice) and gets a QR pass; reception checks them in and out per location; the log; visits are
-- deleted after the location's retention period (608), with counts kept without names for reports; visits nobody
-- checked out are closed at the end of their window (611). Never a full ID number (603: type and last 4 only, slice 3).

CREATE TABLE "visits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "host_user_id" UUID NOT NULL,
    "visitor_name" VARCHAR(200) NOT NULL,
    "visitor_mobile" VARCHAR(20) NOT NULL,
    "visitor_email" VARCHAR(254),
    "visitor_company" VARCHAR(200),
    "purpose" VARCHAR(20) NOT NULL,
    "vehicle" VARCHAR(20),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    -- expected, on_site, checked_out, not_out (611: nobody checked them out), no_show, cancelled
    "status" VARCHAR(12) NOT NULL DEFAULT 'expected',
    -- The visitor's link (unguessable) and the pass code the QR carries (short, unique in the company).
    "pass_token" VARCHAR(64) NOT NULL,
    "pass_code" VARCHAR(16) NOT NULL,
    "badge_seq" INTEGER,
    "notice_version" VARCHAR(40),
    "notice_accepted_at" TIMESTAMPTZ(3),
    "notice_accepted_via" VARCHAR(6),
    "checked_in_at" TIMESTAMPTZ(3),
    "checked_in_by" UUID,
    "checked_out_at" TIMESTAMPTZ(3),
    "checked_out_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visits_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "visits_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "visits_host_fkey" FOREIGN KEY ("organization_id", "host_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "visits_status_check" CHECK ("status" IN ('expected', 'on_site', 'checked_out', 'not_out', 'no_show', 'cancelled')),
    CONSTRAINT "visits_purpose_check" CHECK ("purpose" IN ('meeting', 'interview', 'vendor', 'audit', 'delivery', 'maintenance')),
    CONSTRAINT "visits_window_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "visits_via_check" CHECK ("notice_accepted_via" IS NULL OR "notice_accepted_via" IN ('link', 'desk')),
    CONSTRAINT "visits_name_check" CHECK (char_length(btrim("visitor_name")) BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX "visits_pass_token_key" ON "visits" ("pass_token");
CREATE UNIQUE INDEX "visits_pass_code_key" ON "visits" ("organization_id", "pass_code");
CREATE INDEX "visits_desk_idx" ON "visits" ("organization_id", "location_id", "starts_at");
CREATE INDEX "visits_host_idx" ON "visits" ("organization_id", "host_user_id", "starts_at" DESC);
CREATE INDEX "visits_open_idx" ON "visits" ("ends_at") WHERE "status" IN ('expected', 'on_site');
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visits"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- 608: what is left of a deleted visit, for reports: counts by location, day and purpose, never a name.
CREATE TABLE "visit_counts" (
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "visits" INTEGER NOT NULL,
    CONSTRAINT "visit_counts_pkey" PRIMARY KEY ("organization_id", "location_id", "day", "purpose"),
    CONSTRAINT "visit_counts_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "visit_counts_visits_check" CHECK ("visits" >= 0)
);
ALTER TABLE "visit_counts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visit_counts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Keys (613): reception runs the desk per location; the log; Settings 3.12. Every employee may invite (no key).
SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'visitors.desk.manage', 'Visitors: the reception desk (today''s visitors, check in and out) at the locations in scope'),
  (gen_random_uuid(), 'visitors.log.view', 'Visitors: the visitor log of the locations in scope'),
  (gen_random_uuid(), 'visitors.settings.manage', 'Visitors: Settings 3.12 (what is captured, hours, notice, badge, retention)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" IN ('visitors.desk.manage', 'visitors.log.view', 'visitors.settings.manage')
ON CONFLICT DO NOTHING;
