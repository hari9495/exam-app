-- HIR-04 founder answer 263 (10 Nov 2026, docs/yukthix/hiring-design-map.md): an optional days target and an optional
-- limit per pipeline stage. Empty (NULL) means none, the company-level default. The board shows cards over the target in
-- amber and flags a column over its limit; neither blocks a move. Schema only, no data written.
ALTER TABLE "pipeline_stages" ADD COLUMN "days_target" INTEGER;
ALTER TABLE "pipeline_stages" ADD COLUMN "stage_limit" INTEGER;
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_days_target_check" CHECK ("days_target" IS NULL OR "days_target" BETWEEN 1 AND 365);
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_stage_limit_check" CHECK ("stage_limit" IS NULL OR "stage_limit" BETWEEN 1 AND 1000);
