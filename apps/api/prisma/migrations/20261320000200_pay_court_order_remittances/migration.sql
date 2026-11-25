-- PAY-19 OrderPanel (pay gaps, 2 Nov 2026): the payment of a month's court-order deduction to the court, with the bank or
-- challan reference. One per order and month; recorded once and never changed (insert-only for the app role).
-- Tenant isolation, the support-session exclusion and the pay guard as on court_orders. Forward-only.
CREATE TABLE "court_order_remittances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "court_order_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "court_order_remittances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "court_order_remittances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "court_order_remittances_order_fkey" FOREIGN KEY ("court_order_id") REFERENCES "court_orders"("id"),
    CONSTRAINT "court_order_remittances_key" UNIQUE ("organization_id", "court_order_id", "month"),
    CONSTRAINT "court_order_remittances_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "court_order_remittances_month_check" CHECK (EXTRACT(DAY FROM "month") = 1),
    CONSTRAINT "court_order_remittances_reference_check" CHECK (char_length(btrim("reference")) BETWEEN 3 AND 60)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "court_order_remittances" FROM app_runtime;

ALTER TABLE "court_order_remittances" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "court_order_remittances"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "court_order_remittances" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "court_order_remittances" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
