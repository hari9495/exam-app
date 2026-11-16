-- Assessments AS-3 part 2 (answer 2014; PRC-29): the campus kit on the existing walk-in drives. Institutions, a drive's
-- registration form and eligibility (null = not a campus drive), registrants with duplicate merge, and the college
-- coordinator's read-only link. No admit cards (they wait for test centres). No data written.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "walk_in_groups" ADD COLUMN "campus_settings" JSONB;

CREATE TABLE "asmt_institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "city" VARCHAR(120),
    "coordinator_name" VARCHAR(200),
    "coordinator_email" VARCHAR(320),
    "results_visibility" VARCHAR(16) NOT NULL DEFAULT 'aggregate',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asmt_institutions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asmt_institutions_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_institutions_visibility_check" CHECK ("results_visibility" IN ('none', 'aggregate', 'per_candidate')),
    CONSTRAINT "asmt_institutions_text_check" CHECK (char_length(btrim("name")) > 0 AND char_length(btrim("code")) > 0)
);
CREATE UNIQUE INDEX "asmt_institutions_code_key" ON "asmt_institutions" ("organization_id", lower("code"));

CREATE TABLE "asmt_registrants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "walk_in_group_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "invitation_id" UUID,
    "name" VARCHAR(300) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(20),
    "roll_number" VARCHAR(40) NOT NULL,
    "branch" VARCHAR(120),
    "graduation_year" INTEGER,
    "cgpa" NUMERIC(5,2),
    "eligible" BOOLEAN NOT NULL,
    "ineligible_reason" VARCHAR(300),
    "matched_existing" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_of_id" UUID,
    "merged_into_id" UUID,
    "merged_at" TIMESTAMPTZ(3),
    "merged_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asmt_registrants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asmt_registrants_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_registrants_group_fkey" FOREIGN KEY ("walk_in_group_id") REFERENCES "walk_in_groups"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_registrants_institution_fkey" FOREIGN KEY ("institution_id") REFERENCES "asmt_institutions"("id") ON DELETE RESTRICT,
    CONSTRAINT "asmt_registrants_candidate_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_registrants_invitation_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL,
    CONSTRAINT "asmt_registrants_duplicate_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "asmt_registrants"("id") ON DELETE SET NULL,
    CONSTRAINT "asmt_registrants_merged_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "asmt_registrants"("id") ON DELETE SET NULL,
    CONSTRAINT "asmt_registrants_self_check" CHECK ("merged_into_id" IS DISTINCT FROM "id" AND "duplicate_of_id" IS DISTINCT FROM "id"),
    CONSTRAINT "asmt_registrants_merge_check" CHECK (("merged_into_id" IS NULL) = ("merged_at" IS NULL)),
    CONSTRAINT "asmt_registrants_eligible_check" CHECK ("eligible" OR "ineligible_reason" IS NOT NULL),
    CONSTRAINT "asmt_registrants_cgpa_check" CHECK ("cgpa" IS NULL OR "cgpa" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "asmt_registrants_group_email_key" ON "asmt_registrants" ("walk_in_group_id", "email");
CREATE INDEX "asmt_registrants_group_roll_idx" ON "asmt_registrants" ("walk_in_group_id", "institution_id", lower("roll_number"));
CREATE INDEX "asmt_registrants_organization_id_idx" ON "asmt_registrants" ("organization_id");

CREATE TABLE "asmt_coordinator_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "walk_in_group_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asmt_coordinator_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asmt_coordinator_links_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_coordinator_links_institution_fkey" FOREIGN KEY ("institution_id") REFERENCES "asmt_institutions"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_coordinator_links_group_fkey" FOREIGN KEY ("walk_in_group_id") REFERENCES "walk_in_groups"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "asmt_coordinator_links_token_key" ON "asmt_coordinator_links" ("token_hash");
CREATE INDEX "asmt_coordinator_links_organization_id_idx" ON "asmt_coordinator_links" ("organization_id");

ALTER TABLE "asmt_institutions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asmt_institutions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "asmt_registrants" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asmt_registrants"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "asmt_coordinator_links" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asmt_coordinator_links"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
