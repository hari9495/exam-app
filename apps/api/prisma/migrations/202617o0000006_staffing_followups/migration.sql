-- Staffing follow-ups (founder answers 482, 483, 489). 482: bench pay reaches payroll as loss-of-pay days through the
-- existing LOP input (lop_inputs.source 'bench'), sent once per bench spell per pay month (staffing_bench_pay). 483: the
-- nightly job ends a placement past its last day once and puts own payroll on the bench (audited). 489: an account
-- manager may override a vendor duplicate with a reason (audited); the person can then be forwarded. 484 needs no
-- schema: the statutory cost default comes from the company's PF / ESI registrations. Columns and a table; no data.
ALTER TABLE "lop_inputs" DROP CONSTRAINT "lop_inputs_source_check";
ALTER TABLE "lop_inputs" ADD CONSTRAINT "lop_inputs_source_check" CHECK ("source" IN ('manual', 'upload', 'bench'));

ALTER TABLE "agency_submissions"
  ADD COLUMN "duplicate_override_reason" VARCHAR(500),
  ADD COLUMN "duplicate_override_by" UUID,
  ADD COLUMN "duplicate_override_at" TIMESTAMPTZ(3);

CREATE TABLE "staffing_bench_pay" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "bench_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    -- The first day of the pay month.
    "month" DATE NOT NULL,
    "bench_days" INTEGER NOT NULL,
    "lop_days" NUMERIC(5,2) NOT NULL,
    "pay_pct" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_bench_pay_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_bench_pay_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_bench_pay_bench_id_fkey" FOREIGN KEY ("bench_id") REFERENCES "staffing_bench"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_bench_pay_month_check" CHECK (EXTRACT(DAY FROM "month") = 1 AND "bench_days" BETWEEN 1 AND 31 AND "lop_days" BETWEEN 0 AND 31)
);
CREATE UNIQUE INDEX "staffing_bench_pay_key" ON "staffing_bench_pay" ("bench_id", "month");
ALTER TABLE "staffing_bench_pay" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_bench_pay"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
