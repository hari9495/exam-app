-- Recruitment batch AT3 (M10-BUILD-DESIGN §6, §16): what hiring costs, starting with job-board postings. Agency fees
-- (AT7) land in the same table. Money, so platform support sessions do not see it.
CREATE TABLE "recruiting_costs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "job_id" UUID,
    "job_board_id" UUID,
    "source" VARCHAR(120) NOT NULL,
    "cost_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period" DATE,
    "origin" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "note" VARCHAR(500),
    "entered_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recruiting_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recruiting_costs_job_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL,
    CONSTRAINT "recruiting_costs_board_fkey" FOREIGN KEY ("job_board_id") REFERENCES "job_boards"("id") ON DELETE SET NULL,
    CONSTRAINT "recruiting_costs_type_check" CHECK ("cost_type" IN ('posting', 'agency_fee', 'other')),
    CONSTRAINT "recruiting_costs_amount_check" CHECK ("amount" >= 0),
    CONSTRAINT "recruiting_costs_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "recruiting_costs_org_job_idx" ON "recruiting_costs" ("organization_id", "job_id");

ALTER TABLE "recruiting_costs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "recruiting_costs"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "recruiting_costs" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
