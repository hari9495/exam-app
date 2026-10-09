-- M03 payroll batch 5f (M03-BUILD-DESIGN §5.7, §11.4 … §11.6, PAY-6.01 … 6.10): statutory files, TDS challans and returns,
-- registers and the advisory feed. Every table has forced RLS, tenant isolation and the support exclusion; entity-level
-- tables carry the pay guard on the legal entity (payroll and compliance staff of the entity only); register rows carry
-- it per person, so an employee reads only their own row (YX-SEC-16).

CREATE TABLE "statutory_filings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "statute" VARCHAR(10) NOT NULL,
    "state" VARCHAR(6),
    "period_start" DATE NOT NULL,
    "kind" VARCHAR(18) NOT NULL DEFAULT 'original',
    "corrects_id" UUID,
    "filing_mode" VARCHAR(8) NOT NULL DEFAULT 'self',
    "status" VARCHAR(12) NOT NULL DEFAULT 'generated',
    "format_version" VARCHAR(30) NOT NULL,
    "exchange_file_id" UUID,
    "generation_no" INTEGER NOT NULL DEFAULT 1,
    "regeneration_reason" VARCHAR(500),
    "rows" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB NOT NULL DEFAULT '{}',
    "basis" JSONB NOT NULL DEFAULT '{}',
    "amount" DECIMAL(14,2),
    "reason" VARCHAR(500),
    "reference" VARCHAR(60),
    "uploaded_by" UUID,
    "uploaded_at" TIMESTAMPTZ(3),
    "filed_by" UUID,
    "filed_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_filings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_filings_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "statutory_filings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "statutory_filings_corrects_fkey" FOREIGN KEY ("organization_id", "corrects_id") REFERENCES "statutory_filings"("organization_id", "id"),
    CONSTRAINT "statutory_filings_statute_check" CHECK ("statute" IN ('IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF')),
    CONSTRAINT "statutory_filings_kind_check" CHECK ("kind" IN ('original', 'supplementary', 'excess_adjustment', 'excess_refund')),
    CONSTRAINT "statutory_filings_mode_check" CHECK ("filing_mode" IN ('self', 'partner')),
    CONSTRAINT "statutory_filings_status_check" CHECK ("status" IN ('generated', 'uploaded', 'filed', 'superseded', 'recorded')),
    CONSTRAINT "statutory_filings_month_check" CHECK (extract(day FROM "period_start") = 1),
    CONSTRAINT "statutory_filings_state_check" CHECK (("statute" IN ('IN.PT', 'IN.LWF')) = ("state" IS NOT NULL)),
    CONSTRAINT "statutory_filings_link_check" CHECK (("kind" = 'original') = ("corrects_id" IS NULL)),
    CONSTRAINT "statutory_filings_reason_check" CHECK ("generation_no" = 1 OR "regeneration_reason" IS NOT NULL)
);
-- One live original per statute, state and month (a regenerated file supersedes the earlier row).
CREATE UNIQUE INDEX "statutory_filings_one_original" ON "statutory_filings" ("organization_id", "legal_entity_id", "statute", COALESCE("state", ''), "period_start") WHERE "kind" = 'original' AND "status" <> 'superseded';
REVOKE DELETE, TRUNCATE ON TABLE "statutory_filings" FROM app_runtime;

CREATE TABLE "statutory_penalty_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "filing_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "days_late" INTEGER NOT NULL,
    "base" DECIMAL(14,2) NOT NULL,
    "rate" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "rule_version" VARCHAR(40) NOT NULL,
    "paid_ref" VARCHAR(60),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_penalty_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_penalty_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "statutory_penalty_lines_filing_fkey" FOREIGN KEY ("organization_id", "filing_id") REFERENCES "statutory_filings"("organization_id", "id"),
    CONSTRAINT "statutory_penalty_lines_kind_check" CHECK ("kind" IN ('7Q', '14B', 'esi_interest', 'esi_damages'))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "statutory_penalty_lines" FROM app_runtime;

CREATE TABLE "tds_challans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "deposit_month" DATE NOT NULL,
    "subject_key" VARCHAR(30) NOT NULL DEFAULT 'salary_tds',
    "law_version" VARCHAR(8) NOT NULL,
    "tds" DECIMAL(14,2) NOT NULL,
    "interest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "prefill" JSONB NOT NULL DEFAULT '{}',
    "challan_no" VARCHAR(20),
    "bsr_code" CHAR(7),
    "deposit_date" DATE,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "edit_reason" VARCHAR(500),
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_challans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tds_challans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tds_challans_key" UNIQUE ("organization_id", "legal_entity_id", "deposit_month", "subject_key"),
    CONSTRAINT "tds_challans_status_check" CHECK ("status" IN ('draft', 'deposited')),
    CONSTRAINT "tds_challans_deposit_check" CHECK ("status" = 'draft' OR ("challan_no" IS NOT NULL AND "bsr_code" IS NOT NULL AND "deposit_date" IS NOT NULL)),
    CONSTRAINT "tds_challans_bsr_check" CHECK ("bsr_code" IS NULL OR "bsr_code" ~ '^\d{7}$')
);
REVOKE DELETE, TRUNCATE ON TABLE "tds_challans" FROM app_runtime;

CREATE TABLE "tds_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "form_code" VARCHAR(4) NOT NULL,
    "law_version" VARCHAR(8) NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "quarter" SMALLINT NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'original',
    "corrects_id" UUID,
    "rows" JSONB NOT NULL,
    "reconciliation" JSONB,
    "exchange_file_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "token_no" VARCHAR(30),
    "filed_by" UUID,
    "filed_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tds_returns_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "tds_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tds_returns_corrects_fkey" FOREIGN KEY ("organization_id", "corrects_id") REFERENCES "tds_returns"("organization_id", "id"),
    CONSTRAINT "tds_returns_form_check" CHECK (("law_version" = 'IT-1961' AND "form_code" = '24Q') OR ("law_version" = 'IT-2025' AND "form_code" = '138')),
    CONSTRAINT "tds_returns_quarter_check" CHECK ("quarter" BETWEEN 1 AND 4),
    CONSTRAINT "tds_returns_kind_check" CHECK (("kind" = 'original') = ("corrects_id" IS NULL) AND "kind" IN ('original', 'correction')),
    CONSTRAINT "tds_returns_status_check" CHECK ("status" IN ('draft', 'reconciled', 'filed'))
);
CREATE UNIQUE INDEX "tds_returns_one_original" ON "tds_returns" ("organization_id", "legal_entity_id", "tax_year", "quarter") WHERE "kind" = 'original';
REVOKE DELETE, TRUNCATE ON TABLE "tds_returns" FROM app_runtime;

CREATE TABLE "statutory_registers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "location_id" UUID,
    "register_type" VARCHAR(20) NOT NULL,
    "period_start" DATE NOT NULL,
    "format_version" VARCHAR(30) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(12) NOT NULL DEFAULT 'generated',
    "supersedes_id" UUID,
    "reason" VARCHAR(500),
    "file_ref" VARCHAR(500) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "unsigned_sha256" CHAR(64) NOT NULL,
    "unsigned_bytes" INTEGER NOT NULL,
    "signature_ref" VARCHAR(500),
    "row_count" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozen_at" TIMESTAMPTZ(3),
    "signed_at" TIMESTAMPTZ(3),

    CONSTRAINT "statutory_registers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_registers_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "statutory_registers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "statutory_registers_supersedes_fkey" FOREIGN KEY ("organization_id", "supersedes_id") REFERENCES "statutory_registers"("organization_id", "id"),
    CONSTRAINT "statutory_registers_status_check" CHECK ("status" IN ('generated', 'frozen', 'signed', 'superseded')),
    CONSTRAINT "statutory_registers_version_check" CHECK ("version" = 1 OR ("supersedes_id" IS NOT NULL AND "reason" IS NOT NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "statutory_registers" FROM app_runtime;
-- A frozen or signed register never changes, except that it may be superseded (a new signed version carries the fix).
CREATE FUNCTION statutory_registers_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'superseded' THEN RAISE EXCEPTION 'YX_REGISTER_FINAL: a superseded register never changes'; END IF;
  IF OLD."status" IN ('frozen', 'signed') AND (to_jsonb(NEW) - ARRAY['status', 'signature_ref', 'sha256', 'signed_at', 'file_ref']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'signature_ref', 'sha256', 'signed_at', 'file_ref']) THEN
    RAISE EXCEPTION 'YX_REGISTER_FROZEN: a frozen register never changes; generate a new version with a reason';
  END IF;
  IF OLD."status" = 'signed' AND NEW."status" NOT IN ('signed', 'superseded') THEN RAISE EXCEPTION 'YX_REGISTER_FROZEN: a signed register stays signed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER statutory_registers_guard BEFORE UPDATE ON "statutory_registers" FOR EACH ROW EXECUTE FUNCTION statutory_registers_guard();

CREATE TABLE "register_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "register_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "register_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "register_rows_register_fkey" FOREIGN KEY ("organization_id", "register_id") REFERENCES "statutory_registers"("organization_id", "id")
);
CREATE INDEX "register_rows_employee_idx" ON "register_rows" ("organization_id", "employee_id");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "register_rows" FROM app_runtime;

CREATE TABLE "inspection_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "location_id" UUID,
    "period_start" DATE NOT NULL,
    "register_ids" UUID[] NOT NULL,
    "exchange_file_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_packs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inspection_packs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "inspection_packs" FROM app_runtime;

CREATE TABLE "advisory_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "advisory_code" VARCHAR(40) NOT NULL,
    "rule_version" VARCHAR(20) NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "reviewed_by" UUID NOT NULL,
    "reviewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advisory_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "advisory_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "advisory_reviews_key" UNIQUE ("organization_id", "legal_entity_id", "advisory_code", "rule_version")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "advisory_reviews" FROM app_runtime;

-- Exchange files gain the quarterly TDS return annexure (old law) and the inspection pack.
ALTER TABLE "exchange_files" DROP CONSTRAINT "exchange_files_kind_check";
ALTER TABLE "exchange_files" ADD CONSTRAINT "exchange_files_kind_check" CHECK ("kind" IN ('bank', 'ecr', 'esi', 'pt', 'lwf', 'form138', 'form24q', 'form140', 'journal', 'register', 'inspection', 'wps'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['statutory_filings', 'statutory_penalty_lines', 'tds_challans', 'tds_returns', 'statutory_registers', 'register_rows', 'inspection_packs', 'advisory_reviews']
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
  -- Entity filings, challans, returns, registers and packs: the entity's payroll and compliance staff only.
  FOREACH t IN ARRAY ARRAY['statutory_filings', 'statutory_penalty_lines', 'tds_challans', 'tds_returns', 'statutory_registers', 'inspection_packs', 'advisory_reviews']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  -- A register row: the person's own, or the entity's staff (YX-SEC-16).
  EXECUTE
    'CREATE POLICY pay_guard ON register_rows AS RESTRICTIVE
       USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))';
END $$;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'statutory.filing.view', 'See the statutory hub, filings, challans, returns and registers of the legal entities in scope'),
  (gen_random_uuid(), 'statutory.filing.generate', 'Generate PF, ESI, PT and LWF files, supplementary filings and TDS returns'),
  (gen_random_uuid(), 'statutory.filing.download', 'Download statutory files (each download is recorded with the file''s hash)'),
  (gen_random_uuid(), 'statutory.filing.mark_filed', 'Record a filing as uploaded and filed, which locks the month (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'statutory.challan.manage', 'Prepare TDS challans and record deposits'),
  (gen_random_uuid(), 'statutory.register.sign', 'Freeze and sign statutory registers, and issue the year-end tax certificates in bulk (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'statutory.advisory.review', 'Review labour-law advisories for the legal entities in scope')
ON CONFLICT DO NOTHING;
