-- Learning, the core (LRN-01, 02, 03, 07, 08 and the PPL-03 Learning tab): courses with their content items,
-- assignment rules (who must complete what, by when, how often), enrolments with progress, certificates with a public
-- verify code, and a log of reminders so none is sent twice. Every table is a company's own (forced RLS) and kept out
-- of YukthiX support sessions.

CREATE TABLE "learning_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "type" VARCHAR(20) NOT NULL DEFAULT 'self_paced',
    "source" VARCHAR(20) NOT NULL DEFAULT 'company',
    "provider" VARCHAR(120),
    "duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "cost" NUMERIC(12, 2) NOT NULL DEFAULT 0,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "needs_approval" BOOLEAN NOT NULL DEFAULT false,
    "certificate" BOOLEAN NOT NULL DEFAULT false,
    "certificate_months" INTEGER,
    "skills" TEXT[] NOT NULL DEFAULT '{}',
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "learning_courses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_courses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_courses_type_check" CHECK ("type" IN ('self_paced', 'classroom', 'virtual', 'scorm', 'assessment')),
    CONSTRAINT "learning_courses_source_check" CHECK ("source" IN ('company', 'provider', 'partner')),
    CONSTRAINT "learning_courses_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
    CONSTRAINT "learning_courses_months_check" CHECK ("certificate_months" IS NULL OR "certificate_months" BETWEEN 1 AND 120),
    CONSTRAINT "learning_courses_cost_check" CHECK ("cost" >= 0 AND "duration_minutes" >= 0)
);
CREATE UNIQUE INDEX "learning_courses_title_key" ON "learning_courses"("organization_id", lower("title")) WHERE "status" <> 'retired';

CREATE TABLE "learning_course_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "file_id" UUID,
    "url" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_course_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_course_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_course_items_course_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_course_items_kind_check" CHECK ("kind" IN ('pdf', 'video', 'link')),
    CONSTRAINT "learning_course_items_source_check" CHECK (("kind" = 'link' AND "url" IS NOT NULL AND "file_id" IS NULL) OR ("kind" <> 'link' AND "file_id" IS NOT NULL AND "url" IS NULL)),
    CONSTRAINT "learning_course_items_minutes_check" CHECK ("minutes" BETWEEN 0 AND 1440)
);
CREATE INDEX "learning_course_items_course_idx" ON "learning_course_items"("organization_id", "course_id", "position");

-- Who must complete a course: people whose job today is in every listed entity / location / department (an empty list
-- means any) and whose designation contains the given words; due N days after they are enrolled; again every N months.
CREATE TABLE "learning_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "course_id" UUID NOT NULL,
    "legal_entity_ids" UUID[] NOT NULL DEFAULT '{}',
    "location_ids" UUID[] NOT NULL DEFAULT '{}',
    "department_ids" UUID[] NOT NULL DEFAULT '{}',
    "designation" VARCHAR(120),
    "due_days" INTEGER NOT NULL DEFAULT 30,
    "repeat_months" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "learning_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_rules_course_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_rules_due_check" CHECK ("due_days" BETWEEN 1 AND 365),
    CONSTRAINT "learning_rules_repeat_check" CHECK ("repeat_months" IN (0, 12, 24))
);

CREATE TABLE "learning_enrolments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "source" VARCHAR(12) NOT NULL,
    "rule_id" UUID,
    "assigned_on" DATE NOT NULL,
    "due_on" DATE,
    "status" VARCHAR(12) NOT NULL DEFAULT 'enrolled',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "learning_enrolments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_enrolments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_enrolments_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_enrolments_course_fkey" FOREIGN KEY ("course_id") REFERENCES "learning_courses"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_enrolments_rule_fkey" FOREIGN KEY ("rule_id") REFERENCES "learning_rules"("id") ON DELETE SET NULL,
    CONSTRAINT "learning_enrolments_source_check" CHECK ("source" IN ('rule', 'renewal', 'self', 'nominated')),
    CONSTRAINT "learning_enrolments_status_check" CHECK ("status" IN ('requested', 'enrolled', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT "learning_enrolments_done_check" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL))
);
-- One open enrolment per person and course.
CREATE UNIQUE INDEX "learning_enrolments_open_key" ON "learning_enrolments"("organization_id", "employee_id", "course_id") WHERE "status" IN ('requested', 'enrolled', 'in_progress');
CREATE INDEX "learning_enrolments_employee_idx" ON "learning_enrolments"("organization_id", "employee_id");
CREATE INDEX "learning_enrolments_due_idx" ON "learning_enrolments"("organization_id", "due_on") WHERE "status" IN ('enrolled', 'in_progress');

CREATE TABLE "learning_item_progress" (
    "organization_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "done_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_item_progress_pkey" PRIMARY KEY ("enrolment_id", "item_id"),
    CONSTRAINT "learning_item_progress_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_item_progress_enrolment_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "learning_enrolments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_item_progress_item_fkey" FOREIGN KEY ("item_id") REFERENCES "learning_course_items"("id") ON DELETE CASCADE
);

CREATE TABLE "learning_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "course_title" VARCHAR(200) NOT NULL,
    "person_name" VARCHAR(200) NOT NULL,
    "issued_on" DATE NOT NULL,
    "expires_on" DATE,
    "verify_code" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_certificates_enrolment_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "learning_enrolments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_certificates_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "learning_certificates_enrolment_key" ON "learning_certificates"("enrolment_id");
CREATE UNIQUE INDEX "learning_certificates_verify_key" ON "learning_certificates"("verify_code");
CREATE INDEX "learning_certificates_employee_idx" ON "learning_certificates"("organization_id", "employee_id");

-- before_7 · before_2 · overdue_manager · overdue_hr: each sent once per enrolment.
CREATE TABLE "learning_reminders" (
    "organization_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_reminders_pkey" PRIMARY KEY ("enrolment_id", "kind"),
    CONSTRAINT "learning_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_reminders_enrolment_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "learning_enrolments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_reminders_kind_check" CHECK ("kind" IN ('before_7', 'before_2', 'overdue_manager', 'overdue_hr'))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_courses', 'learning_course_items', 'learning_rules', 'learning_enrolments', 'learning_item_progress', 'learning_certificates', 'learning_reminders']
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

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'learning.manage', 'Build and publish courses, and set the rules for who must complete them'),
  (gen_random_uuid(), 'learning.report.view', 'Training completion and compliance of people in scope; remind people who are overdue')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('learning.manage', 'learning.report.view')
ON CONFLICT DO NOTHING;
