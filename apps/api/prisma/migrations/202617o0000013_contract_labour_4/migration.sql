-- Contract labour CL-4 (answers 626, 634, 685; CLB-03, T9-13 packs and bills). Each month a contractor uploads, per site,
-- the wage register (with each worker's days and wage paid), the wage payment (bank) proof, and the PF and ESI challans
-- (with the workers covered and the amount). The compliance owner verifies each proof or raises a discrepancy. The wage
-- check compares each worker's pay with the site's minimum wage (the IN.MW rule sets, verify); shortfalls are liability
-- alerts. A worker the company pays itself is recorded and recovered from the contractor's next PAY 8 bill
-- (consultant_invoices.clra_recovery). A contractor's bill is held while a month's proofs are overdue or disputed; only
-- the compliance owner releases a month, with a reason.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "contractor_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_packs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_packs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_packs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_packs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contractor_packs_month_check" CHECK (EXTRACT(DAY FROM "month") = 1)
);
CREATE UNIQUE INDEX "contractor_packs_key" ON "contractor_packs" ("organization_id", "agency_id", "location_id", "month");

CREATE TABLE "contractor_pack_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "kind" VARCHAR(14) NOT NULL,
    "file_id" UUID NOT NULL,
    "state" VARCHAR(12) NOT NULL DEFAULT 'submitted',
    "workers_covered" INTEGER,
    "amount_paise" BIGINT,
    "note" VARCHAR(500),
    "uploaded_by_contact" UUID,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "contractor_pack_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_pack_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "contractor_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_pack_items_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contractor_pack_items_kind_check" CHECK ("kind" IN ('pf_challan', 'esi_challan', 'wage_register', 'bank_proof')),
    CONSTRAINT "contractor_pack_items_state_check" CHECK ("state" IN ('submitted', 'verified', 'discrepancy')),
    CONSTRAINT "contractor_pack_items_challan_check" CHECK (("kind" IN ('pf_challan', 'esi_challan')) = ("workers_covered" IS NOT NULL AND "amount_paise" IS NOT NULL)),
    CONSTRAINT "contractor_pack_items_numbers_check" CHECK (("workers_covered" IS NULL OR "workers_covered" >= 0) AND ("amount_paise" IS NULL OR "amount_paise" >= 0)),
    CONSTRAINT "contractor_pack_items_discrepancy_check" CHECK ("state" <> 'discrepancy' OR "note" IS NOT NULL)
);
CREATE UNIQUE INDEX "contractor_pack_items_key" ON "contractor_pack_items" ("pack_id", "kind");

CREATE TABLE "contractor_wage_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "days" INTEGER NOT NULL,
    "gross_paise" BIGINT NOT NULL,
    "paid_on" DATE NOT NULL,
    CONSTRAINT "contractor_wage_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_wage_lines_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "contractor_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_wage_lines_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "contract_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_wage_lines_days_check" CHECK ("days" BETWEEN 0 AND 31),
    CONSTRAINT "contractor_wage_lines_gross_check" CHECK ("gross_paise" >= 0)
);
CREATE UNIQUE INDEX "contractor_wage_lines_key" ON "contractor_wage_lines" ("pack_id", "deployment_id");

CREATE TABLE "contractor_hold_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "released_by" UUID NOT NULL,
    "released_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_hold_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_hold_releases_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_hold_releases_month_check" CHECK (EXTRACT(DAY FROM "month") = 1)
);
CREATE UNIQUE INDEX "contractor_hold_releases_key" ON "contractor_hold_releases" ("organization_id", "agency_id", "month");

CREATE TABLE "contractor_direct_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "deployment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "paid_on" DATE NOT NULL,
    "reference" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "recovered_invoice_id" UUID,
    "recovered_paise" BIGINT NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_direct_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_direct_payments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_direct_payments_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "contract_deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_direct_payments_amount_check" CHECK ("amount_paise" > 0 AND "recovered_paise" BETWEEN 0 AND "amount_paise")
);
CREATE INDEX "contractor_direct_payments_agency_idx" ON "contractor_direct_payments" ("organization_id", "agency_id");

ALTER TABLE "consultant_invoices" ADD COLUMN "clra_recovery" DECIMAL(14,2) NOT NULL DEFAULT 0;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contractor_packs', 'contractor_pack_items', 'contractor_wage_lines', 'contractor_hold_releases', 'contractor_direct_payments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
  END LOOP;
END $$;
