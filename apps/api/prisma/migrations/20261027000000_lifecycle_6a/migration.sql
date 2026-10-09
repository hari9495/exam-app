-- Lifecycle batch 6a (M01-LIFECYCLE-BUILD-DESIGN §5.2): the shared file store, person documents with versions and
-- verification, journey templates and running journeys (one checklist engine for joining and leaving), and joiners
-- before day one. Every table: forced RLS + tenant_isolation, composite foreign keys, no hard delete by the app.

-- ---------------------------------------------------------------------------------------------- files (P05 §4.1)
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "area" VARCHAR(20) NOT NULL,
    "storage_ref" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "scan_status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "scan_detail" VARCHAR(200),
    "scanned_at" TIMESTAMPTZ(3),
    "uploaded_by" UUID,
    "uploaded_via" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "files_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "files_scan_check" CHECK ("scan_status" IN ('pending', 'clean', 'infected')),
    CONSTRAINT "files_via_check" CHECK ("uploaded_via" IN ('staff', 'self', 'preboarder', 'system')),
    CONSTRAINT "files_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "files_size_check" CHECK ("size" > 0)
);
REVOKE DELETE, TRUNCATE ON TABLE "files" FROM app_runtime;
-- The bytes, name and hash of a stored file never change; only the scan verdict moves, once, from pending.
CREATE FUNCTION files_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.storage_ref IS DISTINCT FROM OLD.storage_ref OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.size IS DISTINCT FROM OLD.size
     OR NEW.mime IS DISTINCT FROM OLD.mime OR NEW.file_name IS DISTINCT FROM OLD.file_name OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A stored file never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.scan_status <> 'pending' AND NEW.scan_status IS DISTINCT FROM OLD.scan_status THEN
    RAISE EXCEPTION 'A scan verdict is final' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER files_guard BEFORE UPDATE ON "files" FOR EACH ROW EXECUTE FUNCTION files_guard();

-- ---------------------------------------------------------------------------------------------- documents (P05 §4.2)
CREATE TABLE "document_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sensitivity" VARCHAR(12) NOT NULL,
    "requires_verification" BOOLEAN NOT NULL,
    "allowed_mime" TEXT[] NOT NULL,
    "max_mb" INTEGER NOT NULL,
    "expiry_tracked" BOOLEAN NOT NULL,
    "reminder_days" INTEGER[] NOT NULL DEFAULT '{}',
    "upload_by" TEXT[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_types_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT "document_types_sensitivity_check" CHECK ("sensitivity" IN ('internal', 'personal', 'confidential', 'special')),
    CONSTRAINT "document_types_mime_check" CHECK ("allowed_mime" <@ ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[] AND cardinality("allowed_mime") > 0),
    CONSTRAINT "document_types_max_check" CHECK ("max_mb" BETWEEN 1 AND 20),
    CONSTRAINT "document_types_upload_check" CHECK ("upload_by" <@ ARRAY['person', 'hr']::text[] AND cardinality("upload_by") > 0)
);
-- One key per company, and a company key never shadows a system key.
CREATE UNIQUE INDEX "document_types_key" ON "document_types" (COALESCE("organization_id", '00000000-0000-0000-0000-000000000000'::uuid), "key");
REVOKE DELETE, TRUNCATE ON TABLE "document_types" FROM app_runtime;

CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type_key" VARCHAR(40) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "current_version_id" UUID,
    "expires_on" DATE,
    "requested_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(3),
    "reject_reason" VARCHAR(500),
    "reminded_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "documents_status_check" CHECK ("status" IN ('requested', 'uploaded', 'verified', 'rejected', 'expired'))
);
-- One live document of a type per person (versions hold the history).
CREATE UNIQUE INDEX "documents_person_type_key" ON "documents" ("organization_id", "person_id", "type_key");
CREATE INDEX "documents_queue_idx" ON "documents" ("organization_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "documents" FROM app_runtime;

CREATE TABLE "document_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_versions_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "document_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_versions_document_fkey" FOREIGN KEY ("organization_id", "document_id") REFERENCES "documents"("organization_id", "id"),
    CONSTRAINT "document_versions_file_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "files"("organization_id", "id"),
    CONSTRAINT "document_versions_number_key" UNIQUE ("organization_id", "document_id", "version")
);
-- Versions are history: never edited, never deleted by the app (YX-DOC-05).
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "document_versions" FROM app_runtime;
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_fkey" FOREIGN KEY ("organization_id", "current_version_id") REFERENCES "document_versions"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------- joiners (M01 §3.5, D2)
ALTER TABLE "person_roles" DROP CONSTRAINT "person_roles_type_check";
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_type_check" CHECK ("role_type" IN ('applicant', 'candidate', 'campus_registrant', 'test_taker', 'preboarder', 'employee', 'alumnus', 'nominee', 'consultant', 'contract_worker', 'vendor_worker', 'external_login', 'login'));

CREATE TABLE "preboardings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "joining_on" DATE NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "employment_type_id" UUID,
    "manager_employee_id" UUID,
    "hr_owner_user_id" UUID NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "employment_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "preboardings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preboardings_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "preboardings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "preboardings_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "preboardings_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "preboardings_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "preboardings_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "preboardings_designation_fkey" FOREIGN KEY ("organization_id", "designation_id") REFERENCES "designations"("organization_id", "id"),
    CONSTRAINT "preboardings_type_fkey" FOREIGN KEY ("organization_id", "employment_type_id") REFERENCES "employment_types"("organization_id", "id"),
    CONSTRAINT "preboardings_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "preboardings_hr_fkey" FOREIGN KEY ("organization_id", "hr_owner_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "preboardings_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "preboardings_source_check" CHECK ("source" IN ('direct', 'import', 'offer')),
    CONSTRAINT "preboardings_status_check" CHECK ("status" IN ('invited', 'joined', 'cancelled'))
);
-- One open joiner record per person.
CREATE UNIQUE INDEX "preboardings_open_key" ON "preboardings" ("organization_id", "person_id") WHERE "status" = 'invited';
CREATE INDEX "preboardings_board_idx" ON "preboardings" ("organization_id", "status", "joining_on");
REVOKE DELETE, TRUNCATE ON TABLE "preboardings" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- journeys (M01 §3.5 / §7)
CREATE TABLE "journey_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "legal_entity_id" UUID,
    "location_id" UUID,
    "department_id" UUID,
    "starter_key" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journey_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journey_templates_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "journey_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journey_templates_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "journey_templates_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "journey_templates_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "journey_templates_kind_check" CHECK ("kind" IN ('onboarding', 'offboarding'))
);
REVOKE DELETE, TRUNCATE ON TABLE "journey_templates" FROM app_runtime;

CREATE TABLE "journey_template_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "owner_type" VARCHAR(10) NOT NULL,
    "owner_user_id" UUID,
    "owner_group_id" UUID,
    "kind" VARCHAR(16) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "due_offset_days" INTEGER NOT NULL,
    "depends_on" TEXT[] NOT NULL DEFAULT '{}',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "journey_template_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journey_template_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journey_template_tasks_template_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "journey_templates"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "journey_template_tasks_user_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "journey_template_tasks_key_key" UNIQUE ("template_id", "key"),
    CONSTRAINT "journey_template_tasks_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{0,39}$'),
    CONSTRAINT "journey_template_tasks_owner_check" CHECK ("owner_type" IN ('hr', 'it', 'admin', 'finance', 'payroll', 'manager', 'person', 'user', 'group')),
    CONSTRAINT "journey_template_tasks_kind_check" CHECK ("kind" IN ('tick', 'form', 'document', 'letter', 'desk_request')),
    CONSTRAINT "journey_template_tasks_offset_check" CHECK ("due_offset_days" BETWEEN -90 AND 180)
);
-- The template editor replaces a template's task list as a whole (same transaction as the version bump).
GRANT DELETE ON TABLE "journey_template_tasks" TO app_runtime;

CREATE TABLE "journeys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "person_id" UUID NOT NULL,
    "subject_type" VARCHAR(12) NOT NULL,
    "subject_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "anchor_on" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "owner_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journeys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journeys_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "journeys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journeys_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "journeys_template_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "journey_templates"("organization_id", "id"),
    CONSTRAINT "journeys_subject_key" UNIQUE ("organization_id", "subject_type", "subject_id", "kind"),
    CONSTRAINT "journeys_kind_check" CHECK ("kind" IN ('onboarding', 'offboarding')),
    CONSTRAINT "journeys_subject_check" CHECK ("subject_type" IN ('preboarding', 'exit_case', 'employment')),
    CONSTRAINT "journeys_status_check" CHECK ("status" IN ('active', 'done', 'cancelled')),
    CONSTRAINT "journeys_progress_check" CHECK ("progress" BETWEEN 0 AND 100)
);
CREATE INDEX "journeys_person_idx" ON "journeys" ("organization_id", "person_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "journeys" FROM app_runtime;

CREATE TABLE "journey_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "journey_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "owner_type" VARCHAR(10) NOT NULL,
    "assignee_user_id" UUID,
    "assignee_group_id" UUID,
    "due_offset_days" INTEGER NOT NULL,
    "due_on" DATE NOT NULL,
    "depends_on" TEXT[] NOT NULL DEFAULT '{}',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "link_type" VARCHAR(16),
    "link_id" UUID,
    "answers" JSONB,
    "completed_by" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "skip_reason" VARCHAR(300),
    "reminded_on" DATE,
    "escalated_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journey_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journey_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "journey_tasks_journey_fkey" FOREIGN KEY ("organization_id", "journey_id") REFERENCES "journeys"("organization_id", "id"),
    CONSTRAINT "journey_tasks_user_fkey" FOREIGN KEY ("organization_id", "assignee_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "journey_tasks_key_key" UNIQUE ("journey_id", "key"),
    CONSTRAINT "journey_tasks_status_check" CHECK ("status" IN ('waiting', 'open', 'done', 'skipped', 'cancelled')),
    CONSTRAINT "journey_tasks_kind_check" CHECK ("kind" IN ('tick', 'form', 'document', 'letter', 'desk_request')),
    CONSTRAINT "journey_tasks_skip_check" CHECK ("status" <> 'skipped' OR ("skip_reason" IS NOT NULL AND NOT "locked" AND NOT "required"))
);
CREATE INDEX "journey_tasks_assignee_idx" ON "journey_tasks" ("organization_id", "assignee_user_id", "status");
CREATE INDEX "journey_tasks_due_idx" ON "journey_tasks" ("organization_id", "status", "due_on");
CREATE INDEX "journey_tasks_link_idx" ON "journey_tasks" ("organization_id", "link_type", "link_id");
REVOKE DELETE, TRUNCATE ON TABLE "journey_tasks" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- system document types
-- P05 §4.2 / Q7: PAN, Aadhaar, bank proof, education and experience proofs need verification before payroll uses them.
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'pan_card', 'PAN card', 'confidential', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'aadhaar', 'Aadhaar (masked copy)', 'special', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'bank_proof', 'Bank proof (cancelled cheque or passbook)', 'confidential', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'photo', 'Photograph', 'personal', false, ARRAY['image/jpeg', 'image/png'], 2, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'education', 'Highest education certificate', 'personal', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 10, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'experience', 'Experience letter from the last employer', 'personal', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 10, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'relieving_prev', 'Relieving letter from the last employer', 'personal', false, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 10, false, '{}', ARRAY['person', 'hr']),
  (NULL, 'passport', 'Passport', 'confidential', false, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, true, '{60,30,7}', ARRAY['person', 'hr']);

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['files', 'documents', 'document_versions', 'preboardings', 'journey_templates', 'journey_template_tasks', 'journeys', 'journey_tasks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  -- P02 Q8: YukthiX support never reads people's documents or joiners' plans, even in an approved support session.
  FOREACH t IN ARRAY ARRAY['files', 'documents', 'document_versions', 'preboardings']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
-- System document types (organization_id NULL) are readable by every company and writable by none.
ALTER TABLE "document_types" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_types"
  USING ("organization_id" = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK ("organization_id" = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY system_types_read ON "document_types" FOR SELECT USING ("organization_id" IS NULL);

-- ---------------------------------------------------------------------------------------------- permission keys (§6)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'lifecycle.onboarding.view', 'See joiners, their onboarding checklists and progress for the people in scope'),
  (gen_random_uuid(), 'lifecycle.onboarding.manage', 'Add and import joiners, change their joining day, and run their onboarding checklists'),
  (gen_random_uuid(), 'lifecycle.journey.template.manage', 'Set up onboarding and offboarding checklist templates'),
  (gen_random_uuid(), 'document.view', 'See the documents of the people in scope (each document type still needs its data class)'),
  (gen_random_uuid(), 'document.manage', 'Ask people for documents, upload for them, and verify or reject documents in scope')
ON CONFLICT DO NOTHING;
-- P02 §4.2 System Admin: sets up checklists and adds joiners (like adding employees); documents only by data class.
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('lifecycle.onboarding.view', 'lifecycle.onboarding.manage', 'lifecycle.journey.template.manage', 'document.view')
ON CONFLICT DO NOTHING;
