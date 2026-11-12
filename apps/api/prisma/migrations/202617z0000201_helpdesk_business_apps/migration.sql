-- Helpdesk plan item 3: the company's business applications, each with an owner. Access to an application is asked for
-- through the service catalogue (a form question that picks an application) and approved by that application's owner
-- (approver kind app_owner) or the desk's admins. A retired application can no longer be asked for.
CREATE TABLE "sd_business_apps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(500),
  "owner_user_id" UUID NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_business_apps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_business_apps_status_check" CHECK ("status" IN ('active', 'retired')),
  CONSTRAINT "sd_business_apps_name_check" CHECK (length(btrim("name")) >= 2)
);
CREATE UNIQUE INDEX "sd_business_apps_name_key" ON "sd_business_apps"("organization_id", lower("name"));
CREATE INDEX "sd_business_apps_owner_idx" ON "sd_business_apps"("organization_id", "owner_user_id");

ALTER TABLE "sd_business_apps" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sd_business_apps"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
