-- HIR-13 internal jobs (founder decision 6 and answer 226), 13 Nov 2026.
-- A job says whether it shows on Internal jobs and whether it is open for referrals (the job workspace's "Referrals &
-- internal" tab). Both start on, so every open job stays referable and internal as before. An internal application
-- keeps the employee's own words, who their manager was and when that manager was told (decision 6: told, not asked).
-- Columns and a new table only; no data is written.
ALTER TABLE "jobs"
  ADD COLUMN "internal_open" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "referral_open" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "internal_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "manager_user_id" UUID,
    "manager_told_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "internal_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_applications_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "pipeline_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "internal_applications_entry_key" ON "internal_applications" ("entry_id");
CREATE INDEX "internal_applications_applicant_idx" ON "internal_applications" ("organization_id", "applicant_user_id", "created_at");
ALTER TABLE "internal_applications" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "internal_applications"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
