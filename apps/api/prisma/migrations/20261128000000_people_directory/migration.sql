-- People › Directory on the designed screen (PPL-01, design audit step 2): saved views and monthly workforce counts.

-- A person's saved directory views; a shared one is seen by everyone in the company who can open the page.
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "page" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "saved_views_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "saved_views_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "saved_views_page_check" CHECK ("page" IN ('people.directory')),
    CONSTRAINT "saved_views_name_check" CHECK (length(btrim("name")) > 0)
);
CREATE INDEX "saved_views_org_page_idx" ON "saved_views"("organization_id", "page");

-- Head counts at the end of each month (the last run in the month wins), for "vs last month" on the directory cards.
-- legal_entity_id NULL is the whole company. persons counts employees and consultants once each; employee_persons only
-- employees (what someone without the consultant keys sees).
CREATE TABLE "workforce_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "month" DATE NOT NULL,
    "employees" INTEGER NOT NULL,
    "consultants" INTEGER NOT NULL,
    "persons" INTEGER NOT NULL,
    "employee_persons" INTEGER NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workforce_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workforce_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workforce_snapshots_month_check" CHECK (extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "workforce_snapshots_scope_month_key" ON "workforce_snapshots"("organization_id", COALESCE("legal_entity_id", '00000000-0000-0000-0000-000000000000'::uuid), "month");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['saved_views', 'workforce_snapshots']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
