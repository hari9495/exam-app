-- Visitors slice 3 (M02 §B11; founder answers 603, 605, 614): the watch-list (blocked visitors), ID proof (type and
-- last 4 only, never a full Aadhaar number; an ID image only where the location asks, deleted after its ID retention
-- period) and visitors under 18 (only with a named adult; no photo and no ID for them).
-- A blocked visit keeps its status (expected) and gets blocked_at: the status list is left alone so slice 2 can add
-- its walk-in statuses without the two slices rewriting the same check.

ALTER TABLE "visits"
  ADD COLUMN "blocked_at" TIMESTAMPTZ(3),
  ADD COLUMN "id_type" VARCHAR(20),
  ADD COLUMN "id_last4" VARCHAR(4),
  ADD COLUMN "id_file_id" UUID,
  ADD COLUMN "id_captured_at" TIMESTAMPTZ(3),
  ADD COLUMN "minor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minor_adult" VARCHAR(200),
  ADD COLUMN "adult_confirmed_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "visits_id_type_check" CHECK ("id_type" IS NULL OR "id_type" IN ('aadhaar', 'driving_licence', 'passport', 'voter_id', 'pan', 'company_id', 'other')),
  -- 603: never more than the last 4 characters of an ID number.
  ADD CONSTRAINT "visits_id_last4_check" CHECK ("id_last4" IS NULL OR "id_last4" ~ '^[A-Z0-9]{4}$'),
  ADD CONSTRAINT "visits_id_pair_check" CHECK (("id_type" IS NULL) = ("id_last4" IS NULL)),
  -- An Aadhaar card shows the full number, so no image of one is kept (UIDAI).
  ADD CONSTRAINT "visits_id_image_check" CHECK ("id_file_id" IS NULL OR ("id_type" IS NOT NULL AND "id_type" <> 'aadhaar')),
  -- 614: under 18 only with a named adult, and no ID for them.
  ADD CONSTRAINT "visits_minor_check" CHECK (NOT "minor" OR (char_length(btrim(coalesce("minor_adult", ''))) BETWEEN 2 AND 200 AND "id_type" IS NULL AND "id_file_id" IS NULL)),
  ADD CONSTRAINT "visits_id_file_fkey" FOREIGN KEY ("id_file_id") REFERENCES "files"("id") ON DELETE SET NULL;
CREATE INDEX "visits_id_kept_idx" ON "visits" ("organization_id", "location_id", "ends_at") WHERE "id_type" IS NOT NULL OR "id_file_id" IS NOT NULL;

-- 605: the watch-list. Matched by mobile number, then by name; only the watch-list key sees it and the reasons.
-- Each entry is reviewed every review period (Settings 3.12) or it lapses and is deleted by the nightly sweep.
CREATE TABLE "visitor_watchlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    -- Lower case, single spaces: what a visitor's name is matched on.
    "name_key" VARCHAR(200) NOT NULL,
    "mobile" VARCHAR(20),
    "reason" VARCHAR(500) NOT NULL,
    "added_by" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_by" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "visitor_watchlist_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visitor_watchlist_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "visitor_watchlist_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 200),
    CONSTRAINT "visitor_watchlist_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 5 AND 500)
);
CREATE INDEX "visitor_watchlist_mobile_idx" ON "visitor_watchlist" ("organization_id", "mobile");
CREATE INDEX "visitor_watchlist_name_idx" ON "visitor_watchlist" ("organization_id", "name_key");
CREATE INDEX "visitor_watchlist_review_idx" ON "visitor_watchlist" ("review_by");
ALTER TABLE "visitor_watchlist" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visitor_watchlist"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'visitors.watchlist.manage', 'Visitors: the blocked-visitor watch-list and its reasons (add, review, remove), company-wide')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'visitors.watchlist.manage'
ON CONFLICT DO NOTHING;
