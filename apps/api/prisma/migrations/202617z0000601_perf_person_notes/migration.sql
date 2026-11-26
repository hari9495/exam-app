-- Batch F item 32 (answer 2577): private notes a person keeps about a colleague. Only the author ever sees them (never the
-- person, HR or the next manager; never used in reviews); edited or deleted by the author; at most 1,000 characters.
CREATE TABLE "perf_person_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_person_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_person_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "perf_person_notes_text_check" CHECK (char_length(btrim("text")) >= 1)
);
CREATE INDEX "perf_person_notes_author_idx" ON "perf_person_notes"("organization_id", "author_user_id", "employee_id");

ALTER TABLE "perf_person_notes" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "perf_person_notes"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- The author alone, enforced by the database too (a company admin or support session sees nothing).
CREATE POLICY author_only ON "perf_person_notes" AS RESTRICTIVE
  USING (author_user_id = (SELECT app_current_user_id()) OR (SELECT app_is_super_admin()))
  WITH CHECK (author_user_id = (SELECT app_current_user_id()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "perf_person_notes" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "perf_person_notes" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
