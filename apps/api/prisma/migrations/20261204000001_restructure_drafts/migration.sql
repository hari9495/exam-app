-- People › Restructure (PPL-09) "Save and exit": a half-planned restructure kept for the person who planned it. Only
-- its creator sees or changes it (the API checks the creator; RLS keeps it inside the company). The payload is never
-- trusted: sending checks the whole plan again.

CREATE TABLE "restructure_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restructure_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "restructure_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "restructure_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "restructure_drafts_owner_idx" ON "restructure_drafts"("organization_id", "created_by", "updated_at");

ALTER TABLE "restructure_drafts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "restructure_drafts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "restructure_drafts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
