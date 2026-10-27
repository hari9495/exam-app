-- PPL-46 International bank details: a salary account abroad (IBAN, BIC, payout currency) for people on deputation.
-- It changes only through an approved identity / bank request, like the Indian accounts: dated rows, closed and never
-- edited, the IBAN sealed with only its last four in clear, a replacement used for pay only after the cooling period.
ALTER TABLE "employee_profile_requests" DROP CONSTRAINT "employee_profile_requests_kind_check";
ALTER TABLE "employee_profile_requests" ADD CONSTRAINT "employee_profile_requests_kind_check" CHECK ("kind" IN ('bank_salary', 'bank_reimbursement', 'pan', 'aadhaar', 'uan', 'esic', 'legal_name', 'passport', 'bank_international'));

CREATE TABLE "employee_intl_bank_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "iban_enc" TEXT NOT NULL,
    "iban_hash" CHAR(64) NOT NULL,
    "iban_last4" CHAR(4) NOT NULL,
    "bic" VARCHAR(11) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(3),
    "usable_from" TIMESTAMPTZ(3) NOT NULL,
    "request_id" UUID,
    CONSTRAINT "employee_intl_bank_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_intl_bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_intl_bank_accounts_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_intl_bank_accounts_bic_check" CHECK ("bic" ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$')
);
CREATE UNIQUE INDEX "employee_intl_bank_accounts_current_key" ON "employee_intl_bank_accounts"("organization_id", "employee_id") WHERE "valid_to" IS NULL;
CREATE INDEX "employee_intl_bank_accounts_hash_idx" ON "employee_intl_bank_accounts"("organization_id", "iban_hash");
REVOKE DELETE, TRUNCATE ON TABLE "employee_intl_bank_accounts" FROM app_runtime;

ALTER TABLE "employee_intl_bank_accounts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_intl_bank_accounts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "employee_intl_bank_accounts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
