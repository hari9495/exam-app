-- Batch H part 3 items B8 and E5 (18 Nov 2026), founder answers 2406 and 2407: flexible benefits.
-- A company-set list of flexible components (phone, fuel, books, LTA, meals ...), each with a monthly entitlement and
-- "taxable if unclaimed", claimed through the expense claims flow (one expense category per component). What is left
-- unclaimed is paid as taxable salary in March or at exit; carrying it into the next year is a company setting (off).
SELECT set_config('app.is_super_admin', 'on', true);

-- Settings 4.11 (design): HR's key for the benefits settings page.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'benefits.settings.manage', 'Benefits and flexible benefit plan settings (Settings 4.11): the flexible components, their monthly amounts and what happens to an unclaimed balance')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'benefits.settings.manage'
ON CONFLICT DO NOTHING;

CREATE TABLE "flex_components" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "monthly_amount" DECIMAL(14,2) NOT NULL,
  "taxable_if_unclaimed" BOOLEAN NOT NULL DEFAULT true,
  "expense_category_code" VARCHAR(30),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flex_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flex_components_amount_check" CHECK ("monthly_amount" > 0 AND "monthly_amount" <= 1000000)
);
CREATE UNIQUE INDEX "flex_components_code_key" ON "flex_components" ("organization_id", "code");
CREATE UNIQUE INDEX "flex_components_category_key" ON "flex_components" ("organization_id", "expense_category_code") WHERE "expense_category_code" IS NOT NULL;
REVOKE DELETE, TRUNCATE ON TABLE "flex_components" FROM app_runtime;
ALTER TABLE "flex_components" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "flex_components"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "flex_components" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

-- One person's component for one tax year once it is settled (March or exit): what was entitled, claimed, carried in,
-- paid as taxable salary, carried out or lapsed. Next year's carried-in is this row's carried_out.
CREATE TABLE "flex_settlements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "employment_id" UUID NOT NULL,
  "component_id" UUID NOT NULL REFERENCES "flex_components"("id"),
  "tax_year" VARCHAR(7) NOT NULL,
  "kind" VARCHAR(8) NOT NULL,
  "pay_month" DATE NOT NULL,
  "entitled" DECIMAL(14,2) NOT NULL,
  "carried_in" DECIMAL(14,2) NOT NULL,
  "claimed" DECIMAL(14,2) NOT NULL,
  "paid_taxable" DECIMAL(14,2) NOT NULL,
  "carried_out" DECIMAL(14,2) NOT NULL,
  "lapsed" DECIMAL(14,2) NOT NULL,
  "one_time_pay_id" UUID,
  "settled_by" UUID NOT NULL,
  "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flex_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "flex_settlements_kind_check" CHECK ("kind" IN ('year_end', 'exit')),
  CONSTRAINT "flex_settlements_sum_check" CHECK ("paid_taxable" >= 0 AND "carried_out" >= 0 AND "lapsed" >= 0)
);
CREATE UNIQUE INDEX "flex_settlements_key" ON "flex_settlements" ("organization_id", "employee_id", "component_id", "tax_year");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "flex_settlements" FROM app_runtime;
ALTER TABLE "flex_settlements" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "flex_settlements"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "flex_settlements" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "flex_settlements" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));

-- The unclaimed balance is paid through payroll as one-time pay from the benefits module (source 'm11').
ALTER TABLE "one_time_pays" DROP CONSTRAINT "one_time_pays_source_check";
ALTER TABLE "one_time_pays" ADD CONSTRAINT "one_time_pays_source_check" CHECK ("source" IN ('manual', 'm05', 'm06', 'm09', 'm10', 'm08', 'm01', 'm11', 'loan', 'arrears', 'fnf', 'piece', 'incentive', 'tips', 'oncall', 'union', 'layoff', 'vrs', 'settle', 'ewa', 'bonus'));
