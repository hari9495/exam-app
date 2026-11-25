-- PPL-45 Work authorisations: the visas, permits and national IDs a person needs to work in a country (Confidential).
-- The number is sealed like other identifiers, with only its last four in clear. The reminders sent are kept so each
-- goes once; an expired employment visa or work permit for the entity's country stops payroll approval.
CREATE TABLE "work_authorisations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "country" CHAR(2) NOT NULL,
    "number_enc" TEXT NOT NULL,
    "number_last4" VARCHAR(4) NOT NULL,
    "sponsor" VARCHAR(120),
    "occupation" VARCHAR(120),
    "issued_on" DATE,
    "expires_on" DATE NOT NULL,
    "reminded_days" INTEGER[] NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_authorisations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "work_authorisations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "work_authorisations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "work_authorisations_kind_check" CHECK ("kind" IN ('employment_visa', 'residence_visa', 'work_permit', 'national_id')),
    CONSTRAINT "work_authorisations_dates_check" CHECK ("issued_on" IS NULL OR "expires_on" > "issued_on")
);
CREATE INDEX "work_authorisations_employee_idx" ON "work_authorisations"("organization_id", "employee_id");
CREATE INDEX "work_authorisations_expiry_idx" ON "work_authorisations"("expires_on");
REVOKE DELETE, TRUNCATE ON TABLE "work_authorisations" FROM app_runtime;

ALTER TABLE "work_authorisations" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "work_authorisations"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "work_authorisations" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
