-- Batch T2-G item 45 (answer 2744): the company's scheduled data export goes to its own storage (Amazon S3, Azure
-- Blob or Google Drive), connected by a System Admin. One destination per company. The connection secret and the zip
-- password are stored encrypted by the API (AES-256-GCM, ORG_SECRETS_ENCRYPTION_KEY), never in plain text.
CREATE TABLE "company_export_destinations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "target" JSONB NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "zip_password_encrypted" TEXT NOT NULL,
    "set_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(300),
    CONSTRAINT "company_export_destinations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_export_destinations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_export_destinations_kind_check" CHECK ("kind" IN ('s3', 'azure_blob', 'google_drive'))
);
CREATE UNIQUE INDEX "company_export_destinations_org_key" ON "company_export_destinations"("organization_id");

ALTER TABLE "company_export_destinations" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company_export_destinations"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "company_export_destinations" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
