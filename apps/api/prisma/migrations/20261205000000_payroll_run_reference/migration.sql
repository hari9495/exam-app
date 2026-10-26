-- PPL-22: a human reference for F&F runs ("FNF-2026-0041"), gap-free per company, year and kind. The counter row is
-- held by the transaction that makes the run (a rolled-back run gives its number back), as letters and pay documents do.
ALTER TABLE "payroll_runs" ADD COLUMN "reference" VARCHAR(20);
CREATE UNIQUE INDEX "payroll_runs_organization_id_reference_key" ON "payroll_runs" ("organization_id", "reference");

CREATE TABLE "payroll_run_counters" (
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_no" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_run_counters_pkey" PRIMARY KEY ("organization_id", "kind", "year"),
    CONSTRAINT "payroll_run_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
REVOKE DELETE, TRUNCATE ON TABLE "payroll_run_counters" FROM app_runtime;

-- Existing F&F runs numbered in the order they were made (IST year of creation); the counters continue from there.
ALTER TABLE "payroll_runs" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs" DISABLE ROW LEVEL SECURITY;
CREATE TEMP TABLE "fnf_run_numbers" ON COMMIT DROP AS
  SELECT "id", "organization_id", EXTRACT(YEAR FROM "created_at" AT TIME ZONE 'Asia/Kolkata')::smallint AS "year",
         ROW_NUMBER() OVER (PARTITION BY "organization_id", EXTRACT(YEAR FROM "created_at" AT TIME ZONE 'Asia/Kolkata') ORDER BY "created_at", "id")::int AS "n"
    FROM "payroll_runs" WHERE "offcycle_kind" = 'fnf';
UPDATE "payroll_runs" r SET "reference" = 'FNF-' || x."year" || '-' || lpad(x."n"::text, 4, '0') FROM "fnf_run_numbers" x WHERE r."id" = x."id";
INSERT INTO "payroll_run_counters" ("organization_id", "kind", "year", "last_no")
  SELECT "organization_id", 'fnf', "year", MAX("n") FROM "fnf_run_numbers" GROUP BY "organization_id", "year";
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "payroll_run_counters" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payroll_run_counters"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "payroll_run_counters" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
