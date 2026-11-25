-- Batch G3a (M07 Q1-Q2, answers 2606, 2608): Learning starts with courses. L&D (learning.manage) builds a course from
-- videos, PDFs and links (some required), maps the skills it raises, and publishes it. People enrol themselves (or ask,
-- when the course needs approval), are nominated by their manager or L&D (a mandatory course can't be declined), work
-- through the items, and get a certificate when the required items are done (valid for the course's months).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'learning.manage', 'Build and publish courses, nominate anyone, approve enrolment requests and see everyone''s learning and certificates')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'learning.manage'
ON CONFLICT DO NOTHING;

CREATE TABLE "lrn_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "type" VARCHAR(12) NOT NULL DEFAULT 'self_paced',
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "needs_approval" BOOLEAN NOT NULL DEFAULT false,
    "certificate" BOOLEAN NOT NULL DEFAULT false,
    "valid_months" INTEGER,
    "skills" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lrn_courses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_courses_type_check" CHECK ("type" IN ('self_paced', 'classroom', 'virtual')),
    CONSTRAINT "lrn_courses_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
    CONSTRAINT "lrn_courses_numbers_check" CHECK ("duration_minutes" BETWEEN 1 AND 100000 AND "cost" BETWEEN 0 AND 100000000 AND ("valid_months" IS NULL OR "valid_months" BETWEEN 1 AND 120)),
    CONSTRAINT "lrn_courses_valid_check" CHECK ("certificate" OR "valid_months" IS NULL)
);

CREATE TABLE "lrn_course_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "url" VARCHAR(1000),
    "file_id" UUID,
    "minutes" INTEGER NOT NULL DEFAULT 5,
    "required" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "lrn_course_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_course_items_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lrn_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_course_items_kind_check" CHECK ("kind" IN ('video', 'pdf', 'link')),
    CONSTRAINT "lrn_course_items_source_check" CHECK (("kind" = 'link') = ("url" IS NOT NULL) AND ("kind" = 'link') = ("file_id" IS NULL)),
    CONSTRAINT "lrn_course_items_url_check" CHECK ("url" IS NULL OR "url" LIKE 'https://%')
);
CREATE INDEX "lrn_course_items_course_idx" ON "lrn_course_items"("course_id", "position");

CREATE TABLE "lrn_enrolments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "due_on" DATE,
    "nominated_by" UUID,
    "decided_by" UUID,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "lrn_enrolments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_enrolments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "lrn_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_enrolments_source_check" CHECK ("source" IN ('self', 'nominated', 'rule')),
    CONSTRAINT "lrn_enrolments_status_check" CHECK ("status" IN ('requested', 'enrolled', 'completed', 'declined', 'refused'))
);
-- One open enrolment of a person in a course at a time (completed ones stay as history).
CREATE UNIQUE INDEX "lrn_enrolments_open_key" ON "lrn_enrolments"("course_id", "user_id") WHERE "status" IN ('requested', 'enrolled');
CREATE INDEX "lrn_enrolments_user_idx" ON "lrn_enrolments"("organization_id", "user_id");

CREATE TABLE "lrn_item_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "done_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lrn_item_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_item_progress_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "lrn_enrolments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lrn_item_progress_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "lrn_course_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "lrn_item_progress_key" ON "lrn_item_progress"("enrolment_id", "item_id");

CREATE TABLE "lrn_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "issued_on" DATE NOT NULL,
    "expires_on" DATE,
    CONSTRAINT "lrn_certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lrn_certificates_enrolment_id_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "lrn_enrolments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "lrn_certificates_enrolment_key" ON "lrn_certificates"("enrolment_id");
CREATE INDEX "lrn_certificates_user_idx" ON "lrn_certificates"("organization_id", "user_id");

ALTER TABLE "lrn_courses" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_courses"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_courses" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_courses" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_course_items" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_course_items"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_course_items" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_course_items" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_enrolments" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_enrolments"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_enrolments" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_enrolments" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_item_progress" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_item_progress"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_item_progress" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_item_progress" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "lrn_certificates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lrn_certificates"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "lrn_certificates" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "lrn_certificates" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
