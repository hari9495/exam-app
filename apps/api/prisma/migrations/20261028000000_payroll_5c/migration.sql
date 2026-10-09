-- M03 payroll batch 5c: runs and calculation (M03-BUILD-DESIGN §5.4, PAY-3.01 … PAY-3.18).
-- Runs per pay group and month; per-employee progress; validations with waivers; payslips (one approved regular payslip
-- per employment and month, enforced here), lines with explanations and citations, snapshots with hashes; inputs (manual
-- LOP, one-time pay, special days); variance flags; holds; carry-forwards, court orders, loans; journals and cost rates.
-- Every table: forced RLS, tenant isolation, support sessions excluded; one person's pay and entity pay totals also sit
-- behind the pay guard (5a-D4). Approved payslips never change (trigger); nothing is ever deleted by the app.

-- ---------------------------------------------------------------------------------------------
-- 1. Runs (PAY-3.01)

CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "pay_group_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "run_type" VARCHAR(8) NOT NULL DEFAULT 'regular',
    "offcycle_kind" VARCHAR(12),
    "status" VARCHAR(12) NOT NULL DEFAULT 'draft',
    "calc_version" INTEGER NOT NULL DEFAULT 0,
    "wf_request_id" UUID,
    "prepared_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "posted_at" TIMESTAMPTZ(3),
    "totals" JSONB,
    "void_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_runs_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "payroll_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payroll_runs_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "payroll_runs_group_fkey" FOREIGN KEY ("organization_id", "pay_group_id") REFERENCES "pay_groups"("organization_id", "id"),
    CONSTRAINT "payroll_runs_type_check" CHECK ("run_type" IN ('regular', 'offcycle')),
    CONSTRAINT "payroll_runs_kind_check" CHECK (("run_type" = 'offcycle') = ("offcycle_kind" IS NOT NULL) AND ("offcycle_kind" IS NULL OR "offcycle_kind" IN ('fnf', 'bonus', 'arrears', 'correction', 'payment'))),
    CONSTRAINT "payroll_runs_status_check" CHECK ("status" IN ('draft', 'calculating', 'calculated', 'in_review', 'submitted', 'approved', 'reopened', 'paid', 'void')),
    CONSTRAINT "payroll_runs_month_check" CHECK (extract(day FROM "period_start") = 1 AND "period_end" >= "period_start")
);
-- One live regular run per pay group and month (void runs are kept beside it).
CREATE UNIQUE INDEX "payroll_runs_one_regular" ON "payroll_runs" ("organization_id", "pay_group_id", "period_start") WHERE "run_type" = 'regular' AND "status" <> 'void';
REVOKE DELETE, TRUNCATE ON TABLE "payroll_runs" FROM app_runtime;

CREATE TABLE "run_employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "calc_version" INTEGER NOT NULL,
    "state" VARCHAR(8) NOT NULL DEFAULT 'queued',
    "failure" JSONB,
    "included_reason" VARCHAR(200),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "run_employees_key" UNIQUE ("organization_id", "run_id", "calc_version", "employment_id"),
    CONSTRAINT "run_employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "run_employees_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "run_employees_state_check" CHECK ("state" IN ('queued', 'ok', 'failed', 'skipped'))
);
REVOKE DELETE, TRUNCATE ON TABLE "run_employees" FROM app_runtime;

CREATE TABLE "run_validations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "calc_version" INTEGER NOT NULL,
    "employee_id" UUID,
    "check_key" VARCHAR(40) NOT NULL,
    "severity" VARCHAR(8) NOT NULL,
    "blocks" VARCHAR(12) NOT NULL DEFAULT 'calculation',
    "waivable" BOOLEAN NOT NULL DEFAULT true,
    "message" VARCHAR(500) NOT NULL,
    "waived_by" UUID,
    "waiver_reason" VARCHAR(500),
    "waived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_validations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "run_validations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "run_validations_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "run_validations_severity_check" CHECK ("severity" IN ('block', 'warn', 'info')),
    CONSTRAINT "run_validations_blocks_check" CHECK ("blocks" IN ('calculation', 'approval')),
    CONSTRAINT "run_validations_waiver_check" CHECK (("waived_by" IS NULL) = ("waiver_reason" IS NULL) AND ("waived_by" IS NULL OR "waivable"))
);
REVOKE DELETE, TRUNCATE ON TABLE "run_validations" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 2. Payslips, lines and snapshots (PAY-3.04, §3.4–3.5)

CREATE TABLE "payslips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID,
    "run_type" VARCHAR(8) NOT NULL DEFAULT 'regular',
    "employment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "calc_version" INTEGER NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'draft',
    "gross" DECIMAL(14,2) NOT NULL,
    "deductions" DECIMAL(14,2) NOT NULL,
    "net" DECIMAL(14,2) NOT NULL,
    "employer_cost" DECIMAL(14,2) NOT NULL,
    "rule_versions" JSONB NOT NULL,
    "snapshot_hash" CHAR(64) NOT NULL,
    "result_hash" CHAR(64) NOT NULL,
    "source" VARCHAR(6) NOT NULL DEFAULT 'run',
    "verify" BOOLEAN NOT NULL DEFAULT false,
    "held" BOOLEAN NOT NULL DEFAULT false,
    "payment_status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "void_reason" VARCHAR(200),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslips_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "payslips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslips_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "payslips_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "payslips_status_check" CHECK ("status" IN ('draft', 'approved', 'void', 'revised')),
    CONSTRAINT "payslips_source_check" CHECK ("source" IN ('run', 'import')),
    CONSTRAINT "payslips_payment_check" CHECK ("payment_status" IN ('pending', 'paid', 'failed', 'returned', 'held', 'cash')),
    CONSTRAINT "payslips_month_check" CHECK (extract(day FROM "period_start") = 1)
);
-- PAY-3.01: one approved regular payslip per employment and month (a reopened month revises the old one first).
CREATE UNIQUE INDEX "payslips_one_regular" ON "payslips" ("organization_id", "employment_id", "period_start") WHERE "run_type" = 'regular' AND "status" = 'approved';
CREATE UNIQUE INDEX "payslips_one_draft" ON "payslips" ("organization_id", "run_id", "calc_version", "employment_id") WHERE "status" = 'draft';
REVOKE DELETE, TRUNCATE ON TABLE "payslips" FROM app_runtime;

CREATE TABLE "payslip_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "component_code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(14) NOT NULL,
    "segment_no" SMALLINT NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(10,2),
    "rate" DECIMAL(14,4),
    "formula" VARCHAR(500),
    "inputs" JSONB,
    "explanation" VARCHAR(1000) NOT NULL,
    "rule" JSONB,
    "verify" BOOLEAN NOT NULL DEFAULT false,
    "source_ref" VARCHAR(80),

    CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslip_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslip_lines_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id"),
    CONSTRAINT "payslip_lines_kind_check" CHECK ("kind" IN ('earning', 'deduction', 'employer', 'reimbursement', 'info'))
);
CREATE INDEX "payslip_lines_payslip_idx" ON "payslip_lines" ("organization_id", "payslip_id");
-- Lines and snapshots are written once with their payslip and never changed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "payslip_lines" FROM app_runtime;

CREATE TABLE "payslip_snapshots" (
    "payslip_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "inputs" JSONB NOT NULL,
    "rule_versions" JSONB NOT NULL,
    "engine_version" VARCHAR(20) NOT NULL,
    "inputs_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_snapshots_pkey" PRIMARY KEY ("payslip_id"),
    CONSTRAINT "payslip_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslip_snapshots_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "payslip_snapshots" FROM app_runtime;

-- §3.4: an approved payslip never changes, except its payment status and hold flag, and being marked revised (a reopened
-- month) or void is impossible once approved. A draft may only become approved or void.
CREATE FUNCTION payslips_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" IN ('void', 'revised') THEN
    RAISE EXCEPTION 'YX_PAYSLIP_FINAL: a void or revised payslip never changes';
  END IF;
  IF OLD."status" = 'approved' THEN
    IF NEW."status" NOT IN ('approved', 'revised')
       OR (to_jsonb(NEW) - ARRAY['status', 'payment_status', 'held']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'payment_status', 'held']) THEN
      RAISE EXCEPTION 'YX_PAYSLIP_APPROVED: an approved payslip never changes; corrections are paid in the next payroll';
    END IF;
  END IF;
  IF OLD."status" = 'draft' AND NEW."status" NOT IN ('draft', 'approved', 'void') THEN
    RAISE EXCEPTION 'YX_PAYSLIP_STATUS: a draft payslip is approved or void';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payslips_guard BEFORE UPDATE ON "payslips" FOR EACH ROW EXECUTE FUNCTION payslips_guard();

-- ---------------------------------------------------------------------------------------------
-- 3. Inputs (PAY-3.02, 3.13, 3.14)

CREATE TABLE "lop_inputs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "lop_days" DECIMAL(5,2) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "source" VARCHAR(8) NOT NULL DEFAULT 'manual',
    "entered_by" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lop_inputs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lop_inputs_key" UNIQUE ("organization_id", "employment_id", "period_start"),
    CONSTRAINT "lop_inputs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lop_inputs_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "lop_inputs_days_check" CHECK ("lop_days" >= 0 AND "lop_days" <= 31),
    CONSTRAINT "lop_inputs_source_check" CHECK ("source" IN ('manual', 'upload'))
);
REVOKE DELETE, TRUNCATE ON TABLE "lop_inputs" FROM app_runtime;

CREATE TABLE "one_time_pays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "component_code" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "period_start" DATE NOT NULL,
    "end_on" DATE,
    "source" VARCHAR(8) NOT NULL DEFAULT 'manual',
    "source_ref" VARCHAR(80),
    "reason" VARCHAR(300) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'approved',
    "wf_request_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "one_time_pays_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "one_time_pays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "one_time_pays_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "one_time_pays_source_check" CHECK ("source" IN ('manual', 'm05', 'm06', 'm09', 'm10', 'm08', 'm01', 'loan', 'arrears')),
    CONSTRAINT "one_time_pays_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT "one_time_pays_month_check" CHECK (extract(day FROM "period_start") = 1 AND ("end_on" IS NULL OR "end_on" >= "period_start"))
);
REVOKE DELETE, TRUNCATE ON TABLE "one_time_pays" FROM app_runtime;

-- Suspension (subsistence allowance), maternity and injury days of a month (from M08 / M02 until those feed them).
CREATE TABLE "special_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "days_before" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(300) NOT NULL,
    "entered_by" UUID NOT NULL,
    "entered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "special_days_key" UNIQUE ("organization_id", "employment_id", "period_start", "kind"),
    CONSTRAINT "special_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "special_days_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "special_days_kind_check" CHECK ("kind" IN ('suspension', 'maternity', 'injury')),
    CONSTRAINT "special_days_days_check" CHECK ("days" > 0 AND "days" <= 31 AND "days_before" >= 0)
);
REVOKE DELETE, TRUNCATE ON TABLE "special_days" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 4. Review, holds and recoveries (PAY-3.08, 3.11, 3.12)

CREATE TABLE "variance_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "kind" VARCHAR(18) NOT NULL,
    "size" DECIMAL(14,2),
    "detail" VARCHAR(300) NOT NULL,
    "ack_by" UUID,
    "ack_at" TIMESTAMPTZ(3),
    "note" VARCHAR(300),

    CONSTRAINT "variance_flags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "variance_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "variance_flags_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id"),
    CONSTRAINT "variance_flags_kind_check" CHECK ("kind" IN ('net_change', 'new_component', 'removed_component')),
    CONSTRAINT "variance_flags_ack_check" CHECK (("ack_by" IS NULL) = ("ack_at" IS NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "variance_flags" FROM app_runtime;

CREATE TABLE "payroll_withholds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "reason_code" VARCHAR(20) NOT NULL,
    "trigger" VARCHAR(12) NOT NULL DEFAULT 'manual',
    "note" VARCHAR(300) NOT NULL,
    "held_run_id" UUID,
    "amount" DECIMAL(14,2),
    "released_run_id" UUID,
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_withholds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_withholds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payroll_withholds_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "payroll_withholds_reason_check" CHECK ("reason_code" IN ('bank_missing', 'absconding', 'exit_pending', 'investigation', 'employee_request', 'other')),
    CONSTRAINT "payroll_withholds_trigger_check" CHECK ("trigger" IN ('manual', 'validation', 'exit')),
    CONSTRAINT "payroll_withholds_release_check" CHECK (("released_by" IS NULL) = ("released_at" IS NULL))
);
-- One open hold per employment at a time (a release closes it; a second add is the same hold).
CREATE UNIQUE INDEX "payroll_withholds_one_open" ON "payroll_withholds" ("organization_id", "employment_id") WHERE "released_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "payroll_withholds" FROM app_runtime;

CREATE TABLE "pay_carry_forwards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "origin_payslip_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recovered" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_carry_forwards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_carry_forwards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_carry_forwards_payslip_fkey" FOREIGN KEY ("organization_id", "origin_payslip_id") REFERENCES "payslips"("organization_id", "id"),
    CONSTRAINT "pay_carry_forwards_amount_check" CHECK ("amount" > 0 AND "recovered" >= 0 AND "recovered" <= "amount"),
    CONSTRAINT "pay_carry_forwards_status_check" CHECK ("status" IN ('open', 'recovered', 'written_off'))
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_carry_forwards" FROM app_runtime;

CREATE TABLE "court_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "order_ref" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(14,2),
    "percent" DECIMAL(5,2),
    "priority_date" DATE NOT NULL,
    "payee_enc" TEXT NOT NULL,
    "end_on" DATE,
    "cap_total" DECIMAL(14,2),
    "remitted_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "court_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "court_orders_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "court_orders_how_check" CHECK (("amount" IS NULL) <> ("percent" IS NULL) AND ("percent" IS NULL OR "percent" BETWEEN 0 AND 100)),
    CONSTRAINT "court_orders_status_check" CHECK ("status" IN ('active', 'ended'))
);
REVOKE DELETE, TRUNCATE ON TABLE "court_orders" FROM app_runtime;

CREATE TABLE "loans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "loan_type" VARCHAR(8) NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "emi" DECIMAL(14,2) NOT NULL,
    "first_month" DATE NOT NULL,
    "outstanding" DECIMAL(14,2) NOT NULL,
    "perquisite" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(300) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'requested',
    "paused_until" DATE,
    "wf_request_id" UUID,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loans_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "loans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loans_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "loans_type_check" CHECK ("loan_type" IN ('advance', 'loan')),
    CONSTRAINT "loans_amounts_check" CHECK ("principal" > 0 AND "emi" > 0 AND "emi" <= "principal" AND "outstanding" >= 0 AND "outstanding" <= "principal"),
    CONSTRAINT "loans_status_check" CHECK ("status" IN ('requested', 'active', 'paused', 'closed', 'rejected'))
);
REVOKE DELETE, TRUNCATE ON TABLE "loans" FROM app_runtime;

CREATE TABLE "loan_repayments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loan_repayments_key" UNIQUE ("organization_id", "loan_id", "payslip_id"),
    CONSTRAINT "loan_repayments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_repayments_loan_fkey" FOREIGN KEY ("organization_id", "loan_id") REFERENCES "loans"("organization_id", "id"),
    CONSTRAINT "loan_repayments_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "loan_repayments" FROM app_runtime;

CREATE TABLE "loan_schedule_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "detail" JSONB NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_schedule_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loan_schedule_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_schedule_changes_loan_fkey" FOREIGN KEY ("organization_id", "loan_id") REFERENCES "loans"("organization_id", "id"),
    CONSTRAINT "loan_schedule_changes_kind_check" CHECK ("kind" IN ('pause', 'preclose', 'reschedule'))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "loan_schedule_changes" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 5. Journal and cost rates (PAY-3.17)

CREATE TABLE "journals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "exports" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journals_run_key" UNIQUE ("organization_id", "run_id"),
    CONSTRAINT "journals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journals_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "journals" FROM app_runtime;

CREATE TABLE "employee_cost_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "employer_cost" DECIMAL(14,2) NOT NULL,
    "standard_hours" DECIMAL(6,2) NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "source_payslip_id" UUID NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_cost_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_cost_rates_key" UNIQUE ("organization_id", "employee_id", "period_start"),
    CONSTRAINT "employee_cost_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
REVOKE DELETE, TRUNCATE ON TABLE "employee_cost_rates" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 6. Tenant isolation, support sessions, the pay guard

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_runs', 'run_employees', 'run_validations', 'payslips', 'payslip_lines', 'payslip_snapshots', 'lop_inputs', 'one_time_pays', 'special_days', 'variance_flags', 'payroll_withholds', 'pay_carry_forwards', 'court_orders', 'loans', 'loan_repayments', 'loan_schedule_changes', 'journals', 'employee_cost_rates']
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
  FOREACH t IN ARRAY ARRAY['payslips', 'payslip_lines', 'payslip_snapshots', 'lop_inputs', 'one_time_pays', 'special_days', 'variance_flags', 'payroll_withholds', 'pay_carry_forwards', 'court_orders', 'loans', 'loan_repayments', 'loan_schedule_changes', 'employee_cost_rates']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR (%L AND "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[])))',
      t, t = 'loans');
  END LOOP;
  -- Entity pay totals and run workings: payroll staff of the entity only.
  FOREACH t IN ARRAY ARRAY['payroll_runs', 'run_employees', 'run_validations', 'journals']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 7. Permission keys (also in prisma/seed-pay.ts)

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.run.view', 'See payroll runs, payslips and their workings for the legal entities in scope'),
  (gen_random_uuid(), 'payroll.run.prepare', 'Create, calculate, review, submit and void payroll runs for the legal entities in scope'),
  (gen_random_uuid(), 'payroll.run.approve', 'Approve payroll runs prepared by others; approving locks the month (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.input.manage', 'Enter loss-of-pay days, one-time pay, special days and court orders for the legal entities in scope'),
  (gen_random_uuid(), 'payroll.hold.manage', 'Hold and release net pay'),
  (gen_random_uuid(), 'payroll.loan.manage', 'Manage loans and salary advances and change their schedules'),
  (gen_random_uuid(), 'payroll.loan.approve', 'Approve loan and salary-advance requests of others'),
  (gen_random_uuid(), 'payroll.journal.export', 'See and export payroll journals'),
  (gen_random_uuid(), 'payroll.cost_rate.view', 'See employee cost rates (Restricted)')
ON CONFLICT DO NOTHING;
