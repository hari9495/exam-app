-- Expenses batch E2 (M05-BUILD-DESIGN §5.3, §8, §9, §13, §15): claims, lines (one receipt each), the approver's line
-- changes and the duplicate / fraud flags. Forced RLS + tenant_isolation, and support sessions never read them (§5.8).
-- Money is in the claim's pay currency (multi-currency lines come with E5).

CREATE TABLE "expense_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "trip_id" UUID,
    "title" VARCHAR(150) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "payment_status" VARCHAR(16) NOT NULL DEFAULT 'not_due',
    "route" VARCHAR(8),
    "claimed_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approved_total" DECIMAL(14,2),
    "advance_adjusted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(14,2),
    "risk" VARCHAR(8) NOT NULL DEFAULT 'none',
    "wf_request_id" UUID,
    "send_back_pending" BOOLEAN NOT NULL DEFAULT false,
    "decision_note" VARCHAR(500),
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_claims_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "expense_claims_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_claims_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "expense_claims_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "expense_claims_status_check" CHECK ("status" IN ('draft', 'submitted', 'sent_back', 'approved', 'partly_approved', 'rejected', 'withdrawn')),
    CONSTRAINT "expense_claims_payment_check" CHECK ("payment_status" IN ('not_due', 'approved_unpaid', 'in_payroll', 'payout_queued', 'paid', 'payment_failed')),
    CONSTRAINT "expense_claims_route_check" CHECK ("route" IS NULL OR "route" IN ('payroll', 'payout')),
    CONSTRAINT "expense_claims_risk_check" CHECK ("risk" IN ('none', 'low', 'high')),
    CONSTRAINT "expense_claims_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "expense_claims_amounts_check" CHECK ("claimed_total" >= 0 AND COALESCE("approved_total", 0) >= 0 AND "advance_adjusted" >= 0)
);
CREATE INDEX "expense_claims_employee_idx" ON "expense_claims" ("organization_id", "employee_id", "status");
CREATE INDEX "expense_claims_wf_idx" ON "expense_claims" ("organization_id", "wf_request_id");

CREATE TABLE "expense_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "category_code" VARCHAR(30) NOT NULL,
    "spent_on" DATE NOT NULL,
    "merchant" VARCHAR(120),
    "city" VARCHAR(60),
    "country" CHAR(2) NOT NULL DEFAULT 'IN',
    "tier_id" UUID,
    "pay_mode" VARCHAR(14) NOT NULL DEFAULT 'personal',
    "description" VARCHAR(500),
    "receipt_file_id" UUID,
    "receipt_sha256" CHAR(64),
    "self_declared" BOOLEAN NOT NULL DEFAULT false,
    "ocr" JSONB,
    "claimed" DECIMAL(14,2) NOT NULL,
    "approved" DECIMAL(14,2),
    "reduce_reason" VARCHAR(300),
    "justification" VARCHAR(500),
    "taxable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "policy_result" JSONB,
    "flags" TEXT[] NOT NULL DEFAULT '{}',
    "dup_key" CHAR(64) NOT NULL,
    "mileage" JSONB,
    "per_diem" JSONB,
    "supplier_gstin" VARCHAR(15),
    "invoice_no" VARCHAR(40),
    "invoice_date" DATE,
    "place_of_supply" CHAR(2),
    "taxable_value" DECIMAL(14,2),
    "cgst" DECIMAL(14,2),
    "sgst" DECIMAL(14,2),
    "igst" DECIMAL(14,2),
    "cess" DECIMAL(14,2),
    "billed_to_gstin" VARCHAR(15),
    "itc_status" VARCHAR(18),
    "einvoice_irn" VARCHAR(64),
    "einvoice_verified" BOOLEAN NOT NULL DEFAULT false,
    "removed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_lines_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "expense_lines_claim_fkey" FOREIGN KEY ("organization_id", "claim_id") REFERENCES "expense_claims"("organization_id", "id"),
    CONSTRAINT "expense_lines_category_fkey" FOREIGN KEY ("organization_id", "category_code") REFERENCES "expense_categories"("organization_id", "code") ON UPDATE CASCADE,
    CONSTRAINT "expense_lines_tier_fkey" FOREIGN KEY ("organization_id", "tier_id") REFERENCES "city_tiers"("organization_id", "id"),
    CONSTRAINT "expense_lines_file_fkey" FOREIGN KEY ("organization_id", "receipt_file_id") REFERENCES "files"("organization_id", "id"),
    CONSTRAINT "expense_lines_pay_mode_check" CHECK ("pay_mode" IN ('personal', 'company_card', 'company_paid')),
    CONSTRAINT "expense_lines_amounts_check" CHECK ("claimed" >= 0 AND ("approved" IS NULL OR ("approved" >= 0 AND "approved" <= "claimed")) AND "taxable_amount" >= 0),
    CONSTRAINT "expense_lines_reduce_check" CHECK ("approved" IS NULL OR "approved" = "claimed" OR "reduce_reason" IS NOT NULL),
    CONSTRAINT "expense_lines_sha_check" CHECK ("receipt_sha256" IS NULL OR "receipt_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "expense_lines_dup_check" CHECK ("dup_key" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "expense_lines_gstin_check" CHECK (("supplier_gstin" IS NULL OR "supplier_gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$') AND ("billed_to_gstin" IS NULL OR "billed_to_gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$')),
    CONSTRAINT "expense_lines_itc_check" CHECK ("itc_status" IS NULL OR "itc_status" IN ('eligible', 'blocked', 'not_billed_to_us', 'wrong_state', 'missing', 'not_applicable')),
    CONSTRAINT "expense_lines_country_check" CHECK ("country" ~ '^[A-Z]{2}$')
);
CREATE UNIQUE INDEX "expense_lines_no_key" ON "expense_lines" ("claim_id", "line_no");
CREATE INDEX "expense_lines_claim_idx" ON "expense_lines" ("organization_id", "claim_id");
CREATE INDEX "expense_lines_sha_idx" ON "expense_lines" ("organization_id", "receipt_sha256") WHERE "receipt_sha256" IS NOT NULL AND "removed_at" IS NULL;
CREATE INDEX "expense_lines_dup_idx" ON "expense_lines" ("organization_id", "dup_key") WHERE "removed_at" IS NULL;
CREATE INDEX "expense_lines_invoice_idx" ON "expense_lines" ("organization_id", "supplier_gstin", "invoice_no") WHERE "supplier_gstin" IS NOT NULL AND "removed_at" IS NULL;

-- Paid lines never change (YX-EXP-12): money columns are frozen once the claim is paid.
CREATE FUNCTION expense_lines_paid_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM expense_claims c WHERE c.organization_id = OLD.organization_id AND c.id = OLD.claim_id AND c.payment_status = 'paid')
     AND (NEW.claimed IS DISTINCT FROM OLD.claimed OR NEW.approved IS DISTINCT FROM OLD.approved OR NEW.taxable_amount IS DISTINCT FROM OLD.taxable_amount OR NEW.removed_at IS DISTINCT FROM OLD.removed_at) THEN
    RAISE EXCEPTION 'A paid expense line cannot change; make an adjustment claim instead' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expense_lines_paid_guard BEFORE UPDATE ON "expense_lines" FOR EACH ROW EXECUTE FUNCTION expense_lines_paid_guard();

CREATE TABLE "expense_line_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "by_user_id" UUID NOT NULL,
    "old_amount" DECIMAL(14,2) NOT NULL,
    "new_amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "step" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_line_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_line_changes_line_fkey" FOREIGN KEY ("organization_id", "line_id") REFERENCES "expense_lines"("organization_id", "id"),
    CONSTRAINT "expense_line_changes_reason_check" CHECK (length(trim("reason")) >= 3)
);
CREATE INDEX "expense_line_changes_claim_idx" ON "expense_line_changes" ("organization_id", "claim_id");

CREATE TABLE "expense_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "line_id" UUID,
    "kind" VARCHAR(24) NOT NULL,
    "detail" VARCHAR(300) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "decided_by" UUID,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "expense_flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_flags_claim_fkey" FOREIGN KEY ("organization_id", "claim_id") REFERENCES "expense_claims"("organization_id", "id"),
    CONSTRAINT "expense_flags_status_check" CHECK ("status" IN ('open', 'cleared', 'confirmed')),
    CONSTRAINT "expense_flags_kind_check" CHECK ("kind" IN ('same_receipt', 'same_invoice', 'look_alike', 'split', 'just_under', 'old_receipt', 'outside_employment', 'on_leave', 'per_diem_overlap', 'ocr_mismatch', 'gstin_invalid', 'gst_maths', 'einvoice_invalid', 'over_limit'))
);
CREATE INDEX "expense_flags_claim_idx" ON "expense_flags" ("organization_id", "claim_id", "status");

-- ---------------------------------------------------------------------------------------------- RLS (§5.8)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_claims', 'expense_lines', 'expense_line_changes', 'expense_flags']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads claims, receipts or their flags.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- permission keys (§16)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'expense.claim.view', 'See the expense claims and receipts of the people in scope'),
  (gen_random_uuid(), 'expense.finance.review', 'The finance check of expense claims: clear or confirm flags, see claims of the entity')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('expense.claim.view', 'expense.finance.review')
ON CONFLICT DO NOTHING;
