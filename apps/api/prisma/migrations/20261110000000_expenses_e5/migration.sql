-- Expenses batch E5 (M05-BUILD-DESIGN §5.7, §14, §15 F4, §13.5, §21.5; YX-EXP-14, 15, 16): exchange rates, foreign-
-- currency lines, forex advances with their exchange difference, field-day mileage drafts, the receipt image hash
-- for look-alike photos, closing trips, and the reports key.
-- FBIL and ECB imports stay off until their reuse terms are confirmed (§14.2, §22 D2): only the company table is fed.

CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "rate_date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fx_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fx_rates_key" UNIQUE ("organization_id", "source", "base", "quote", "rate_date"),
    CONSTRAINT "fx_rates_source_check" CHECK ("source" IN ('fbil', 'ecb', 'company')),
    CONSTRAINT "fx_rates_pair_check" CHECK ("base" ~ '^[A-Z]{3}$' AND "quote" ~ '^[A-Z]{3}$' AND "base" <> "quote"),
    CONSTRAINT "fx_rates_rate_check" CHECK ("rate" > 0)
);
CREATE INDEX "fx_rates_lookup_idx" ON "fx_rates" ("organization_id", "base", "quote", "rate_date" DESC);

-- Lines: what the receipt says in its own currency, and how it became the pay-currency amount (claimed / approved).
ALTER TABLE "expense_lines"
    ADD COLUMN "receipt_currency" CHAR(3),
    ADD COLUMN "receipt_amount" DECIMAL(14,2),
    ADD COLUMN "fx_rate" DECIMAL(18,8),
    ADD COLUMN "fx_source" VARCHAR(13),
    ADD COLUMN "fx_rate_date" DATE,
    ADD COLUMN "fx_proof_file_id" UUID,
    ADD COLUMN "fx_variance_pct" DECIMAL(7,2),
    ADD COLUMN "receipt_phash" CHAR(16),
    ADD COLUMN "origin" VARCHAR(10) NOT NULL DEFAULT 'employee',
    ADD COLUMN "origin_ref" VARCHAR(60),
    ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT true,
    ADD CONSTRAINT "expense_lines_fx_proof_fkey" FOREIGN KEY ("organization_id", "fx_proof_file_id") REFERENCES "files"("organization_id", "id"),
    ADD CONSTRAINT "expense_lines_fx_check" CHECK (("receipt_currency" IS NULL) = ("fx_rate" IS NULL) AND ("receipt_currency" IS NULL) = ("receipt_amount" IS NULL) AND ("fx_rate" IS NULL OR "fx_rate" > 0)),
    ADD CONSTRAINT "expense_lines_fx_source_check" CHECK ("fx_source" IS NULL OR "fx_source" IN ('reference', 'advance', 'statement', 'company_table', 'manual')),
    ADD CONSTRAINT "expense_lines_phash_check" CHECK ("receipt_phash" IS NULL OR "receipt_phash" ~ '^[0-9a-f]{16}$'),
    ADD CONSTRAINT "expense_lines_origin_check" CHECK ("origin" IN ('employee', 'field_day'));
-- One field-day draft per person and duty day (YX-EXP-16); a removed one can be made again.
CREATE UNIQUE INDEX "expense_lines_origin_key" ON "expense_lines" ("organization_id", "origin_ref") WHERE "origin" = 'field_day' AND "removed_at" IS NULL;

-- Forex advances (YX-EXP-15): the rate at which the advance was loaded; settlements keep both currencies.
ALTER TABLE "expense_advances" ADD COLUMN "fx_rate" DECIMAL(18,8);
ALTER TABLE "advance_settlements"
    ADD COLUMN "amount_pay" DECIMAL(14,2),
    ADD COLUMN "fx_rate" DECIMAL(18,8),
    DROP CONSTRAINT "advance_settlements_amount_check",
    -- The exchange difference moves no foreign currency: only its pay-currency amount (signed) counts.
    ADD CONSTRAINT "advance_settlements_amount_check" CHECK (("kind" <> 'exchange_difference' AND "amount" > 0) OR ("kind" = 'exchange_difference' AND "amount" = 0 AND "amount_pay" IS NOT NULL));

-- Trips: the advance's currency, and who closed the trip and why (§5.5).
ALTER TABLE "trips"
    ADD COLUMN "advance_currency" CHAR(3),
    ADD COLUMN "closed_at" TIMESTAMPTZ(3),
    ADD COLUMN "closed_by" UUID,
    ADD COLUMN "close_reason" VARCHAR(300),
    ADD CONSTRAINT "trips_advance_currency_check" CHECK ("advance_currency" IS NULL OR "advance_currency" ~ '^[A-Z]{3}$');

-- New flags: F4 re-photographed receipt, F12 a rate far from the company rate.
ALTER TABLE "expense_flags" DROP CONSTRAINT "expense_flags_kind_check",
    ADD CONSTRAINT "expense_flags_kind_check" CHECK ("kind" IN ('same_receipt', 'same_invoice', 'look_alike', 'look_alike_image', 'split', 'just_under', 'old_receipt', 'outside_employment', 'on_leave', 'per_diem_overlap', 'ocr_mismatch', 'gstin_invalid', 'gst_maths', 'einvoice_invalid', 'over_limit', 'fx_rate'));

-- ---------------------------------------------------------------------------------------------- RLS (§5.8)
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fx_rates"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- ---------------------------------------------------------------------------------------------- permission key (§16)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'expense.report.view', 'Expense reports of the legal entity, including GST input credit, with CSV export')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'expense.report.view'
ON CONFLICT DO NOTHING;
