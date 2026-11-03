-- HLP-12 accident cases (4 Nov 2026; rules: docs/yukthix/helpdesk-design-map.md section 4g). Anyone reports a workplace
-- accident or injury, also for someone else; the company's safety team (a speak-up list the System Admin keeps) and the
-- HR person they name handle it; the injured person's manager sees leave dates only. Everything is append-only: the
-- report, every step (facts, statements, photos, filings, the EC claim, reminders, closing) and the medical records
-- (each file with its SHA-256 fingerprint). Deadlines come from the rule sets IN.ESI.ACCIDENT and IN.EC, never code.

-- The safety team joins the speak-up lists (founder decision 2).
ALTER TABLE "speakup_team_members" DROP CONSTRAINT "speakup_team_members_team_check";
ALTER TABLE "speakup_team_members" ADD CONSTRAINT "speakup_team_members_team_check" CHECK ("team" IN ('grievance', 'ethics', 'ic', 'escalation', 'safety'));

CREATE TABLE "accident_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "injured_kind" VARCHAR(10) NOT NULL,
    "injured_employee_id" UUID,
    "injured_name" VARCHAR(150) NOT NULL,
    "contractor" VARCHAR(150),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    -- The accident's date in India time: every clock counts from it.
    "occurred_on" DATE NOT NULL,
    "location_id" UUID NOT NULL,
    "place" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "injury_type" VARCHAR(80) NOT NULL,
    "body_part" VARCHAR(100),
    "first_aid" BOOLEAN NOT NULL DEFAULT false,
    "witnesses" VARCHAR(300),
    "filed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accident_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accident_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "accident_cases_reporter_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "accident_cases_employee_fkey" FOREIGN KEY ("injured_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "accident_cases_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
    CONSTRAINT "accident_cases_number_check" CHECK ("number" > 0),
    -- An employee is linked to their record; a contract worker names the contractor (the immediate employer).
    CONSTRAINT "accident_cases_injured_check" CHECK (
      ("injured_kind" = 'employee' AND "injured_employee_id" IS NOT NULL AND "contractor" IS NULL)
      OR ("injured_kind" = 'contract' AND "injured_employee_id" IS NULL AND "contractor" IS NOT NULL))
);
CREATE UNIQUE INDEX "accident_cases_number_key" ON "accident_cases" ("organization_id", "number");

CREATE TABLE "accident_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "actor_user_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accident_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accident_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "accident_steps_case_fkey" FOREIGN KEY ("case_id") REFERENCES "accident_cases"("id") ON DELETE CASCADE,
    CONSTRAINT "accident_steps_kind_check" CHECK ("kind" IN ('facts', 'statement', 'photo', 'esic_filed', 'contractor_filed', 'ec_set', 'ec_paid', 'reminded', 'closed')),
    -- Only the morning reminder is the app's own; every other step names who did it.
    CONSTRAINT "accident_steps_actor_check" CHECK ("kind" = 'reminded' OR "actor_user_id" IS NOT NULL)
);
CREATE INDEX "accident_steps_case_idx" ON "accident_steps" ("case_id", "at");

-- Medical details are special data: append-only, each file with its fingerprint, every open audited.
CREATE TABLE "accident_medical_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "note" VARCHAR(2000) NOT NULL,
    "file_id" UUID,
    "file_sha256" CHAR(64),
    "added_by" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accident_medical_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accident_medical_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "accident_medical_records_case_fkey" FOREIGN KEY ("case_id") REFERENCES "accident_cases"("id") ON DELETE CASCADE,
    CONSTRAINT "accident_medical_records_kind_check" CHECK ("kind" IN ('diagnosis', 'certificate', 'disablement', 'note')),
    CONSTRAINT "accident_medical_records_sha_check" CHECK (("file_id" IS NULL) = ("file_sha256" IS NULL))
);
CREATE INDEX "accident_medical_records_case_idx" ON "accident_medical_records" ("case_id", "at");

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "accident_cases", "accident_steps", "accident_medical_records" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accident_cases', 'accident_steps', 'accident_medical_records']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads accident or medical records.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- Data: the deadline rule sets (founder decision 3: verify with counsel, never in code). FORCE row-level security
-- would otherwise skip rows.
SELECT set_config('app.is_super_admin', 'on', true);

-- IN.EC.CLAIM, not IN.EC: payroll's injury pay reads IN.EC with its own values.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.ESI.ACCIDENT', 'IN', '1950-v1', '1950-02-24',
   '{"reportDays":1}',
   'ESI (General) Regulations 1950, reg. 68: the employer reports an accident to an insured person to the ESIC branch office at once, at most 24 hours after hearing of it; counted as one day after the accident date. For a contract worker the contractor reports; the principal employer stays liable (ESI Act s.40, s.41). Verify with counsel.', true),
  ('IN.EC.CLAIM', 'IN', '2020-v1', '2020-01-03',
   '{"payWithinDays":30,"interestPctYear":12,"wageCeiling":15000,"deathPct":50,"deathMin":120000,"totalPct":60,"totalMin":140000,"tempPct":25,"waitingDays":3,"claimYears":2}',
   'Employee''s Compensation Act 1923: s.4 amounts (50 % / 60 % of wages x Schedule IV factor, at least Rs 1.2 / 1.4 lakh; temporary 25 % a half-month after 3 days); wage ceiling Rs 15,000 (S.O. 71(E), 2020); s.4A interest 12 % a year if unpaid one month after due; s.10 claim in two years. Not where ESI covers the injury (ESI Act s.53). Verify with counsel.', true)
ON CONFLICT DO NOTHING;
