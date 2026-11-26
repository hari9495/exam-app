-- IT assets part 3 (founder answer 2717, 26 Nov 2026): asset contracts. A contract has a type, a number, a supplier from
-- the IT and Admin list, an optional place (legal entity or location; none = company-wide), a start and a length in
-- months (the end date follows: the day before start + length; each renewal adds one more length), tacit or express
-- renewal, a notice period in days, support hours, a value (money, like an asset's cost) and the assets it covers, with
-- an optional cap on how many. Contracts are never deleted; an express contract past its end is "ended".
CREATE TABLE "asset_contracts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind" VARCHAR(16) NOT NULL,
  "number" VARCHAR(60) NOT NULL,
  "supplier_id" UUID NOT NULL,
  "legal_entity_id" UUID,
  "location_id" UUID,
  "starts_on" DATE NOT NULL,
  "months" SMALLINT NOT NULL,
  "renewal" VARCHAR(8) NOT NULL,
  "notice_days" SMALLINT NOT NULL DEFAULT 0,
  "support_hours" VARCHAR(120),
  "value" DECIMAL(14,2),
  "asset_cap" SMALLINT,
  "renewals" SMALLINT NOT NULL DEFAULT 0,
  "ends_on" DATE NOT NULL,
  "status" VARCHAR(8) NOT NULL DEFAULT 'active',
  "notice_alerted_for" DATE,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_contracts_org_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "asset_contracts_supplier_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "it_suppliers"("organization_id", "id"),
  CONSTRAINT "asset_contracts_kind_check" CHECK ("kind" IN ('amc', 'support', 'lease', 'insurance', 'subscription', 'other')),
  CONSTRAINT "asset_contracts_months_check" CHECK ("months" BETWEEN 1 AND 120),
  CONSTRAINT "asset_contracts_renewal_check" CHECK ("renewal" IN ('tacit', 'express')),
  CONSTRAINT "asset_contracts_notice_check" CHECK ("notice_days" BETWEEN 0 AND 365),
  CONSTRAINT "asset_contracts_value_check" CHECK ("value" IS NULL OR "value" >= 0),
  CONSTRAINT "asset_contracts_cap_check" CHECK ("asset_cap" IS NULL OR "asset_cap" BETWEEN 1 AND 10000),
  CONSTRAINT "asset_contracts_status_check" CHECK ("status" IN ('active', 'ended')),
  CONSTRAINT "asset_contracts_ends_check" CHECK ("ends_on" >= "starts_on")
);
-- One contract per number with the same supplier.
CREATE UNIQUE INDEX "asset_contracts_number_key" ON "asset_contracts" ("organization_id", "supplier_id", lower("number"));
CREATE INDEX "asset_contracts_ends_idx" ON "asset_contracts" ("status", "ends_on");

CREATE TABLE "asset_contract_assets" (
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contract_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "added_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_contract_assets_pkey" PRIMARY KEY ("contract_id", "asset_id"),
  CONSTRAINT "asset_contract_assets_contract_fkey" FOREIGN KEY ("organization_id", "contract_id") REFERENCES "asset_contracts"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "asset_contract_assets_asset_fkey" FOREIGN KEY ("organization_id", "asset_id") REFERENCES "assets"("organization_id", "id") ON DELETE CASCADE
);
CREATE INDEX "asset_contract_assets_asset_idx" ON "asset_contract_assets" ("organization_id", "asset_id");

REVOKE DELETE, TRUNCATE ON TABLE "asset_contracts" FROM app_runtime;
REVOKE TRUNCATE ON TABLE "asset_contract_assets" FROM app_runtime;
ALTER TABLE "asset_contracts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asset_contracts" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "asset_contracts" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);
ALTER TABLE "asset_contract_assets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asset_contract_assets" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "asset_contract_assets" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);
