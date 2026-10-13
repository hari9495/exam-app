-- Payroll batch 5i, PAY-9.07 and 9.08 (M03 YX-PAY-61, YX-PAY-62): tips and service-charge pools per outlet and month,
-- shared by points, hours or shifts (tips paid by customers directly are recorded for statements only); on-call rules and
-- slots (a standby allowance per slot; a call-out pays at least the minimum hours at the rule's rate and multiplier).
--   RLS as the rest of payroll; a person reads their own share and slots.

CREATE TABLE "tip_pools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "paid_direct" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_pools_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tip_pools_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tip_pools_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "tip_pools_check" CHECK ("amount" > 0 AND "method" IN ('points', 'hours', 'shifts') AND extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "tip_pools_key" ON "tip_pools" ("organization_id", "location_id", "month", "paid_direct");

CREATE TABLE "tip_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "basis" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "tip_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tip_shares_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tip_shares_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "tip_shares_pool_fkey" FOREIGN KEY ("pool_id") REFERENCES "tip_pools"("id") ON DELETE CASCADE,
    CONSTRAINT "tip_shares_check" CHECK ("basis" > 0 AND "amount" >= 0)
);
CREATE UNIQUE INDEX "tip_shares_key" ON "tip_shares" ("pool_id", "employment_id");

CREATE TABLE "oncall_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "standby_amount" DECIMAL(12,2) NOT NULL,
    "callout_min_hours" DECIMAL(5,2) NOT NULL,
    "callout_rate" DECIMAL(12,2) NOT NULL,
    "multiplier" DECIMAL(5,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oncall_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oncall_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oncall_rules_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "oncall_rules_check" CHECK ("standby_amount" >= 0 AND "callout_min_hours" >= 0 AND "callout_rate" >= 0 AND "multiplier" >= 1)
);

CREATE TABLE "oncall_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "slot_date" DATE NOT NULL,
    "callout_hours" DECIMAL(5,2),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oncall_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oncall_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "oncall_slots_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "oncall_slots_rule_fkey" FOREIGN KEY ("rule_id") REFERENCES "oncall_rules"("id") ON DELETE CASCADE,
    CONSTRAINT "oncall_slots_check" CHECK ("callout_hours" IS NULL OR ("callout_hours" > 0 AND "callout_hours" <= 24))
);
CREATE UNIQUE INDEX "oncall_slots_key" ON "oncall_slots" ("organization_id", "employment_id", "slot_date", "rule_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tip_pools', 'tip_shares', 'oncall_rules', 'oncall_slots']
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
  FOREACH t IN ARRAY ARRAY['tip_pools', 'oncall_rules']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['tip_shares', 'oncall_slots']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;
