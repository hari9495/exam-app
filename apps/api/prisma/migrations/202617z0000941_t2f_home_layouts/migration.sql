-- Batch T2-F item 79 (answer 2884): a person's own Home layout (Edit home), kept in YukthiX so it follows them to any
-- device. No row = the company layout for their role. Pinned widgets are never stored as hidden (the API refuses).
CREATE TABLE "home_layouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "widget_order" VARCHAR(40)[] NOT NULL,
    "hidden" VARCHAR(40)[] NOT NULL,
    "sizes" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "home_layouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "home_layouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "home_layouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "home_layouts_widgets_check" CHECK (cardinality("widget_order") <= 40 AND cardinality("hidden") <= 40)
);
CREATE UNIQUE INDEX "home_layouts_org_user_key" ON "home_layouts"("organization_id", "user_id");

ALTER TABLE "home_layouts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "home_layouts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "home_layouts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
