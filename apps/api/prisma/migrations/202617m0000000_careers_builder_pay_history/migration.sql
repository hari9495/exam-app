-- T9-09 careers site and Surfaces/Careers page builder (founder decision 8) and HIR-24 answer 224 (the pay-history
-- question on the apply page). Schema only, no data written.
-- careers_config: the builder's { theme, accent, sections }; NULL keeps today's page built from headline and intro.
ALTER TABLE "organizations" ADD COLUMN "careers_config" JSONB;
-- current_pay: the applicant's answer in rupees a year, stored only where the job asks and its location's law allows.
ALTER TABLE "pipeline_entries" ADD COLUMN "current_pay" INTEGER;
ALTER TABLE "pipeline_entries" ADD CONSTRAINT "pipeline_entries_current_pay_check" CHECK ("current_pay" IS NULL OR "current_pay" BETWEEN 0 AND 1000000000);
