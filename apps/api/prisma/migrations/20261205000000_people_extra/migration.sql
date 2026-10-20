-- People, the unbuilt screens (founder decision 21 Oct 2026): identity checks (PPL-34), merge and unmerge of two
-- records of one person (PPL-37), the disability declaration (PPL-38, Special), work authorisations (PPL-45,
-- Confidential), international bank details and split pay (PPL-46, Confidential, maker-checker), and for companies
-- that switch them on, BFSI declarations (PPL-43) and trading pre-clearance (PPL-44, maker-checker).

-- PPL-34: identity checks across hiring and joining, with the consent behind each (by jurisdiction).
CREATE TABLE "identity_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "point" VARCHAR(60) NOT NULL,
    "result" VARCHAR(12) NOT NULL,
    "jurisdiction" VARCHAR(60),
    "consent" VARCHAR(8),
    "note" VARCHAR(500),
    "checked_on" DATE NOT NULL,
    "by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "identity_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "identity_checks_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "identity_checks_result_check" CHECK ("result" IN ('captured', 'match', 'mismatch', 'attested', 'id_only', 'requested')),
    CONSTRAINT "identity_checks_consent_check" CHECK ("consent" IS NULL OR "consent" IN ('given', 'refused'))
);
CREATE INDEX "identity_checks_person_idx" ON "identity_checks"("organization_id", "person_id");

-- PPL-37: a merge of two person records, with everything needed to undo it exactly.
CREATE TABLE "person_merges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kept_person_id" UUID NOT NULL,
    "merged_person_id" UUID NOT NULL,
    "choices" JSONB NOT NULL,
    "kept_before" JSONB NOT NULL,
    "moved" JSONB NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "merged_by" UUID NOT NULL,
    "merged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unmerged_by" UUID,
    "unmerged_at" TIMESTAMPTZ(3),
    "unmerge_note" VARCHAR(1000),
    CONSTRAINT "person_merges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_merges_kept_fkey" FOREIGN KEY ("organization_id", "kept_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "person_merges_merged_fkey" FOREIGN KEY ("organization_id", "merged_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "person_merges_two_check" CHECK ("kept_person_id" <> "merged_person_id")
);
-- One live merge per merged record.
CREATE UNIQUE INDEX "person_merges_live_key" ON "person_merges"("organization_id", "merged_person_id") WHERE "unmerged_at" IS NULL;

-- PPL-38: the voluntary disability declaration (Special).
CREATE TABLE "disability_declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "percent" SMALLINT NOT NULL,
    "certificate_document_id" UUID,
    "valid_until" DATE,
    "adjustments" VARCHAR(1000),
    "status" VARCHAR(10) NOT NULL DEFAULT 'declared',
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "disability_declarations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disability_declarations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "disability_declarations_status_check" CHECK ("status" IN ('declared', 'verified', 'withdrawn')),
    CONSTRAINT "disability_declarations_percent_check" CHECK ("percent" BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "disability_declarations_live_key" ON "disability_declarations"("organization_id", "employee_id") WHERE "withdrawn_at" IS NULL;

-- PPL-45: visas, permits and national IDs for people who work outside their home country (Confidential).
CREATE TABLE "work_authorisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "doc_type" VARCHAR(40) NOT NULL,
    "number_enc" TEXT NOT NULL,
    "number_last4" VARCHAR(4) NOT NULL,
    "sponsor" VARCHAR(120),
    "occupation" VARCHAR(120),
    "issued_on" DATE,
    "expires_on" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_authorisations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_authorisations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "work_authorisations_dates_check" CHECK ("issued_on" IS NULL OR "expires_on" > "issued_on")
);
CREATE INDEX "work_authorisations_employee_idx" ON "work_authorisations"("organization_id", "employee_id");

-- PPL-46: international bank accounts and the split of net pay, changed only through an approved request.
CREATE TABLE "pay_split_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "accounts" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "usable_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "pay_split_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_split_requests_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "pay_split_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled'))
);
CREATE UNIQUE INDEX "pay_split_requests_pending_key" ON "pay_split_requests"("organization_id", "employee_id") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "pay_split_requests_live_key" ON "pay_split_requests"("organization_id", "employee_id") WHERE "status" = 'approved' AND "valid_to" IS NULL;

-- PPL-43: designated persons and their annual declarations (Confidential to the compliance officer).
CREATE TABLE "designated_persons" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "added_by" UUID,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "designated_persons_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "designated_persons_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
);

CREATE TABLE "bfsi_declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year" VARCHAR(7) NOT NULL,
    "due_on" DATE NOT NULL,
    "holdings" JSONB NOT NULL DEFAULT '[]',
    "related" JSONB NOT NULL DEFAULT '[]',
    "coi_has" BOOLEAN,
    "coi_details" VARCHAR(2000),
    "coc_version" VARCHAR(20),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "attested_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "bfsi_declarations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bfsi_declarations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "bfsi_declarations_status_check" CHECK ("status" IN ('draft', 'submitted', 'reviewed'))
);
CREATE UNIQUE INDEX "bfsi_declarations_year_key" ON "bfsi_declarations"("organization_id", "employee_id", "year");

-- PPL-44: closed trading windows and pre-clearance requests.
CREATE TABLE "trading_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "closed_from" DATE NOT NULL,
    "closed_to" DATE NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trading_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trading_windows_dates_check" CHECK ("closed_to" >= "closed_from")
);

CREATE TABLE "preclearance_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "ref" VARCHAR(20) NOT NULL,
    "security" VARCHAR(160) NOT NULL,
    "side" VARCHAR(4) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "value" DECIMAL(16, 2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "approved_on" DATE,
    "valid_until" DATE,
    "traded_on" DATE,
    "traded_quantity" INTEGER,
    "contract_note_document_id" UUID,
    "reported_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "preclearance_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preclearance_requests_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "preclearance_requests_side_check" CHECK ("side" IN ('buy', 'sell')),
    CONSTRAINT "preclearance_requests_qty_check" CHECK ("quantity" > 0 AND ("traded_quantity" IS NULL OR "traded_quantity" > 0)),
    CONSTRAINT "preclearance_requests_value_check" CHECK ("value" > 0),
    CONSTRAINT "preclearance_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
CREATE UNIQUE INDEX "preclearance_requests_ref_key" ON "preclearance_requests"("organization_id", "ref");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['identity_checks', 'person_merges', 'disability_declarations', 'work_authorisations', 'pay_split_requests', 'designated_persons', 'bfsi_declarations', 'trading_windows', 'preclearance_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- Personal, Confidential and Special rows: never inside a YukthiX support session.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- Documents the new screens collect from the person themselves (company-wide types: written as system work).
SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'disability_certificate', 'Disability certificate (UDID or medical board)', 'special', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, false, '{}', ARRAY['person']),
  (NULL, 'contract_note', 'Contract note (trade report)', 'confidential', false, ARRAY['application/pdf'], 5, false, '{}', ARRAY['person']);
SELECT set_config('app.is_super_admin', 'off', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'employee.disability.manage', 'See and verify disability declarations (Special: the HR diversity role)'),
  (gen_random_uuid(), 'compliance.officer', 'Keep the regulated declarations register and decide trading pre-clearance (Confidential)')
ON CONFLICT DO NOTHING;
