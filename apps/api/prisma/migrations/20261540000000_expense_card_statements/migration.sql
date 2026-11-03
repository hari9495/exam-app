-- EXP-08 card statement import and matching (founder answer 3 Nov 2026, option A): finance uploads a corporate card
-- statement as CSV or Excel, maps its columns once per bank (kept per company and bank), and matches the card lines to
-- employees' claim lines. Only the last 4 digits of a card number are ever kept. The app cannot delete any of these
-- rows; every change is audited.

-- The column mapping of one bank's statement file, per company (reused and editable next time).
CREATE TABLE "expense_card_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_name" VARCHAR(80) NOT NULL,
    "columns" JSONB NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_card_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_card_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "expense_card_mappings_bank_key" ON "expense_card_mappings" ("organization_id", lower("bank_name"));

-- An employee's corporate card: the bank and the last 4 digits only. Two people may share the last 4 digits.
CREATE TABLE "expense_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "bank_name" VARCHAR(80) NOT NULL,
    "last4" CHAR(4) NOT NULL,
    "created_by" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_cards_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "expense_cards_last4_check" CHECK ("last4" ~ '^[0-9]{4}$')
);
CREATE UNIQUE INDEX "expense_cards_live_key" ON "expense_cards" ("organization_id", lower("bank_name"), "last4", "employee_id") WHERE "removed_at" IS NULL;

-- One imported statement. A second file for the same bank and period replaces it as the next revision; the same file
-- (same SHA-256) is never imported twice.
CREATE TABLE "expense_card_statements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bank_name" VARCHAR(80) NOT NULL,
    "mapping_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "replaces_id" UUID,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "file_id" UUID,
    "file_name" VARCHAR(200) NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "debit_total" DECIMAL(14,2) NOT NULL,
    "credit_total" DECIMAL(14,2) NOT NULL,
    "full_numbers_dropped" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "note" VARCHAR(500),
    "imported_by" UUID NOT NULL,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_card_statements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_card_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_card_statements_mapping_fkey" FOREIGN KEY ("mapping_id") REFERENCES "expense_card_mappings"("id"),
    CONSTRAINT "expense_card_statements_replaces_fkey" FOREIGN KEY ("replaces_id") REFERENCES "expense_card_statements"("id"),
    CONSTRAINT "expense_card_statements_status_check" CHECK ("status" IN ('open', 'closed', 'replaced')),
    CONSTRAINT "expense_card_statements_period_check" CHECK ("period_from" <= "period_to"),
    CONSTRAINT "expense_card_statements_rows_check" CHECK ("row_count" > 0 AND "debit_total" >= 0 AND "credit_total" >= 0)
);
CREATE UNIQUE INDEX "expense_card_statements_file_key" ON "expense_card_statements" ("organization_id", "file_sha256");
CREATE UNIQUE INDEX "expense_card_statements_period_key" ON "expense_card_statements" ("organization_id", lower("bank_name"), "period_from", "period_to") WHERE "status" <> 'replaced';

-- One row of a statement. Amounts are positive; a credit (refund) is never matched or chased.
CREATE TABLE "expense_card_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "row_no" INTEGER NOT NULL,
    "txn_on" DATE NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "merchant" VARCHAR(120),
    "amount" DECIMAL(14,2) NOT NULL,
    "direction" VARCHAR(6) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "card_last4" CHAR(4),
    "employee_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "matched_line_id" UUID,
    "matched_by" UUID,
    "matched_at" TIMESTAMPTZ(3),
    "chased_on" DATE,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "explained_by" UUID,
    "explained_at" TIMESTAMPTZ(3),
    "recovery_loan_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_card_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_card_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_card_lines_statement_fkey" FOREIGN KEY ("statement_id") REFERENCES "expense_card_statements"("id"),
    CONSTRAINT "expense_card_lines_matched_fkey" FOREIGN KEY ("matched_line_id") REFERENCES "expense_lines"("id"),
    CONSTRAINT "expense_card_lines_direction_check" CHECK ("direction" IN ('debit', 'credit')),
    CONSTRAINT "expense_card_lines_status_check" CHECK ("status" IN ('open', 'matched', 'to_chase', 'personal', 'refund', 'replaced')),
    CONSTRAINT "expense_card_lines_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "expense_card_lines_last4_check" CHECK ("card_last4" IS NULL OR "card_last4" ~ '^[0-9]{4}$'),
    CONSTRAINT "expense_card_lines_match_check" CHECK (("status" = 'matched') = ("matched_line_id" IS NOT NULL))
);
CREATE INDEX "expense_card_lines_statement_idx" ON "expense_card_lines" ("organization_id", "statement_id", "row_no");
CREATE INDEX "expense_card_lines_employee_idx" ON "expense_card_lines" ("organization_id", "employee_id", "status");
-- A claim line is matched to one card line at most.
CREATE UNIQUE INDEX "expense_card_lines_matched_key" ON "expense_card_lines" ("organization_id", "matched_line_id") WHERE "matched_line_id" IS NOT NULL;

-- A card line the employee says was a business spend becomes a draft company-card line on their claim.
ALTER TABLE "expense_lines" DROP CONSTRAINT "expense_lines_origin_check";
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_origin_check" CHECK ("origin" IN ('employee', 'field_day', 'card'));

REVOKE DELETE, TRUNCATE ON TABLE "expense_card_mappings", "expense_cards", "expense_card_statements", "expense_card_lines" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_card_mappings', 'expense_cards', 'expense_card_statements', 'expense_card_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads card statements.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
