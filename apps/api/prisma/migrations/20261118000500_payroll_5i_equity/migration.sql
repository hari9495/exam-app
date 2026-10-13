-- Payroll batch 5i, PAY-9.09 (M03 YX-PAY-46, YX-TAX-18, C4): equity plans (pool, type, the post-exit exercise window),
-- valuations (fair market value per unit by date), grants approved through P03 within the pool, vesting events from the
-- grant's schedule (milestones confirmed by someone else), and exercises of vested units whose perquisite reaches the
-- payroll tax projection (perquisites, kind esop).
--   RLS as the rest of payroll; a person reads their own grants, vesting and exercises and asks to exercise.

CREATE TABLE "equity_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(4) NOT NULL,
    "pool_units" INTEGER NOT NULL,
    "exit_window_days" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equity_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equity_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "equity_plans_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "equity_plans_check" CHECK ("kind" IN ('ESOP', 'RSU', 'SAR') AND "pool_units" > 0 AND "exit_window_days" >= 0 AND "status" IN ('active', 'closed'))
);

CREATE TABLE "equity_valuations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "valued_on" DATE NOT NULL,
    "fmv" DECIMAL(14,4) NOT NULL,
    "basis" VARCHAR(16) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equity_valuations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equity_valuations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "equity_valuations_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "equity_valuations_check" CHECK ("fmv" > 0 AND "basis" IN ('listed_price', 'merchant_banker'))
);
CREATE UNIQUE INDEX "equity_valuations_key" ON "equity_valuations" ("organization_id", "legal_entity_id", "valued_on");

CREATE TABLE "equity_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "granted_on" DATE NOT NULL,
    "units" INTEGER NOT NULL,
    "exercise_price" DECIMAL(14,4) NOT NULL,
    "schedule" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equity_grants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equity_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "equity_grants_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "equity_grants_plan_fkey" FOREIGN KEY ("plan_id") REFERENCES "equity_plans"("id"),
    CONSTRAINT "equity_grants_check" CHECK ("units" > 0 AND "exercise_price" >= 0 AND "status" IN ('pending', 'active', 'rejected', 'closed'))
);

CREATE TABLE "vesting_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "grant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "vest_on" DATE NOT NULL,
    "units" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "milestone" VARCHAR(200),
    "status" VARCHAR(10) NOT NULL DEFAULT 'scheduled',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(3),

    CONSTRAINT "vesting_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vesting_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vesting_events_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "vesting_events_grant_fkey" FOREIGN KEY ("grant_id") REFERENCES "equity_grants"("id") ON DELETE CASCADE,
    CONSTRAINT "vesting_events_check" CHECK ("units" > 0 AND "kind" IN ('time', 'milestone') AND "status" IN ('scheduled', 'vested', 'lapsed') AND ("kind" = 'time' OR "milestone" IS NOT NULL))
);

CREATE TABLE "equity_exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "grant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "exercised_on" DATE NOT NULL,
    "units" INTEGER NOT NULL,
    "price_payable" DECIMAL(14,2) NOT NULL,
    "fmv" DECIMAL(14,4),
    "perquisite" DECIMAL(14,2),
    "perquisite_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'requested',
    "wf_request_id" UUID,
    "payment_ref" VARCHAR(60),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equity_exercises_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "equity_exercises_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "equity_exercises_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "equity_exercises_grant_fkey" FOREIGN KEY ("grant_id") REFERENCES "equity_grants"("id"),
    CONSTRAINT "equity_exercises_check" CHECK ("units" > 0 AND "price_payable" >= 0 AND "status" IN ('requested', 'approved', 'rejected', 'paid'))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equity_plans', 'equity_valuations', 'equity_grants', 'vesting_events', 'equity_exercises']
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
  FOREACH t IN ARRAY ARRAY['equity_plans', 'equity_valuations']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['equity_grants', 'vesting_events']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  -- A person asks to exercise their own vested units (status requested only); payroll staff decide and record payment.
  EXECUTE
    'CREATE POLICY pay_guard ON "equity_exercises" AS RESTRICTIVE
       USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR ("status" = ''requested'' AND "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[])))';
END $$;
