-- Batch T2-C item 70 (answer 2843): 1:1 agenda templates. HR keeps company templates (Settings › Performance; owner_user_id
-- NULL) and a manager may save their own (owner_user_id = that user). Picking one adds its lines to a 1:1's agenda, which
-- stays editable. 1 to 20 lines of up to 500 characters each (checked by the API).
CREATE TABLE "one_on_one_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "owner_user_id" UUID,
  "name" VARCHAR(80) NOT NULL,
  "items" TEXT[] NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "one_on_one_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "one_on_one_templates_items_check" CHECK (cardinality("items") BETWEEN 1 AND 20)
);
CREATE UNIQUE INDEX "one_on_one_templates_name_key" ON "one_on_one_templates" ("organization_id", COALESCE("owner_user_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name"));

GRANT DELETE ON TABLE "one_on_one_templates" TO app_runtime;
ALTER TABLE "one_on_one_templates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "one_on_one_templates" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
