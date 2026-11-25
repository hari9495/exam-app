-- PPL-44 Trading pre-clearance (SEBI PIT Regulations 2015, Reg. 9 code of conduct): a designated person asks the
-- compliance officer before trading; an approval is valid for a few trading days (company setting), and the trade is
-- then reported with its contract note. Confidential; the officer decides, never on their own request.
CREATE TABLE "trade_preclearances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "reference_no" VARCHAR(20) NOT NULL,
    "security" VARCHAR(200) NOT NULL,
    "side" VARCHAR(4) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "value" DECIMAL(16,2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "valid_until" DATE,
    "traded_on" DATE,
    "traded_quantity" INTEGER,
    "contract_note_document_id" UUID,
    "reported_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trade_preclearances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trade_preclearances_reference_key" UNIQUE ("organization_id", "reference_no"),
    CONSTRAINT "trade_preclearances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trade_preclearances_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "trade_preclearances_note_fkey" FOREIGN KEY ("organization_id", "contract_note_document_id") REFERENCES "documents"("organization_id", "id"),
    CONSTRAINT "trade_preclearances_side_check" CHECK ("side" IN ('buy', 'sell')),
    CONSTRAINT "trade_preclearances_amounts_check" CHECK ("quantity" > 0 AND "value" > 0 AND ("traded_quantity" IS NULL OR "traded_quantity" > 0)),
    CONSTRAINT "trade_preclearances_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    CONSTRAINT "trade_preclearances_decision_check" CHECK (("status" = 'pending') = ("decided_at" IS NULL) AND ("status" = 'approved') = ("valid_until" IS NOT NULL)),
    CONSTRAINT "trade_preclearances_report_check" CHECK (("reported_at" IS NULL) = ("traded_on" IS NULL) AND ("reported_at" IS NULL OR "status" = 'approved'))
);
CREATE INDEX "trade_preclearances_employee_idx" ON "trade_preclearances"("organization_id", "employee_id", "created_at");
REVOKE DELETE, TRUNCATE ON TABLE "trade_preclearances" FROM app_runtime;

ALTER TABLE "trade_preclearances" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trade_preclearances"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "trade_preclearances" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

ALTER TABLE "document_types" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'contract_note', 'Contract note of a reported trade', 'confidential', false, ARRAY['application/pdf'], 5, false, '{}', ARRAY['person']);
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;
