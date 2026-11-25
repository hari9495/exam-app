-- HIR-03 founder answers 222, 223, 225 (9 Nov 2026). A job has a recruiter (default: the person who opened it; changed
-- only with the job-manage key, audited by the API), a company job number (JOB-0001 on; per company; never reused, also
-- after a job is deleted and purged), and may be put on hold (status 'on_hold': hidden from the careers site, public
-- applications and job boards because those read status 'open' only; candidates stay). The status column is free text
-- today; the API allows only draft, pending_approval, open, on_hold and closed.
ALTER TABLE "jobs" ADD COLUMN "recruiter_user_id" UUID;
ALTER TABLE "jobs" ADD COLUMN "job_number" INTEGER;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_job_number_check" CHECK ("job_number" IS NULL OR "job_number" > 0);
CREATE UNIQUE INDEX "jobs_org_job_number_key" ON "jobs" ("organization_id", "job_number");

-- The last number a company gave out. One row per company, bumped in the same transaction as the job insert
-- (INSERT ... ON CONFLICT DO UPDATE takes the row lock, so two jobs created at once get different numbers).
CREATE TABLE "job_number_counters" (
    "organization_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL,
    CONSTRAINT "job_number_counters_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "job_number_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "job_number_counters_last_number_check" CHECK ("last_number" >= 0)
);
ALTER TABLE "job_number_counters" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "job_number_counters"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

SELECT set_config('app.is_super_admin', 'on', true);
-- Existing jobs (deleted ones too, so their numbers are never given again): numbered in the order they were opened.
UPDATE "jobs" j SET "recruiter_user_id" = j."created_by_id" WHERE j."recruiter_user_id" IS NULL;
UPDATE "jobs" j SET "job_number" = n.rn
  FROM (SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id") AS rn FROM "jobs") n
 WHERE j."id" = n."id";
-- Only companies that still exist (some older test rows have no company row).
INSERT INTO "job_number_counters" ("organization_id", "last_number")
  SELECT j."organization_id", max(j."job_number") FROM "jobs" j JOIN "organizations" o ON o."id" = j."organization_id" GROUP BY j."organization_id";
