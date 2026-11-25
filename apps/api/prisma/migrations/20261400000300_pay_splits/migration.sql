-- PPL-46 Split pay: net salary split over up to three of the person's accounts on file (the salary and reimbursement
-- accounts in India, and the account abroad): fixed amounts first, then percentages, the remainder to one account. A
-- split changes only through an approved profile request (kind `pay_split`, maker and checker apart, step-up) and is
-- used for pay after the company's cooling period; until then the previous split (or the salary account) is paid.
-- Payroll pays each line: Indian accounts in the bank file, the account abroad in an outward remittance list released
-- with that bank file.
CREATE TABLE "employee_pay_splits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "lines" JSONB NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(3),
    "usable_from" TIMESTAMPTZ(3) NOT NULL,
    "request_id" UUID,
    CONSTRAINT "employee_pay_splits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_pay_splits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_pay_splits_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_pay_splits_lines_check" CHECK (jsonb_typeof("lines") = 'array' AND jsonb_array_length("lines") BETWEEN 1 AND 3)
);
CREATE UNIQUE INDEX "employee_pay_splits_latest_key" ON "employee_pay_splits"("organization_id", "employee_id") WHERE "valid_to" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "employee_pay_splits" FROM app_runtime;

ALTER TABLE "employee_pay_splits" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_pay_splits"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "employee_pay_splits" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

-- The outward remittance list (accounts abroad) goes with its bank file and is released with it.
ALTER TABLE "exchange_files" DROP CONSTRAINT "exchange_files_kind_check";
ALTER TABLE "exchange_files" ADD CONSTRAINT "exchange_files_kind_check" CHECK ("kind" IN ('bank', 'ecr', 'esi', 'pt', 'lwf', 'form138', 'form24q', 'form140', 'journal', 'register', 'inspection', 'wps', 'f1099nec', 'census', 'remittance'));
ALTER TABLE "bank_files" ADD COLUMN "remittance_file_id" UUID;
