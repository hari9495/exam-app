-- Recruitment batch AT1 (M10-BUILD-DESIGN §3, §16.1, §17; AT-1.01 … 1.05): YukthiX hiring keys, support-session exclusion
-- of hiring decisions, and jobs linked to the P01 masters. The older hiring tables keep their forced RLS and tenant
-- isolation (20261005000001_tenant_rls); nothing here changes who can read them inside the company.

-- ---------------------------------------------------------------------------------------------- jobs → P01 masters (U79)
-- The free-text department stays for the older screens; the master links are what YukthiX screens set and read.
ALTER TABLE "jobs"
  ADD COLUMN "legal_entity_id" UUID,
  ADD COLUMN "department_id" UUID,
  ADD COLUMN "designation_id" UUID,
  ADD COLUMN "grade_id" UUID,
  ADD COLUMN "location_id" UUID,
  ADD CONSTRAINT "jobs_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
  ADD CONSTRAINT "jobs_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
  ADD CONSTRAINT "jobs_designation_fkey" FOREIGN KEY ("organization_id", "designation_id") REFERENCES "designations"("organization_id", "id"),
  ADD CONSTRAINT "jobs_grade_fkey" FOREIGN KEY ("organization_id", "grade_id") REFERENCES "grades"("organization_id", "id"),
  ADD CONSTRAINT "jobs_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id");
CREATE INDEX "jobs_department_idx" ON "jobs" ("organization_id", "department_id");

-- Existing jobs: a free-text department that names exactly one live department of the company is linked to it.
UPDATE "jobs" j SET "department_id" = d."id"
FROM "departments" d
WHERE d."organization_id" = j."organization_id" AND j."department_id" IS NULL AND j."department" IS NOT NULL
  AND lower(btrim(d."name")) = lower(btrim(j."department")) AND d."archived_at" IS NULL
  AND (SELECT count(*) FROM "departments" d2 WHERE d2."organization_id" = j."organization_id" AND d2."archived_at" IS NULL AND lower(btrim(d2."name")) = lower(btrim(j."department"))) = 1;

-- ---------------------------------------------------------------------------------------------- support sessions (D14)
-- Offers (pay), interview feedback (judgements) and referrals (rewards) are never read by YukthiX support.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['offers', 'pipeline_feedback', 'referrals']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- permission keys (§17, D2)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'ats.headcount.manage', 'Hiring: headcount plans and their budgets'),
  (gen_random_uuid(), 'ats.requisition.raise', 'Hiring: raise requisitions'),
  (gen_random_uuid(), 'ats.job.manage', 'Hiring: jobs, pipelines, postings and careers content'),
  (gen_random_uuid(), 'ats.candidate.view', 'Hiring: see candidates and applications'),
  (gen_random_uuid(), 'ats.candidate.manage', 'Hiring: manage candidates and applications'),
  (gen_random_uuid(), 'ats.interview.schedule', 'Hiring: schedule interviews and panels'),
  (gen_random_uuid(), 'ats.assessment.view', 'Hiring: see assessment results on applications'),
  (gen_random_uuid(), 'ats.offer.manage', 'Hiring: draft, send and withdraw offers'),
  (gen_random_uuid(), 'ats.offer.compensation.view', 'Hiring: see offer pay'),
  (gen_random_uuid(), 'ats.referral.manage', 'Hiring: referral policies and rewards'),
  (gen_random_uuid(), 'ats.agency.manage', 'Hiring: agencies, their contacts and job shares'),
  (gen_random_uuid(), 'ats.report.view', 'Hiring: reports'),
  (gen_random_uuid(), 'ats.candidate.data_rights', 'Hiring: erase, export and hold candidate data')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" LIKE 'ats.%'
ON CONFLICT DO NOTHING;
