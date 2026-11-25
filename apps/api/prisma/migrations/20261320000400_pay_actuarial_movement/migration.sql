-- PAY-38 Upload (pay gaps, 2 Nov 2026): the actuary's movement in the obligation, kept with the valuation: current service
-- cost, interest cost, benefits paid, actuarial loss and gain (all or none; when given, opening + service + interest
-- - benefits paid + loss - gain = closing, checked by the API). Forward-only; RLS on actuarial_valuations is unchanged.
ALTER TABLE "actuarial_valuations"
  ADD COLUMN "service_cost" DECIMAL(16,2),
  ADD COLUMN "interest_cost" DECIMAL(16,2),
  ADD COLUMN "benefits_paid" DECIMAL(16,2),
  ADD COLUMN "actuarial_loss" DECIMAL(16,2),
  ADD COLUMN "actuarial_gain" DECIMAL(16,2);
ALTER TABLE "actuarial_valuations" ADD CONSTRAINT "actuarial_valuations_movement_check" CHECK (
  ("service_cost" IS NULL AND "interest_cost" IS NULL AND "benefits_paid" IS NULL AND "actuarial_loss" IS NULL AND "actuarial_gain" IS NULL)
  OR ("service_cost" >= 0 AND "interest_cost" >= 0 AND "benefits_paid" >= 0 AND "actuarial_loss" >= 0 AND "actuarial_gain" >= 0
      AND "opening" + "service_cost" + "interest_cost" - "benefits_paid" + "actuarial_loss" - "actuarial_gain" = "closing"));
