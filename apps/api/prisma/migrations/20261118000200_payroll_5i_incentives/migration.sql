-- Payroll batch 5i, PAY-9.06 (M03 YX-PAY-60): incentive and commission plans (target, quota, tiers with accelerators, a
-- cap, a clawback window), results per person and month (approved through a posting), clawbacks recovered later.
--   RLS as the rest of payroll; a person reads their own results and clawbacks (their statement).

CREATE TABLE "incentive_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "target_amount" DECIMAL(14,2) NOT NULL,
    "tiers" JSONB NOT NULL,
    "cap_percent" DECIMAL(7,2),
    "clawback_days" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incentive_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "incentive_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "incentive_plans_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "incentive_plans_check" CHECK ("kind" IN ('production', 'attendance', 'sales') AND "target_amount" > 0 AND ("cap_percent" IS NULL OR "cap_percent" > 0) AND "clawback_days" >= 0 AND "status" IN ('active', 'inactive'))
);

CREATE TABLE "incentive_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "quota" DECIMAL(14,2) NOT NULL,
    "actual" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "workings" JSONB NOT NULL,
    "posting_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incentive_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "incentive_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "incentive_results_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "incentive_results_plan_fkey" FOREIGN KEY ("plan_id") REFERENCES "incentive_plans"("id") ON DELETE CASCADE,
    CONSTRAINT "incentive_results_check" CHECK ("quota" > 0 AND "actual" >= 0 AND "amount" >= 0 AND extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "incentive_results_key" ON "incentive_results" ("organization_id", "plan_id", "employment_id", "month");

CREATE TABLE "incentive_clawbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "posting_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incentive_clawbacks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "incentive_clawbacks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "incentive_clawbacks_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "incentive_clawbacks_result_fkey" FOREIGN KEY ("result_id") REFERENCES "incentive_results"("id") ON DELETE CASCADE,
    CONSTRAINT "incentive_clawbacks_check" CHECK ("amount" > 0 AND extract(day FROM "month") = 1)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['incentive_plans', 'incentive_results', 'incentive_clawbacks']
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
  EXECUTE
    'CREATE POLICY pay_guard ON "incentive_plans" AS RESTRICTIVE
       USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))';
  FOREACH t IN ARRAY ARRAY['incentive_results', 'incentive_clawbacks']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;
