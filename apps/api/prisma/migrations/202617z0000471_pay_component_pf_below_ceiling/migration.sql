-- Batch H part 2, B2 (compare-payroll.md; answer 2403): a component can be PF wage "only while the rest of the month's
-- PF wage is below the PF ceiling" (Zoho's "Yes, if PF wage is below 15,000"), against allowance-splitting findings.
ALTER TABLE "pay_components" ADD COLUMN "pf_below_ceiling" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_pf_below_ceiling_check" CHECK (NOT "pf_below_ceiling" OR "pf_wage");
