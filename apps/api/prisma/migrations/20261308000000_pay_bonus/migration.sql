-- PAY-24 statutory bonus (Payment of Bonus Act; founder decision 9, 29 Oct 2026). One computation per legal entity and
-- accounting year: worked out from the approved payslips (bonusWage components), reviewed, approved by someone other than
-- its makers, then sent as one-time pay to an off-cycle "bonus" run. Rows are rebuilt while it is a draft.
--   RLS as the rest of payroll: tenant isolation, the support exclusion and the pay guard on the legal entity.

CREATE TABLE "bonus_computations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "year_start" DATE NOT NULL,
    "year_end" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "rules" JSONB NOT NULL,
    "available_surplus" DECIMAL(16,2),
    "allocable_surplus" DECIMAL(16,2),
    "opening_set_on" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "opening_set_off" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "chosen_rate" DECIMAL(5,2),
    "supported_rate" DECIMAL(5,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "carry" JSONB NOT NULL,
    "set_on_made" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "set_off_made" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "people" INTEGER NOT NULL DEFAULT 0,
    "eligible" INTEGER NOT NULL DEFAULT 0,
    "salary_total" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "bonus_total" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "deduction_total" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "payable_total" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "computed_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "returned_reason" VARCHAR(500),
    "run_id" UUID,
    "sent_by" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_computations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bonus_computations_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "bonus_computations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bonus_computations_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "bonus_computations_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "bonus_computations_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'sent')),
    CONSTRAINT "bonus_computations_year_check" CHECK (extract(day FROM "year_start") = 1 AND "year_end" > "year_start" AND "due_on" > "year_end"),
    CONSTRAINT "bonus_computations_amounts_check" CHECK (("available_surplus" IS NULL OR "available_surplus" >= 0) AND "opening_set_on" >= 0 AND "opening_set_off" >= 0 AND "set_on_made" >= 0 AND "set_off_made" >= 0 AND "payable_total" >= 0),
    -- Approved by someone other than whoever made, changed or submitted it.
    CONSTRAINT "bonus_computations_maker_checker" CHECK ("approved_by" IS NULL OR ("approved_by" <> "created_by" AND "approved_by" <> "updated_by" AND "approved_by" <> "submitted_by")),
    CONSTRAINT "bonus_computations_sent_check" CHECK (("status" = 'sent') = ("run_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "bonus_computations_year_key" ON "bonus_computations" ("organization_id", "legal_entity_id", "year_start");
REVOKE DELETE, TRUNCATE ON TABLE "bonus_computations" FROM app_runtime;

CREATE TABLE "bonus_computation_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "computation_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "months" JSONB NOT NULL,
    "working_days" DECIMAL(6,2) NOT NULL,
    "minimum_wage" DECIMAL(12,2) NOT NULL,
    "ceiling" DECIMAL(12,2) NOT NULL,
    "eligible_months" SMALLINT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "reason" VARCHAR(200),
    "bonus_salary" DECIMAL(14,2) NOT NULL,
    "bonus" DECIMAL(14,2) NOT NULL,
    "puja_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "misconduct_loss" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "disqualified" BOOLEAN NOT NULL DEFAULT false,
    "adjust_reason" VARCHAR(300),
    "deductions" DECIMAL(14,2) NOT NULL,
    "payable" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "bonus_computation_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bonus_computation_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bonus_computation_rows_computation_fkey" FOREIGN KEY ("organization_id", "computation_id") REFERENCES "bonus_computations"("organization_id", "id"),
    CONSTRAINT "bonus_computation_rows_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "bonus_computation_rows_amounts_check" CHECK ("puja_paid" >= 0 AND "misconduct_loss" >= 0 AND "bonus" >= 0 AND "payable" >= 0 AND "payable" = "bonus" - "deductions"),
    -- A deduction or a disqualification always carries its reason.
    CONSTRAINT "bonus_computation_rows_reason_check" CHECK (("puja_paid" = 0 AND "misconduct_loss" = 0 AND NOT "disqualified") OR "adjust_reason" IS NOT NULL)
);
CREATE UNIQUE INDEX "bonus_computation_rows_employment_key" ON "bonus_computation_rows" ("organization_id", "computation_id", "employment_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bonus_computations', 'bonus_computation_rows']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL)', t);
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[])) WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))', t);
  END LOOP;
END $$;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.bonus.manage', 'Work out the statutory bonus of a legal entity, enter the surplus and deductions, send it for approval and pay it through an off-cycle bonus run'),
  (gen_random_uuid(), 'payroll.bonus.approve', 'Approve or send back a statutory bonus computation someone else made')
ON CONFLICT DO NOTHING;
