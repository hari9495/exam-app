-- Batch G1 · Global core (G1-GLOBAL-CORE-BUILD-DESIGN; global gap pass §7.1, accepted 10 Oct 2026):
--   hours     a job's contracted hours a week, a dated job fact like the grade (empty = full-time);
--   service   continuous service from, set by HR with a reason (company and employer start are read from employments);
--   language  company words translated per language (content_translations);
--   countries the "Add a country" guide per legal entity (country_setups) and the India country pack (P07 IN.PACK).
-- Every new tenant table: organization_id NOT NULL, composite keys, forced RLS with tenant_isolation.

-- ---------------------------------------------------------------------------------------------- hours (C1)
ALTER TABLE "employee_assignments"
  ADD COLUMN "hours_per_week" NUMERIC(4,1),
  ADD CONSTRAINT "employee_assignments_hours_check" CHECK ("hours_per_week" IS NULL OR ("hours_per_week" > 0 AND "hours_per_week" <= 80 AND "hours_per_week" * 2 = trunc("hours_per_week" * 2)));

-- ---------------------------------------------------------------------------------------------- service dates (C3)
ALTER TABLE "employments"
  ADD COLUMN "continuous_service_from" DATE,
  ADD COLUMN "continuous_service_reason" VARCHAR(300),
  ADD CONSTRAINT "employments_continuous_service_check" CHECK ("continuous_service_from" IS NULL OR ("continuous_service_from" <= "joined_on" AND "continuous_service_reason" IS NOT NULL));

-- ---------------------------------------------------------------------------------------------- translations (G1)
CREATE TABLE "content_translations" (
    "organization_id" UUID NOT NULL,
    "subject_type" VARCHAR(24) NOT NULL,
    "subject_id" UUID NOT NULL,
    "language" VARCHAR(5) NOT NULL,
    "text" VARCHAR(150) NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_translations_pkey" PRIMARY KEY ("organization_id", "subject_type", "subject_id", "language"),
    CONSTRAINT "content_translations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "content_translations_subject_check" CHECK ("subject_type" IN ('leave_type', 'designation', 'department', 'grade', 'employment_type', 'location', 'journey_template', 'journey_task')),
    CONSTRAINT "content_translations_language_check" CHECK ("language" IN ('en', 'hi', 'ta', 'te')),
    CONSTRAINT "content_translations_text_check" CHECK (char_length(btrim("text")) BETWEEN 1 AND 150)
);
REVOKE TRUNCATE ON TABLE "content_translations" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- Add a country (G6)
CREATE TABLE "country_setups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "legal_entity_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'in_progress',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_by" UUID,
    "finished_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_setups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "country_setups_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "country_setups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "country_setups_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "country_setups_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "country_setups_status_check" CHECK ("status" IN ('in_progress', 'done')),
    CONSTRAINT "country_setups_finished_check" CHECK (("status" = 'done') = ("finished_at" IS NOT NULL))
);
-- One guide per legal entity.
CREATE UNIQUE INDEX "country_setups_entity_key" ON "country_setups"("organization_id", "legal_entity_id") WHERE "legal_entity_id" IS NOT NULL;
REVOKE DELETE, TRUNCATE ON TABLE "country_setups" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_translations', 'country_setups']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- the India country pack (P07)
-- The country itself: currency, financial year, data region, the legal normal week, languages, entity identifiers,
-- registrations and the person-field rules (required / optional / not_allowed). Verify stays on until the compliance
-- owner confirms it (YX-STAT-13).
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES
  ('IN.PACK', 'IN', '2026-v1', '2026-04-01', NULL,
   '{"kind":"country_pack","name":"India","currency":"INR","fyStartMonth":4,"dataRegion":"IN","normalWeekHours":"48","languages":["en","hi","ta","te"],"entityIds":[{"key":"pan","required":true},{"key":"tan","required":true},{"key":"gstin","required":false},{"key":"cin","required":false}],"registrations":["IN.PF","IN.ESI","IN.PT","IN.LWF"],"personFields":{"legalName":"required","dateOfBirth":"required","gender":"required","maritalStatus":"optional","nationality":"optional","fatherOrSpouseName":"optional","disability":"optional","bloodGroup":"optional","religion":"not_allowed","casteCategory":"not_allowed","ethnicity":"not_allowed","pan":"required","aadhaar":"optional","uan":"optional","esic":"optional","passport":"optional","socialSecurityNumber":"not_allowed","nationalInsuranceNumber":"not_allowed","emiratesId":"not_allowed"}}',
   'Normal week: Factories Act 1948 s.51 and Occupational Safety, Health and Working Conditions Code 2020 s.25 (48 hours a week). Financial year: Income-tax Act. Aadhaar optional for private employers: Puttaswamy (Aadhaar) judgment 2018 and Aadhaar Act s.57 as read down. Person fields: YukthiX privacy review (DPDP Act 2023: collect only what is needed). Verify before go-live.',
   true, 'published', NULL, CURRENT_TIMESTAMP);
