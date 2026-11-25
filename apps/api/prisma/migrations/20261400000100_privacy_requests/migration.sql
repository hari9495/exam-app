-- PPL-33 My data: "Request a correction" is a profile request of kind `correction` (the person says what is wrong; HR
-- decides it like any other change, maker and checker apart, and fixes the data where it lives). "Nominate someone" is
-- the person's nominee for their data rights (DPDP Act 2023, s.14: who acts for them on death or incapacity). One
-- nominee at a time; a change ends the old row (never deleted), every change is audited.
-- PPL-46 adds the kind `pay_split` (see 20261400000300_pay_splits).
ALTER TABLE "employee_profile_requests" DROP CONSTRAINT "employee_profile_requests_kind_check";
ALTER TABLE "employee_profile_requests" ADD CONSTRAINT "employee_profile_requests_kind_check" CHECK ("kind" IN ('bank_salary', 'bank_reimbursement', 'pan', 'aadhaar', 'uan', 'esic', 'legal_name', 'passport', 'bank_international', 'correction', 'pay_split'));

CREATE TABLE "privacy_nominees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "relation" VARCHAR(40) NOT NULL,
    "email" CITEXT,
    "phone" VARCHAR(16),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "ended_by" UUID,
    CONSTRAINT "privacy_nominees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "privacy_nominees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "privacy_nominees_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "privacy_nominees_contact_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL),
    CONSTRAINT "privacy_nominees_name_check" CHECK (char_length(btrim("name")) >= 2)
);
CREATE UNIQUE INDEX "privacy_nominees_current_key" ON "privacy_nominees"("organization_id", "employee_id") WHERE "ended_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "privacy_nominees" FROM app_runtime;

ALTER TABLE "privacy_nominees" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "privacy_nominees"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "privacy_nominees" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
