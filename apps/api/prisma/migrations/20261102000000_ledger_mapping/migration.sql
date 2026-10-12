-- Founder decision GP-PAY-1 (10 Oct 2026, global gap pass §7.1; M03 §19.7): pay lines map to ledger accounts in two levels,
-- a company default and an override per legal entity or cost centre (the most specific wins). The journal is worked out
-- from the approved payslips and this mapping; anything without an account sits in "Unmapped", which blocks export and
-- posting. Configuration, not pay: tenant isolation and the support exclusion, no pay guard.
CREATE TABLE "ledger_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "scope_type" VARCHAR(12) NOT NULL,
    "scope_id" UUID,
    "component_code" VARCHAR(30) NOT NULL,
    "side" VARCHAR(8) NOT NULL,
    "account_code" VARCHAR(40) NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ledger_mappings_scope_check" CHECK (("scope_type" = 'company') = ("scope_id" IS NULL) AND "scope_type" IN ('company', 'legal_entity', 'cost_centre')),
    CONSTRAINT "ledger_mappings_side_check" CHECK ("side" IN ('expense', 'payable')),
    CONSTRAINT "ledger_mappings_account_check" CHECK ("account_code" ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,39}$')
);
CREATE UNIQUE INDEX "ledger_mappings_key" ON "ledger_mappings" ("organization_id", "scope_type", COALESCE("scope_id", '00000000-0000-0000-0000-000000000000'::uuid), "component_code", "side");
REVOKE TRUNCATE ON TABLE "ledger_mappings" FROM app_runtime;

ALTER TABLE "ledger_mappings" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ledger_mappings"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "ledger_mappings" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.ledger.manage', 'Map pay lines to ledger accounts (company default, or per legal entity or cost centre)')
ON CONFLICT DO NOTHING;
