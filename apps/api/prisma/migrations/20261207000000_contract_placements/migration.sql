-- Contract workers and placements (founder decision 21 Oct 2026): the People Directory's designed "Contract workers" and
-- "Placements" cards from real data. A contract worker and a placement are roles on the person record (person_roles),
-- like an employee. Contract labour (CLB-01, CLB-02): contractors, their licences, and deployments checked against the
-- licence (valid on the date, covering the site's state, within its maximum) and the worker's age (18 or over).
-- Placements (HIR-17): a person placed with a client, own payroll or vendor supplied.

CREATE TABLE "contractors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "work" VARCHAR(100) NOT NULL,
    "pan" VARCHAR(10),
    "contact" VARCHAR(100),
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractors_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractors_status_check" CHECK ("status" IN ('active', 'inactive')),
    CONSTRAINT "contractors_pan_check" CHECK ("pan" IS NULL OR "pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
);
CREATE UNIQUE INDEX "contractors_org_pan_key" ON "contractors"("organization_id", "pan") WHERE "pan" IS NOT NULL;

CREATE TABLE "contractor_licences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "licence_no" VARCHAR(50) NOT NULL,
    "location_id" UUID NOT NULL,
    "states" TEXT[] NOT NULL,
    "max_workers" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_licences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_licences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_max_check" CHECK ("max_workers" > 0),
    CONSTRAINT "contractor_licences_dates_check" CHECK ("valid_to" >= "valid_from"),
    CONSTRAINT "contractor_licences_states_check" CHECK (cardinality("states") > 0)
);
CREATE UNIQUE INDEX "contractor_licences_org_no_key" ON "contractor_licences"("organization_id", "licence_no");

CREATE TABLE "contract_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "licence_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "work" VARCHAR(80) NOT NULL,
    "skill" VARCHAR(12) NOT NULL,
    "wage" DECIMAL(12,2),
    "date_of_birth" DATE NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "created_by" UUID,
    "decided_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_deployments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_deployments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_licence_id_fkey" FOREIGN KEY ("licence_id") REFERENCES "contractor_licences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_skill_check" CHECK ("skill" IN ('unskilled', 'semi_skilled', 'skilled')),
    CONSTRAINT "contract_deployments_status_check" CHECK ("status" IN ('pending', 'deployed', 'released')),
    CONSTRAINT "contract_deployments_wage_check" CHECK ("wage" IS NULL OR "wage" >= 0)
);
CREATE INDEX "contract_deployments_org_status_idx" ON "contract_deployments"("organization_id", "status");
-- One open deployment per person (not already deployed by another contractor).
CREATE UNIQUE INDEX "contract_deployments_open_person_key" ON "contract_deployments"("organization_id", "person_id") WHERE "status" <> 'released';

CREATE TABLE "placements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "client" VARCHAR(150) NOT NULL,
    "role" VARCHAR(100) NOT NULL,
    "start_on" DATE NOT NULL,
    "end_on" DATE NOT NULL,
    "bill_rate" DECIMAL(12,2) NOT NULL,
    "pay_rate" DECIMAL(12,2) NOT NULL,
    "statutory_per_hour" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "supply" VARCHAR(8) NOT NULL,
    "vendor" VARCHAR(150),
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "ended_on" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "placements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "placements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "placements_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "placements_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "placements_supply_check" CHECK ("supply" IN ('own', 'vendor')),
    CONSTRAINT "placements_vendor_check" CHECK (("supply" = 'vendor') = ("vendor" IS NOT NULL)),
    CONSTRAINT "placements_status_check" CHECK ("status" IN ('active', 'ended')),
    CONSTRAINT "placements_dates_check" CHECK ("end_on" >= "start_on"),
    CONSTRAINT "placements_rates_check" CHECK ("bill_rate" >= 0 AND "pay_rate" >= 0 AND "statutory_per_hour" >= 0)
);
CREATE INDEX "placements_org_status_idx" ON "placements"("organization_id", "status");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contractors', 'contractor_licences', 'contract_deployments', 'placements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- A placement is a role on the person record too.
ALTER TABLE "person_roles" DROP CONSTRAINT "person_roles_type_check";
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_type_check" CHECK ("role_type" IN ('applicant', 'candidate', 'campus_registrant', 'test_taker', 'preboarder', 'employee', 'alumnus', 'nominee', 'consultant', 'contract_worker', 'vendor_worker', 'placement', 'external_login', 'login'));

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'clra.worker.view', 'See contractors, their licences and the contract workers deployed in scope'),
  (gen_random_uuid(), 'clra.worker.manage', 'Add contractors and licences, deploy contract workers (licence and age checked), approve and release them'),
  (gen_random_uuid(), 'staffing.placement.view', 'See placements with clients, their rates and margins, for the legal entities in scope'),
  (gen_random_uuid(), 'staffing.placement.manage', 'Create placements with clients and end them')
ON CONFLICT DO NOTHING;
-- P02 §4.2 System Admin, like the other people modules.
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('clra.worker.view', 'clra.worker.manage', 'staffing.placement.view', 'staffing.placement.manage')
ON CONFLICT DO NOTHING;
