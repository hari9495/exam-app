-- Staffing round 4 (founder answers 491-500): 492 the GST invoice PDF fields as data (rule 46 / 53, verify); 493 payment
-- reminders once per schedule step (staffing_reminders); 494 the placement fee invoice when the client hires and the
-- guarantee credit note when the person leaves inside it (invoice kind 'fee'; hire and leave on the placement); 496 a
-- vendor linked to its consultant record in payroll (PAY 8) so its confirmed invoices are paid, taxed and certified there.
ALTER TABLE "staffing_invoices" DROP CONSTRAINT IF EXISTS "staffing_invoices_kind_check";
ALTER TABLE "staffing_invoices" ADD CONSTRAINT "staffing_invoices_kind_check" CHECK ("kind" IN ('staffing', 'fee', 'credit_note') AND (("kind" = 'credit_note') = ("credit_of" IS NOT NULL)));

ALTER TABLE "staffing_placements"
  ADD COLUMN IF NOT EXISTS "hired_on" DATE,
  ADD COLUMN IF NOT EXISTS "hire_ctc_paise" BIGINT,
  ADD COLUMN IF NOT EXISTS "fee_invoice_id" UUID,
  ADD COLUMN IF NOT EXISTS "left_on" DATE,
  ADD COLUMN IF NOT EXISTS "guarantee_outcome" VARCHAR(8),
  ADD COLUMN IF NOT EXISTS "guarantee_credit_id" UUID;
ALTER TABLE "staffing_placements" DROP CONSTRAINT IF EXISTS "staffing_placements_hire_check";
ALTER TABLE "staffing_placements" ADD CONSTRAINT "staffing_placements_hire_check" CHECK (("hired_on" IS NULL) = ("hire_ctc_paise" IS NULL) AND ("hire_ctc_paise" IS NULL OR "hire_ctc_paise" > 0) AND ("left_on" IS NULL OR ("hired_on" IS NOT NULL AND "left_on" >= "hired_on")) AND ("guarantee_outcome" IS NULL OR "guarantee_outcome" IN ('replace', 'credit', 'none')));

ALTER TABLE "agencies" ADD COLUMN IF NOT EXISTS "consultant_id" UUID;
ALTER TABLE "staffing_vendor_bills" ADD COLUMN IF NOT EXISTS "consultant_invoice_id" UUID;

CREATE TABLE IF NOT EXISTS "staffing_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    -- Days from the due date of this schedule step (negative = before).
    "step" INTEGER NOT NULL,
    "emailed" BOOLEAN NOT NULL,
    "recipients" TEXT[] NOT NULL DEFAULT '{}',
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_reminders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "staffing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "staffing_reminders_step_key" ON "staffing_reminders" ("invoice_id", "step");
ALTER TABLE "staffing_reminders" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "staffing_reminders";
CREATE POLICY tenant_isolation ON "staffing_reminders"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('GST.INVOICE_R46', 'IN', '2026-v1', '2017-07-01',
   '{"fields":[{"key":"supplier","label":"Supplier"},{"key":"supplierAddress","label":"Supplier address"},{"key":"supplierGstin","label":"Supplier GSTIN"},{"key":"number","label":"Invoice number"},{"key":"date","label":"Date of issue"},{"key":"original","label":"Against invoice","only":"credit_note"},{"key":"recipient","label":"Recipient"},{"key":"recipientAddress","label":"Recipient address"},{"key":"recipientGstin","label":"Recipient GSTIN"},{"key":"placeOfSupply","label":"Place of supply (state and code)"},{"key":"reverseCharge","label":"Tax payable on reverse charge"},{"key":"reason","label":"Reason for the credit note","only":"credit_note"},{"key":"po","label":"Client PO","only":"invoice"},{"key":"signature","label":"Signature or digital signature of the supplier or authorised representative"}],"title":{"invoice":"Tax invoice","credit_note":"Credit note"}}',
   'CGST Rules 2017 r.46 (tax invoice: supplier name, address and GSTIN; a consecutive serial number up to 16 characters unique for a financial year; date; recipient name, address and GSTIN; HSN/SAC; description; quantity; total and taxable value; rate and amount of CGST, SGST/UTGST and IGST; place of supply with state; whether tax is on reverse charge; signature) and r.53 (credit note: the original invoice and reason). Verify the list and wording with the CA before use.', true);
