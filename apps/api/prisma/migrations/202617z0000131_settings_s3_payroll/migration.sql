-- Settings S-3 (founder answers 1323 to 1325, 12 Nov 2026): the Payroll & Statutory pages.
--
-- 1325: a change to a payroll setting (Settings 4.3 Payroll policies, 4.4 Payslip layout, 4.5 Tax) waits for a second
-- person with HR's settings key, while the company setting payroll.settings.second_person is on (the default). The person
-- who asked never approves it (checked in the service and here). One request waits per setting and scope at a time.
CREATE TABLE "setting_change_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "previous" JSONB,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "note" VARCHAR(500),
    CONSTRAINT "setting_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "setting_change_requests_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "setting_change_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    CONSTRAINT "setting_change_requests_decided_check" CHECK (("status" = 'pending') = ("decided_by" IS NULL)),
    CONSTRAINT "setting_change_requests_four_eyes" CHECK ("status" <> 'approved' OR "decided_by" <> "requested_by")
);
CREATE INDEX "setting_change_requests_org_status_idx" ON "setting_change_requests"("organization_id", "status");
CREATE UNIQUE INDEX "setting_change_requests_one_pending" ON "setting_change_requests"("organization_id", "key", "scope_type", "scope_id") WHERE "status" = 'pending';

ALTER TABLE "setting_change_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "setting_change_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "setting_change_requests" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

-- 1324: the payroll limits join the country's rule set as a new version (a published version never changes). The
-- earlier limits are carried over unchanged.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify", "published_at") VALUES
  ('IN.SETTINGS.LIMITS', 'IN', '2026-v2', '2026-11-12',
   '{"limits":{"roster.max_daily_hours":{"max":9,"act":"Factories Act, 1948 s.54"},"roster.max_weekly_hours":{"max":48,"act":"Factories Act, 1948 s.51"},"roster.max_spread_over_hours":{"max":10.5,"act":"Factories Act, 1948 s.56"},"roster.min_weekly_offs":{"min":1,"act":"Factories Act, 1948 s.52"},"payroll.standard_daily_hours":{"max":9,"act":"Factories Act, 1948 s.54"},"payroll.document_retention_years":{"min":8,"act":"Companies Act, 2013 s.128(5)"}}}',
   'Factories Act, 1948 s.51, s.52, s.54, s.56 (OSH Code 2020 s.25-26 as state rules); Companies Act, 2013 s.128(5) (books of account kept 8 years, pay records with them). Shops and Establishments Acts differ by state. Verify before go-live.',
   true, now());
