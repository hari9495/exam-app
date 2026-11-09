-- Staffing desk, slice 3 (HIR-18 invoices and vendor invoices, HIR-19 receivables and collections, HIR-30 placement fee
-- and replacement guarantee, HIR-31 e-invoice window; the client portal per contact, answer 453; TDS by client and
-- invoice grouping, answer 454). Money is paise (BIGINT). An issued invoice is never edited: a credit note corrects it.
-- Numbers come from the slice-1 series (one per GSTIN per financial year, only up, never reused). GST rates, TDS
-- sections and the e-invoice window are rule sets (data, marked verify), never code.

-- Answer 454: the client's TDS section and how its invoices are grouped. Answer 453: portal access per contact.
ALTER TABLE "staffing_clients"
  ADD COLUMN "tds_section" VARCHAR(8),
  ADD COLUMN "invoice_grouping" VARCHAR(10) NOT NULL DEFAULT 'month';
ALTER TABLE "staffing_clients" ADD CONSTRAINT "staffing_clients_grouping_check" CHECK ("invoice_grouping" IN ('month', 'placement'));
ALTER TABLE "staffing_client_contacts"
  ADD COLUMN "portal" VARCHAR(8) NOT NULL DEFAULT 'none',
  ADD COLUMN "portal_invited_at" TIMESTAMPTZ(3);
ALTER TABLE "staffing_client_contacts" ADD CONSTRAINT "staffing_client_contacts_portal_check" CHECK ("portal" IN ('none', 'invited', 'active'));
-- Credit notes run their own counter in the same series (prefix + CN-), also only up.
ALTER TABLE "staffing_invoice_series" ADD COLUMN "next_credit_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "staffing_invoice_series" ADD CONSTRAINT "staffing_invoice_series_next_cn_check" CHECK ("next_credit_number" BETWEEN 1 AND 99999999);

-- Weekly hours per placement, approved (or sent back) by the client contact. Quantities are hundredths of an hour.
CREATE TABLE "staffing_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "hours_centi" INTEGER NOT NULL,
    "overtime_centi" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'waiting',
    "note" VARCHAR(500),
    "decided_by_contact_id" UUID,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "invoice_id" UUID,
    "vendor_bill_id" UUID,
    "entered_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_hours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_hours_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "staffing_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_hours_status_check" CHECK ("status" IN ('waiting', 'approved', 'sent_back')),
    CONSTRAINT "staffing_hours_qty_check" CHECK ("hours_centi" BETWEEN 0 AND 16800 AND "overtime_centi" BETWEEN 0 AND 16800 AND "hours_centi" + "overtime_centi" > 0),
    -- A week is Monday to Sunday.
    CONSTRAINT "staffing_hours_monday_check" CHECK (EXTRACT(ISODOW FROM "week_start") = 1)
);
CREATE UNIQUE INDEX "staffing_hours_week_key" ON "staffing_hours" ("placement_id", "week_start");
CREATE INDEX "staffing_hours_org_idx" ON "staffing_hours" ("organization_id", "client_id", "status");

-- HIR-18: tax invoices and credit notes (kind), numbered from the series when issued.
CREATE TABLE "staffing_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "credit_of" UUID,
    "number" VARCHAR(16),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "period_start" DATE,
    "period_end" DATE,
    "invoice_date" DATE,
    "supplier_state" VARCHAR(6) NOT NULL,
    "place_of_supply" VARCHAR(6) NOT NULL,
    "gst_pct" NUMERIC(5,2) NOT NULL,
    "taxable_paise" BIGINT NOT NULL,
    "cgst_paise" BIGINT NOT NULL DEFAULT 0,
    "sgst_paise" BIGINT NOT NULL DEFAULT 0,
    "igst_paise" BIGINT NOT NULL DEFAULT 0,
    "total_paise" BIGINT NOT NULL,
    "po" VARCHAR(60),
    "reason" VARCHAR(500),
    "irn" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "tds_26as_paise" BIGINT,
    "dispute" VARCHAR(500),
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staffing_invoices_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "staffing_invoice_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staffing_invoices_credit_of_fkey" FOREIGN KEY ("credit_of") REFERENCES "staffing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staffing_invoices_kind_check" CHECK ("kind" IN ('staffing', 'credit_note') AND (("kind" = 'credit_note') = ("credit_of" IS NOT NULL))),
    CONSTRAINT "staffing_invoices_status_check" CHECK ("status" IN ('draft', 'issued')),
    -- Issued means numbered and dated; a draft has neither.
    CONSTRAINT "staffing_invoices_issued_check" CHECK (("status" = 'issued') = ("number" IS NOT NULL AND "invoice_date" IS NOT NULL)),
    CONSTRAINT "staffing_invoices_irn_check" CHECK ("irn" IN ('pending', 'not_needed')),
    CONSTRAINT "staffing_invoices_money_check" CHECK ("taxable_paise" >= 0 AND "total_paise" = "taxable_paise" + "cgst_paise" + "sgst_paise" + "igst_paise" AND ("igst_paise" = 0 OR ("cgst_paise" = 0 AND "sgst_paise" = 0)))
);
-- One number per series, ever (credit notes carry the CN- part in the number).
CREATE UNIQUE INDEX "staffing_invoices_number_key" ON "staffing_invoices" ("series_id", "number") WHERE "number" IS NOT NULL;
CREATE INDEX "staffing_invoices_org_idx" ON "staffing_invoices" ("organization_id", "client_id", "status");

CREATE TABLE "staffing_invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "placement_id" UUID,
    "description" VARCHAR(300) NOT NULL,
    "qty_centi" INTEGER NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    CONSTRAINT "staffing_invoice_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "staffing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "staffing_invoice_lines_invoice_idx" ON "staffing_invoice_lines" ("invoice_id");

-- HIR-19: a client's payment, its TDS, and how it settles invoices (cash + TDS = the settled amounts).
CREATE TABLE "staffing_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "received_on" DATE NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "tds_paise" BIGINT NOT NULL DEFAULT 0,
    "reference" VARCHAR(60),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_receipts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staffing_receipts_money_check" CHECK ("amount_paise" >= 0 AND "tds_paise" >= 0 AND "amount_paise" + "tds_paise" > 0)
);
CREATE TABLE "staffing_receipt_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "tds_paise" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "staffing_receipt_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_receipt_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "staffing_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_receipt_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "staffing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staffing_receipt_allocations_money_check" CHECK ("amount_paise" > 0 AND "tds_paise" >= 0 AND "tds_paise" <= "amount_paise")
);
CREATE INDEX "staffing_receipt_allocations_invoice_idx" ON "staffing_receipt_allocations" ("invoice_id");

-- HIR-30: per-client contract terms: placement fee, conversion taper and replacement guarantee.
CREATE TABLE "staffing_client_terms" (
    "client_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "fee_kind" VARCHAR(8) NOT NULL,
    "fee_pct_bp" INTEGER,
    "fee_paise" BIGINT,
    -- [{"fromMonth":0,"pctBp":833}, ...] ascending by fromMonth, starting at 0.
    "taper" JSONB NOT NULL DEFAULT '[]',
    "guarantee_days" INTEGER NOT NULL,
    "remedy" VARCHAR(8) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_client_terms_pkey" PRIMARY KEY ("client_id"),
    CONSTRAINT "staffing_client_terms_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_client_terms_fee_check" CHECK (("fee_kind" = 'percent' AND "fee_pct_bp" BETWEEN 1 AND 10000 AND "fee_paise" IS NULL) OR ("fee_kind" = 'fixed' AND "fee_paise" > 0 AND "fee_pct_bp" IS NULL)),
    CONSTRAINT "staffing_client_terms_guarantee_check" CHECK ("guarantee_days" BETWEEN 0 AND 365 AND "remedy" IN ('replace', 'refund'))
);

-- Answer 490: vendor invoices proposed from client-approved hours of vendor-supplied placements, per month.
CREATE TABLE "staffing_vendor_bills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "qty_centi" INTEGER NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "net_paise" BIGINT NOT NULL,
    "gst_paise" BIGINT NOT NULL,
    "tds_section" VARCHAR(8) NOT NULL,
    "tds_paise" BIGINT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'confirmed',
    "vendor_invoice_no" VARCHAR(40) NOT NULL,
    "paid_on" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_vendor_bills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_vendor_bills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_vendor_bills_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "staffing_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "staffing_vendor_bills_status_check" CHECK ("status" IN ('confirmed', 'paid') AND (("status" = 'paid') = ("paid_on" IS NOT NULL))),
    CONSTRAINT "staffing_vendor_bills_month_check" CHECK (EXTRACT(DAY FROM "month") = 1)
);
CREATE UNIQUE INDEX "staffing_vendor_bills_month_key" ON "staffing_vendor_bills" ("placement_id", "month");

-- Answer 453: a client contact's portal session (email one-time code; the token is stored hashed).
CREATE TABLE "staffing_portal_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_portal_sessions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "staffing_client_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staffing_portal_sessions_token_key" ON "staffing_portal_sessions" ("token_hash");

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['staffing_hours', 'staffing_invoices', 'staffing_invoice_lines', 'staffing_receipts', 'staffing_receipt_allocations', 'staffing_client_terms', 'staffing_vendor_bills', 'staffing_portal_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
  END LOOP;
END $$;

-- Data: the finance key and the rule sets.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'ats.staffing.billing', 'Staffing desk: client invoices, credit notes, receipts and TDS, vendor invoices (finance)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'ats.staffing.billing'
ON CONFLICT DO NOTHING;

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('GST.STAFFING_RATE', 'IN', '2026-v1', '2017-07-01',
   '{"gstPct":"18","sac":"998519","intraState":["CGST","SGST"],"interState":["IGST"]}',
   'GST on manpower supply and placement services: 18% (SAC 9985). Intra-state CGST + SGST half each; inter-state IGST (IGST Act s.7, CGST Act s.9). Verify the SAC and rate with the CA.', true),
  ('GST.EINVOICE_WINDOW', 'IN', '2026-v1', '2025-04-01',
   '{"reportWithinDays":30,"warnFromDay":25,"appliesFromTurnoverCr":"10"}',
   'E-invoice: taxpayers with aggregate turnover of 10 crore and above; from 1 Apr 2025, those with AATO of 10 crore or more must report an invoice to the IRP within 30 days of its date (GSTN advisory, 2024). Verify with the CA.', true),
  ('TDS.SECTIONS', 'IN', '2026-v1', '2024-10-01',
   '{"194C":{"label":"194C contract work","individualPct":"1","otherPct":"2"},"194J":{"label":"194J professional or technical","individualPct":"10","otherPct":"10","technicalPct":"2"}}',
   'Income-tax Act 1961 s.194C (1% individuals and HUF, 2% others) and s.194J (10% professional fees, 2% fees for technical services). Thresholds and the new Income-tax Act 2025 section numbers apply from 1 Apr 2026: verify with the CA.', true);
