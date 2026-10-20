-- Payroll budget (finance Home, PLT-02 "Payroll cost vs budget", founder decision 21 Oct 2026): one amount per legal
-- entity and month, the cost to company the company plans to spend. Entered with payroll.setup.manage; every change is
-- audited (payroll.budget.set / payroll.budget.cleared). Entity pay totals, so the pay guard applies like payroll_runs.
CREATE TABLE "payroll_budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payroll_budgets_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payroll_budgets_month_check" CHECK (extract(day FROM "month") = 1),
    CONSTRAINT "payroll_budgets_amount_check" CHECK ("amount" >= 0)
);
CREATE UNIQUE INDEX "payroll_budgets_organization_id_legal_entity_id_month_key" ON "payroll_budgets"("organization_id", "legal_entity_id", "month");

ALTER TABLE "payroll_budgets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_budgets"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "payroll_budgets" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "payroll_budgets" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
