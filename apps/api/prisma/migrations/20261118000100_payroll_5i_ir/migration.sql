-- Payroll batch 5i, PAY-9.04 (M03 YX-PAY-63, YX-TAX-21): industrial-relations pay. Union check-off dues only with a
-- recorded authorisation, remitted per union per month; wage settlements by worker category (arrears by category); lay-off
-- days paid at the IR Code's share of wages; VRS payouts with the lifetime exemption.
--   RLS as the rest of payroll; a worker reads their own authorisations, lay-off days and VRS payout.

CREATE TABLE "unions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "registration_no" VARCHAR(60),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "unions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "unions_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id")
);
CREATE UNIQUE INDEX "unions_name_key" ON "unions" ("organization_id", "legal_entity_id", lower("name"));

CREATE TABLE "union_authorisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "union_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "dues_kind" VARCHAR(8) NOT NULL,
    "dues_value" DECIMAL(12,4) NOT NULL,
    "valid_from" DATE NOT NULL,
    "revoked_on" DATE,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "union_authorisations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "union_authorisations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "union_authorisations_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "union_authorisations_union_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE CASCADE,
    CONSTRAINT "union_authorisations_check" CHECK ("dues_kind" IN ('fixed', 'percent') AND "dues_value" > 0 AND ("dues_kind" = 'fixed' OR "dues_value" < 100) AND ("revoked_on" IS NULL OR "revoked_on" >= "valid_from"))
);
-- One live authorisation per worker and union.
CREATE UNIQUE INDEX "union_authorisations_live_key" ON "union_authorisations" ("organization_id", "union_id", "employment_id") WHERE "revoked_on" IS NULL;

CREATE TABLE "wage_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "union_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "effective_from" DATE NOT NULL,
    "signed_on" DATE NOT NULL,
    "rates" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wage_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wage_settlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wage_settlements_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "wage_settlements_union_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id")
);

CREATE TABLE "layoff_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "layoff_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "layoff_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "layoff_days_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "layoff_days_check" CHECK ("days" > 0 AND "days" <= 31 AND extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "layoff_days_key" ON "layoff_days" ("organization_id", "employment_id", "month");

CREATE TABLE "vrs_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "prior_exemption" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exempt" DECIMAL(14,2) NOT NULL,
    "taxable" DECIMAL(14,2) NOT NULL,
    "rule_version" VARCHAR(20) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vrs_payouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vrs_payouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vrs_payouts_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "vrs_payouts_check" CHECK ("amount" > 0 AND "prior_exemption" >= 0 AND "exempt" >= 0 AND "taxable" >= 0 AND "exempt" + "taxable" = "amount" AND extract(day FROM "month") = 1)
);
-- VRS is paid once per employment.
CREATE UNIQUE INDEX "vrs_payouts_key" ON "vrs_payouts" ("organization_id", "employment_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['unions', 'union_authorisations', 'wage_settlements', 'layoff_days', 'vrs_payouts']
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
  FOREACH t IN ARRAY ARRAY['unions', 'wage_settlements']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['union_authorisations', 'layoff_days', 'vrs_payouts']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;
