-- Locations and geofences in Time (TIM-31, founder decision 20 Oct 2026): a site has any number of allowed points
-- (a centre and a radius each), its office networks (IP ranges), its Wi-Fi names, and can bind check-in to one phone
-- per person. The points move from the single geofence on the location into their own table (one source of truth);
-- Settings › Locations shows them and links to Time to change them.
CREATE TABLE "location_fences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_fences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_fences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "location_fences_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "location_fences_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "location_fences_lat_check" CHECK ("lat" BETWEEN -90 AND 90),
    CONSTRAINT "location_fences_lng_check" CHECK ("lng" BETWEEN -180 AND 180),
    CONSTRAINT "location_fences_radius_check" CHECK ("radius_m" BETWEEN 50 AND 1000)
);
CREATE INDEX "location_fences_location_idx" ON "location_fences"("organization_id", "location_id");

ALTER TABLE "location_fences" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "location_fences"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- The one geofence each location had becomes its first point (radius kept inside the new 50–1,000 m bounds). Run as the
-- platform: under forced row-level security the copy would otherwise see no rows (20261201000001 explains).
SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "location_fences" ("organization_id", "location_id", "name", "lat", "lng", "radius_m")
SELECT "organization_id", "id", 'Main point', "geo_lat", "geo_lng", LEAST(GREATEST("geo_radius_m", 50), 1000)
FROM "locations" WHERE "geo_lat" IS NOT NULL AND "geo_lng" IS NOT NULL AND "geo_radius_m" IS NOT NULL;
-- Nothing is dropped unless every geofence was copied.
DO $$ BEGIN
  IF (SELECT count(*) FROM "locations" WHERE "geo_lat" IS NOT NULL AND "geo_lng" IS NOT NULL AND "geo_radius_m" IS NOT NULL) <> (SELECT count(*) FROM "location_fences") THEN
    RAISE EXCEPTION 'location geofences were not all copied';
  END IF;
END $$;
SELECT set_config('app.is_super_admin', 'off', true);

ALTER TABLE "locations" DROP CONSTRAINT "locations_geofence_check";
ALTER TABLE "locations" DROP COLUMN "geo_lat", DROP COLUMN "geo_lng", DROP COLUMN "geo_radius_m";
ALTER TABLE "locations" ADD COLUMN "wifi_names" TEXT[] NOT NULL DEFAULT '{}', ADD COLUMN "bind_device" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "locations" ADD CONSTRAINT "locations_wifi_names_check" CHECK (cardinality("wifi_names") <= 10);

-- The phone each person checks in from where the site binds check-in to one phone. Only a hash of the key the app
-- keeps on the phone is stored. HR resets it (the row goes) when someone changes phone.
CREATE TABLE "checkin_devices" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "device_hash" CHAR(64) NOT NULL,
    "label" VARCHAR(200),
    "bound_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_devices_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "checkin_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "checkin_devices_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id") ON DELETE CASCADE
);
REVOKE UPDATE, TRUNCATE ON TABLE "checkin_devices" FROM app_runtime;

ALTER TABLE "checkin_devices" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "checkin_devices"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- A punch refused because it came from another phone than the bound one.
ALTER TABLE "punches" DROP CONSTRAINT "punches_verdict_check";
ALTER TABLE "punches" ADD CONSTRAINT "punches_verdict_check" CHECK ("verdict" IN ('inside', 'outside', 'network', 'no_fence', 'field', 'coarse', 'no_location', 'other_phone'));
