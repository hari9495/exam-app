-- Payroll hooks for the expenses (M05 §22.1) and performance (M06 PM7) modules.
--   change 3: taxable salary paid outside payroll (taxable expense amounts paid by transfer) is tax-year salary income.
--   change 5: an 'expense' loan type recovers an overdue expense advance from salary through the loan engine
--             (interest-free, not a perquisite), linked to its advance by source_ref.
--   One-time pays from a module are kept once per source and reference.

ALTER TABLE "loans" DROP CONSTRAINT "loans_type_check";
ALTER TABLE "loans" ADD CONSTRAINT "loans_type_check" CHECK ("loan_type" IN ('advance', 'loan', 'expense'));
ALTER TABLE "loans" ADD COLUMN "source_ref" VARCHAR(80);
ALTER TABLE "loans" ADD CONSTRAINT "loans_expense_terms_check" CHECK ("loan_type" <> 'expense' OR ("interest_rate" = 0 AND "perquisite" = false AND "source_ref" IS NOT NULL));
CREATE UNIQUE INDEX "loans_source_ref_key" ON "loans" ("organization_id", "source_ref") WHERE "source_ref" IS NOT NULL;

-- (F&F keeps several items under one settlement, so only module sources are one per reference.)
CREATE UNIQUE INDEX "one_time_pays_module_ref_key" ON "one_time_pays" ("organization_id", "source", "source_ref") WHERE "source" IN ('m05', 'm06') AND "source_ref" IS NOT NULL AND "status" <> 'cancelled';

CREATE TABLE "tax_paid_outside" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "source_ref" VARCHAR(80) NOT NULL,
    "entered_by" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_paid_outside_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_paid_outside_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_paid_outside_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "tax_paid_outside_source_check" CHECK ("source" IN ('m05')),
    CONSTRAINT "tax_paid_outside_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "tax_paid_outside_source_ref_key" ON "tax_paid_outside" ("organization_id", "source", "source_ref");
CREATE INDEX "tax_paid_outside_employee_idx" ON "tax_paid_outside" ("organization_id", "employee_id", "tax_year");
REVOKE DELETE, TRUNCATE ON TABLE "tax_paid_outside" FROM app_runtime;

ALTER TABLE "tax_paid_outside" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_paid_outside"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "tax_paid_outside" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "tax_paid_outside" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
