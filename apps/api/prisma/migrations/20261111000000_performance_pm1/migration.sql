-- Performance batch PM1 (M06-BUILD-DESIGN §5.2, §6, PM-1.01 … 1.04): rating scales, levels and bands; review
-- templates with sections and questions (data, never code; versions); the first form of the company skills library
-- (M06 T2, decision D1) with competencies as a view of it, their levels and the level each designation needs.
-- Forced RLS + tenant_isolation on every table. Set-up rows are retired, never erased: no DELETE on the parents;
-- a draft's children (levels, bands, sections, questions, role levels) are replaced while it is a draft.

CREATE TABLE "rating_scales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "min_value" DECIMAL(4,1) NOT NULL,
    "max_value" DECIMAL(4,1) NOT NULL,
    "step" DECIMAL(2,1) NOT NULL DEFAULT 1,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "starter_key" VARCHAR(40),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rating_scales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rating_scales_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "rating_scales_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "rating_scales_range_check" CHECK ("min_value" >= 0 AND "max_value" > "min_value" AND "max_value" <= 100),
    CONSTRAINT "rating_scales_step_check" CHECK ("step" IN (0.5, 1)),
    CONSTRAINT "rating_scales_status_check" CHECK ("status" IN ('active', 'retired'))
);
CREATE UNIQUE INDEX "rating_scales_name_key" ON "rating_scales" ("organization_id", lower("name")) WHERE "status" = 'active';
CREATE UNIQUE INDEX "rating_scales_starter_key" ON "rating_scales" ("organization_id", "starter_key") WHERE "starter_key" IS NOT NULL;

CREATE TABLE "rating_scale_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "value" DECIMAL(4,1) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300),
    CONSTRAINT "rating_scale_levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rating_scale_levels_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "rating_scale_levels_value_key" UNIQUE ("scale_id", "value"),
    CONSTRAINT "rating_scale_levels_scale_fkey" FOREIGN KEY ("organization_id", "scale_id") REFERENCES "rating_scales"("organization_id", "id")
);

CREATE TABLE "rating_bands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "from_score" DECIMAL(5,2) NOT NULL,
    "to_score" DECIMAL(5,2) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    CONSTRAINT "rating_bands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rating_bands_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "rating_bands_scale_fkey" FOREIGN KEY ("organization_id", "scale_id") REFERENCES "rating_scales"("organization_id", "id"),
    CONSTRAINT "rating_bands_range_check" CHECK ("to_score" >= "from_score")
);
CREATE INDEX "rating_bands_scale_idx" ON "rating_bands" ("organization_id", "scale_id", "from_score");

-- A template family (family_id) has numbered versions; at most one version of a family is active (§5.2).
CREATE TABLE "review_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL DEFAULT 1,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "scale_id" UUID NOT NULL,
    "scoring" VARCHAR(16) NOT NULL DEFAULT 'weighted',
    "status" VARCHAR(8) NOT NULL DEFAULT 'draft',
    "starter_key" VARCHAR(40),
    "created_by" UUID,
    "activated_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_templates_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "review_templates_family_version_key" UNIQUE ("organization_id", "family_id", "template_version"),
    CONSTRAINT "review_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "review_templates_scale_fkey" FOREIGN KEY ("organization_id", "scale_id") REFERENCES "rating_scales"("organization_id", "id"),
    CONSTRAINT "review_templates_kind_check" CHECK ("kind" IN ('annual', 'half_yearly', 'quarterly', 'project', 'probation')),
    CONSTRAINT "review_templates_scoring_check" CHECK ("scoring" IN ('weighted', 'manager_overall')),
    CONSTRAINT "review_templates_status_check" CHECK ("status" IN ('draft', 'active', 'retired')),
    CONSTRAINT "review_templates_version_check" CHECK ("template_version" >= 1)
);
CREATE UNIQUE INDEX "review_templates_active_key" ON "review_templates" ("organization_id", "family_id") WHERE "status" = 'active';
CREATE UNIQUE INDEX "review_templates_starter_key" ON "review_templates" ("organization_id", "starter_key") WHERE "starter_key" IS NOT NULL;

CREATE TABLE "review_template_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "seq" SMALLINT NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rated" BOOLEAN NOT NULL DEFAULT true,
    "who_answers" VARCHAR(8)[] NOT NULL,
    CONSTRAINT "review_template_sections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_template_sections_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "review_template_sections_seq_key" UNIQUE ("template_id", "seq"),
    CONSTRAINT "review_template_sections_template_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "review_templates"("organization_id", "id"),
    CONSTRAINT "review_template_sections_kind_check" CHECK ("kind" IN ('goals', 'competencies', 'values', 'questions', 'overall')),
    CONSTRAINT "review_template_sections_weight_check" CHECK ("weight" BETWEEN 0 AND 100 AND ("rated" OR "weight" = 0)),
    CONSTRAINT "review_template_sections_who_check" CHECK (cardinality("who_answers") >= 1 AND "who_answers" <@ ARRAY['self', 'manager', 'peer', 'skip']::VARCHAR(8)[])
);

CREATE TABLE "review_template_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "seq" SMALLINT NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "answer" VARCHAR(8) NOT NULL DEFAULT 'both',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "max_chars" INTEGER NOT NULL DEFAULT 2000,
    CONSTRAINT "review_template_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_template_questions_seq_key" UNIQUE ("section_id", "seq"),
    CONSTRAINT "review_template_questions_section_fkey" FOREIGN KEY ("organization_id", "section_id") REFERENCES "review_template_sections"("organization_id", "id"),
    CONSTRAINT "review_template_questions_answer_check" CHECK ("answer" IN ('rating', 'text', 'both')),
    CONSTRAINT "review_template_questions_chars_check" CHECK ("max_chars" BETWEEN 100 AND 10000)
);

-- The company skills library, first form (T2): domain → skill → sub-skill. A skill in use is retired or merged.
CREATE TABLE "company_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "merged_into_id" UUID,
    "starter_key" VARCHAR(40),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_skills_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "company_skills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_skills_parent_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "company_skills"("organization_id", "id"),
    CONSTRAINT "company_skills_merged_fkey" FOREIGN KEY ("organization_id", "merged_into_id") REFERENCES "company_skills"("organization_id", "id"),
    CONSTRAINT "company_skills_kind_check" CHECK ("kind" IN ('domain', 'skill', 'sub_skill')),
    CONSTRAINT "company_skills_status_check" CHECK ("status" IN ('active', 'retired', 'merged')),
    CONSTRAINT "company_skills_merged_check" CHECK (("status" = 'merged') = ("merged_into_id" IS NOT NULL)),
    CONSTRAINT "company_skills_domain_check" CHECK (("kind" = 'domain') = ("parent_id" IS NULL))
);
CREATE UNIQUE INDEX "company_skills_name_key" ON "company_skills" ("organization_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name")) WHERE "status" = 'active';
CREATE UNIQUE INDEX "company_skills_starter_key" ON "company_skills" ("organization_id", "starter_key") WHERE "starter_key" IS NOT NULL;

-- Competencies are the M06 view of a skill (D1): the name lives on the skill.
CREATE TABLE "competencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "company_skill_id" UUID NOT NULL,
    "group" VARCHAR(12) NOT NULL,
    "description" VARCHAR(500),
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "starter_key" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "competencies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "competencies_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "competencies_skill_key" UNIQUE ("organization_id", "company_skill_id"),
    CONSTRAINT "competencies_skill_fkey" FOREIGN KEY ("organization_id", "company_skill_id") REFERENCES "company_skills"("organization_id", "id"),
    CONSTRAINT "competencies_group_check" CHECK ("group" IN ('core', 'functional', 'leadership')),
    CONSTRAINT "competencies_status_check" CHECK ("status" IN ('active', 'retired'))
);
CREATE UNIQUE INDEX "competencies_starter_key" ON "competencies" ("organization_id", "starter_key") WHERE "starter_key" IS NOT NULL;

CREATE TABLE "competency_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "behaviours" VARCHAR(500),
    CONSTRAINT "competency_levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "competency_levels_level_key" UNIQUE ("competency_id", "level"),
    CONSTRAINT "competency_levels_competency_fkey" FOREIGN KEY ("organization_id", "competency_id") REFERENCES "competencies"("organization_id", "id"),
    CONSTRAINT "competency_levels_level_check" CHECK ("level" BETWEEN 1 AND 10)
);

-- The level a designation needs, dated (P06 style).
CREATE TABLE "role_competency_map" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "designation_id" UUID NOT NULL,
    "competency_id" UUID NOT NULL,
    "expected_level" SMALLINT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    CONSTRAINT "role_competency_map_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_competency_map_designation_fkey" FOREIGN KEY ("organization_id", "designation_id") REFERENCES "designations"("organization_id", "id"),
    CONSTRAINT "role_competency_map_competency_fkey" FOREIGN KEY ("organization_id", "competency_id") REFERENCES "competencies"("organization_id", "id"),
    CONSTRAINT "role_competency_map_level_check" CHECK ("expected_level" BETWEEN 1 AND 10),
    CONSTRAINT "role_competency_map_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
CREATE INDEX "role_competency_map_idx" ON "role_competency_map" ("organization_id", "competency_id", "designation_id");

-- G1 translations (§6.4): rating labels, band labels, section titles and competency names. The expense subjects
-- (expenses E1) are listed too, so the constraint is the same whichever branch reaches a database first.
ALTER TABLE "content_translations" DROP CONSTRAINT "content_translations_subject_check";
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_subject_check" CHECK ("subject_type" IN ('leave_type', 'designation', 'department', 'grade', 'employment_type', 'location', 'journey_template', 'journey_task', 'expense_category', 'city_tier', 'rating_level', 'rating_band', 'review_section', 'competency'));

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rating_scales', 'rating_scale_levels', 'rating_bands', 'review_templates', 'review_template_sections', 'review_template_questions', 'company_skills', 'competencies', 'competency_levels', 'role_competency_map']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
-- Parents are retired, never erased (§5.1).
REVOKE DELETE, TRUNCATE ON TABLE "rating_scales" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "review_templates" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "company_skills" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "competencies" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- permission key (§17)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.setup.manage', 'Performance set-up: rating scales, review templates, competencies and the skills library')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'perf.setup.manage'
ON CONFLICT DO NOTHING;
