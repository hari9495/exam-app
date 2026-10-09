-- M03 payroll batch 5d (M03-BUILD-DESIGN §5.5, §9.7, §9.8, §11.1, §11.2, PAY-4.01 … 4.06): pay-out and payslips.
-- Bank file formats are platform rule sets (kind bank_format, published by two YukthiX staff like every P07 rule set),
-- so there is no bank_formats table here. Every table below has forced RLS, tenant isolation, the support-session
-- exclusion and the pay guard; nothing is ever deleted by the app.

-- ---------------------------------------------------------------------------------------------
-- 1. Payslips: "sent" once a released bank file carries them.

ALTER TABLE "payslips" DROP CONSTRAINT "payslips_payment_check";
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payment_check" CHECK ("payment_status" IN ('pending', 'sent', 'paid', 'failed', 'returned', 'held', 'cash'));

-- ---------------------------------------------------------------------------------------------
-- 2. Bank files (PAY-4.01, YX-PAY-13): the stored file is an exchange_files row (hash, rows, totals, release).

CREATE TABLE "bank_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "exchange_file_id" UUID NOT NULL,
    "format_key" VARCHAR(8) NOT NULL,
    "format_version" VARCHAR(20) NOT NULL,
    "debit_account_last4" CHAR(4) NOT NULL,
    "generation_no" INTEGER NOT NULL,
    "regeneration_reason" VARCHAR(500),
    "payslip_ids" UUID[] NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "generated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bank_files_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "bank_files_exchange_file_key" UNIQUE ("exchange_file_id"),
    CONSTRAINT "bank_files_generation_key" UNIQUE ("organization_id", "run_id", "generation_no"),
    CONSTRAINT "bank_files_reason_check" CHECK ("generation_no" = 1 OR "regeneration_reason" IS NOT NULL)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "bank_files" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 3. Payment results (PAY-4.02, YX-PAY-14): one row per result, never changed; the payslip keeps the latest.

CREATE TABLE "payment_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "bank_file_id" UUID,
    "status" VARCHAR(10) NOT NULL,
    "mode" VARCHAR(8) NOT NULL DEFAULT 'bank',
    "bank_reference" VARCHAR(60),
    "reason" VARCHAR(300),
    "source" VARCHAR(8) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payment_records_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id"),
    CONSTRAINT "payment_records_status_check" CHECK ("status" IN ('paid', 'failed', 'returned', 'cash')),
    CONSTRAINT "payment_records_mode_check" CHECK ("mode" IN ('bank', 'cash', 'cheque')),
    CONSTRAINT "payment_records_source_check" CHECK ("source" IN ('file', 'manual', 'register')),
    CONSTRAINT "payment_records_reason_check" CHECK ("status" NOT IN ('failed', 'returned') OR "reason" IS NOT NULL)
);
CREATE INDEX "payment_records_payslip_idx" ON "payment_records" ("organization_id", "payslip_id");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "payment_records" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 4. Payment mode per employee (PAY-4.03, YX-PAY-31): dated, approved through P03 by someone else.

CREATE TABLE "employee_payment_modes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "mode" VARCHAR(8) NOT NULL,
    "valid_from" DATE NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_payment_modes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_payment_modes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_payment_modes_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "employee_payment_modes_mode_check" CHECK ("mode" IN ('bank', 'cash', 'cheque')),
    CONSTRAINT "employee_payment_modes_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX "employee_payment_modes_idx" ON "employee_payment_modes" ("organization_id", "employment_id", "valid_from");
REVOKE DELETE, TRUNCATE ON TABLE "employee_payment_modes" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 5. Cash and cheque disbursement register (PAY-4.03): one row per payslip paid outside the bank file.

CREATE TABLE "disbursements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "mode" VARCHAR(8) NOT NULL,
    "cheque_no" VARCHAR(20),
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "acknowledgement" VARCHAR(300),
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disbursements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "disbursements_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id"),
    CONSTRAINT "disbursements_payslip_key" UNIQUE ("organization_id", "payslip_id"),
    CONSTRAINT "disbursements_mode_check" CHECK ("mode" IN ('cash', 'cheque') AND ("mode" = 'cash') = ("cheque_no" IS NULL))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "disbursements" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 6. Payslip queries (PAY-4.06, YX-PAY-25): the employee raises one on their own payslip; payroll answers.

CREATE TABLE "payslip_queries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "line_code" VARCHAR(30),
    "text" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "assignee_user_id" UUID,
    "replies" JSONB NOT NULL DEFAULT '[]',
    "raised_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_queries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslip_queries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslip_queries_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id"),
    CONSTRAINT "payslip_queries_status_check" CHECK ("status" IN ('open', 'answered', 'closed'))
);
CREATE INDEX "payslip_queries_idx" ON "payslip_queries" ("organization_id", "legal_entity_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "payslip_queries" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 7. Payslip PDF links (PAY-4.04): single use, 60 seconds, for the person who asked; only the hash is kept.

CREATE TABLE "payslip_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslip_links_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "payslip_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payslip_links_payslip_fkey" FOREIGN KEY ("organization_id", "payslip_id") REFERENCES "payslips"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "payslip_links" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 8. Row-level security: tenant isolation, no support sessions, and the pay guard (own rows or the entity's payroll staff).

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_files', 'payment_records', 'employee_payment_modes', 'disbursements', 'payslip_queries', 'payslip_links']
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
  -- One person's rows: their own (an employee writes only their own queries and payslip links), or the entity's payroll staff.
  FOREACH t IN ARRAY ARRAY['payment_records', 'employee_payment_modes', 'disbursements', 'payslip_queries', 'payslip_links']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR (%L AND "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[])))',
      t, t IN ('payslip_queries', 'payslip_links'));
  END LOOP;
  -- A bank file lists many people: the entity's payroll staff only.
  EXECUTE
    'CREATE POLICY pay_guard ON bank_files AS RESTRICTIVE
       USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))';
END $$;

-- An employee's published payslips (PAY-4.04): the runs table is payroll staff's, so the employee's app asks this
-- definer function, which answers only for runs of the current company and says only whether they are published.
CREATE FUNCTION payroll_runs_published(p_org UUID, p_ids UUID[]) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev TEXT := current_setting('app.pay_entities', true);
  out UUID[];
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN '{}'; END IF;
  PERFORM set_config('app.pay_entities', '{' || coalesce((SELECT string_agg(id::text, ',') FROM legal_entities WHERE organization_id = p_org), '') || '}', true);
  SELECT coalesce(array_agg(id), '{}') INTO out FROM payroll_runs WHERE organization_id = p_org AND id = ANY (p_ids) AND published_at IS NOT NULL;
  PERFORM set_config('app.pay_entities', coalesce(prev, '{}'), true);
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION payroll_runs_published(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_runs_published(UUID, UUID[]) TO app_runtime;

-- D11 expedited bank fix: the app may only change the end of a bank account (P02 §4.5), so a checker's confirmed
-- penny-drop lets the current account be used now through this one narrow definer function (current company only).
CREATE FUNCTION bank_account_use_now(p_org UUID, p_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN false; END IF;
  UPDATE employee_bank_accounts SET usable_from = now() WHERE organization_id = p_org AND id = p_id AND valid_to IS NULL AND usable_from > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION bank_account_use_now(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bank_account_use_now(UUID, UUID) TO app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 9. Permission keys (also in prisma/seed-pay.ts)

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.bankfile.generate', 'Generate the bank file of an approved payroll run (a new one needs a reason)'),
  (gen_random_uuid(), 'payroll.bankfile.release', 'Release a bank file generated by someone else, and allow an urgent bank fix after a failed payment (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.payment.record', 'Record bank results and cash or cheque payments, and ask for a cash or cheque payment mode'),
  (gen_random_uuid(), 'payroll.payslip.publish', 'Publish the payslips of an approved payroll run to employees (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.query.handle', 'Answer employees'' payslip queries for the legal entities in scope'),
  (gen_random_uuid(), 'payroll.payment_mode.approve', 'Approve a cash or cheque payment mode asked for by someone else')
ON CONFLICT DO NOTHING;
