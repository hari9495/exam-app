-- PPL-42 Re-verification cycles (founder 20 Oct 2026): company rules for re-checking a document type every N months
-- (for some departments or designations, optionally when someone moves into them), dated and per legal entity; and
-- each fresh copy asked for, with its due date and reminder. The copy itself goes through the documents engine.
CREATE TABLE "reverification_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "type_key" VARCHAR(40) NOT NULL,
    "every_months" INTEGER NOT NULL,
    "department_ids" UUID[] NOT NULL DEFAULT '{}',
    "designation_ids" UUID[] NOT NULL DEFAULT '{}',
    "on_role_change" BOOLEAN NOT NULL DEFAULT false,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reverification_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reverification_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reverification_rules_every_check" CHECK ("every_months" BETWEEN 1 AND 120),
    CONSTRAINT "reverification_rules_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
CREATE INDEX "reverification_rules_org_idx" ON "reverification_rules"("organization_id");

CREATE TABLE "reverification_asks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "last_verified" DATE,
    "asked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asked_by" UUID,
    "reminded_on" DATE,
    CONSTRAINT "reverification_asks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reverification_asks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "reverification_asks_rule_fkey" FOREIGN KEY ("rule_id") REFERENCES "reverification_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reverification_asks_once_key" ON "reverification_asks"("organization_id", "rule_id", "employee_id", "due_on");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reverification_rules', 'reverification_asks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
