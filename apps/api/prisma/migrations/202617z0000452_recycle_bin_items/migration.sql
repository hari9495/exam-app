-- Batch B item 3 (admin B2, answers 2367-2369): one recycle bin across YukthiX. A delete in a covered area keeps the
-- row as it was (data) so HR can restore it with the same id; the nightly job removes items older than the company's
-- "Keep deleted items for" setting (recycle_bin.keep_days, default 180). Hiring keeps its own soft-delete columns.
CREATE TABLE "recycle_bin_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL,
    "deleted_by" UUID,
    "deleted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "recycle_bin_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recycle_bin_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "recycle_bin_items_org_deleted_idx" ON "recycle_bin_items" ("organization_id", "deleted_at" DESC);
ALTER TABLE "recycle_bin_items" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recycle_bin_items"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
