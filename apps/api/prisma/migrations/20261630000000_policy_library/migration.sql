-- HLP-10 / HLP-11 (3 Nov 2026): company policies, their versions, who they apply to, and acknowledgements.
-- Rules: docs/yukthix/helpdesk-design-map.md section 4d. A published version never changes (trigger) and nothing here is
-- ever deleted by the app (no DELETE for app_runtime). Acknowledgements and reminders are append-only (no UPDATE either).
-- Maker-checker: a version that needs a second person can never be published by its writer (CHECK).

CREATE TABLE "policy_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "category" VARCHAR(60) NOT NULL,
    "method" VARCHAR(10) NOT NULL DEFAULT 'click',
    "owner_user_id" UUID,
    -- Who it applies to (empty = everyone): the existing org structure, matched on the assignment in force.
    "legal_entity_ids" UUID[] NOT NULL DEFAULT '{}',
    "location_ids" UUID[] NOT NULL DEFAULT '{}',
    "department_ids" UUID[] NOT NULL DEFAULT '{}',
    "grade_ids" UUID[] NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "policy_documents_method_check" CHECK ("method" IN ('click', 'otp')),
    CONSTRAINT "policy_documents_number_check" CHECK ("number" > 0)
);
CREATE UNIQUE INDEX "policy_documents_number_key" ON "policy_documents" ("organization_id", "number");
-- One policy per title (any case): a double click never makes two.
CREATE UNIQUE INDEX "policy_documents_title_key" ON "policy_documents" ("organization_id", lower("title"));

CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "body_html" TEXT NOT NULL DEFAULT '',
    "body_sha256" CHAR(64),
    "change_summary" VARCHAR(500),
    "file_ids" UUID[] NOT NULL DEFAULT '{}',
    "reack" BOOLEAN NOT NULL DEFAULT true,
    -- The company's second-person setting when it was sent; a version that needs one is never published by its writer.
    "needs_second_person" BOOLEAN NOT NULL DEFAULT true,
    "effective_on" DATE,
    "written_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "sent_back_note" VARCHAR(500),
    "published_by" UUID,
    "published_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "policy_versions_policy_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy_documents"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_versions_status_check" CHECK ("status" IN ('draft', 'waiting', 'sent_back', 'published')),
    CONSTRAINT "policy_versions_published_check" CHECK ("status" <> 'published' OR ("published_by" IS NOT NULL AND "published_at" IS NOT NULL AND "effective_on" IS NOT NULL AND "body_sha256" IS NOT NULL)),
    CONSTRAINT "policy_versions_four_eyes_check" CHECK (NOT "needs_second_person" OR "published_by" IS NULL OR "published_by" <> "written_by"),
    -- v1 always asks for acknowledgement; later versions say what changed.
    CONSTRAINT "policy_versions_first_check" CHECK ("number" > 1 OR "reack"),
    CONSTRAINT "policy_versions_summary_check" CHECK ("status" IN ('draft', 'sent_back') OR "number" = 1 OR length(btrim(coalesce("change_summary", ''))) >= 3)
);
CREATE UNIQUE INDEX "policy_versions_number_key" ON "policy_versions" ("policy_id", "number");
-- One open (not yet published) version per policy.
CREATE UNIQUE INDEX "policy_versions_open_key" ON "policy_versions" ("policy_id") WHERE "status" <> 'published';
CREATE INDEX "policy_versions_org_idx" ON "policy_versions" ("organization_id", "status");

CREATE OR REPLACE FUNCTION policy_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'a published policy version never changes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER policy_versions_guard BEFORE UPDATE ON "policy_versions" FOR EACH ROW EXECUTE FUNCTION policy_versions_guard();

CREATE TABLE "policy_acknowledgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "typed_name" VARCHAR(200),
    "body_sha256" CHAR(64) NOT NULL,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acknowledgements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_acknowledgements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "policy_acknowledgements_policy_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy_documents"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_acknowledgements_version_fkey" FOREIGN KEY ("version_id") REFERENCES "policy_versions"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_acknowledgements_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_acknowledgements_method_check" CHECK ("method" IN ('click', 'otp'))
);
CREATE UNIQUE INDEX "policy_acknowledgements_once_key" ON "policy_acknowledgements" ("version_id", "employee_id");
CREATE INDEX "policy_acknowledgements_policy_idx" ON "policy_acknowledgements" ("organization_id", "policy_id", "employee_id");

-- Reminders sent (by the daily job or by HR): one per person, version, kind and day, so a second run sends nothing.
CREATE TABLE "policy_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "sent_on" DATE NOT NULL,
    "by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "policy_reminders_version_fkey" FOREIGN KEY ("version_id") REFERENCES "policy_versions"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_reminders_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_reminders_kind_check" CHECK ("kind" IN ('employee', 'manager'))
);
CREATE UNIQUE INDEX "policy_reminders_day_key" ON "policy_reminders" ("version_id", "employee_id", "kind", "sent_on");

REVOKE DELETE, TRUNCATE ON TABLE "policy_documents", "policy_versions" FROM app_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "policy_acknowledgements", "policy_reminders" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['policy_documents', 'policy_versions', 'policy_acknowledgements', 'policy_reminders']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- New keys: policy.manage (write, audience, completion, reminders, evidence) and policy.publish (the second person).
-- The System Admin role and the HR Admin template get both; company HR Admin roles that still follow the template get
-- them too (additive only, audited like the start-up template sync). FORCE row-level security would otherwise skip
-- every company's rows here.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'policy.manage', 'Write company policies and their versions, choose who they apply to, see who acknowledged, send reminders and export the evidence'),
  (gen_random_uuid(), 'policy.publish', 'Publish or send back a policy version written by someone else')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('policy.manage', 'policy.publish')
ON CONFLICT DO NOTHING;

WITH following AS (
  SELECT p.id, p.organization_id, p.name,
         (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT DISTINCT k FROM jsonb_array_elements_text(p.permissions_json::jsonb || '["policy.manage", "policy.publish"]'::jsonb) AS k) s) AS keys
  FROM permission_profiles p
  WHERE p.template_key = 'hr_admin'
    AND p.template_set IS NOT NULL
    AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.permissions_json::jsonb) AS k)
      = (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.template_set::jsonb) AS k)
    AND NOT (p.permissions_json::jsonb ? 'policy.manage' AND p.permissions_json::jsonb ? 'policy.publish')
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id)
), changed AS (
  UPDATE permission_profiles p
  SET permissions_json = f.keys::text, template_set = f.keys::text, updated_at = now()
  FROM following f
  WHERE p.id = f.id
  RETURNING p.id, p.organization_id, p.name
)
INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT gen_random_uuid(), c.organization_id, 'access.role.template_synced', 'permission_profile', c.id::text,
       json_build_object('template', 'hr_admin', 'role', c.name, 'added', json_build_array('policy.manage', 'policy.publish'), 'notAddedConfidential', json_build_array(), 'by', 'migration 20261630000000')::text,
       now()
FROM changed c;
