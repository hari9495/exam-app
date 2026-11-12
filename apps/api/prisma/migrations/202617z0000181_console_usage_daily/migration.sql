-- Console 1216 (approved 12 Nov 2026): the nightly product-analytics summary. One row per company, action family (the
-- part of an audit action before the first dot, the same families product analytics maps to features) and India day:
-- how many actions and when the last one was. Counts only, never the record, the metadata or a person. Filled by a
-- nightly job; Console › Product analytics reads it instead of scanning audit_logs across companies. Platform data:
-- only the platform (staff) context reads or writes it. No data is written here.
CREATE TABLE "product_usage_daily" (
    "day" DATE NOT NULL,
    "organization_id" UUID NOT NULL,
    "family" VARCHAR(40) NOT NULL,
    "actions" INTEGER NOT NULL,
    "last_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_usage_daily_pkey" PRIMARY KEY ("day", "organization_id", "family"),
    CONSTRAINT "product_usage_daily_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "product_usage_daily_actions_check" CHECK ("actions" > 0)
);
CREATE INDEX "product_usage_daily_org_idx" ON "product_usage_daily" ("organization_id");
ALTER TABLE "product_usage_daily" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "product_usage_daily" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
