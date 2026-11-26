-- IT assets part 4 (founder answer 2718, 26 Nov 2026): software licences. A licence names the software, a version, an
-- optional supplier from the IT and Admin list, an optional place (legal entity or location; none = company-wide, like a
-- contract), the seats bought, an optional expiry date, a cost (money, like an asset's cost) and an "allow over quota"
-- switch. Seats go to a person or a device (an asset) and are counted; there is no install scan. A seat is freed, never
-- deleted. A leaver's seat is an exit clearance item; clearing it frees the seat. expiry_alerted_for: the expiry date
-- whose alert the asset managers were told about.
CREATE TABLE "asset_licences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "software" VARCHAR(120) NOT NULL,
  "software_version" VARCHAR(60),
  "supplier_id" UUID,
  "legal_entity_id" UUID,
  "location_id" UUID,
  "seats" INTEGER NOT NULL,
  "expires_on" DATE,
  "cost" DECIMAL(14,2),
  "allow_over_quota" BOOLEAN NOT NULL DEFAULT false,
  "expiry_alerted_for" DATE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_licences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_licences_org_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "asset_licences_supplier_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "it_suppliers"("organization_id", "id"),
  CONSTRAINT "asset_licences_seats_check" CHECK ("seats" BETWEEN 1 AND 100000),
  CONSTRAINT "asset_licences_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0)
);
CREATE INDEX "asset_licences_expires_idx" ON "asset_licences" ("expires_on");

CREATE TABLE "asset_licence_seats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "licence_id" UUID NOT NULL,
  "person_id" UUID,
  "asset_id" UUID,
  "given_on" DATE NOT NULL,
  "given_by" UUID,
  "freed_on" DATE,
  "freed_by" UUID,
  "free_reason" VARCHAR(200),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_licence_seats_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_licence_seats_org_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "asset_licence_seats_licence_fkey" FOREIGN KEY ("organization_id", "licence_id") REFERENCES "asset_licences"("organization_id", "id"),
  CONSTRAINT "asset_licence_seats_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
  CONSTRAINT "asset_licence_seats_asset_fkey" FOREIGN KEY ("organization_id", "asset_id") REFERENCES "assets"("organization_id", "id"),
  -- A seat is a person's or a device's, never both.
  CONSTRAINT "asset_licence_seats_holder_check" CHECK (("person_id" IS NULL) <> ("asset_id" IS NULL)),
  CONSTRAINT "asset_licence_seats_freed_check" CHECK (("freed_on" IS NULL) = ("free_reason" IS NULL)),
  CONSTRAINT "asset_licence_seats_dates_check" CHECK ("freed_on" IS NULL OR "freed_on" >= "given_on")
);
-- One seat of a licence per person and per device at a time.
CREATE UNIQUE INDEX "asset_licence_seats_person_key" ON "asset_licence_seats" ("organization_id", "licence_id", "person_id") WHERE "freed_on" IS NULL AND "person_id" IS NOT NULL;
CREATE UNIQUE INDEX "asset_licence_seats_asset_key" ON "asset_licence_seats" ("organization_id", "licence_id", "asset_id") WHERE "freed_on" IS NULL AND "asset_id" IS NOT NULL;
CREATE INDEX "asset_licence_seats_person_idx" ON "asset_licence_seats" ("organization_id", "person_id");
CREATE INDEX "asset_licence_seats_asset_idx" ON "asset_licence_seats" ("organization_id", "asset_id");

-- A leaver's seat on the exit clearance list (IT); clearing the item frees the seat.
ALTER TABLE "clearance_items" ADD COLUMN "licence_seat_id" UUID;
ALTER TABLE "clearance_items" ADD CONSTRAINT "clearance_items_licence_seat_fkey" FOREIGN KEY ("organization_id", "licence_seat_id") REFERENCES "asset_licence_seats"("organization_id", "id");

REVOKE DELETE, TRUNCATE ON TABLE "asset_licences" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "asset_licence_seats" FROM app_runtime;
ALTER TABLE "asset_licences" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asset_licences" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "asset_licences" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);
ALTER TABLE "asset_licence_seats" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asset_licence_seats" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "asset_licence_seats" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);
