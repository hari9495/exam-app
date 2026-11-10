-- Contract labour CL-8 (CLB-06, CLB-07, CLB-08; founder answers 638, 639): we are the contractor. Our staff work at a
-- client's establishment through the staffing desk (staffing_clients, staffing_placements); the client is the principal
-- employer. A client site carries the client's registration number. Our own licences are rows of the same licence
-- table, owned by our legal entity instead of a contractor (agency). A placement past our licence maximum at the site is
-- blocked. Each month a client pack is made from our payroll and attendance for the employees placed there (the
-- registers through the payroll registers service); the upload to the client's portal is recorded by hand.

-- CLB-06: the client's establishment where our staff work.
CREATE TABLE "staffing_client_sites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "state" VARCHAR(6) NOT NULL,
    "address" VARCHAR(500),
    -- The principal employer and its registration number for this establishment (answer 638).
    "principal_name" VARCHAR(200) NOT NULL,
    "registration_no" VARCHAR(60) NOT NULL,
    -- Where the monthly pack goes (the client's vendor portal, an email…) and the day of the next month it is due.
    "pack_channel" VARCHAR(100) NOT NULL,
    "pack_due_day" INTEGER NOT NULL DEFAULT 10,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_client_sites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_client_sites_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "staffing_client_sites_client_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE RESTRICT,
    CONSTRAINT "staffing_client_sites_state_check" CHECK ("state" ~ '^IN-[A-Z]{2}$'),
    CONSTRAINT "staffing_client_sites_due_check" CHECK ("pack_due_day" BETWEEN 1 AND 28),
    CONSTRAINT "staffing_client_sites_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 200),
    CONSTRAINT "staffing_client_sites_reg_check" CHECK (char_length(btrim("registration_no")) BETWEEN 3 AND 60)
);
CREATE UNIQUE INDEX "staffing_client_sites_name_key" ON "staffing_client_sites" ("organization_id", "client_id", lower("name"));
ALTER TABLE "staffing_client_sites" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_client_sites"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- A placement of our own employee at the client's site.
ALTER TABLE "staffing_placements"
  ADD COLUMN "client_site_id" UUID,
  ADD CONSTRAINT "staffing_placements_site_fkey" FOREIGN KEY ("client_site_id") REFERENCES "staffing_client_sites"("id") ON DELETE RESTRICT;
CREATE INDEX "staffing_placements_site_idx" ON "staffing_placements" ("organization_id", "client_site_id", "status") WHERE "client_site_id" IS NOT NULL;

-- CLB-07: our own licences in the same table: the owner is our legal entity (for one client site, or for the states
-- listed when no site is named); a contractor's licence keeps its contractor and our location.
ALTER TABLE "contractor_licences"
  ALTER COLUMN "agency_id" DROP NOT NULL,
  ALTER COLUMN "location_id" DROP NOT NULL,
  ADD COLUMN "legal_entity_id" UUID,
  ADD COLUMN "client_site_id" UUID,
  ADD CONSTRAINT "contractor_licences_entity_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "contractor_licences_site_fkey" FOREIGN KEY ("client_site_id") REFERENCES "staffing_client_sites"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "contractor_licences_owner_check" CHECK (
    ("agency_id" IS NOT NULL AND "legal_entity_id" IS NULL AND "client_site_id" IS NULL AND "location_id" IS NOT NULL)
    OR ("agency_id" IS NULL AND "legal_entity_id" IS NOT NULL AND "location_id" IS NULL));
CREATE INDEX "contractor_licences_own_idx" ON "contractor_licences" ("organization_id", "legal_entity_id") WHERE "legal_entity_id" IS NOT NULL;

-- CLB-08: a client's monthly pack; its registers are statutory_registers versions (types clpk_*), made through the
-- payroll registers service; the upload to the client's portal is recorded by hand (answer 639).
CREATE TABLE "client_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_site_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "wages_register_id" UUID NOT NULL,
    "muster_register_id" UUID NOT NULL,
    "employees" INTEGER NOT NULL,
    "made_by" UUID NOT NULL,
    "made_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_on" DATE,
    "reference" VARCHAR(80),
    "recorded_by" UUID,
    "recorded_at" TIMESTAMPTZ(3),
    "ack_file_id" UUID,
    "accepted_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "client_packs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_packs_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "client_packs_site_fkey" FOREIGN KEY ("client_site_id") REFERENCES "staffing_client_sites"("id") ON DELETE RESTRICT,
    CONSTRAINT "client_packs_ack_fkey" FOREIGN KEY ("ack_file_id") REFERENCES "files"("id") ON DELETE RESTRICT,
    CONSTRAINT "client_packs_month_check" CHECK (EXTRACT(DAY FROM "month") = 1),
    CONSTRAINT "client_packs_upload_check" CHECK (("uploaded_on" IS NULL) = ("reference" IS NULL) AND ("uploaded_on" IS NULL) = ("recorded_at" IS NULL)),
    CONSTRAINT "client_packs_accepted_check" CHECK (("accepted_at" IS NULL) = ("ack_file_id" IS NULL) AND ("accepted_at" IS NULL OR "uploaded_on" IS NOT NULL))
);
CREATE UNIQUE INDEX "client_packs_key" ON "client_packs" ("organization_id", "client_site_id", "month");
ALTER TABLE "client_packs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "client_packs"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
