-- Batch H part 2, E1 (compare-payroll.md; answer 2408): HR opens or locks the declaration or proof window of a legal
-- entity before its dates, or goes back to the dates. Append-only history (the latest action per window wins), with
-- who, when and why; the API also audits it. Lock stops new declarations and proofs; proofs already sent are decided.
CREATE TABLE "tax_window_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "tax_year" CHAR(7) NOT NULL,
    "window" VARCHAR(12) NOT NULL,
    "action" VARCHAR(5) NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tax_window_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_window_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_window_actions_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "tax_window_actions_year_check" CHECK ("tax_year" ~ '^\d{4}-\d{2}$'),
    CONSTRAINT "tax_window_actions_window_check" CHECK ("window" IN ('declarations', 'proofs')),
    CONSTRAINT "tax_window_actions_action_check" CHECK ("action" IN ('open', 'lock', 'dates')),
    CONSTRAINT "tax_window_actions_reason_check" CHECK (length(btrim("reason")) >= 5)
);
CREATE INDEX "tax_window_actions_lookup_idx" ON "tax_window_actions" ("organization_id", "legal_entity_id", "tax_year", "window", "created_at" DESC);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "tax_window_actions" FROM app_runtime;

-- Employees read their entity's windows (no pay data in it), so no pay guard; tenant isolation and no support sessions.
ALTER TABLE "tax_window_actions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_window_actions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "tax_window_actions" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
