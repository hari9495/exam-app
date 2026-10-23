-- People › Restructure (PPL-09) and the inter-entity continuity checklist (PPL-10): a bulk move of people inside a
-- legal entity or from one legal entity to another, sent once and approved once by someone else. Every move runs
-- through the job-change engine (history, audit, RLS); a person who cannot move is reported with the reason.

CREATE TABLE "restructures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "from_entity_id" UUID NOT NULL,
    "into_entity_id" UUID,
    "effective_on" DATE NOT NULL,
    "plan" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "override_reason" VARCHAR(500),
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "ran_at" TIMESTAMPTZ(3),
    "moved" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "restructures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "restructures_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "restructures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "restructures_from_fkey" FOREIGN KEY ("from_entity_id") REFERENCES "legal_entities"("id"),
    CONSTRAINT "restructures_into_fkey" FOREIGN KEY ("into_entity_id") REFERENCES "legal_entities"("id"),
    CONSTRAINT "restructures_kind_check" CHECK ("kind" IN ('merge', 'close', 'demerge', 'within')),
    CONSTRAINT "restructures_into_check" CHECK (("kind" = 'within') = ("into_entity_id" IS NULL) AND ("into_entity_id" IS NULL OR "into_entity_id" <> "from_entity_id")),
    CONSTRAINT "restructures_status_check" CHECK ("status" IN ('pending', 'scheduled', 'done', 'rejected', 'cancelled'))
);
CREATE INDEX "restructures_org_status_idx" ON "restructures"("organization_id", "status");

-- Who moves (fixed when sent), with their own options, and what happened to each.
CREATE TABLE "restructure_people" (
    "organization_id" UUID NOT NULL,
    "restructure_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "fail_reason" VARCHAR(500),
    "new_employment_id" UUID,
    "change_id" UUID,
    "result" JSONB,
    CONSTRAINT "restructure_people_pkey" PRIMARY KEY ("restructure_id", "employee_id"),
    CONSTRAINT "restructure_people_restructure_fkey" FOREIGN KEY ("organization_id", "restructure_id") REFERENCES "restructures"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "restructure_people_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "restructure_people_status_check" CHECK ("status" IN ('pending', 'moved', 'failed', 'left_out'))
);
CREATE INDEX "restructure_people_org_idx" ON "restructure_people"("organization_id");

-- PPL-10: what still has to happen for one person after a move between legal entities (shown in payroll checks).
CREATE TABLE "continuity_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "restructure_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "owner" VARCHAR(20) NOT NULL,
    "due_on" DATE,
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    "note" VARCHAR(300),
    "done_by" UUID,
    "done_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "continuity_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "continuity_items_restructure_fkey" FOREIGN KEY ("organization_id", "restructure_id") REFERENCES "restructures"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "continuity_items_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id"),
    CONSTRAINT "continuity_items_status_check" CHECK ("status" IN ('open', 'done')),
    CONSTRAINT "continuity_items_owner_check" CHECK ("owner" IN ('HR', 'Payroll', 'Finance'))
);
CREATE UNIQUE INDEX "continuity_items_key" ON "continuity_items"("restructure_id", "employee_id", "key");
CREATE INDEX "continuity_items_open_idx" ON "continuity_items"("organization_id", "legal_entity_id", "status");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['restructures', 'restructure_people', 'continuity_items']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
