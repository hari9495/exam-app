-- Payroll batch 5j (M03-BUILD-DESIGN §17.10, PAY-10.07): the parallel run. Before going live a month is paid by the old
-- payroll and worked out by YukthiX; the old payroll's register is uploaded and compared person by person. Someone other
-- than the uploader signs the comparison off, or waives it with a reason. Forced RLS, tenant isolation, no support
-- sessions and the pay guard, as every payroll table.

CREATE TABLE "parallel_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "reference" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "differences" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'compared',
    "reason" VARCHAR(300),
    "created_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parallel_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parallel_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "parallel_runs_run_fkey" FOREIGN KEY ("organization_id", "run_id") REFERENCES "payroll_runs"("organization_id", "id"),
    CONSTRAINT "parallel_runs_status_check" CHECK ("status" IN ('compared', 'signed_off', 'waived', 'superseded')),
    -- Signed off or waived by someone other than the uploader; a waiver, or signing off with differences, needs a reason.
    CONSTRAINT "parallel_runs_decided_check" CHECK (("status" IN ('signed_off', 'waived')) = ("decided_by" IS NOT NULL) AND ("decided_by" IS NULL OR "decided_by" <> "created_by")),
    CONSTRAINT "parallel_runs_reason_check" CHECK ("status" <> 'waived' OR "reason" IS NOT NULL)
);
CREATE INDEX "parallel_runs_entity_idx" ON "parallel_runs" ("organization_id", "legal_entity_id");
REVOKE DELETE, TRUNCATE ON TABLE "parallel_runs" FROM app_runtime;

ALTER TABLE "parallel_runs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "parallel_runs"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "parallel_runs" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "parallel_runs" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
