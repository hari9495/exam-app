-- PPL-04 "Save draft": a half-filled change kept for the person who started it. Only that person reads or edits it
-- (the service filters by created_by); sending it goes through the normal change path and its checks, then removes it.
CREATE TABLE "employee_change_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "change_type" VARCHAR(32),
    "form" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_change_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_change_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_change_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_change_drafts_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "employee_change_drafts_form_check" CHECK (jsonb_typeof("form") = 'object' AND octet_length("form"::text) <= 40000)
);
CREATE INDEX "employee_change_drafts_owner_idx" ON "employee_change_drafts"("organization_id", "created_by", "updated_at" DESC);

-- Drafts may hold proposed pay, so YukthiX support never reads them.
ALTER TABLE "employee_change_drafts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "employee_change_drafts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "employee_change_drafts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
