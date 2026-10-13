-- Payroll batch 5i, PAY-9.01 (M03 YX-PAY-58, V5): weekly and fortnightly pay groups. A group's periods run from its anchor
-- date and are cut at month ends; each period has its own regular run and payslip (sub-period 1, 2 …) inside the month,
-- so the month's returns add them up. Monthly groups keep sub-period 0.

ALTER TABLE "pay_groups" DROP CONSTRAINT "pay_groups_frequency_check";
ALTER TABLE "pay_groups" ADD COLUMN "anchor_date" DATE;
ALTER TABLE "pay_groups" ADD CONSTRAINT "pay_groups_frequency_check" CHECK ("frequency" IN ('monthly', 'weekly', 'fortnightly') AND ("frequency" = 'monthly' OR "anchor_date" IS NOT NULL));

ALTER TABLE "payroll_runs" ADD COLUMN "sub_period" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "payroll_runs" ADD COLUMN "range_start" DATE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_sub_period_check" CHECK ("sub_period" BETWEEN 0 AND 6 AND ("sub_period" = 0) = ("range_start" IS NULL));
DROP INDEX "payroll_runs_one_regular";
CREATE UNIQUE INDEX "payroll_runs_one_regular" ON "payroll_runs" ("organization_id", "pay_group_id", "period_start", "sub_period") WHERE "run_type" = 'regular' AND "status" <> 'void';

ALTER TABLE "payslips" ADD COLUMN "sub_period" SMALLINT NOT NULL DEFAULT 0;
DROP INDEX "payslips_one_regular";
CREATE UNIQUE INDEX "payslips_one_regular" ON "payslips" ("organization_id", "employment_id", "period_start", "sub_period") WHERE "run_type" = 'regular' AND "status" = 'approved';
