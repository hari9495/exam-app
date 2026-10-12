-- Payroll batch 5h (M03-BUILD-DESIGN §5.9, §17.8; M03 A8, YX-PAY-37/38, YX-TAX-16/17): consultants and contractors paid
-- through payroll. The consultant register (PAN and bank sealed with a hash and the last four; Special), s.197 lower
-- deduction certificates, monthly invoices approved through P03 with their TDS, bank files for consultant payments released
-- by someone else, the consultant's own sign-in (OTP; own rows only) and Form 131 / 16A certificates per quarter.
--   RLS: forced, tenant isolation, no YukthiX support sessions, and the pay guard: payroll staff see the legal entities their
--   keys reach (app.pay_entities); a consultant's portal session (app.consultant_portal) sees only that consultant's rows.

CREATE FUNCTION app_consultant() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.consultant_portal', true), '')::uuid
$$;

CREATE TABLE "consultants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "pan_enc" TEXT,
    "pan_hash" CHAR(64),
    "pan_last4" CHAR(4),
    "pan_status" VARCHAR(12) NOT NULL,
    "gstin" VARCHAR(15),
    "default_section" VARCHAR(8) NOT NULL,
    "bank_holder" VARCHAR(200),
    "bank_ifsc" CHAR(11),
    "bank_account_enc" TEXT,
    "bank_account_hash" CHAR(64),
    "bank_account_last4" CHAR(4),
    "bank_changed_by" UUID,
    "bank_usable_from" TIMESTAMPTZ(3),
    "bank_verified_ref" VARCHAR(60),
    "bank_verified_by" UUID,
    "bank_verified_at" TIMESTAMPTZ(3),
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consultants_kind_check" CHECK ("kind" IN ('individual', 'firm')),
    CONSTRAINT "consultants_pan_check" CHECK (("pan_status" = 'missing') = ("pan_enc" IS NULL) AND "pan_status" IN ('operative', 'inoperative', 'missing')),
    CONSTRAINT "consultants_section_check" CHECK ("default_section" IN ('194C', '194J_A', '194J_B')),
    CONSTRAINT "consultants_status_check" CHECK ("status" IN ('active', 'inactive')),
    -- YX-PAY-37 / P10: a bank account is verified (penny drop) by someone other than the person who entered it.
    CONSTRAINT "consultants_bank_checker_check" CHECK ("bank_verified_by" IS NULL OR "bank_verified_by" <> "bank_changed_by")
);
CREATE UNIQUE INDEX "consultants_email_key" ON "consultants" ("organization_id", "legal_entity_id", lower("email"));
CREATE INDEX "consultants_pan_hash_idx" ON "consultants" ("organization_id", "pan_hash");

CREATE TABLE "tds_197_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "certificate_no" VARCHAR(30) NOT NULL,
    "section" VARCHAR(8) NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "limit_amount" DECIMAL(14,2) NOT NULL,
    "consumed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_197_certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tds_197_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tds_197_certificates_consultant_fkey" FOREIGN KEY ("consultant_id") REFERENCES "consultants"("id") ON DELETE CASCADE,
    CONSTRAINT "tds_197_certificates_check" CHECK ("valid_to" >= "valid_from" AND "rate" >= 0 AND "rate" < 1 AND "limit_amount" > 0 AND "consumed" >= 0 AND "consumed" <= "limit_amount")
);

CREATE TABLE "consultant_payout_batches" (
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
    "invoice_ids" UUID[] NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "generated_by" UUID NOT NULL,
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_payout_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultant_payout_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consultant_payout_batches_status_check" CHECK ("status" IN ('draft', 'released', 'confirmed', 'cancelled')),
    CONSTRAINT "consultant_payout_batches_checker_check" CHECK ("released_by" IS NULL OR "released_by" <> "generated_by"),
    CONSTRAINT "consultant_payout_batches_rows_check" CHECK ("row_count" > 0 AND "total" > 0)
);

CREATE TABLE "consultant_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "invoice_no" VARCHAR(40) NOT NULL,
    "invoice_date" DATE NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "period" DATE NOT NULL,
    "taxable_value" DECIMAL(14,2) NOT NULL,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "section" VARCHAR(8) NOT NULL,
    "file_ref" VARCHAR(500),
    "file_sha256" CHAR(64),
    "file_name" VARCHAR(200),
    "uploaded_via" VARCHAR(10) NOT NULL,
    "uploaded_by" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'submitted',
    "wf_request_id" UUID,
    "decision_note" VARCHAR(500),
    "tds_amount" DECIMAL(14,2),
    "tds_base" DECIMAL(14,2),
    "tds_rate" VARCHAR(12),
    "tds_reason" VARCHAR(20),
    "tds_rule_version" VARCHAR(20),
    "certificate_id" UUID,
    "certificate_used" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(14,2),
    "payout_batch_id" UUID,
    "paid_on" DATE,
    "payment_ref" VARCHAR(80),
    "payment_reason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultant_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consultant_invoices_consultant_fkey" FOREIGN KEY ("consultant_id") REFERENCES "consultants"("id") ON DELETE CASCADE,
    CONSTRAINT "consultant_invoices_certificate_fkey" FOREIGN KEY ("certificate_id") REFERENCES "tds_197_certificates"("id"),
    CONSTRAINT "consultant_invoices_batch_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "consultant_payout_batches"("id"),
    CONSTRAINT "consultant_invoices_section_check" CHECK ("section" IN ('194C', '194J_A', '194J_B')),
    CONSTRAINT "consultant_invoices_via_check" CHECK ("uploaded_via" IN ('consultant', 'staff')),
    CONSTRAINT "consultant_invoices_status_check" CHECK ("status" IN ('submitted', 'approved', 'rejected', 'queued', 'sent', 'paid', 'failed')),
    CONSTRAINT "consultant_invoices_amount_check" CHECK ("taxable_value" > 0 AND "cgst" >= 0 AND "sgst" >= 0 AND "igst" >= 0)
);
-- YX-PAY-38: an invoice number once per consultant and tax year.
CREATE UNIQUE INDEX "consultant_invoices_no_key" ON "consultant_invoices" ("organization_id", "consultant_id", "tax_year", lower("invoice_no"));
CREATE INDEX "consultant_invoices_period_idx" ON "consultant_invoices" ("organization_id", "legal_entity_id", "period");

CREATE TABLE "consultant_portal_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultant_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consultant_portal_sessions_consultant_fkey" FOREIGN KEY ("consultant_id") REFERENCES "consultants"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "consultant_portal_sessions_token_key" ON "consultant_portal_sessions" ("token_hash");

-- Form 131 (Form 16A up to 31 Mar 2026) per consultant and quarter, from TRACES after the quarterly return is filed.
CREATE TABLE "consultant_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "consultant_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "quarter" SMALLINT NOT NULL,
    "form_code" VARCHAR(4) NOT NULL,
    "file_ref" VARCHAR(500) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'issued',
    "issued_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultant_certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consultant_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consultant_certificates_consultant_fkey" FOREIGN KEY ("consultant_id") REFERENCES "consultants"("id") ON DELETE CASCADE,
    CONSTRAINT "consultant_certificates_form_check" CHECK ("form_code" IN ('16A', '131') AND "quarter" BETWEEN 1 AND 4),
    CONSTRAINT "consultant_certificates_status_check" CHECK ("status" IN ('issued', 'superseded'))
);
CREATE UNIQUE INDEX "consultant_certificates_issued_key" ON "consultant_certificates" ("organization_id", "consultant_id", "tax_year", "quarter") WHERE "status" = 'issued';

-- Form 140 (26Q up to 31 Mar 2026) is a TDS return like Form 138; challans are kept per section.
ALTER TABLE "tds_returns" DROP CONSTRAINT "tds_returns_form_check";
ALTER TABLE "tds_returns" ADD CONSTRAINT "tds_returns_form_check" CHECK (("law_version" = 'IT-1961' AND "form_code" IN ('24Q', '26Q')) OR ("law_version" = 'IT-2025' AND "form_code" IN ('138', '140')));

REVOKE DELETE, TRUNCATE ON TABLE "consultants", "tds_197_certificates", "consultant_payout_batches", "consultant_invoices", "consultant_certificates" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['consultants', 'tds_197_certificates', 'consultant_payout_batches', 'consultant_invoices', 'consultant_portal_sessions', 'consultant_certificates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- The pay guard: payroll staff by legal entity; a consultant's own session by its own rows (never another's).
CREATE POLICY pay_guard ON "consultants" AS RESTRICTIVE
  USING (CASE WHEN (SELECT app_consultant()) IS NULL THEN "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) ELSE "id" = (SELECT app_consultant()) END)
  WITH CHECK ((SELECT app_consultant()) IS NULL AND "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
CREATE POLICY pay_guard ON "consultant_invoices" AS RESTRICTIVE
  USING (CASE WHEN (SELECT app_consultant()) IS NULL THEN "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) ELSE "consultant_id" = (SELECT app_consultant()) END)
  WITH CHECK (CASE WHEN (SELECT app_consultant()) IS NULL THEN "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) ELSE "consultant_id" = (SELECT app_consultant()) AND "uploaded_via" = 'consultant' END);
CREATE POLICY pay_guard ON "consultant_certificates" AS RESTRICTIVE
  USING (CASE WHEN (SELECT app_consultant()) IS NULL THEN "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) ELSE "consultant_id" = (SELECT app_consultant()) END)
  WITH CHECK ((SELECT app_consultant()) IS NULL AND "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
CREATE POLICY pay_guard ON "consultant_portal_sessions" AS RESTRICTIVE
  USING ((SELECT app_consultant()) IS NULL OR "consultant_id" = (SELECT app_consultant()))
  WITH CHECK ((SELECT app_consultant()) IS NULL);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tds_197_certificates', 'consultant_payout_batches']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ((SELECT app_consultant()) IS NULL AND "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ((SELECT app_consultant()) IS NULL AND "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;

-- The 5h keys (M03-BUILD-DESIGN §6.2).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'consultant.manage', 'The consultant register, their invoices, TDS and payments, Form 140 rows and Form 131 (never one''s own)'),
  (gen_random_uuid(), 'consultant.invoice.approve', 'Approve consultant invoices for payment (never one''s own upload)')
ON CONFLICT DO NOTHING;
