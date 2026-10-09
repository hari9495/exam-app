-- Step 5 · Payroll batch 5b (M03-BUILD-DESIGN §5.3, slices PAY-2.01 … PAY-2.13): set-up, structures and components.
--   rule store   statutory_rule_sets gains the P07 shape (status, law version, transitional, drafted / reviewed /
--                published); golden cases and the law cross-walk; YukthiX staff draft and publish through two
--                SECURITY DEFINER functions with maker ≠ checker; the app reads only. The India pack is loaded below.
--                (Kept in the public schema: Prisma's multi-schema mode would have to tag every model; the grants and
--                policies give the same "app reads, console writes" split.)
--   entity       statutory registrations and dated legal options per legal entity (YX-PAY-36, P07 §4.4).
--   pay groups   groups with their calendar facts, dated membership; pay periods per group with the cut-off.
--   structures   the component library with wage flags, salary templates with immutable versions and checked lines.
--   pay          the compensation package and its breakup per change (beside the P06 compensations rows), the dated
--                statutory profile, the coverage monitor, opening balances, as-paid lines, Form 12B income and their
--                import batches, payslip layouts.
--   guard        founder decision 5a-D4: the pay guard now covers compensations and every new table holding one
--                person's pay; support sessions are excluded from all payroll tables.

-- ---------------------------------------------------------------------------------------------
-- 1. Rule store (PAY-2.01)

ALTER TABLE "statutory_rule_sets"
  ADD COLUMN "status" VARCHAR(10) NOT NULL DEFAULT 'published',
  ADD COLUMN "law_version" VARCHAR(10),
  ADD COLUMN "transitional" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "drafted_by" UUID,
  ADD COLUMN "reviewed_by" UUID,
  ADD COLUMN "published_at" TIMESTAMPTZ(3),
  ADD COLUMN "withdrawn_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "statutory_rule_sets_status_check" CHECK ("status" IN ('draft', 'in_review', 'published', 'withdrawn')),
  ADD CONSTRAINT "statutory_rule_sets_law_check" CHECK ("law_version" IS NULL OR "law_version" IN ('OLD-ACT', 'CODE', 'IT-1961', 'IT-2025')),
  ADD CONSTRAINT "statutory_rule_sets_review_check" CHECK ("status" NOT IN ('published', 'withdrawn') OR "drafted_by" IS NULL OR "reviewed_by" IS DISTINCT FROM "drafted_by");
-- The console writes through the functions below, which run as the owner; the policy lets the owner (and only the
-- owner) write under forced RLS. The app role keeps SELECT only.
CREATE POLICY owner_write ON "statutory_rule_sets" FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
UPDATE "statutory_rule_sets" SET "published_at" = "created_at" WHERE "published_at" IS NULL;

-- YX-STAT-02: a published version never changes; it may only be withdrawn (a fix is a new version).
CREATE FUNCTION statutory_rule_sets_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('published', 'withdrawn') AND (
       OLD."status" = 'withdrawn' OR NEW."status" <> 'withdrawn' OR NEW."withdrawn_at" IS NULL
       OR (to_jsonb(NEW) - 'status' - 'withdrawn_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'withdrawn_at')) THEN
    RAISE EXCEPTION 'YX_RULE_PUBLISHED: a published rule set never changes; publish a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER statutory_rule_sets_guard BEFORE UPDATE ON "statutory_rule_sets" FOR EACH ROW EXECUTE FUNCTION statutory_rule_sets_guard();
CREATE TRIGGER statutory_rule_sets_no_delete BEFORE DELETE ON "statutory_rule_sets" FOR EACH ROW WHEN (OLD."status" <> 'draft') EXECUTE FUNCTION statutory_rule_sets_guard();

CREATE TABLE "statutory_golden_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_set_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "fn" VARCHAR(30) NOT NULL,
    "input" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_golden_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_golden_cases_rule_set_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "statutory_rule_sets"("id") ON DELETE CASCADE
);
CREATE INDEX "statutory_golden_cases_rule_set_idx" ON "statutory_golden_cases" ("rule_set_id");

-- YX-STAT-24: section and form labels per law version, from the reviewed cross-walk only.
CREATE TABLE "statutory_law_crosswalk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_key" VARCHAR(40) NOT NULL,
    "law_version" VARCHAR(10) NOT NULL,
    "section" VARCHAR(60) NOT NULL,
    "form" VARCHAR(80),
    "verify" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "statutory_law_crosswalk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_law_crosswalk_key" UNIQUE ("subject_key", "law_version")
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['statutory_golden_cases', 'statutory_law_crosswalk']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY read_all ON %I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY owner_write ON %I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
  END LOOP;
END $$;

/** A YukthiX staff member drafts a rule set version (P07 §4.3). Only inside a platform-staff context. */
CREATE FUNCTION statutory_save_draft(p_statute TEXT, p_jurisdiction TEXT, p_version TEXT, p_valid_from DATE, p_valid_to DATE, p_values JSONB, p_source TEXT, p_law_version TEXT, p_verify BOOLEAN, p_golden JSONB, p_user UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid UUID;
  g JSONB;
BEGIN
  IF NOT app_is_super_admin() OR p_user IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff draft statutory rules'; END IF;
  INSERT INTO statutory_rule_sets (statute, jurisdiction, version, valid_from, valid_to, "values", source, verify, status, law_version, drafted_by)
  VALUES (p_statute, p_jurisdiction, p_version, p_valid_from, p_valid_to, p_values, p_source, p_verify, 'draft', p_law_version, p_user) RETURNING id INTO rid;
  FOR g IN SELECT * FROM jsonb_array_elements(coalesce(p_golden, '[]'::jsonb)) LOOP
    INSERT INTO statutory_golden_cases (rule_set_id, name, fn, input, expected) VALUES (rid, g ->> 'name', g ->> 'fn', g -> 'input', g -> 'expected');
  END LOOP;
  RETURN rid;
END $$;

/** A second staff member publishes it (maker ≠ checker, YX-STAT maker-checker); the API ran the shape checks and golden cases first. */
CREATE FUNCTION statutory_publish(p_id UUID, p_user UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r statutory_rule_sets%ROWTYPE;
BEGIN
  IF NOT app_is_super_admin() OR p_user IS NULL THEN RAISE EXCEPTION 'Only YukthiX staff publish statutory rules'; END IF;
  SELECT * INTO r FROM statutory_rule_sets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('draft', 'in_review') THEN RAISE EXCEPTION 'Only a draft can be published'; END IF;
  IF r.drafted_by = p_user THEN RAISE EXCEPTION 'YX_MAKER_CHECKER: someone other than the person who drafted it must publish it'; END IF;
  IF NOT EXISTS (SELECT 1 FROM statutory_golden_cases WHERE rule_set_id = p_id) THEN RAISE EXCEPTION 'A rule set is published with at least one golden case'; END IF;
  UPDATE statutory_rule_sets SET status = 'published', reviewed_by = p_user, published_at = CURRENT_TIMESTAMP WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION statutory_save_draft(TEXT, TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT, BOOLEAN, JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION statutory_publish(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION statutory_save_draft(TEXT, TEXT, TEXT, DATE, DATE, JSONB, TEXT, TEXT, BOOLEAN, JSONB, UUID) TO app_runtime;
GRANT EXECUTE ON FUNCTION statutory_publish(UUID, UUID) TO app_runtime;
-- The app reads published rules only (drafts are the console's).
DROP POLICY read_all ON "statutory_rule_sets";
CREATE POLICY read_published ON "statutory_rule_sets" FOR SELECT USING ("status" IN ('published', 'withdrawn') OR app_is_super_admin());

-- ---------------------------------------------------------------------------------------------
-- 2. Entity set-up (PAY-2.04)

CREATE TABLE "statutory_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "statute" VARCHAR(10) NOT NULL,
    "state" VARCHAR(6) NOT NULL DEFAULT '',
    "registration_no" VARCHAR(40),
    "start_on" DATE,
    "responsible_person" VARCHAR(200),
    "responsible_designation" VARCHAR(100),
    "address" JSONB,
    "status" VARCHAR(16) NOT NULL DEFAULT 'off',
    "applied_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_registrations_key" UNIQUE ("organization_id", "legal_entity_id", "statute", "state"),
    CONSTRAINT "statutory_registrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "statutory_registrations_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "statutory_registrations_statute_check" CHECK ("statute" IN ('IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF', 'IN.TDS')),
    CONSTRAINT "statutory_registrations_status_check" CHECK ("status" IN ('on', 'applied_awaited', 'off')),
    CONSTRAINT "statutory_registrations_state_check" CHECK (("statute" IN ('IN.PT', 'IN.LWF')) = ("state" <> '')),
    CONSTRAINT "statutory_registrations_applied_check" CHECK ("status" <> 'applied_awaited' OR "applied_on" IS NOT NULL)
);
REVOKE DELETE, TRUNCATE ON TABLE "statutory_registrations" FROM app_runtime;

-- P07 §4.4: only the choices the law leaves to the employer, dated; never rate overrides (YX-STAT-06).
CREATE TABLE "entity_statutory_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "option_key" VARCHAR(40) NOT NULL,
    "value" VARCHAR(40) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_statutory_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_statutory_options_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "entity_statutory_options_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "entity_statutory_options_key_check" CHECK ("option_key" IN ('pf.on_actual_wage', 'bonus.rate', 'bonus.payment', 'gratuity.provisioning')),
    CONSTRAINT "entity_statutory_options_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "entity_statutory_options_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "legal_entity_id" WITH =, "option_key" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);
REVOKE DELETE, TRUNCATE ON TABLE "entity_statutory_options" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 3. Pay groups (PAY-2.05)

CREATE TABLE "pay_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "frequency" VARCHAR(12) NOT NULL DEFAULT 'monthly',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "day_basis" VARCHAR(8) NOT NULL DEFAULT 'calendar',
    "cut_off_day" SMALLINT NOT NULL DEFAULT 25,
    "pay_day" SMALLINT NOT NULL DEFAULT 0,
    "membership_rule" JSONB,
    "bank_format" VARCHAR(30),
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_groups_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "pay_groups_name_key" UNIQUE ("organization_id", "legal_entity_id", "name"),
    CONSTRAINT "pay_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_groups_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "pay_groups_frequency_check" CHECK ("frequency" IN ('monthly')),
    CONSTRAINT "pay_groups_basis_check" CHECK ("day_basis" IN ('calendar', '30', '26')),
    CONSTRAINT "pay_groups_cutoff_check" CHECK ("cut_off_day" BETWEEN 1 AND 28),
    CONSTRAINT "pay_groups_payday_check" CHECK ("pay_day" BETWEEN 0 AND 28),
    CONSTRAINT "pay_groups_status_check" CHECK ("status" IN ('active', 'archived'))
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_groups" FROM app_runtime;

-- One group per employment on any date (dated, never overlapping).
CREATE TABLE "pay_group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pay_group_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_group_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_group_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_group_members_group_fkey" FOREIGN KEY ("organization_id", "pay_group_id") REFERENCES "pay_groups"("organization_id", "id"),
    CONSTRAINT "pay_group_members_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "pay_group_members_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "pay_group_members_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "employment_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_group_members" FROM app_runtime;
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_group_fkey" FOREIGN KEY ("organization_id", "pay_group_id") REFERENCES "pay_groups"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------
-- 4. Components (PAY-2.07) and templates (PAY-2.08)

CREATE TABLE "pay_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(14) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "pf_wage" BOOLEAN NOT NULL DEFAULT false,
    "esi_wage" BOOLEAN NOT NULL DEFAULT false,
    "pt_wage" BOOLEAN NOT NULL DEFAULT false,
    "gratuity_wage" BOOLEAN NOT NULL DEFAULT false,
    "bonus_wage" BOOLEAN NOT NULL DEFAULT false,
    "code_wage_part" BOOLEAN NOT NULL DEFAULT false,
    "code_exclusion" BOOLEAN NOT NULL DEFAULT false,
    "prorated" BOOLEAN NOT NULL DEFAULT true,
    "on_payslip" BOOLEAN NOT NULL DEFAULT true,
    "in_ctc" BOOLEAN NOT NULL DEFAULT true,
    "proration_text" VARCHAR(500),
    "proration_ast" JSONB,
    "rounding" VARCHAR(10) NOT NULL DEFAULT 'rupee',
    "tax_subject" VARCHAR(40),
    "ledger" VARCHAR(60),
    "statutory" VARCHAR(30),
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "used_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_components_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "pay_components_code_key" UNIQUE ("organization_id", "code"),
    CONSTRAINT "pay_components_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_components_kind_check" CHECK ("kind" IN ('earning', 'deduction', 'employer', 'reimbursement', 'info')),
    CONSTRAINT "pay_components_code_check" CHECK ("code" ~ '^[a-z][a-z0-9_]{0,29}$'),
    CONSTRAINT "pay_components_rounding_check" CHECK ("rounding" IN ('none', 'rupee', 'up_rupee')),
    CONSTRAINT "pay_components_status_check" CHECK ("status" IN ('active', 'retired')),
    CONSTRAINT "pay_components_code_wage_check" CHECK (NOT ("code_wage_part" AND "code_exclusion"))
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_components" FROM app_runtime;
-- §7.1: the code is fixed once a payslip or template uses it; a statutory component's maths belongs to the pack.
CREATE FUNCTION pay_components_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."used_at" IS NOT NULL AND NEW."code" IS DISTINCT FROM OLD."code" THEN RAISE EXCEPTION 'YX_COMPONENT_USED: the code of a component in use never changes'; END IF;
  IF OLD."used_at" IS NOT NULL AND NEW."used_at" IS NULL THEN RAISE EXCEPTION 'YX_COMPONENT_USED: a component in use stays in use'; END IF;
  IF OLD."statutory" IS NOT NULL AND (to_jsonb(NEW) - 'name' - 'on_payslip' - 'ledger' - 'used_at' - 'version' - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'name' - 'on_payslip' - 'ledger' - 'used_at' - 'version' - 'status') THEN
    RAISE EXCEPTION 'YX_COMPONENT_STATUTORY: a statutory component''s maths come from the pack; only its label and payslip display change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pay_components_guard BEFORE UPDATE ON "pay_components" FOR EACH ROW EXECUTE FUNCTION pay_components_guard();

CREATE TABLE "salary_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "salary_templates_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "salary_templates_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "salary_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "salary_templates_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "salary_templates_status_check" CHECK ("status" IN ('active', 'archived'))
);
REVOKE DELETE, TRUNCATE ON TABLE "salary_templates" FROM app_runtime;

-- YX-PAY-01: an edit is a new version; a version (and its lines) never changes once saved.
CREATE TABLE "salary_template_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "employer_pf_in_ctc" BOOLEAN NOT NULL DEFAULT true,
    "employer_esi_in_ctc" BOOLEAN NOT NULL DEFAULT true,
    "gratuity_in_ctc" BOOLEAN NOT NULL DEFAULT false,
    "balancing_component_id" UUID NOT NULL,
    "validated_at" TIMESTAMPTZ(3) NOT NULL,
    "sample_input" JSONB NOT NULL,
    "sample_result" JSONB NOT NULL,
    "code_wage_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_template_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "salary_template_versions_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "salary_template_versions_key" UNIQUE ("organization_id", "template_id", "version"),
    CONSTRAINT "salary_template_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "salary_template_versions_template_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "salary_templates"("organization_id", "id"),
    CONSTRAINT "salary_template_versions_balancing_fkey" FOREIGN KEY ("organization_id", "balancing_component_id") REFERENCES "pay_components"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "salary_template_versions" FROM app_runtime;

CREATE TABLE "salary_template_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "formula_text" VARCHAR(500) NOT NULL,
    "formula_ast" JSONB NOT NULL,
    "depends_on" TEXT[] NOT NULL DEFAULT '{}',

    CONSTRAINT "salary_template_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "salary_template_lines_key" UNIQUE ("organization_id", "version_id", "component_id"),
    CONSTRAINT "salary_template_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "salary_template_lines_version_fkey" FOREIGN KEY ("organization_id", "version_id") REFERENCES "salary_template_versions"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "salary_template_lines_component_fkey" FOREIGN KEY ("organization_id", "component_id") REFERENCES "pay_components"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "salary_template_lines" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 5. Compensation (PAY-2.09) and the statutory profile (PAY-2.10)

-- The package behind a P06 compensation change (one per change; the dated compensations rows stay P06's): how it was
-- entered, the template version, the pay basis, and the breakup (compensation_lines).
CREATE TABLE "compensation_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "template_version_id" UUID,
    "entry_mode" VARCHAR(5) NOT NULL,
    "pay_basis" VARCHAR(7) NOT NULL DEFAULT 'monthly',
    "annual_ctc" NUMERIC(14, 2) NOT NULL,
    "rate" NUMERIC(14, 2),
    "ot_multiplier" NUMERIC(5, 2),
    "holiday_multiplier" NUMERIC(5, 2),
    "monthly_gross" NUMERIC(14, 2) NOT NULL,
    "min_wage_check" JSONB NOT NULL,
    "code_wage_add_back" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "letter_document_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compensation_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compensation_packages_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "compensation_packages_change_key" UNIQUE ("organization_id", "change_id"),
    CONSTRAINT "compensation_packages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "compensation_packages_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "compensation_packages_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "compensation_packages_template_fkey" FOREIGN KEY ("organization_id", "template_version_id") REFERENCES "salary_template_versions"("organization_id", "id"),
    CONSTRAINT "compensation_packages_mode_check" CHECK ("entry_mode" IN ('ctc', 'fixed')),
    CONSTRAINT "compensation_packages_basis_check" CHECK ("pay_basis" IN ('monthly', 'hourly', 'daily')),
    CONSTRAINT "compensation_packages_rate_check" CHECK (("pay_basis" = 'monthly') = ("rate" IS NULL))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "compensation_packages" FROM app_runtime;
GRANT UPDATE ("letter_document_id") ON TABLE "compensation_packages" TO app_runtime;

CREATE TABLE "compensation_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "monthly" NUMERIC(14, 2) NOT NULL,
    "annual" NUMERIC(14, 2) NOT NULL,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "citation" JSONB,

    CONSTRAINT "compensation_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compensation_lines_key" UNIQUE ("organization_id", "package_id", "component_id"),
    CONSTRAINT "compensation_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "compensation_lines_package_fkey" FOREIGN KEY ("organization_id", "package_id") REFERENCES "compensation_packages"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "compensation_lines_component_fkey" FOREIGN KEY ("organization_id", "component_id") REFERENCES "pay_components"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "compensation_lines" FROM app_runtime;

-- Dated statutory profile (YX-ORG-20): defaults by employment category from P07; overrides only where the law leaves
-- a choice. UAN and IP numbers stay encrypted in employee_identifiers.
CREATE TABLE "employee_statutory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "pf" VARCHAR(8) NOT NULL,
    "eps" BOOLEAN NOT NULL DEFAULT true,
    "pre2014_member" BOOLEAN NOT NULL DEFAULT false,
    "higher_pension" BOOLEAN NOT NULL DEFAULT false,
    "vpf_percent" NUMERIC(5, 2) NOT NULL DEFAULT 0,
    "pf_on_actual_wage" BOOLEAN,
    "international_worker" BOOLEAN NOT NULL DEFAULT false,
    "esi" VARCHAR(8) NOT NULL,
    "pwd_ceiling_consent" BOOLEAN NOT NULL DEFAULT false,
    "pt_state" VARCHAR(6),
    "lwf_state" VARCHAR(6),
    "reason" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_statutory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_statutory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_statutory_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "employee_statutory_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "employee_statutory_pf_check" CHECK ("pf" IN ('yes', 'no')),
    CONSTRAINT "employee_statutory_esi_check" CHECK ("esi" IN ('yes', 'no', 'by_wage')),
    CONSTRAINT "employee_statutory_vpf_check" CHECK ("vpf_percent" BETWEEN 0 AND 88),
    CONSTRAINT "employee_statutory_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "employee_statutory_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "employment_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);
REVOKE DELETE, TRUNCATE ON TABLE "employee_statutory" FROM app_runtime;
-- Dated rows only close (valid_to set once); everything else is fixed.
CREATE FUNCTION employee_statutory_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."valid_to" IS NOT NULL OR NEW."valid_to" IS NULL OR (to_jsonb(NEW) - 'valid_to') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to') THEN
    RAISE EXCEPTION 'A statutory profile row is only ever closed; add a new dated row';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER employee_statutory_guard BEFORE UPDATE ON "employee_statutory" FOR EACH ROW EXECUTE FUNCTION employee_statutory_guard();

-- ---------------------------------------------------------------------------------------------
-- 6. Coverage monitor (PAY-2.11)

CREATE TABLE "establishment_coverage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "statute" VARCHAR(10) NOT NULL,
    "headcount" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "crossed_on" DATE,
    "rule_version" VARCHAR(20) NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "establishment_coverage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "establishment_coverage_key" UNIQUE ("organization_id", "legal_entity_id", "statute"),
    CONSTRAINT "establishment_coverage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "establishment_coverage_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "establishment_coverage_status_check" CHECK ("status" IN ('not_covered', 'approaching', 'covered'))
);
REVOKE DELETE, TRUNCATE ON TABLE "establishment_coverage" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 7. Imports (PAY-2.12): staged, checked, then committed; committed rows never change.

CREATE TABLE "pay_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "rows" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "staged" JSONB NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'staged',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_by" UUID,
    "committed_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_import_batches_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "pay_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_import_batches_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "pay_import_batches_kind_check" CHECK ("kind" IN ('opening_balances', 'as_paid_lines', 'form12b')),
    CONSTRAINT "pay_import_batches_status_check" CHECK ("status" IN ('staged', 'committed', 'discarded'))
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_import_batches" FROM app_runtime;

CREATE TABLE "opening_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "fy" VARCHAR(7) NOT NULL,
    "head" VARCHAR(40) NOT NULL,
    "amount" NUMERIC(14, 2) NOT NULL,
    "batch_id" UUID NOT NULL,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opening_balances_key" UNIQUE ("organization_id", "employment_id", "fy", "head"),
    CONSTRAINT "opening_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "opening_balances_batch_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "pay_import_batches"("organization_id", "id"),
    CONSTRAINT "opening_balances_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "opening_balances_fy_check" CHECK ("fy" ~ '^\d{4}-\d{2}$')
);

CREATE TABLE "as_paid_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "component_code" VARCHAR(30) NOT NULL,
    "amount" NUMERIC(14, 2) NOT NULL,
    "batch_id" UUID NOT NULL,

    CONSTRAINT "as_paid_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "as_paid_lines_key" UNIQUE ("organization_id", "employment_id", "period_start", "component_code"),
    CONSTRAINT "as_paid_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "as_paid_lines_batch_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "pay_import_batches"("organization_id", "id"),
    CONSTRAINT "as_paid_lines_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "as_paid_lines_month_check" CHECK (extract(day FROM "period_start") = 1)
);

CREATE TABLE "previous_employment_income" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "fy" VARCHAR(7) NOT NULL,
    "employer_tan" VARCHAR(10) NOT NULL,
    "gross" NUMERIC(14, 2) NOT NULL,
    "exemptions" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "tds" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "batch_id" UUID NOT NULL,

    CONSTRAINT "previous_employment_income_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "previous_employment_income_key" UNIQUE ("organization_id", "employment_id", "fy", "employer_tan"),
    CONSTRAINT "previous_employment_income_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "previous_employment_income_batch_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "pay_import_batches"("organization_id", "id"),
    CONSTRAINT "previous_employment_income_tan_check" CHECK ("employer_tan" ~ '^[A-Z]{4}[0-9]{5}[A-Z]$')
);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['opening_balances', 'as_paid_lines', 'previous_employment_income']
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Payslip layouts (PAY-2.13): versions; the law's particulars (P07 IN.WAGESLIP) can never be hidden.

CREATE TABLE "payslip_layouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "pay_group_id" UUID,
    "version" INTEGER NOT NULL,
    "blocks" JSONB NOT NULL,
    "languages" TEXT[] NOT NULL DEFAULT '{en}',
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "previewed_at" TIMESTAMPTZ(3),
    "activated_by" UUID,
    "activated_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_layouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslip_layouts_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "legal_entity_id", "pay_group_id", "version"),
    CONSTRAINT "payslip_layouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslip_layouts_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "payslip_layouts_group_fkey" FOREIGN KEY ("organization_id", "pay_group_id") REFERENCES "pay_groups"("organization_id", "id"),
    CONSTRAINT "payslip_layouts_status_check" CHECK ("status" IN ('draft', 'active', 'retired')),
    CONSTRAINT "payslip_layouts_active_check" CHECK ("status" <> 'active' OR ("previewed_at" IS NOT NULL AND "activated_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "payslip_layouts_one_active" ON "payslip_layouts" ("organization_id", "legal_entity_id", "pay_group_id") NULLS NOT DISTINCT WHERE "status" = 'active';
REVOKE DELETE, TRUNCATE ON TABLE "payslip_layouts" FROM app_runtime;
-- An active layout never changes except to retire; a draft changes until it is activated.
CREATE FUNCTION payslip_layouts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'retired' OR (OLD."status" = 'active' AND (NEW."status" <> 'retired' OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status'))) THEN
    RAISE EXCEPTION 'An active payslip layout never changes; make a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payslip_layouts_guard BEFORE UPDATE ON "payslip_layouts" FOR EACH ROW EXECUTE FUNCTION payslip_layouts_guard();

-- ---------------------------------------------------------------------------------------------
-- 9. Tenant isolation, support sessions, the pay guard (5a-D4)

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['statutory_registrations', 'entity_statutory_options', 'pay_groups', 'pay_group_members', 'pay_components', 'salary_templates', 'salary_template_versions', 'salary_template_lines', 'compensation_packages', 'compensation_lines', 'employee_statutory', 'establishment_coverage', 'pay_import_batches', 'opening_balances', 'as_paid_lines', 'previous_employment_income', 'payslip_layouts']
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
  -- One person's pay: their own rows, or payroll staff of the entity. No super-admin escape.
  FOREACH t IN ARRAY ARRAY['compensation_packages', 'compensation_lines', 'employee_statutory', 'opening_balances', 'as_paid_lines', 'previous_employment_income']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  -- Entity-level pay data (staged rows carry amounts).
  EXECUTE 'CREATE POLICY pay_guard ON "pay_import_batches" AS RESTRICTIVE
             USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
             WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))';
END $$;

-- The step-2 compensations rows (P06): the same guard through their employment.
CREATE FUNCTION app_pay_employment_ok(p_org UUID, p_employment UUID, p_write BOOLEAN) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM employments m
    WHERE m.organization_id = p_org AND m.id = p_employment
      AND (m.legal_entity_id = ANY (app_pay_entities()) OR (NOT p_write AND m.employee_id = ANY (app_current_employee_ids()))))
$$;
CREATE POLICY pay_guard ON "compensations" AS RESTRICTIVE
  USING (app_pay_employment_ok("organization_id", "employment_id", false))
  WITH CHECK (app_pay_employment_ok("organization_id", "employment_id", true));

-- ---------------------------------------------------------------------------------------------
-- 10. Permission keys (also in prisma/seed.ts)

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.setup.manage', 'Set up payroll for the legal entities in scope: pay groups, membership, payslip layout, the statutory rules browser and the coverage monitor'),
  (gen_random_uuid(), 'payroll.statutory.setup', 'Change statutory registrations, deductor details and legal options of the legal entities in scope (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.component.manage', 'Manage the pay component library and its wage flags'),
  (gen_random_uuid(), 'payroll.template.manage', 'Build salary templates and their versions'),
  (gen_random_uuid(), 'payroll.import.run', 'Import opening balances, as-paid lines and previous-employer income for the legal entities in scope'),
  (gen_random_uuid(), 'platform.statutory.manage', 'Draft and publish statutory rule sets (YukthiX staff; the publisher is never the drafter)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.statutory.manage'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 11. The India pack (PAY-2.03), written by scripts/statutory-pack-sql.ts from src/statutory/packs/in.json.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PF', 'IN', '2025-v1', '2025-04-01', NULL, '{"kind":"pf","wageCeiling":"15000","employeeRate":"0.12","employerRate":"0.12","epsRate":"0.0833","epsCeiling":"15000","epsStopAge":58,"edliRate":"0.005","edliCeiling":"15000","adminRate":"0.005","adminMinimum":"500","rounding":"nearest"}', 'Employees'' Provident Funds and Miscellaneous Provisions Act, 1952 s.6; EPF Scheme 1952 para 26A / 29; EPS 1995 para 3; EDLI Scheme 1976; admin charges notification 2017. Code on Social Security 2020 from 21 Nov 2025 (transitional: the Act''s schemes continue).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Basic 20,000 on the ceiling: employee 1,800, EPS 1,250, EPF 550', 'pf', '{"pfWage":"20000","onActualWage":false,"age":30}', '{"employee":"1800","eps":"1250","epf":"550","edli":"75"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PF' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'M03 §16.2: basic 20,000 on actual wage: EPS 1,250 and EPF 1,150', 'pf', '{"pfWage":"20000","onActualWage":true,"age":30}', '{"employee":"2400","eps":"1250","epf":"1150","edli":"75"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PF' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Below the ceiling: 12,000', 'pf', '{"pfWage":"12000","onActualWage":false,"age":40}', '{"employee":"1440","eps":"1000","epf":"440","edli":"60"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PF' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Age 58: no EPS, the whole employer share goes to EPF', 'pf', '{"pfWage":"15000","onActualWage":false,"age":58}', '{"employee":"1800","eps":"0","epf":"1800","edli":"75"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PF' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.ESI', 'IN', '2019-v1', '2019-07-01', NULL, '{"kind":"esi","wageCeiling":"21000","pwdWageCeiling":"25000","employeeRate":"0.0075","employerRate":"0.0325","dailyWageExempt":"176","contributionPeriods":[[4,9],[10,3]],"rounding":"up"}', 'Employees'' State Insurance Act, 1948 s.39; ESI (Central) Rules 1950 r.51 (rates from 1 Jul 2019); wage ceiling notification 2016; PwD ceiling notification. Contribution periods Apr–Sep and Oct–Mar; amounts rounded up to the next rupee.', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'M03 §16.2: gross 15,050 gives employee ESI 113 (rounded up)', 'esi', '{"esiWage":"15050","covered":true}', '{"employee":"113","employer":"490"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.ESI' AND "jurisdiction" = 'IN' AND "version" = '2019-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Just at the ceiling: 21,000', 'esi', '{"esiWage":"21000","covered":true}', '{"employee":"158","employer":"683"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.ESI' AND "jurisdiction" = 'IN' AND "version" = '2019-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Not covered: nothing', 'esi', '{"esiWage":"21001","covered":false}', '{"employee":"0","employer":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.ESI' AND "jurisdiction" = 'IN' AND "version" = '2019-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PT', 'IN', '1988-v1', '1988-05-15', NULL, '{"kind":"pt_limit","annualMax":"2500"}', 'Constitution of India art. 276(2) as amended in 1988: a state tax on professions, trades, callings and employments is at most ₹2,500 a year per person.', false, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'The ceiling is ₹2,500 a year', 'pt_limit', '{}', '{"annualMax":"2500"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN' AND "version" = '1988-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PT', 'IN-KA', '2025-v1', '2025-04-01', NULL, '{"kind":"pt","basis":"monthly","annualCap":"2500","slabs":[{"from":"0","to":"24999.99","amount":"0"},{"from":"25000","to":null,"amount":"200","months":{"2":"300"}}]}', 'Karnataka Tax on Professions, Trades, Callings and Employments Act, 1976, Schedule entry 1 as amended from 1 Apr 2025 (₹200 a month, ₹300 in February). Annual cap ₹2,500 (Constitution art. 276(2)).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Below 25,000: nothing', 'pt', '{"ptWage":"24000","month":5}', '{"amount":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-KA' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", '25,000 in May: 200', 'pt', '{"ptWage":"25000","month":5}', '{"amount":"200"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-KA' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'February: 300 (2,500 a year)', 'pt', '{"ptWage":"60000","month":2}', '{"amount":"300"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-KA' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PT', 'IN-TN', '2024-v1', '2024-04-01', NULL, '{"kind":"pt","basis":"half_yearly","deductMonths":[9,3],"annualCap":"2500","slabs":[{"from":"0","to":"21000","amount":"0"},{"from":"21000.01","to":"30000","amount":"180"},{"from":"30000.01","to":"45000","amount":"425"},{"from":"45000.01","to":"60000","amount":"930"},{"from":"60000.01","to":"75000","amount":"1025"},{"from":"75000.01","to":null,"amount":"1250"}]}', 'Tamil Nadu Urban Local Bodies Act, 1998 s.198 and the professional tax rules (half-yearly income slabs, revised 2024). Deducted in September and March for the half-year.', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Half-year income 1,80,000 in September: 1,250', 'pt', '{"ptWage":"180000","month":9}', '{"amount":"1250"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-TN' AND "version" = '2024-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Half-year income 40,000 in March: 425', 'pt', '{"ptWage":"40000","month":3}', '{"amount":"425"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-TN' AND "version" = '2024-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Not a deduction month: nothing', 'pt', '{"ptWage":"180000","month":6}', '{"amount":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-TN' AND "version" = '2024-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PT', 'IN-MH', '2023-v1', '2023-04-01', NULL, '{"kind":"pt","basis":"monthly","annualCap":"2500","slabs":[{"from":"0","to":"7500","amount":"0","gender":"male"},{"from":"7500.01","to":"10000","amount":"175","gender":"male"},{"from":"10000.01","to":null,"amount":"200","gender":"male","months":{"2":"300"}},{"from":"0","to":"25000","amount":"0","gender":"female"},{"from":"25000.01","to":null,"amount":"200","gender":"female","months":{"2":"300"}}]}', 'Maharashtra State Tax on Professions, Trades, Callings and Employments Act, 1975, Schedule entry 1 (women up to ₹25,000 exempt; ₹300 in February).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'A man earning 9,000: 175', 'pt', '{"ptWage":"9000","month":6,"gender":"male"}', '{"amount":"175"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-MH' AND "version" = '2023-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'A woman earning 20,000: nothing', 'pt', '{"ptWage":"20000","month":6,"gender":"female"}', '{"amount":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-MH' AND "version" = '2023-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'A woman earning 30,000 in February: 300', 'pt', '{"ptWage":"30000","month":2,"gender":"female"}', '{"amount":"300"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-MH' AND "version" = '2023-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PT', 'IN-TS', '2014-v1', '2014-06-02', NULL, '{"kind":"pt","basis":"monthly","annualCap":"2500","slabs":[{"from":"0","to":"15000","amount":"0"},{"from":"15000.01","to":"20000","amount":"150"},{"from":"20000.01","to":null,"amount":"200"}]}', 'Telangana Tax on Professions, Trades, Callings and Employments Act, 1987 (as adapted), Schedule entry 1.', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", '18,000: 150', 'pt', '{"ptWage":"18000","month":6}', '{"amount":"150"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-TS' AND "version" = '2014-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", '45,000: 200', 'pt', '{"ptWage":"45000","month":2}', '{"amount":"200"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-TS' AND "version" = '2014-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PT', 'IN-DL', '2025-v1', '2025-04-01', NULL, '{"kind":"pt","basis":"monthly","annualCap":"0","slabs":[]}', 'Delhi levies no professional tax on salaries (the control state of M03 §19 D2).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Delhi: never', 'pt', '{"ptWage":"200000","month":2}', '{"amount":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PT' AND "jurisdiction" = 'IN-DL' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.LWF', 'IN-KA', '2024-v1', '2024-01-01', NULL, '{"kind":"lwf","months":[12],"employee":"50","employer":"100"}', 'Karnataka Labour Welfare Fund Act, 1965 s.7A as amended 2024 (yearly; ₹50 employee, ₹100 employer; paid by 15 January for the calendar year).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'December: 50 and 100', 'lwf', '{"month":12}', '{"employee":"50","employer":"100"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.LWF' AND "jurisdiction" = 'IN-KA' AND "version" = '2024-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Other months: nothing', 'lwf', '{"month":6}', '{"employee":"0","employer":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.LWF' AND "jurisdiction" = 'IN-KA' AND "version" = '2024-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.LWF', 'IN-TN', '2021-v1', '2021-01-01', NULL, '{"kind":"lwf","months":[12],"employee":"20","employer":"40"}', 'Tamil Nadu Labour Welfare Fund Act, 1972 s.15 (yearly; ₹20 employee, ₹40 employer; paid by 31 January).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'December: 20 and 40', 'lwf', '{"month":12}', '{"employee":"20","employer":"40"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.LWF' AND "jurisdiction" = 'IN-TN' AND "version" = '2021-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.LWF', 'IN-MH', '2019-v1', '2019-06-01', NULL, '{"kind":"lwf","months":[6,12],"employee":"25","employer":"75"}', 'Maharashtra Labour Welfare Fund Act, 1953 s.6BB (half-yearly, June and December; ₹25 employee, ₹75 employer).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'June: 25 and 75', 'lwf', '{"month":6}', '{"employee":"25","employer":"75"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.LWF' AND "jurisdiction" = 'IN-MH' AND "version" = '2019-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.LWF', 'IN-TS', '2014-v1', '2014-06-02', NULL, '{"kind":"lwf","months":[12],"employee":"2","employer":"5"}', 'Telangana Labour Welfare Fund Act, 1987 (as adapted) (yearly; ₹2 employee, ₹5 employer).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'December: 2 and 5', 'lwf', '{"month":12}', '{"employee":"2","employer":"5"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.LWF' AND "jurisdiction" = 'IN-TS' AND "version" = '2014-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.LWF', 'IN-DL', '2014-v1', '2014-01-01', NULL, '{"kind":"lwf","months":[6,12],"employee":"0.75","employer":"2.25"}', 'Bombay Labour Welfare Fund Act, 1953 as extended to Delhi (half-yearly, June and December; ₹0.75 employee, ₹2.25 employer).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'December: 0.75 and 2.25', 'lwf', '{"month":12}', '{"employee":"0.75","employer":"2.25"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.LWF' AND "jurisdiction" = 'IN-DL' AND "version" = '2014-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.MW', 'IN', '2019-v1', '2019-06-01', NULL, '{"kind":"min_wage","floorDaily":"178","monthDays":26,"states":{}}', 'National floor-level minimum wage (₹178 a day, MoLE 2019; the Code on Wages 2019 s.9 floor wage once notified). State rates per zone and skill are separate state tables (IN.MW per state, packs/in-min-wages.json).', true, 'published', 'CODE', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Floor only: 178 a day, 4,628 for 26 days', 'min_wage', '{"state":"IN-KA","zone":"I","skill":"unskilled"}', '{"daily":"178","monthly":"4628","floorApplied":true}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.MW' AND "jurisdiction" = 'IN' AND "version" = '2019-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.WAGES-CODE', 'IN', '2025-v1', '2025-11-21', NULL, '{"kind":"code_wage","exclusionLimit":"0.5"}', 'Code on Wages, 2019 s.2(y) proviso: when the excluded payments exceed one half of all remuneration, the excess counts as wages (in force 21 Nov 2025).', false, 'published', 'CODE', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Exclusions 60% of 50,000: 5,000 added back', 'code_wage', '{"wageParts":"20000","exclusions":"30000"}', '{"codeWage":"25000","addBack":"5000"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.WAGES-CODE' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Exclusions at half: nothing added', 'code_wage', '{"wageParts":"25000","exclusions":"25000"}', '{"codeWage":"25000","addBack":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.WAGES-CODE' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.WAGES', 'IN', '2025-v1', '2025-11-21', NULL, '{"kind":"deduction_cap","cap":"0.5","withCoopCap":"0.75"}', 'Code on Wages, 2019 s.18(2) (total deductions at most 50% of wages); Payment of Wages Act, 1936 s.7(3) (75% where co-operative society dues are included) for earlier periods.', true, 'published', 'CODE', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Wages 40,000: deductions at most 20,000', 'deduction_cap', '{"wages":"40000","coop":false}', '{"cap":"20000"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.WAGES' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.BONUS', 'IN', '2015-v1', '2015-04-01', NULL, '{"kind":"bonus","eligibilityWage":"21000","calculationCeiling":"7000","minRate":"0.0833","maxRate":"0.2"}', 'Payment of Bonus Act, 1965 s.2(13), s.10, s.11, s.12 as amended 2015 (eligibility ₹21,000 a month; calculated on ₹7,000 or the minimum wage if higher; 8.33% to 20%).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Wage 18,000 at 8.33%: monthly provision on 7,000 = 583.10', 'bonus', '{"bonusWage":"18000","rate":"0.0833","minWageMonthly":"4628"}', '{"eligible":true,"monthly":"583.10"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.BONUS' AND "jurisdiction" = 'IN' AND "version" = '2015-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Wage 25,000: not eligible', 'bonus', '{"bonusWage":"25000","rate":"0.0833","minWageMonthly":"4628"}', '{"eligible":false,"monthly":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.BONUS' AND "jurisdiction" = 'IN' AND "version" = '2015-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.GRATUITY', 'IN', '2018-v1', '2018-03-29', NULL, '{"kind":"gratuity","daysPerYear":15,"monthDays":26,"cap":"2000000","minYears":5,"fixedTermMinYears":null}', 'Payment of Gratuity Act, 1972 s.4 (15 days'' wages per year, a month as 26 days, at most ₹20,00,000 from 29 Mar 2018, after 5 years).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Wage 26,000: monthly provision 1,250', 'gratuity', '{"gratuityWage":"26000"}', '{"monthly":"1250"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.GRATUITY' AND "jurisdiction" = 'IN' AND "version" = '2018-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.SS-CODE', 'IN', '2025-v1', '2025-11-21', NULL, '{"kind":"gratuity","daysPerYear":15,"monthDays":26,"cap":"2000000","minYears":5,"fixedTermMinYears":1}', 'Code on Social Security, 2020 s.53 (gratuity after 5 years; fixed-term employees after 1 year; ceiling as notified, ₹20,00,000 until revised).', true, 'published', 'CODE', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Wage 52,000: monthly provision 2,500', 'gratuity', '{"gratuityWage":"52000"}', '{"monthly":"2500"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.SS-CODE' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.TDS', 'IN', 'FY2025-26', '2025-04-01', '2026-03-31', '{"kind":"tds","cess":"0.04","noPanRate":"0.2","regimes":{"new":{"standardDeduction":"75000","rebate":{"incomeUpTo":"1200000","max":"60000"},"slabs":[{"upTo":"400000","rate":"0"},{"upTo":"800000","rate":"0.05"},{"upTo":"1200000","rate":"0.1"},{"upTo":"1600000","rate":"0.15"},{"upTo":"2000000","rate":"0.2"},{"upTo":"2400000","rate":"0.25"},{"upTo":null,"rate":"0.3"}],"surcharge":[{"above":"5000000","rate":"0.1"},{"above":"10000000","rate":"0.15"},{"above":"20000000","rate":"0.25"}]},"old":{"standardDeduction":"50000","rebate":{"incomeUpTo":"500000","max":"12500"},"slabs":[{"upTo":"250000","rate":"0"},{"upTo":"500000","rate":"0.05"},{"upTo":"1000000","rate":"0.2"},{"upTo":null,"rate":"0.3"}],"seniorExemption":"300000","superSeniorExemption":"500000","surcharge":[{"above":"5000000","rate":"0.1"},{"above":"10000000","rate":"0.15"},{"above":"20000000","rate":"0.25"},{"above":"50000000","rate":"0.37"}]}}}', 'Income-tax Act, 1961 s.115BAC (new regime, Finance Act 2025), s.87A, s.16(ia), First Schedule; Health and Education Cess 4%; s.206AA (20% without PAN).', true, 'published', 'IT-1961', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'M03 §16.2: ₹8 L taxable at the 4–8 L slab = ₹20,000 before rebate', 'tds', '{"taxable":"800000","regime":"new","age":30}', '{"slabTax":"20000","rebate":"20000","tax":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.TDS' AND "jurisdiction" = 'IN' AND "version" = 'FY2025-26';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'New regime, ₹15 L taxable: 1,05,000 + 4% cess', 'tds', '{"taxable":"1500000","regime":"new","age":30}', '{"slabTax":"105000","rebate":"0","tax":"109200"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.TDS' AND "jurisdiction" = 'IN' AND "version" = 'FY2025-26';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Old regime, ₹6 L taxable: 32,500 + cess', 'tds', '{"taxable":"600000","regime":"old","age":30}', '{"slabTax":"32500","rebate":"0","tax":"33800"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.TDS' AND "jurisdiction" = 'IN' AND "version" = 'FY2025-26';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.TDS', 'IN', 'TY2026-27', '2026-04-01', NULL, '{"kind":"tds","cess":"0.04","noPanRate":"0.2","regimes":{"new":{"standardDeduction":"75000","rebate":{"incomeUpTo":"1200000","max":"60000"},"slabs":[{"upTo":"400000","rate":"0"},{"upTo":"800000","rate":"0.05"},{"upTo":"1200000","rate":"0.1"},{"upTo":"1600000","rate":"0.15"},{"upTo":"2000000","rate":"0.2"},{"upTo":"2400000","rate":"0.25"},{"upTo":null,"rate":"0.3"}],"surcharge":[{"above":"5000000","rate":"0.1"},{"above":"10000000","rate":"0.15"},{"above":"20000000","rate":"0.25"}]},"old":{"standardDeduction":"50000","rebate":{"incomeUpTo":"500000","max":"12500"},"slabs":[{"upTo":"250000","rate":"0"},{"upTo":"500000","rate":"0.05"},{"upTo":"1000000","rate":"0.2"},{"upTo":null,"rate":"0.3"}],"seniorExemption":"300000","superSeniorExemption":"500000","surcharge":[{"above":"5000000","rate":"0.1"},{"above":"10000000","rate":"0.15"},{"above":"20000000","rate":"0.25"},{"above":"50000000","rate":"0.37"}]}}}', 'Income-tax Act, 2025 (from 1 Apr 2026; tax year replaces previous year): the rates of the Finance Act for tax year 2026-27, same slabs as FY 2025-26 until the compliance owner confirms otherwise. Sections and forms per the law cross-walk (Form 130 / 138).', true, 'published', 'IT-2025', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", '₹8 L taxable, new regime: rebate makes it nil', 'tds', '{"taxable":"800000","regime":"new","age":30}', '{"slabTax":"20000","rebate":"20000","tax":"0"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.TDS' AND "jurisdiction" = 'IN' AND "version" = 'TY2026-27';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PENALTY', 'IN', '2025-v1', '2025-04-01', NULL, '{"kind":"penalty","items":{"pf_interest_yearly":"0.12","esi_interest_yearly":"0.12","tds_late_deduction_monthly":"0.01","tds_late_payment_monthly":"0.015","tds_return_late_fee_daily":"200"}}', 'EPF Act s.7Q (12% a year) and s.14B damages; ESI Act s.39(5) (12% a year); Income-tax Act 1961 s.201(1A) (1% a month late deduction, 1.5% late payment) and s.234E (₹200 a day for late returns).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'PF interest on 10,000 for 73 days: 240', 'penalty', '{"item":"pf_interest_yearly","amount":"10000","days":73}', '{"amount":"240"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PENALTY' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.CALENDAR', 'IN', '2025-v1', '2025-04-01', NULL, '{"kind":"calendar","items":[{"key":"pf_ecr","label":"PF contributions (ECR)","dueDay":15,"monthOffset":1},{"key":"esi","label":"ESI contributions","dueDay":15,"monthOffset":1},{"key":"tds_deposit","label":"TDS deposit","dueDay":7,"monthOffset":1,"march":{"dueDay":30,"monthOffset":1}}]}', 'EPF Scheme para 38 (15th of the next month); ESI Regulations reg. 31 (15th); Income-tax Rules r.30 (7th of the next month, 30 April for March).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'September PF is due 15 October', 'calendar', '{"key":"pf_ecr","month":"2026-09"}', '{"due":"2026-10-15"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.CALENDAR' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'March TDS is due 30 April', 'calendar', '{"key":"tds_deposit","month":"2026-03"}', '{"due":"2026-04-30"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.CALENDAR' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.COVERAGE', 'IN', '2025-v1', '2025-04-01', NULL, '{"kind":"coverage","items":[{"statute":"IN.PF","threshold":20,"approachAt":18,"sticky":true},{"statute":"IN.ESI","threshold":10,"approachAt":8,"sticky":true}]}', 'EPF Act s.1(3)(b) (20 or more persons; s.1(5): stays covered); ESI Act s.1(4) with state notifications (10 or more persons; s.1(6): stays covered).', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", '19 people: PF approaching', 'coverage', '{"statute":"IN.PF","headcount":19,"wasCovered":false}', '{"status":"approaching"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.COVERAGE' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", '15 people after being covered: PF stays covered', 'coverage', '{"statute":"IN.PF","headcount":15,"wasCovered":true}', '{"status":"covered"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.COVERAGE' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.EMPTYPE', 'IN', '2025-v1', '2025-04-01', NULL, '{"kind":"emp_defaults","categories":{"permanent":{"IN.PF":"mandatory","IN.ESI":"by_wage","IN.PT":"mandatory","IN.LWF":"mandatory"},"probation":{"IN.PF":"mandatory","IN.ESI":"by_wage","IN.PT":"mandatory","IN.LWF":"mandatory"},"fixed_term":{"IN.PF":"mandatory","IN.ESI":"by_wage","IN.PT":"mandatory","IN.LWF":"mandatory"},"intern":{"IN.PF":"optional","IN.ESI":"optional","IN.PT":"mandatory","IN.LWF":"optional"},"apprentice":{"IN.PF":"excluded","IN.ESI":"excluded","IN.PT":"mandatory","IN.LWF":"excluded"},"consultant":{"IN.PF":"excluded","IN.ESI":"excluded","IN.PT":"excluded","IN.LWF":"excluded"},"deployed_contractor":{"IN.PF":"mandatory","IN.ESI":"by_wage","IN.PT":"mandatory","IN.LWF":"mandatory"},"retired_reemployed":{"IN.PF":"optional","IN.ESI":"by_wage","IN.PT":"mandatory","IN.LWF":"mandatory"}}}', 'Default applicability by employment category (P07, YX-ORG-20): EPF Act s.2(f) (employees, including through contractors; apprentices under the Apprentices Act excluded); ESI Act s.2(9); state PT and LWF Acts. ''optional'' is a choice the law leaves to the employer.', true, 'published', 'OLD-ACT', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'An apprentice is outside PF', 'emp_defaults', '{"category":"apprentice","statute":"IN.PF"}', '{"applicability":"excluded"}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.EMPTYPE' AND "jurisdiction" = 'IN' AND "version" = '2025-v1';
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('salary_tds', 'IT-1961', 's.192', 'Form 16 / 24Q');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('salary_tds', 'IT-2025', 's.392', 'Form 130 / Form 138');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('standard_deduction', 'IT-1961', 's.16(ia)', 'Form 16 Part B');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('standard_deduction', 'IT-2025', 's.19', 'Form 130 Part B');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('rebate', 'IT-1961', 's.87A', 'Form 16 Part B');
INSERT INTO "statutory_law_crosswalk" ("subject_key", "law_version", "section", "form") VALUES ('rebate', 'IT-2025', 's.156', 'Form 130 Part B');
