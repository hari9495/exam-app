-- G4 (items 14 and 21): personal favourites in the report library (ANL-06), and company documents in folders with
-- expiry (answers 2695-2697 as suggested; changeable).

-- A report the person marked as a favourite (the catalogue lives in code; report_id is its id there).
CREATE TABLE "report_favourites" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" VARCHAR(60) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_favourites_pkey" PRIMARY KEY ("user_id", "report_id"),
    CONSTRAINT "report_favourites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "report_favourites_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "report_favourites_org_idx" ON "report_favourites"("organization_id");

-- A folder of company documents: everyone in the company, or the document managers only.
CREATE TABLE "company_doc_folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "audience" VARCHAR(10) NOT NULL DEFAULT 'everyone',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    CONSTRAINT "company_doc_folders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_doc_folders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_doc_folders_audience_check" CHECK ("audience" IN ('everyone', 'managers'))
);
CREATE UNIQUE INDEX "company_doc_folders_name_key" ON "company_doc_folders"("organization_id", lower("name")) WHERE "removed_at" IS NULL;

-- A document: its file (stored and virus-checked like every upload), an optional expiry, and who changed it last.
CREATE TABLE "company_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "folder_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "file_id" UUID NOT NULL,
    "expires_on" DATE,
    "reminded_at" TIMESTAMPTZ(3),
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,
    CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_documents_folder_fkey" FOREIGN KEY ("folder_id") REFERENCES "company_doc_folders"("id") ON DELETE CASCADE,
    CONSTRAINT "company_documents_file_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id")
);
CREATE INDEX "company_documents_folder_idx" ON "company_documents"("organization_id", "folder_id");
CREATE INDEX "company_documents_expiry_idx" ON "company_documents"("expires_on") WHERE "removed_at" IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['report_favourites', 'company_doc_folders', 'company_documents']
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
  (gen_random_uuid(), 'company.documents.manage', 'Create folders of company documents, upload, replace and remove documents, and see folders for document managers')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'company.documents.manage'
ON CONFLICT DO NOTHING;
