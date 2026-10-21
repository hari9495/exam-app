-- Contract labour, part 2 (founder decision 21 Oct 2026): vendor compliance (CLB-03), CLRA registers and returns (CLB-04)
-- and reports, from real data. Contractors carry their statutory codes; contract workers carry Aadhaar, UAN and ESI
-- numbers (Confidential: sealed, shown masked, full value only through an audited reveal) and a gate pass.

ALTER TABLE "contractors"
  ADD COLUMN "gstin" VARCHAR(15),
  ADD COLUMN "pf_code" VARCHAR(30),
  ADD COLUMN "esic_code" VARCHAR(30),
  ADD COLUMN "lin" VARCHAR(20),
  ADD CONSTRAINT "contractors_gstin_check" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');

ALTER TABLE "contract_deployments"
  ADD COLUMN "aadhaar_enc" TEXT,
  ADD COLUMN "aadhaar_hash" VARCHAR(128),
  ADD COLUMN "aadhaar_last4" CHAR(4),
  ADD COLUMN "uan_enc" TEXT,
  ADD COLUMN "uan_last4" CHAR(4),
  ADD COLUMN "esic_enc" TEXT,
  ADD COLUMN "esic_last4" CHAR(4),
  ADD COLUMN "gate_pass" VARCHAR(30),
  ADD COLUMN "gate_pass_valid_to" DATE;
-- The same Aadhaar is never deployed twice at once (not already deployed by another contractor).
CREATE UNIQUE INDEX "contract_deployments_open_aadhaar_key" ON "contract_deployments"("organization_id", "aadhaar_hash") WHERE "status" <> 'released' AND "aadhaar_hash" IS NOT NULL;
CREATE UNIQUE INDEX "contract_deployments_gate_pass_key" ON "contract_deployments"("organization_id", "gate_pass") WHERE "status" <> 'released' AND "gate_pass" IS NOT NULL;

-- Standing documents of a contractor (licence, registration, PF and ESI codes, insurance) with their expiry.
CREATE TABLE "contractor_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "number" VARCHAR(60),
    "valid_from" DATE,
    "valid_to" DATE,
    "file_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'submitted',
    "note" VARCHAR(500),
    "submitted_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_documents_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_documents_kind_check" CHECK ("kind" IN ('licence', 'registration', 'pf_code', 'esi_code', 'insurance', 'other')),
    CONSTRAINT "contractor_documents_status_check" CHECK ("status" IN ('submitted', 'verified', 'rejected')),
    CONSTRAINT "contractor_documents_dates_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" >= "valid_from")
);
CREATE INDEX "contractor_documents_contractor_idx" ON "contractor_documents"("organization_id", "contractor_id");

-- Monthly proofs from each contractor for a wage month (CLB-03 matrix). Verified by someone other than who submitted it.
CREATE TABLE "contractor_proofs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "proof_type" VARCHAR(16) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'submitted',
    "reference" VARCHAR(60),
    "amount" DECIMAL(14,2),
    "workers_covered" INTEGER,
    "paid_on" DATE,
    "file_id" UUID,
    "note" VARCHAR(500),
    "submitted_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_proofs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_proofs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_proofs_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_proofs_month_check" CHECK (extract(day FROM "month") = 1),
    CONSTRAINT "contractor_proofs_type_check" CHECK ("proof_type" IN ('pf', 'esi', 'wage_register', 'wage_payment', 'pt_lwf')),
    CONSTRAINT "contractor_proofs_status_check" CHECK ("status" IN ('submitted', 'verified', 'discrepancy', 'not_required')),
    CONSTRAINT "contractor_proofs_numbers_check" CHECK (("amount" IS NULL OR "amount" >= 0) AND ("workers_covered" IS NULL OR "workers_covered" >= 0))
);
CREATE UNIQUE INDEX "contractor_proofs_key" ON "contractor_proofs"("organization_id", "contractor_id", "month", "proof_type");

-- A contractor's bill released for a month although proofs are missing: the reason is kept (and audited).
CREATE TABLE "contractor_bill_releases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "released_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_bill_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_bill_releases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_bill_releases_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_bill_releases_month_check" CHECK (extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "contractor_bill_releases_key" ON "contractor_bill_releases"("organization_id", "contractor_id", "month");

-- A liability alert closed with a note (the alerts themselves are worked out from the data each time).
CREATE TABLE "contractor_alert_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "alert_key" VARCHAR(160) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "resolved_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_alert_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_alert_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contractor_alert_notes_key" ON "contractor_alert_notes"("organization_id", "alert_key");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contractor_documents', 'contractor_proofs', 'contractor_bill_releases', 'contractor_alert_notes']
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

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'clra.compliance.manage', 'Verify contractor documents and monthly proofs, release a held contractor bill with a reason, and close liability alerts'),
  (gen_random_uuid(), 'clra.identity.view', 'See a contract worker''s Aadhaar, UAN and ESI number in full (each view is recorded)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('clra.compliance.manage')
ON CONFLICT DO NOTHING;
