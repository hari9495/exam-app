-- IT assets part 5 (founder answer 2715, 26 Nov 2026): asset booking. IT (asset.manage of the asset's place) marks an
-- in-stock asset "bookable" (spare laptops, projectors). Any employee books one for themselves for a period (a company
-- setting caps the days), with daily or weekly repeats (each occurrence its own row, sharing series_id). A company
-- setting can require IT's approval (status pending until an asset manager approves or declines with a reason). IT hands
-- it over (an asset_assignment, as the register's Issue does: status out) and takes it back (the assignment's return:
-- status returned). Two live bookings of one asset never overlap (exclusion constraint). due_reminded_at and
-- overdue_alerted_at: the daily sweep told the person (the day before it is due back) and IT (overdue), once each.
ALTER TABLE "assets" ADD COLUMN "bookable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "asset_bookings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "asset_id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "series_id" UUID,
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "status" VARCHAR(10) NOT NULL,
  "purpose" VARCHAR(200),
  "decided_by" UUID,
  "decided_at" TIMESTAMPTZ(3),
  "decline_reason" VARCHAR(300),
  "cancelled_by" UUID,
  "cancel_reason" VARCHAR(300),
  "assignment_id" UUID,
  "due_reminded_at" TIMESTAMPTZ(3),
  "overdue_alerted_at" TIMESTAMPTZ(3),
  "created_by" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_bookings_org_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "asset_bookings_asset_fkey" FOREIGN KEY ("organization_id", "asset_id") REFERENCES "assets"("organization_id", "id"),
  CONSTRAINT "asset_bookings_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
  CONSTRAINT "asset_bookings_assignment_fkey" FOREIGN KEY ("organization_id", "assignment_id") REFERENCES "asset_assignments"("organization_id", "id"),
  CONSTRAINT "asset_bookings_status_check" CHECK ("status" IN ('pending', 'booked', 'declined', 'cancelled', 'out', 'returned')),
  CONSTRAINT "asset_bookings_dates_check" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "asset_bookings_out_check" CHECK (("status" IN ('out', 'returned')) = ("assignment_id" IS NOT NULL)),
  -- One live booking of an asset per day (pending, booked or out).
  CONSTRAINT "asset_bookings_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "asset_id" WITH =, daterange("starts_on", "ends_on", '[]') WITH &&) WHERE ("status" IN ('pending', 'booked', 'out'))
);
CREATE INDEX "asset_bookings_person_idx" ON "asset_bookings" ("organization_id", "person_id");
CREATE INDEX "asset_bookings_asset_idx" ON "asset_bookings" ("organization_id", "asset_id");
CREATE INDEX "asset_bookings_series_idx" ON "asset_bookings" ("organization_id", "series_id");
CREATE INDEX "asset_bookings_ends_idx" ON "asset_bookings" ("ends_on");

REVOKE DELETE, TRUNCATE ON TABLE "asset_bookings" FROM app_runtime;
ALTER TABLE "asset_bookings" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asset_bookings" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "asset_bookings" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);
