-- Careers answer 353: an optional last day to apply (applications close after it) and the experience asked for, shown
-- on the careers job page. Schema only: no data is written.
ALTER TABLE "jobs" ADD COLUMN "apply_by" DATE;
ALTER TABLE "jobs" ADD COLUMN "experience" VARCHAR(60);
