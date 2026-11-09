-- Staffing desk, slice 1 (HIR-14 clients, HIR-15 rate cards, Settings 6.2): the foundation slices 2 and 3 stand on.
-- A staffing company's clients with their contacts, contract and SLAs; dated rate cards per client (bill and pay rates in
-- paise, OT and holiday multipliers); invoice number series per GSTIN and financial year (used by the invoices of
-- slice 3). Two keys: ats.staffing.manage (account managers: clients, contacts, pay rates and margins, invoice series)
-- and ats.staffing.view (recruiters: clients and bill rates only). The GST state codes are data (a rule set), never code.
CREATE TABLE "staffing_clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "legal_name" VARCHAR(200),
    "gstin" VARCHAR(15),
    -- ISO 3166-2 state of the billing address (IN-KA): the place of supply.
    "state" VARCHAR(5) NOT NULL,
    "billing_address" VARCHAR(500) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'onboarding',
    "account_manager_user_id" UUID,
    -- Null: the company default (setting staffing.payment_terms_days).
    "payment_terms_days" INTEGER,
    "contract_start" DATE,
    "contract_end" DATE,
    "notice_days" INTEGER,
    "sla_first_submission_days" INTEGER,
    "sla_feedback_days" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_clients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_clients_status_check" CHECK ("status" IN ('onboarding', 'active', 'on_hold')),
    CONSTRAINT "staffing_clients_terms_check" CHECK ("payment_terms_days" IS NULL OR "payment_terms_days" BETWEEN 0 AND 180),
    CONSTRAINT "staffing_clients_contract_check" CHECK ("contract_end" IS NULL OR "contract_start" IS NULL OR "contract_end" >= "contract_start"),
    CONSTRAINT "staffing_clients_notice_check" CHECK ("notice_days" IS NULL OR "notice_days" BETWEEN 0 AND 365),
    CONSTRAINT "staffing_clients_sla_check" CHECK (("sla_first_submission_days" IS NULL OR "sla_first_submission_days" BETWEEN 1 AND 60) AND ("sla_feedback_days" IS NULL OR "sla_feedback_days" BETWEEN 1 AND 60))
);
CREATE UNIQUE INDEX "staffing_clients_name_key" ON "staffing_clients" ("organization_id", lower("name"));
CREATE UNIQUE INDEX "staffing_clients_gstin_key" ON "staffing_clients" ("organization_id", "gstin") WHERE "gstin" IS NOT NULL;

CREATE TABLE "staffing_client_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" VARCHAR(120) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(16),
    "billing" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_client_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staffing_client_contacts_email_key" ON "staffing_client_contacts" ("client_id", "email") WHERE "archived_at" IS NULL;
CREATE INDEX "staffing_client_contacts_client_idx" ON "staffing_client_contacts" ("organization_id", "client_id");

CREATE TABLE "staffing_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    -- One rate-card line (role, skill, location) across its dated versions.
    "line_id" UUID NOT NULL,
    "role" VARCHAR(120) NOT NULL,
    "skill" VARCHAR(200) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(6) NOT NULL,
    "bill_rate_paise" BIGINT NOT NULL,
    "pay_rate_paise" BIGINT NOT NULL,
    "ot_multiplier" DECIMAL(4,2) NOT NULL,
    "holiday_multiplier" DECIMAL(4,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "reason" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_rates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_rates_unit_check" CHECK ("unit" IN ('hour', 'day', 'month')),
    CONSTRAINT "staffing_rates_money_check" CHECK ("bill_rate_paise" > 0 AND "pay_rate_paise" > 0 AND "pay_rate_paise" <= "bill_rate_paise"),
    CONSTRAINT "staffing_rates_multiplier_check" CHECK ("ot_multiplier" BETWEEN 1 AND 3 AND "holiday_multiplier" BETWEEN 1 AND 3),
    CONSTRAINT "staffing_rates_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
-- One current version per line.
CREATE UNIQUE INDEX "staffing_rates_line_current_key" ON "staffing_rates" ("line_id") WHERE "valid_to" IS NULL;
CREATE INDEX "staffing_rates_client_idx" ON "staffing_rates" ("organization_id", "client_id", "line_id", "valid_from");

CREATE TABLE "staffing_invoice_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "gstin" VARCHAR(15) NOT NULL,
    -- Indian financial year, e.g. 2026-27.
    "financial_year" VARCHAR(7) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_invoice_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_invoice_series_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_invoice_series_next_check" CHECK ("next_number" BETWEEN 1 AND 99999999),
    CONSTRAINT "staffing_invoice_series_fy_check" CHECK ("financial_year" ~ '^[0-9]{4}-[0-9]{2}$')
);
-- CGST Rules 2017 r.46(b): one consecutive series per GSTIN per financial year.
CREATE UNIQUE INDEX "staffing_invoice_series_key" ON "staffing_invoice_series" ("organization_id", "gstin", "financial_year");

ALTER TABLE "staffing_clients" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_clients"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "staffing_client_contacts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_client_contacts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "staffing_rates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_rates"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "staffing_invoice_series" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_invoice_series"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Data: the keys, the System Admin role, and the GST state codes.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'ats.staffing.manage', 'Staffing desk: clients, contacts, rate cards with pay rates and margins, invoice series'),
  (gen_random_uuid(), 'ats.staffing.view', 'Staffing desk: read clients and their bill rates (no pay rates or margins)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" IN ('ats.staffing.manage', 'ats.staffing.view')
ON CONFLICT DO NOTHING;

-- GST state codes (the first two characters of a GSTIN) as published by GSTN, mapped to ISO states. Verify yearly.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('GST.STATE_CODES', 'IN', '2026-v1', '2017-07-01',
   '{"01":"IN-JK","02":"IN-HP","03":"IN-PB","04":"IN-CH","05":"IN-UK","06":"IN-HR","07":"IN-DL","08":"IN-RJ","09":"IN-UP","10":"IN-BR","11":"IN-SK","12":"IN-AR","13":"IN-NL","14":"IN-MN","15":"IN-MZ","16":"IN-TR","17":"IN-ML","18":"IN-AS","19":"IN-WB","20":"IN-JH","21":"IN-OD","22":"IN-CG","23":"IN-MP","24":"IN-GJ","25":"IN-DH","26":"IN-DH","27":"IN-MH","29":"IN-KA","30":"IN-GA","31":"IN-LD","32":"IN-KL","33":"IN-TN","34":"IN-PY","35":"IN-AN","36":"IN-TS","37":"IN-AP","38":"IN-LA"}',
   'GST state codes published by GSTN (CGST Rules 2017, Form GST REG-06 first two digits). 25 and 26 are Dadra and Nagar Haveli and Daman and Diu (merged 2020); 37 is Andhra Pradesh after 2014; 97 (other territory) has no state. Verify with the GST portal list.', true);
