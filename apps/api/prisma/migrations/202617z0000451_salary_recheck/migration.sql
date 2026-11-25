-- Batch B item 1 (pay B12 / admin B4, answers 2360-2363): confirm it's you again before salary pages.
-- On by default; ask again after 5, 10 or 15 minutes (15 is the platform's step-up window, so never longer).
ALTER TABLE "tenant_security_policies"
  ADD COLUMN "salary_recheck" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "salary_recheck_minutes" INTEGER NOT NULL DEFAULT 15,
  ADD CONSTRAINT "tenant_security_policies_salary_recheck_minutes_check" CHECK ("salary_recheck_minutes" IN (5, 10, 15));
