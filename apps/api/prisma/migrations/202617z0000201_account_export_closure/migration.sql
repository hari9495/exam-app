-- Settings S-9, 8.5 Data export & closure (answer 1332). A System Admin downloads a whole-company export (security key,
-- audited, the link works account.export.link_hours, 24 by default) and asks YukthiX to close the account; closing is
-- done by YukthiX staff, and the data is kept account.closure.keep_days (30 by default) before deletion. Both periods
-- are platform settings.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "company_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "file_ref" VARCHAR(500) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "tables" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "company_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_exports_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE INDEX "company_exports_organization_id_created_at_idx" ON "company_exports" ("organization_id", "created_at");

CREATE TABLE "account_closure_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "keep_until" DATE,
    CONSTRAINT "account_closure_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_closure_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "account_closure_requests_status_check" CHECK ("status" IN ('requested', 'withdrawn', 'closed')),
    CONSTRAINT "account_closure_requests_closed_check" CHECK (("status" = 'closed') = ("keep_until" IS NOT NULL))
);
-- One open request per company.
CREATE UNIQUE INDEX "account_closure_requests_one_open" ON "account_closure_requests" ("organization_id") WHERE "status" = 'requested';

ALTER TABLE "company_exports" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company_exports"
  USING ("organization_id" = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK ("organization_id" = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- YukthiX support never reads a company's export, even in an approved support session.
CREATE POLICY support_session_excluded ON "company_exports" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
ALTER TABLE "account_closure_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "account_closure_requests"
  USING ("organization_id" = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK ("organization_id" = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- Only YukthiX staff (the console, outside any company) close a request.
CREATE POLICY closure_only_staff_close ON "account_closure_requests" AS RESTRICTIVE
  USING (true)
  WITH CHECK ("status" <> 'closed' OR (SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "company_exports", "account_closure_requests" FROM app_runtime;

INSERT INTO "platform_settings" ("key", "value", "label") VALUES
  ('account.export.link_hours', '24', 'Whole-company export: the download link works for (hours)'),
  ('account.closure.keep_days', '30', 'Closed company: data is kept for (days) before deletion')
ON CONFLICT ("key") DO NOTHING;
