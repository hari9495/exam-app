-- IT assets part 3 (founder answer 2716, 26 Nov 2026): the IT and Admin supplier list, separate from hiring's staffing
-- vendors and from contract-labour contractors. A supplier has a name, up to five contacts (name, email, phone), an
-- optional GSTIN and notes; it is retired, never deleted. An asset may name its supplier.
CREATE TABLE "it_suppliers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" VARCHAR(150) NOT NULL,
  "gstin" VARCHAR(15),
  "contacts" JSONB NOT NULL DEFAULT '[]',
  "notes" VARCHAR(500),
  "retired_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "it_suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "it_suppliers_org_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "it_suppliers_gstin_check" CHECK ("gstin" IS NULL OR "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  CONSTRAINT "it_suppliers_contacts_check" CHECK (jsonb_typeof("contacts") = 'array' AND jsonb_array_length("contacts") <= 5)
);
-- One active supplier per name (a retired name may be used again).
CREATE UNIQUE INDEX "it_suppliers_name_key" ON "it_suppliers" ("organization_id", lower("name")) WHERE "retired_at" IS NULL;

REVOKE DELETE, TRUNCATE ON TABLE "it_suppliers" FROM app_runtime;
ALTER TABLE "it_suppliers" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "it_suppliers" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "it_suppliers" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);

ALTER TABLE "assets" ADD COLUMN "supplier_id" UUID;
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "it_suppliers"("organization_id", "id");
CREATE INDEX "assets_supplier_idx" ON "assets" ("organization_id", "supplier_id");
