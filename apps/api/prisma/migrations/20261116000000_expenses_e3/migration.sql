-- Expenses batch E3 (M05-BUILD-DESIGN §5.4, §10 – §12; XP-3.03 … XP-3.08): paying approved claims through the next payroll or a
-- direct payout, the payment attempts, payout batches released by a second person, the payroll events handled once, and
-- the expense journal through ledger mapping.

-- One row per payment attempt of a claim. A payroll attempt points at the one-time pay rows it made (exempt and taxable
-- parts); a payout attempt at its batch.
CREATE TABLE "expense_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "route" VARCHAR(8) NOT NULL,
    "pay_month" DATE,
    "one_time_pay_ids" UUID[] NOT NULL DEFAULT '{}',
    "payout_batch_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "taxable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'queued',
    "paid_on" DATE,
    "ref" VARCHAR(80),
    "reason" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_payments_claim_fkey" FOREIGN KEY ("claim_id") REFERENCES "expense_claims"("id") ON DELETE CASCADE,
    CONSTRAINT "expense_payments_route_check" CHECK ("route" IN ('payroll', 'payout')),
    CONSTRAINT "expense_payments_status_check" CHECK ("status" IN ('queued', 'sent', 'paid', 'failed', 'returned', 'cancelled')),
    CONSTRAINT "expense_payments_amount_check" CHECK ("amount" > 0 AND "taxable_amount" >= 0 AND "taxable_amount" <= "amount")
);
CREATE INDEX "expense_payments_claim_idx" ON "expense_payments" ("organization_id", "claim_id");
-- At most one live attempt per claim.
CREATE UNIQUE INDEX "expense_payments_live_key" ON "expense_payments" ("organization_id", "claim_id") WHERE "status" IN ('queued', 'sent');

-- Direct payouts: a bank file per legal entity, made by one person and released by another (step-up, typed phrase).
-- The file is kept encrypted with its hash; the release checks the hash, rows and total again.
CREATE TABLE "expense_payout_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "format_key" VARCHAR(20) NOT NULL,
    "format_version" VARCHAR(20) NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "file_enc" TEXT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "claim_ids" UUID[] NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "generated_by" UUID NOT NULL,
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payout_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_payout_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_payout_batches_status_check" CHECK ("status" IN ('draft', 'released', 'confirmed', 'cancelled')),
    CONSTRAINT "expense_payout_batches_checker_check" CHECK ("released_by" IS NULL OR "released_by" <> "generated_by"),
    CONSTRAINT "expense_payout_batches_rows_check" CHECK ("row_count" > 0 AND "total" > 0)
);
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_batch_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "expense_payout_batches"("id");

-- Payroll events handled once each (§11.4): a redelivered event changes nothing.
CREATE TABLE "expense_event_receipts" (
    "event_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "handled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_event_receipts_pkey" PRIMARY KEY ("event_id"),
    CONSTRAINT "expense_event_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The month's expense journal as exported (and later marked posted), per legal entity.
CREATE TABLE "expense_journals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'exported',
    "exported_by" UUID NOT NULL,
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_journals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_journals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_journals_status_check" CHECK ("status" IN ('exported', 'posted'))
);
CREATE INDEX "expense_journals_period_idx" ON "expense_journals" ("organization_id", "legal_entity_id", "period");

REVOKE DELETE, TRUNCATE ON TABLE "expense_payments", "expense_payout_batches", "expense_event_receipts", "expense_journals" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_payments', 'expense_payout_batches', 'expense_event_receipts', 'expense_journals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads expense payments.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- §12.1: expense ledger codes are "exp." plus the category code (up to 30), so the mapping code is widened.
ALTER TABLE "ledger_mappings" ALTER COLUMN "component_code" TYPE VARCHAR(40);
