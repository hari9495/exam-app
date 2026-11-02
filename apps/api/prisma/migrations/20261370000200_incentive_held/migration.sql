-- PAY-33 (2 Nov 2026): part of an incentive result can be held until the customer pays (entered by payroll with the
-- result, with the reason). Sending the month to payroll pays the rest; payroll releases the held part later as its
-- own posting, approved like any other. The statement shows the quarter, the tier reached and the held part.
ALTER TABLE "incentive_results"
  ADD COLUMN "held_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "held_reason" VARCHAR(200),
  ADD COLUMN "released_posting_id" UUID,
  ADD CONSTRAINT "incentive_results_held_check" CHECK ("held_amount" >= 0 AND "held_amount" <= "amount" AND ("held_amount" = 0 OR "held_reason" IS NOT NULL)),
  ADD CONSTRAINT "incentive_results_release_check" CHECK ("released_posting_id" IS NULL OR "held_amount" > 0);
