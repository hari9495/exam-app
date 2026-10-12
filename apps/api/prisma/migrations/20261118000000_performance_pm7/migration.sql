-- Performance batch PM7 (M06-BUILD-DESIGN §5.8, §12; PM-7.01 … 7.07): from ratings to pay. Merit matrices (cells tile
-- the compa-ratio axis), comp cycles per legal entity and pay currency, budgets, proposals (a snapshot of what the
-- approver saw), pay-equity runs, and the link from P06 bulk batches back to the comp cycle that made them.
-- Forced RLS + tenant_isolation; proposals and pay-equity runs carry the RESTRICTIVE pay guard like compensations;
-- support sessions never read any of it; nothing erased.

CREATE TABLE "comp_matrices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "axis" VARCHAR(12) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "starter_key" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comp_matrices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_matrices_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "comp_matrices_axis_check" CHECK ("axis" IN ('compa_ratio', 'rating_only')),
    CONSTRAINT "comp_matrices_status_check" CHECK ("status" IN ('active', 'retired'))
);
CREATE UNIQUE INDEX "comp_matrices_starter_key" ON "comp_matrices" ("organization_id", "starter_key") WHERE "starter_key" IS NOT NULL;

CREATE TABLE "comp_matrix_cells" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "matrix_id" UUID NOT NULL,
    "band" VARCHAR(60) NOT NULL,
    "compa_from" DECIMAL(5,3),
    "compa_to" DECIMAL(5,3),
    "min_pct" DECIMAL(5,2) NOT NULL,
    "target_pct" DECIMAL(5,2) NOT NULL,
    "max_pct" DECIMAL(5,2) NOT NULL,
    CONSTRAINT "comp_matrix_cells_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_matrix_cells_matrix_fkey" FOREIGN KEY ("organization_id", "matrix_id") REFERENCES "comp_matrices"("organization_id", "id")
);

CREATE TABLE "comp_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "review_cycle_id" UUID,
    "legal_entity_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "effective_on" DATE NOT NULL,
    "matrix_id" UUID NOT NULL,
    "bonus" JSONB,
    "status" VARCHAR(12) NOT NULL DEFAULT 'draft',
    "applied_at" TIMESTAMPTZ(3),
    "applied_by" UUID,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comp_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_cycles_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "comp_cycles_review_fkey" FOREIGN KEY ("organization_id", "review_cycle_id") REFERENCES "review_cycles"("organization_id", "id"),
    CONSTRAINT "comp_cycles_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "comp_cycles_matrix_fkey" FOREIGN KEY ("organization_id", "matrix_id") REFERENCES "comp_matrices"("organization_id", "id"),
    CONSTRAINT "comp_cycles_status_check" CHECK ("status" IN ('draft', 'open', 'approved', 'applied', 'closed'))
);

CREATE TABLE "comp_budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "comp_cycle_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "comp_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_budgets_one_key" UNIQUE ("comp_cycle_id", "department_id", "kind"),
    CONSTRAINT "comp_budgets_cycle_fkey" FOREIGN KEY ("organization_id", "comp_cycle_id") REFERENCES "comp_cycles"("organization_id", "id"),
    CONSTRAINT "comp_budgets_kind_check" CHECK ("kind" IN ('merit', 'bonus')),
    CONSTRAINT "comp_budgets_amount_check" CHECK ("amount" >= 0)
);

CREATE TABLE "comp_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "comp_cycle_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "review_id" UUID,
    "band" VARCHAR(60),
    "current_ctc" DECIMAL(14,2) NOT NULL,
    "compa_ratio" DECIMAL(6,3),
    "proration" DECIMAL(5,4) NOT NULL DEFAULT 1,
    "cell" JSONB,
    "merit_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "merit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "promotion_to_grade_id" UUID,
    "promotion_to_designation_id" UUID,
    "promotion_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "new_ctc" DECIMAL(14,2) NOT NULL,
    "out_of_range" BOOLEAN NOT NULL DEFAULT false,
    "justification" VARCHAR(1000),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "wf_request_id" UUID,
    "batch_id" UUID,
    "change_id" UUID,
    "one_time_pay_id" UUID,
    "letter_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comp_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_proposals_one_key" UNIQUE ("comp_cycle_id", "employee_id"),
    CONSTRAINT "comp_proposals_cycle_fkey" FOREIGN KEY ("organization_id", "comp_cycle_id") REFERENCES "comp_cycles"("organization_id", "id"),
    CONSTRAINT "comp_proposals_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "comp_proposals_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'rejected', 'applied')),
    CONSTRAINT "comp_proposals_amounts_check" CHECK ("merit_amount" >= 0 AND "promotion_amount" >= 0 AND "bonus_amount" >= 0 AND "new_ctc" >= 0)
);
CREATE INDEX "comp_proposals_manager_idx" ON "comp_proposals" ("organization_id", "comp_cycle_id", "manager_employee_id");

CREATE TABLE "pay_equity_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "comp_cycle_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "dimension" VARCHAR(20) NOT NULL,
    "results" JSONB NOT NULL,
    "run_by" UUID,
    "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pay_equity_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_equity_runs_cycle_fkey" FOREIGN KEY ("organization_id", "comp_cycle_id") REFERENCES "comp_cycles"("organization_id", "id")
);

-- P06 bulk batches made by applying a comp cycle point back to it (§12.6); a large cycle is several batches.
ALTER TABLE "employee_change_batches" ADD COLUMN "comp_cycle_id" UUID;
ALTER TABLE "employee_change_batches" ADD CONSTRAINT "employee_change_batches_comp_cycle_fkey" FOREIGN KEY ("organization_id", "comp_cycle_id") REFERENCES "comp_cycles"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comp_matrices', 'comp_matrix_cells', 'comp_cycles', 'comp_budgets', 'comp_proposals', 'pay_equity_runs']
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
-- Pay data: proposals and pay-equity runs are read only inside a pay scope, like compensations (5a-D4).
CREATE POLICY pay_guard ON "comp_proposals" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
CREATE POLICY pay_guard ON "pay_equity_runs" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
REVOKE DELETE, TRUNCATE ON TABLE "comp_cycles", "comp_proposals", "pay_equity_runs", "comp_matrices" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- permission keys (§17)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.comp.manage', 'Comp cycles of an entity: matrices, budgets, proposals, apply'),
  (gen_random_uuid(), 'perf.comp.approve', 'Approve comp proposals as finance for an entity')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('perf.comp.manage', 'perf.comp.approve')
ON CONFLICT DO NOTHING;
