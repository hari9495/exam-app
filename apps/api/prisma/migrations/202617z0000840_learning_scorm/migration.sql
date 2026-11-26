-- Answer 2781: SCORM 1.2 and 2004 packages as a course item (LRN-03), played in the course player (LRN-02). The zip
-- stays as the item's file; each unpacked file is stored and virus-checked on its own (files), and is served only from
-- the separate content origin while clean. What the package reports is kept per enrolment so the learner can resume.

ALTER TABLE "learning_course_items" DROP CONSTRAINT "learning_course_items_kind_check";
ALTER TABLE "learning_course_items" ADD CONSTRAINT "learning_course_items_kind_check" CHECK ("kind" IN ('pdf', 'video', 'link', 'scorm'));
ALTER TABLE "learning_course_items" ADD COLUMN "scorm_version" VARCHAR(4);
ALTER TABLE "learning_course_items" ADD COLUMN "scorm_launch" VARCHAR(1000);
ALTER TABLE "learning_course_items" ADD CONSTRAINT "learning_course_items_scorm_check" CHECK (("kind" = 'scorm') = ("scorm_version" IS NOT NULL AND "scorm_launch" IS NOT NULL));
ALTER TABLE "learning_course_items" ADD CONSTRAINT "learning_course_items_scorm_version_check" CHECK ("scorm_version" IS NULL OR "scorm_version" IN ('1.2', '2004'));

-- One unpacked file of a SCORM item, by its path inside the package.
CREATE TABLE "learning_scorm_files" (
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "path" VARCHAR(1000) NOT NULL,
    "file_id" UUID NOT NULL,
    CONSTRAINT "learning_scorm_files_pkey" PRIMARY KEY ("item_id", "path"),
    CONSTRAINT "learning_scorm_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_scorm_files_item_fkey" FOREIGN KEY ("item_id") REFERENCES "learning_course_items"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_scorm_files_file_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE
);
CREATE INDEX "learning_scorm_files_org_idx" ON "learning_scorm_files"("organization_id", "item_id");

-- What the package reported for one enrolment: only the allowed cmi fields (status, score, location, suspend data,
-- times), never anything else.
CREATE TABLE "learning_scorm_attempts" (
    "organization_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cmi" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_scorm_attempts_pkey" PRIMARY KEY ("enrolment_id", "item_id"),
    CONSTRAINT "learning_scorm_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_scorm_attempts_enrolment_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "learning_enrolments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_scorm_attempts_item_fkey" FOREIGN KEY ("item_id") REFERENCES "learning_course_items"("id") ON DELETE CASCADE
);
CREATE INDEX "learning_scorm_attempts_org_idx" ON "learning_scorm_attempts"("organization_id", "enrolment_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_scorm_files', 'learning_scorm_attempts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
