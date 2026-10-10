-- M03 payroll batch 5e (M03-BUILD-DESIGN §5.6, §8.5, §8.6, PAY-5.01 … 5.08): income tax on salary. A tax workspace per
-- employment and tax year (regime, residential status, PAN status, other income), declarations with line-by-line proof
-- verification, the TDS projection behind every payslip (the tax sheet), perquisites (Form 12BA) and the year-end
-- certificate (Form 16 to March 2026, Form 130 after). Forced RLS, tenant isolation, no support sessions and the pay guard
-- on every table; an employee writes only their own workspace and declarations.

CREATE TABLE "tax_workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "law_version" VARCHAR(8) NOT NULL,
    "regime" VARCHAR(3) NOT NULL DEFAULT 'new',
    "regime_set_at" TIMESTAMPTZ(3),
    "regime_override_by" UUID,
    "regime_override_reason" VARCHAR(500),
    "residential_status" VARCHAR(12) NOT NULL DEFAULT 'resident',
    "trc_valid_to" DATE,
    "dtaa_country" CHAR(2),
    "pan_status" VARCHAR(12) NOT NULL DEFAULT 'unchecked',
    "pan_status_by" UUID,
    "pan_status_reason" VARCHAR(300),
    "other_income" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_workspaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_workspaces_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "tax_workspaces_key" UNIQUE ("organization_id", "employment_id", "tax_year"),
    CONSTRAINT "tax_workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_workspaces_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "tax_workspaces_year_check" CHECK ("tax_year" ~ '^\d{4}-\d{2}$'),
    CONSTRAINT "tax_workspaces_law_check" CHECK ("law_version" IN ('IT-1961', 'IT-2025')),
    CONSTRAINT "tax_workspaces_regime_check" CHECK ("regime" IN ('new', 'old')),
    CONSTRAINT "tax_workspaces_residence_check" CHECK ("residential_status" IN ('resident', 'non_resident')),
    CONSTRAINT "tax_workspaces_pan_check" CHECK ("pan_status" IN ('unchecked', 'operative', 'inoperative')),
    CONSTRAINT "tax_workspaces_override_check" CHECK (("regime_override_by" IS NULL) = ("regime_override_reason" IS NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "tax_workspaces" FROM app_runtime;

CREATE TABLE "tax_declaration_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subject_key" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "landlord_name" VARCHAR(200),
    "landlord_pan_enc" TEXT,
    "landlord_pan_last4" CHAR(4),
    "rent_from" CHAR(7),
    "rent_to" CHAR(7),
    "metro" BOOLEAN,
    "proof_files" JSONB NOT NULL DEFAULT '[]',
    "proof_status" VARCHAR(8) NOT NULL DEFAULT 'none',
    "approved_amount" DECIMAL(14,2),
    "verifier_id" UUID,
    "verifier_comment" VARCHAR(500),
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_declaration_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_declaration_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_declaration_lines_workspace_fkey" FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "tax_workspaces"("organization_id", "id"),
    CONSTRAINT "tax_declaration_lines_key" UNIQUE ("organization_id", "workspace_id", "subject_key"),
    CONSTRAINT "tax_declaration_lines_amount_check" CHECK ("amount" >= 0 AND ("approved_amount" IS NULL OR ("approved_amount" >= 0 AND "approved_amount" <= "amount"))),
    CONSTRAINT "tax_declaration_lines_status_check" CHECK ("proof_status" IN ('none', 'pending', 'approved', 'partly', 'rejected')),
    CONSTRAINT "tax_declaration_lines_rent_check" CHECK ("subject_key" <> 'hra' OR ("rent_from" IS NOT NULL AND "rent_to" IS NOT NULL AND "rent_from" <= "rent_to" AND "metro" IS NOT NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "tax_declaration_lines" FROM app_runtime;
-- YX-TAX-05: whoever verifies a proof is never the employee it belongs to (also checked in code).
CREATE FUNCTION tax_declaration_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."verifier_id" IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = NEW.organization_id AND e.id = NEW.employee_id AND e.user_id = NEW.verifier_id) THEN
    RAISE EXCEPTION 'YX_TAX_SELF_VERIFY: an employee never verifies their own proof';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_declaration_lines_guard BEFORE INSERT OR UPDATE ON "tax_declaration_lines" FOR EACH ROW EXECUTE FUNCTION tax_declaration_lines_guard();

-- The projection behind each payslip's TDS (the tax sheet is this row, YX-TAX-06). Written once with the payslip.
CREATE TABLE "tds_projections" (
    "payslip_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "law_version" VARCHAR(8) NOT NULL,
    "regime" VARCHAR(3) NOT NULL,
    "calc_version" VARCHAR(20) NOT NULL,
    "month_tds" DECIMAL(14,2) NOT NULL,
    "annual_tax" DECIMAL(14,2) NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_projections_pkey" PRIMARY KEY ("payslip_id"),
    CONSTRAINT "tds_projections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tds_projections_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id")
);
CREATE INDEX "tds_projections_employee_idx" ON "tds_projections" ("organization_id", "employee_id", "tax_year");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "tds_projections" FROM app_runtime;

-- Perquisites (Form 12BA): their value for the tax year is salary income.
CREATE TABLE "perquisites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "kind" VARCHAR(14) NOT NULL,
    "annual_value" DECIMAL(14,2) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "entered_by" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perquisites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perquisites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "perquisites_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "perquisites_kind_check" CHECK ("kind" IN ('car', 'accommodation', 'loan', 'esop', 'other')),
    CONSTRAINT "perquisites_value_check" CHECK ("annual_value" >= 0)
);
REVOKE DELETE, TRUNCATE ON TABLE "perquisites" FROM app_runtime;

-- The year-end certificate: Part A from TRACES (uploaded, kept with its hash), Part B from the year's payslips; issued as a
-- pay document (DSC, verify code) and so published to the employee and, after exit, the alumni portal.
CREATE TABLE "tax_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "law_version" VARCHAR(8) NOT NULL,
    "form" VARCHAR(8) NOT NULL,
    "part_a_ref" VARCHAR(500),
    "part_a_sha256" CHAR(64),
    "part_b" JSONB NOT NULL,
    "pay_document_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_certificates_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "tax_certificates_key" UNIQUE ("organization_id", "employment_id", "tax_year"),
    CONSTRAINT "tax_certificates_form_check" CHECK (("law_version" = 'IT-1961' AND "form" = 'form16') OR ("law_version" = 'IT-2025' AND "form" = 'form130'))
);
REVOKE DELETE, TRUNCATE ON TABLE "tax_certificates" FROM app_runtime;

ALTER TABLE "pay_documents" DROP CONSTRAINT "pay_documents_kind_check";
ALTER TABLE "pay_documents" ADD CONSTRAINT "pay_documents_kind_check" CHECK ("kind" IN ('payslip', 'form16', 'form130', 'form131', 'revision_letter', 'payment_advice', 'register', 'inspection_pack', 'correction_statement'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_workspaces', 'tax_declaration_lines', 'tds_projections', 'perquisites', 'tax_certificates']
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
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR (%L AND "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[])))',
      t, t IN ('tax_workspaces', 'tax_declaration_lines'));
  END LOOP;
END $$;

-- Section labels of the declaration subjects per law version (YX-STAT-24): the 2025 Act numbers stay "verify number"
-- until the compliance owner fills them in.
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES
  ('hra', 'IT-1961', 's.10(13A)', 'Form 12BB'),
  ('sec80c', 'IT-1961', 's.80C', 'Form 12BB'),
  ('sec80ccd1b', 'IT-1961', 's.80CCD(1B)', 'Form 12BB'),
  ('sec80ccd2', 'IT-1961', 's.80CCD(2)', 'Form 12BB'),
  ('sec80d_self', 'IT-1961', 's.80D', 'Form 12BB'),
  ('sec80d_self_senior', 'IT-1961', 's.80D', 'Form 12BB'),
  ('sec80d_parents', 'IT-1961', 's.80D', 'Form 12BB'),
  ('sec80d_parents_senior', 'IT-1961', 's.80D', 'Form 12BB'),
  ('sec80e', 'IT-1961', 's.80E', 'Form 12BB'),
  ('sec24b', 'IT-1961', 's.24(b)', 'Form 12BB'),
  ('perquisites', 'IT-1961', 's.17(2)', 'Form 12BA'),
  ('hra', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80c', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80ccd1b', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80ccd2', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80d_self', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80d_self_senior', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80d_parents', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80d_parents_senior', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec80e', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('sec24b', 'IT-2025', 'verify number', 'Form 12BB successor (verify number)'),
  ('perquisites', 'IT-2025', 'verify number', 'Form 12BA successor (verify number)')
ON CONFLICT DO NOTHING;

-- Permission keys (also in prisma/seed-pay.ts).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'tax.workspace.view', 'See employees'' tax workspaces, declarations and tax sheets for the legal entities in scope'),
  (gen_random_uuid(), 'tax.proof.verify', 'Verify tax proofs line by line, record PAN status and perquisites (never one''s own)'),
  (gen_random_uuid(), 'tax.regime.override', 'Change an employee''s tax regime after the cut-off, with a reason')
ON CONFLICT DO NOTHING;
