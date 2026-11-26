-- IT assets part 1 (founder answers 2711, 2712; 26 Nov 2026): the company's asset category list (Settings 2.8) and the
-- money key. A category has a name, what it is tracked by, a default recovery amount, a useful life in years and may be
-- retired (never deleted). Every company starts from the drawn starter list; the free-text categories its assets
-- already have become list entries too, and each asset is linked to its entry (the text stays for history).
-- asset.finance.view: money on assets (cost, later net book value and contract value) for Finance; asset.manage
-- holders of an asset's place see it too.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'asset.finance.view', 'See money on company assets: cost, net book value and contract value')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'asset.finance.view'
ON CONFLICT DO NOTHING;

CREATE TABLE "asset_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" VARCHAR(40) NOT NULL,
  "tracked_by" VARCHAR(40),
  "default_recovery" DECIMAL(14,2),
  "useful_life_years" SMALLINT,
  "retired_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "asset_categories_org_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "asset_categories_recovery_check" CHECK ("default_recovery" IS NULL OR "default_recovery" >= 0),
  CONSTRAINT "asset_categories_life_check" CHECK ("useful_life_years" IS NULL OR "useful_life_years" BETWEEN 1 AND 50)
);
-- One active category per name (a retired name may be used again).
CREATE UNIQUE INDEX "asset_categories_name_key" ON "asset_categories" ("organization_id", lower("name")) WHERE "retired_at" IS NULL;

REVOKE DELETE, TRUNCATE ON TABLE "asset_categories" FROM app_runtime;
ALTER TABLE "asset_categories" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asset_categories" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "asset_categories" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);

ALTER TABLE "assets" ADD COLUMN "category_id" UUID;
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "asset_categories"("organization_id", "id");
CREATE INDEX "assets_category_idx" ON "assets" ("organization_id", "category_id");

-- The drawn starter list for every company (the API adds it for a company created later).
INSERT INTO "asset_categories" ("organization_id", "name", "tracked_by", "default_recovery", "useful_life_years")
SELECT o."id", s.name, s.tracked_by, s.recovery, s.life
FROM "organizations" o
CROSS JOIN (VALUES
  ('Laptop', 'Serial number', 45000.00, 3),
  ('Phone', 'IMEI', 15000.00, 3),
  ('SIM', 'Number', 500.00, NULL),
  ('ID / access card', 'Card number', 300.00, NULL),
  ('Safety shoes and PPE kit', 'Tag', 2500.00, NULL),
  ('Tools', 'Tag', NULL, NULL)
) AS s(name, tracked_by, recovery, life);

-- Free-text categories already in use become entries (one per distinct name, ignoring case), then assets point to them.
INSERT INTO "asset_categories" ("organization_id", "name")
SELECT DISTINCT ON (a."organization_id", lower(btrim(a."category"))) a."organization_id", btrim(a."category")
FROM "assets" a
WHERE btrim(a."category") <> ''
  AND NOT EXISTS (SELECT 1 FROM "asset_categories" c WHERE c."organization_id" = a."organization_id" AND lower(c."name") = lower(btrim(a."category")))
ORDER BY a."organization_id", lower(btrim(a."category")), a."created_at";

UPDATE "assets" a SET "category_id" = c."id"
FROM "asset_categories" c
WHERE c."organization_id" = a."organization_id" AND lower(c."name") = lower(btrim(a."category")) AND c."retired_at" IS NULL;
