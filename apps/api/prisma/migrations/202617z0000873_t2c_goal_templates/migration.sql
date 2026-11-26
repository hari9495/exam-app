-- Batch T2-C item 71 (answer 2844): goal templates. HR keeps them in Settings › Performance, for everyone or for one
-- department and/or designation; anyone adding a goal can start from one that fits them (the goal form stays editable).
-- key_results: the key result names an OKR template suggests (the numbers are filled in on the goal).
CREATE TABLE "goal_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" VARCHAR(200) NOT NULL,
  "description" VARCHAR(1000),
  "kind" VARCHAR(4) NOT NULL,
  "key_results" TEXT[] NOT NULL DEFAULT '{}',
  "department_id" UUID,
  "designation_id" UUID,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goal_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "goal_templates_kind_check" CHECK ("kind" IN ('okr', 'kpi')),
  CONSTRAINT "goal_templates_krs_check" CHECK (cardinality("key_results") <= 10)
);
CREATE INDEX "goal_templates_org_idx" ON "goal_templates" ("organization_id");

GRANT DELETE ON TABLE "goal_templates" TO app_runtime;
ALTER TABLE "goal_templates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "goal_templates" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
