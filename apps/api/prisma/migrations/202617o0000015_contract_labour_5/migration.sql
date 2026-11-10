-- Contract labour CL-5 (answers 622, 625, 673, 681, 684, 686, 735, 742). Contract workers' attendance per day: kiosk
-- punches (the gate pass number and a kiosk PIN of their own) where the site has a kiosk, otherwise the contractor's
-- entry on the portal; our site in-charge confirms the month, which locks it. The principal-employer registrations per
-- site (Settings 4.9). The highest number of contract workers on any day of the last 12 months per site, kept nightly.
-- The worker's photo for the gate pass card.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "contract_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "in_at" TIMESTAMPTZ(3),
    "out_at" TIMESTAMPTZ(3),
    "entered_by_contact" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_attendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_attendance_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "contract_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_attendance_source_check" CHECK ("source" IN ('kiosk', 'contractor'))
);
CREATE UNIQUE INDEX "contract_attendance_key" ON "contract_attendance" ("deployment_id", "work_on");
CREATE INDEX "contract_attendance_org_idx" ON "contract_attendance" ("organization_id", "work_on");

CREATE TABLE "contract_attendance_confirmations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "confirmed_by" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_attendance_confirmations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_attendance_confirmations_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_attendance_confirmations_month_check" CHECK (EXTRACT(DAY FROM "month") = 1)
);
CREATE UNIQUE INDEX "contract_attendance_confirmations_key" ON "contract_attendance_confirmations" ("organization_id", "agency_id", "location_id", "month");

CREATE TABLE "contract_kiosk_pins" (
    "organization_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "pin_hash" VARCHAR(200) NOT NULL,
    "failed" SMALLINT NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_kiosk_pins_pkey" PRIMARY KEY ("deployment_id"),
    CONSTRAINT "contract_kiosk_pins_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "contract_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "clra_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "registration_no" VARCHAR(60) NOT NULL,
    "max_workers" INTEGER NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "clra_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clra_registrations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "clra_registrations_max_check" CHECK ("max_workers" BETWEEN 1 AND 100000)
);
CREATE UNIQUE INDEX "clra_registrations_site_key" ON "clra_registrations" ("organization_id", "location_id") WHERE "removed_at" IS NULL;

CREATE TABLE "clra_site_peaks" (
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "peak" INTEGER NOT NULL,
    "peak_on" DATE,
    "evaluated_on" DATE NOT NULL,
    CONSTRAINT "clra_site_peaks_pkey" PRIMARY KEY ("organization_id", "location_id"),
    CONSTRAINT "clra_site_peaks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "contract_deployments" ADD COLUMN "photo_file_id" UUID REFERENCES "files"("id") ON DELETE SET NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_attendance', 'contract_attendance_confirmations', 'contract_kiosk_pins', 'clra_registrations', 'clra_site_peaks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
  END LOOP;
END $$;
