-- T2-G 2903 (answer 2745): a short HR-edited tag list per company (Settings › Structure › Tags, kept like the other
-- structure masters with org.settings.manage: shared or entity-only, archived when in use) and the tags on a person
-- (HR with employee.profile.edit; the person cannot). Rule-based groups take a "Tags" rule (any of the tags).

CREATE TABLE "person_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    "owner_legal_entity_id" UUID,
    "applies_to_entities" UUID[] NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_tags_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "person_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "person_tags_owner_fkey" FOREIGN KEY ("organization_id", "owner_legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "person_tags_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "person_tags_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "person_tags_applies_to_check" CHECK ("owner_legal_entity_id" IS NULL OR cardinality("applies_to_entities") = 0)
);
CREATE UNIQUE INDEX "person_tags_code_key" ON "person_tags"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "code");
CREATE UNIQUE INDEX "person_tags_name_key" ON "person_tags"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "name");

-- A tag on a person. A tag in use cannot be deleted (only archived), like the other masters.
CREATE TABLE "employee_tags" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_tags_pkey" PRIMARY KEY ("organization_id", "employee_id", "tag_id"),
    CONSTRAINT "employee_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_tags_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "employee_tags_tag_fkey" FOREIGN KEY ("organization_id", "tag_id") REFERENCES "person_tags"("organization_id", "id")
);
CREATE INDEX "employee_tags_tag_idx" ON "employee_tags"("organization_id", "tag_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['person_tags', 'employee_tags']
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
