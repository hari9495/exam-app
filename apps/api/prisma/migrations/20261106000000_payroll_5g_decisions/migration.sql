-- Founder decisions 5g-D1 … 5g-D7 (12 Oct 2026, M03 §19.9).

-- 5g-D6: arrears worksheets carry the statutory shares too (employee deductions and employer contributions); the employer
-- share is the company's cost.
ALTER TABLE "arrears_worksheet_lines" ADD COLUMN "kind" VARCHAR(10) NOT NULL DEFAULT 'earning';
ALTER TABLE "arrears_worksheet_lines" ADD CONSTRAINT "arrears_worksheet_lines_kind_check" CHECK ("kind" IN ('earning', 'deduction', 'employer'));
ALTER TABLE "arrears_worksheets" ADD COLUMN "employer_cost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- 5g-D5: an unserved notice is recovered unless the company's policy waives it, or HR waives it for this person.
ALTER TABLE "fnf_settlements" ADD COLUMN "notice_waived_by" UUID;
ALTER TABLE "fnf_settlements" ADD COLUMN "notice_waive_reason" VARCHAR(300);
ALTER TABLE "fnf_settlements" ADD CONSTRAINT "fnf_settlements_waiver_check" CHECK (("notice_waived_by" IS NULL) = ("notice_waive_reason" IS NULL));
