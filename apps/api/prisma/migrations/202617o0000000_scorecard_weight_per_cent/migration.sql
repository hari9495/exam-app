-- Founder answer 345: scorecard item weights are whole per cent (a template's weights add up to 100, checked by the API).
-- Schema only, no data write: templates saved before keep their 1-10 weights and score the same.
ALTER TABLE "scorecard_items" DROP CONSTRAINT "scorecard_items_weight_check";
ALTER TABLE "scorecard_items" ADD CONSTRAINT "scorecard_items_weight_check" CHECK ("weight" BETWEEN 1 AND 100);
