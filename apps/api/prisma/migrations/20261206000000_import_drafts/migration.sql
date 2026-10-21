-- PPL-07 "Save and exit": an employee import kept to finish later. One per person; only that person reads it
-- (DESIGN-SYSTEM, Stepper: "progress kept per user"). The file's rows, the column matching and the fixes typed in are
-- one sealed value (they can hold PAN and contact details). Deleted after 30 days by the daily sweep.
CREATE TABLE "employee_import_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "step" VARCHAR(20) NOT NULL,
    "payload_enc" TEXT NOT NULL,
    "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "employee_import_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_import_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_import_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_import_drafts_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_import_drafts_step_check" CHECK ("step" IN ('upload', 'map', 'validate', 'review')),
    CONSTRAINT "employee_import_drafts_rows_check" CHECK ("row_count" BETWEEN 0 AND 500)
);
CREATE UNIQUE INDEX "employee_import_drafts_owner_key" ON "employee_import_drafts"("organization_id", "user_id");
CREATE INDEX "employee_import_drafts_expires_idx" ON "employee_import_drafts"("expires_at");

ALTER TABLE "employee_import_drafts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_import_drafts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "employee_import_drafts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
-- Only the person who saved it; the platform sweep (super admin) deletes expired ones.
CREATE POLICY owner_only ON "employee_import_drafts" AS RESTRICTIVE
  USING (user_id = (SELECT app_current_user_id()) OR (SELECT app_is_super_admin()))
  WITH CHECK (user_id = (SELECT app_current_user_id()) OR (SELECT app_is_super_admin()));
