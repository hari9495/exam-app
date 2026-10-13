-- Recruitment batch AT3 (M10-BUILD-DESIGN §6, §13): the careers site and public apply.
--   readable job URLs   jobs.slug (ASCII, stable once set, unique per company) and published_at for Google for Jobs
--   entity pages        a careers headline, intro and colour per legal entity (the company's own page stays the default)
--   consent notices     every notice text a candidate can accept, versioned per purpose; a version is never edited
--   candidate consents  what each applicant accepted, which version, when, from where (hashed IP); never deleted
--   résumé virus scan   public uploads are scanned; a résumé that is not clean is not handed out

ALTER TABLE "jobs" ADD COLUMN "slug" VARCHAR(120), ADD COLUMN "published_at" TIMESTAMPTZ(3), ADD COLUMN "show_salary" BOOLEAN NOT NULL DEFAULT false;
UPDATE "jobs" SET "slug" = left(trim(both '-' from regexp_replace(lower(coalesce("title", 'job') || coalesce(' ' || "location", '')), '[^a-z0-9]+', '-', 'g')), 100) || '-' || left(replace("id"::text, '-', ''), 6);
UPDATE "jobs" SET "slug" = 'job-' || left(replace("id"::text, '-', ''), 8) WHERE "slug" IS NULL OR "slug" ~ '^-';
UPDATE "jobs" SET "published_at" = "created_at" WHERE "list_on_careers";
-- Salary showed on the careers page whenever it was set; keep that for existing jobs.
UPDATE "jobs" SET "show_salary" = true WHERE "salary_min" IS NOT NULL OR "salary_max" IS NOT NULL;
CREATE UNIQUE INDEX "jobs_slug_key" ON "jobs" ("organization_id", "slug") WHERE "slug" IS NOT NULL;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_slug_check" CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

CREATE TABLE "careers_entity_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "headline" VARCHAR(200),
    "intro" VARCHAR(2000),
    "primary_color" VARCHAR(7),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "careers_entity_pages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "careers_entity_pages_entity_key" UNIQUE ("organization_id", "legal_entity_id"),
    CONSTRAINT "careers_entity_pages_slug_key" UNIQUE ("organization_id", "slug"),
    CONSTRAINT "careers_entity_pages_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "careers_entity_pages_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "careers_entity_pages_color_check" CHECK ("primary_color" IS NULL OR "primary_color" ~ '^#[0-9a-fA-F]{6}$')
);

CREATE TABLE "consent_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL,
    "text" VARCHAR(5000) NOT NULL,
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consent_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consent_notices_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "consent_notices_version_key" UNIQUE ("organization_id", "purpose", "version"),
    CONSTRAINT "consent_notices_purpose_check" CHECK ("purpose" IN ('application', 'talent_pool'))
);
-- The notice each existing company already shows becomes version n of 'application'.
INSERT INTO "consent_notices" ("organization_id", "purpose", "version", "text")
SELECT "id", 'application', "apply_consent_version", left("apply_consent_text", 5000) FROM "organizations" WHERE "apply_consent_text" IS NOT NULL AND btrim("apply_consent_text") <> '';

CREATE TABLE "candidate_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "version" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "ip_hash" VARCHAR(64),
    "given_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),
    CONSTRAINT "candidate_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "candidate_consents_notice_fkey" FOREIGN KEY ("organization_id", "notice_id") REFERENCES "consent_notices"("organization_id", "id"),
    CONSTRAINT "candidate_consents_candidate_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE,
    CONSTRAINT "candidate_consents_purpose_check" CHECK ("purpose" IN ('application', 'talent_pool'))
);
CREATE INDEX "candidate_consents_candidate_idx" ON "candidate_consents" ("organization_id", "candidate_id", "purpose");

ALTER TABLE "candidate_profiles" ADD COLUMN "resume_scan" VARCHAR(10) NOT NULL DEFAULT 'clean',
  ADD CONSTRAINT "candidate_profiles_resume_scan_check" CHECK ("resume_scan" IN ('clean', 'pending', 'infected'));

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['careers_entity_pages', 'consent_notices', 'candidate_consents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
-- A published notice and a given consent are records: never changed or erased by the app (withdrawal is a new fact).
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "consent_notices" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "candidate_consents" FROM app_runtime;
