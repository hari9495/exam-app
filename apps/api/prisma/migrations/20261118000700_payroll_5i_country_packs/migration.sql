-- Payroll batch 5i, PAY-9.10 … 9.12 (M03 YX-PAY-43 … 45, C4): the country-pack framework (a legal entity outside India is
-- paid only once its country's P07 pack is switched on after a completeness check), the UAE pack's WPS salary file (SIF)
-- and end-of-service gratuity provision, and the US pack's 1099-NEC data for contractors (no US withholding or W-2).
--   RLS as the rest of payroll; a person reads their own WPS ids and provisions; contractors' tax forms are payroll's.

CREATE TABLE "entity_country_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "settings" JSONB NOT NULL,
    "checked" JSONB NOT NULL,
    "switched_on_by" UUID NOT NULL,
    "switched_on_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_country_packs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_country_packs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entity_country_packs_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "entity_country_packs_check" CHECK ("country" ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX "entity_country_packs_key" ON "entity_country_packs" ("organization_id", "legal_entity_id");

CREATE TABLE "wps_employee_ids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "person_id" VARCHAR(14) NOT NULL,
    "routing_code" CHAR(9) NOT NULL,
    "iban_enc" TEXT NOT NULL,
    "iban_last4" CHAR(4) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wps_employee_ids_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wps_employee_ids_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wps_employee_ids_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "wps_employee_ids_check" CHECK ("person_id" ~ '^\d{14}$' AND "routing_code" ~ '^\d{9}$')
);
CREATE UNIQUE INDEX "wps_employee_ids_key" ON "wps_employee_ids" ("organization_id", "legal_entity_id", "employee_id");

CREATE TABLE "wps_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "format_version" VARCHAR(20) NOT NULL,
    "exchange_file_id" UUID NOT NULL,
    "rows" INTEGER NOT NULL,
    "total" DECIMAL(16,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wps_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wps_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wps_files_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "wps_files_check" CHECK ("rows" > 0 AND "total" > 0)
);

CREATE TABLE "eosb_provisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "basic_monthly" DECIMAL(14,2) NOT NULL,
    "service_years" DECIMAL(6,2) NOT NULL,
    "accrued" DECIMAL(14,2) NOT NULL,
    "monthly" DECIMAL(14,2) NOT NULL,
    "rule_version" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eosb_provisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eosb_provisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eosb_provisions_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "eosb_provisions_check" CHECK ("accrued" >= 0 AND extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "eosb_provisions_key" ON "eosb_provisions" ("organization_id", "employment_id", "month");

CREATE TABLE "contractor_tax_forms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "tin_kind" CHAR(3) NOT NULL,
    "tin_enc" TEXT NOT NULL,
    "tin_hash" CHAR(64) NOT NULL,
    "tin_last4" CHAR(4) NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "address" JSONB NOT NULL,
    "received_on" DATE NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_tax_forms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_tax_forms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_tax_forms_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "contractor_tax_forms_consultant_fkey" FOREIGN KEY ("consultant_id") REFERENCES "consultants"("id") ON DELETE CASCADE,
    CONSTRAINT "contractor_tax_forms_check" CHECK ("tin_kind" IN ('SSN', 'EIN'))
);
CREATE UNIQUE INDEX "contractor_tax_forms_key" ON "contractor_tax_forms" ("organization_id", "consultant_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entity_country_packs', 'wps_employee_ids', 'wps_files', 'eosb_provisions', 'contractor_tax_forms']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
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
  FOREACH t IN ARRAY ARRAY['entity_country_packs', 'wps_files', 'contractor_tax_forms']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['wps_employee_ids', 'eosb_provisions']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;

-- The exchange file kinds of the packs' files.
ALTER TABLE "exchange_files" DROP CONSTRAINT "exchange_files_kind_check";
ALTER TABLE "exchange_files" ADD CONSTRAINT "exchange_files_kind_check" CHECK ("kind" IN ('bank', 'ecr', 'esi', 'pt', 'lwf', 'form138', 'form24q', 'form140', 'journal', 'register', 'inspection', 'wps', 'f1099nec', 'census'));
