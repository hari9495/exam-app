-- Payroll batch 5g (M03-BUILD-DESIGN §5.8, §9.9, PAY-7.01 … 7.07): off-cycle runs, arrears worksheets, past-dated rule
-- change proposals, F&F settlements and overpayment recoveries. Every table: forced RLS, tenant isolation, no support
-- sessions and the pay guard (an employee reads and answers only their own overpayment recovery).

-- One-time pay can belong to an off-cycle run (paid only there), carry the text shown on the payslip line, and be held
-- back from an F&F run with a reason (paid later in a second F&F run).
ALTER TABLE "one_time_pays" ADD COLUMN "run_id" UUID;
ALTER TABLE "one_time_pays" ADD COLUMN "label" VARCHAR(200);
ALTER TABLE "one_time_pays" ADD COLUMN "hold_reason" VARCHAR(300);
ALTER TABLE "one_time_pays" ADD CONSTRAINT "one_time_pays_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id");
ALTER TABLE "one_time_pays" DROP CONSTRAINT "one_time_pays_source_check";
ALTER TABLE "one_time_pays" ADD CONSTRAINT "one_time_pays_source_check" CHECK ("source" IN ('manual', 'm05', 'm06', 'm09', 'm10', 'm08', 'm01', 'loan', 'arrears', 'fnf'));
CREATE INDEX "one_time_pays_run_idx" ON "one_time_pays" ("organization_id", "run_id") WHERE "run_id" IS NOT NULL;

CREATE TABLE "arrears_worksheets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "source_ref" VARCHAR(80),
    "from_month" DATE NOT NULL,
    "to_month" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pay_month" DATE,
    "run_id" UUID,
    "reason" VARCHAR(300) NOT NULL,
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arrears_worksheets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "arrears_worksheets_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "arrears_worksheets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "arrears_worksheets_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "arrears_worksheets_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "arrears_worksheets_source_check" CHECK ("source" IN ('change', 'rule', 'settlement', 'manual')),
    CONSTRAINT "arrears_worksheets_status_check" CHECK ("status" IN ('draft', 'approved', 'cancelled')),
    CONSTRAINT "arrears_worksheets_months_check" CHECK (extract(day FROM "from_month") = 1 AND extract(day FROM "to_month") = 1 AND "to_month" >= "from_month"),
    CONSTRAINT "arrears_worksheets_maker_checker" CHECK ("approved_by" IS NULL OR "approved_by" <> "created_by")
);
CREATE INDEX "arrears_worksheets_employee_idx" ON "arrears_worksheets" ("organization_id", "employee_id");
REVOKE DELETE, TRUNCATE ON TABLE "arrears_worksheets" FROM app_runtime;

CREATE TABLE "arrears_worksheet_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "worksheet_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "component_code" VARCHAR(30) NOT NULL,
    "as_paid" DECIMAL(14,2),
    "corrected" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2),
    "base_source" VARCHAR(10) NOT NULL,
    "confirmed_by" UUID,
    "confirm_reason" VARCHAR(300),
    CONSTRAINT "arrears_worksheet_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "arrears_worksheet_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "arrears_worksheet_lines_sheet_fkey" FOREIGN KEY ("organization_id", "worksheet_id") REFERENCES "arrears_worksheets"("organization_id", "id"),
    CONSTRAINT "arrears_worksheet_lines_base_check" CHECK ("base_source" IN ('payslip', 'import', 'confirmed', 'missing')),
    -- A missing base has no as-paid amount and no difference until someone confirms one, with a reason.
    CONSTRAINT "arrears_worksheet_lines_missing_check" CHECK (("base_source" = 'missing') = ("as_paid" IS NULL) AND ("as_paid" IS NULL) = ("difference" IS NULL)),
    CONSTRAINT "arrears_worksheet_lines_confirmed_check" CHECK (("base_source" = 'confirmed') = ("confirmed_by" IS NOT NULL AND "confirm_reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "arrears_worksheet_lines_one" ON "arrears_worksheet_lines" ("organization_id", "worksheet_id", "period", "component_code");
REVOKE DELETE, TRUNCATE ON TABLE "arrears_worksheet_lines" FROM app_runtime;

CREATE TABLE "statutory_arrears_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "statute" VARCHAR(30) NOT NULL,
    "jurisdiction" VARCHAR(10) NOT NULL,
    "rule_version" VARCHAR(40) NOT NULL,
    "periods" JSONB NOT NULL,
    "employees" JSONB NOT NULL,
    "employee_count" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "reason" VARCHAR(300),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statutory_arrears_proposals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_arrears_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "statutory_arrears_proposals_status_check" CHECK ("status" IN ('open', 'accepted', 'dismissed')),
    CONSTRAINT "statutory_arrears_proposals_reason_check" CHECK ("status" <> 'dismissed' OR "reason" IS NOT NULL)
);
CREATE UNIQUE INDEX "statutory_arrears_proposals_one" ON "statutory_arrears_proposals" ("organization_id", "legal_entity_id", "statute", "jurisdiction", "rule_version");
REVOKE DELETE, TRUNCATE ON TABLE "statutory_arrears_proposals" FROM app_runtime;

CREATE TABLE "fnf_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "exit_type" VARCHAR(24) NOT NULL,
    "input_revision" INTEGER NOT NULL,
    "lwd" DATE NOT NULL,
    "deadline" DATE NOT NULL,
    "run_id" UUID,
    "second_run_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "payees" JSONB NOT NULL DEFAULT '[]',
    "alerted_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fnf_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fnf_settlements_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "fnf_settlements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "fnf_settlements_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "fnf_settlements_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "fnf_settlements_second_run_fkey" FOREIGN KEY ("organization_id", "second_run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "fnf_settlements_status_check" CHECK ("status" IN ('open', 'settled', 'cancelled'))
);
CREATE UNIQUE INDEX "fnf_settlements_one" ON "fnf_settlements" ("organization_id", "exit_case_id");
REVOKE DELETE, TRUNCATE ON TABLE "fnf_settlements" FROM app_runtime;

CREATE TABLE "overpayment_recoveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "origin" VARCHAR(10) NOT NULL,
    "origin_ref" VARCHAR(80),
    "origin_tax_year" VARCHAR(7) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recovered" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "written_off" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "instalment" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'proposed',
    "consent_at" TIMESTAMPTZ(3),
    "consent_by" UUID,
    "declined_at" TIMESTAMPTZ(3),
    "write_off_by" UUID,
    "write_off_at" TIMESTAMPTZ(3),
    "write_off_reason" VARCHAR(300),
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "overpayment_recoveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "overpayment_recoveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "overpayment_recoveries_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "overpayment_recoveries_origin_check" CHECK ("origin" IN ('arrears', 'manual', 'fnf')),
    CONSTRAINT "overpayment_recoveries_status_check" CHECK ("status" IN ('proposed', 'active', 'declined', 'recovered', 'written_off')),
    CONSTRAINT "overpayment_recoveries_amount_check" CHECK ("amount" > 0 AND "instalment" > 0 AND "recovered" >= 0 AND "written_off" >= 0 AND "recovered" + "written_off" <= "amount"),
    -- Recovered only after the employee agreed; written off by someone other than who raised it, with a reason.
    CONSTRAINT "overpayment_recoveries_consent_check" CHECK ("status" NOT IN ('active', 'recovered') OR "consent_at" IS NOT NULL),
    CONSTRAINT "overpayment_recoveries_writeoff_check" CHECK (("write_off_at" IS NULL) = ("write_off_by" IS NULL) AND ("write_off_at" IS NULL OR ("write_off_reason" IS NOT NULL AND "write_off_by" <> "created_by")))
);
CREATE INDEX "overpayment_recoveries_employment_idx" ON "overpayment_recoveries" ("organization_id", "employment_id") WHERE "status" = 'active';
REVOKE DELETE, TRUNCATE ON TABLE "overpayment_recoveries" FROM app_runtime;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['arrears_worksheets', 'arrears_worksheet_lines', 'statutory_arrears_proposals', 'fnf_settlements', 'overpayment_recoveries']
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
  FOREACH t IN ARRAY ARRAY['arrears_worksheets', 'arrears_worksheet_lines', 'statutory_arrears_proposals', 'fnf_settlements']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  -- The employee reads their own recovery plan and records their answer (the service writes only the answer).
  EXECUTE
    'CREATE POLICY pay_guard ON overpayment_recoveries AS RESTRICTIVE
       USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]))';
END $$;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.offcycle.prepare', 'Prepare off-cycle runs (bonus, arrears, correction, payment) and their items'),
  (gen_random_uuid(), 'payroll.arrears.approve', 'Make, confirm and approve arrears worksheets, and accept or dismiss arrears proposals after a past-dated rule change'),
  (gen_random_uuid(), 'payroll.fnf.manage', 'Manage full and final settlements: items, held items, payees and the second run'),
  (gen_random_uuid(), 'payroll.writeoff.approve', 'Write off the rest of an overpayment raised by someone else, with a reason (needs a fresh second sign-in step)')
ON CONFLICT DO NOTHING;
