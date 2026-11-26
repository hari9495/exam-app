-- Enterprise E3 (answers 2651, 2652, 2786, 2787): back-dated pay drafts itself.
--   Per pay component, "recalculate when": a salary change, a joining date (LOP is not a trigger, 2786). Defaults from the
--   component's flags: regular monthly earnings (prorated) and the statutory lines follow; one-off earnings and other
--   deductions do not.
--   arrears_runs: one row per trigger job (a salary change, a joining date, a statutory proposal's preview or drafting),
--   unique on what fired it, so a retry never drafts twice; it keeps the impact (people, total, largest change).
--   Statutory proposals keep the total and the largest change of their preview (2787).
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "pay_components" ADD COLUMN "arrears_on_salary_change" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pay_components" ADD COLUMN "arrears_on_joining" BOOLEAN NOT NULL DEFAULT true;
UPDATE "pay_components" SET "arrears_on_salary_change" = false, "arrears_on_joining" = false
WHERE "statutory" IS NULL AND NOT ("kind" = 'earning' AND "prorated");

ALTER TABLE "statutory_arrears_proposals" ADD COLUMN "impact_status" VARCHAR(10);
ALTER TABLE "statutory_arrears_proposals" ADD COLUMN "impact_people" INTEGER;
ALTER TABLE "statutory_arrears_proposals" ADD COLUMN "impact_total" DECIMAL(14,2);
ALTER TABLE "statutory_arrears_proposals" ADD COLUMN "impact_largest" DECIMAL(14,2);

CREATE TABLE "arrears_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" UUID NOT NULL,
  "kind" VARCHAR(10) NOT NULL,
  "ref" UUID NOT NULL,
  "mode" VARCHAR(10) NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'queued',
  "people" INTEGER NOT NULL DEFAULT 0,
  "drafted" INTEGER NOT NULL DEFAULT 0,
  "skipped" JSONB NOT NULL DEFAULT '[]',
  "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "largest" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "largest_employee_id" UUID,
  "created_by" UUID NOT NULL,
  "error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(3),
  CONSTRAINT "arrears_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "arrears_runs_kind_check" CHECK ("kind" IN ('change', 'join', 'rule')),
  CONSTRAINT "arrears_runs_mode_check" CHECK ("mode" IN ('preview', 'draft')),
  CONSTRAINT "arrears_runs_status_check" CHECK ("status" IN ('queued', 'running', 'done', 'failed'))
);
CREATE UNIQUE INDEX "arrears_runs_org_kind_ref_mode_key" ON "arrears_runs" ("organization_id", "kind", "ref", "mode");

ALTER TABLE "arrears_runs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "arrears_runs" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "arrears_runs" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "arrears_runs" AS RESTRICTIVE USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[])) WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
