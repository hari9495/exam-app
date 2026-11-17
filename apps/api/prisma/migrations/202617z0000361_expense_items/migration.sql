-- Keka ideas (2026-11): expenses saved first, claimed later. A single spend (amount, date, an optional receipt) the
-- employee keeps until they pick it into a claim; it then becomes a claim line and points at it. No data written.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "expense_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "spent_on" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category_code" VARCHAR(30),
    "merchant" VARCHAR(120),
    "description" VARCHAR(500),
    "receipt_file_id" UUID,
    "receipt_sha256" CHAR(64),
    "claimed_line_id" UUID,
    "claimed_at" TIMESTAMPTZ(3),
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_items_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "expense_items_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "expense_items_line_fkey" FOREIGN KEY ("claimed_line_id") REFERENCES "expense_lines"("id") ON DELETE SET NULL,
    CONSTRAINT "expense_items_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "expense_items_claimed_check" CHECK (("claimed_line_id" IS NULL) OR ("claimed_at" IS NOT NULL))
);
CREATE INDEX "expense_items_employee_idx" ON "expense_items" ("organization_id", "employee_id") WHERE "claimed_at" IS NULL AND "removed_at" IS NULL;

ALTER TABLE "expense_items" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "expense_items"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- The app never deletes a saved expense: removing one stamps removed_at.
REVOKE DELETE, TRUNCATE ON TABLE "expense_items" FROM app_runtime;
