-- PAY-32 Draft (pay gaps, 2 Nov 2026): an incentive plan has effective dates, a payout frequency, a metric source and
-- who is on it (a department and / or a location; none = everyone in the entity), and is saved as a draft before it
-- is published. A published plan is changed by a new version (a draft that replaces it from a later date; publishing
-- it ends the earlier one the day before). Existing plans stay published, monthly, entered by hand, for everyone.
-- Forward-only; RLS on incentive_plans is unchanged (same rows, new columns).
ALTER TABLE "incentive_plans"
  ADD COLUMN "effective_from" DATE,
  ADD COLUMN "effective_to" DATE,
  ADD COLUMN "payout_frequency" VARCHAR(10) NOT NULL DEFAULT 'monthly',
  ADD COLUMN "metric_source" VARCHAR(10) NOT NULL DEFAULT 'manual',
  ADD COLUMN "department_id" UUID,
  ADD COLUMN "location_id" UUID,
  ADD COLUMN "plan_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "previous_id" UUID;
ALTER TABLE "incentive_plans" DROP CONSTRAINT "incentive_plans_check";
ALTER TABLE "incentive_plans" ADD CONSTRAINT "incentive_plans_check" CHECK ("kind" IN ('production', 'attendance', 'sales') AND "target_amount" > 0 AND ("cap_percent" IS NULL OR "cap_percent" > 0) AND "clawback_days" >= 0 AND "status" IN ('draft', 'active', 'inactive'));
ALTER TABLE "incentive_plans" ADD CONSTRAINT "incentive_plans_terms_check" CHECK (
  "payout_frequency" IN ('monthly', 'quarterly') AND "metric_source" IN ('manual', 'import', 'api', 'projects')
  AND ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" > "effective_from") AND "plan_version" >= 1);
ALTER TABLE "incentive_plans" ADD CONSTRAINT "incentive_plans_previous_fkey" FOREIGN KEY ("previous_id") REFERENCES "incentive_plans"("id");
