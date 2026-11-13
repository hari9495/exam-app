-- Helpdesk ITSM follow-ups (founder answers 2051-2058, docs/yukthix/helpdesk-itsm-plan.md). An IT ticket may name the
-- business application it is about (2057: repeats by the same application), a problem may be about one, a known-issue
-- notice may be limited to an application's users (2056), and each IT desk chooses whom its notices reach (2056: all
-- employees by default; or one location; or the users of the application). No data is written.
ALTER TABLE "sd_tickets" ADD COLUMN "app_id" UUID;
CREATE INDEX "sd_tickets_app_idx" ON "sd_tickets"("organization_id", "desk_id", "app_id") WHERE "app_id" IS NOT NULL;

ALTER TABLE "sd_problems" ADD COLUMN "app_id" UUID;

ALTER TABLE "sd_banners" ADD COLUMN "app_id" UUID;

ALTER TABLE "sd_itsm_settings" ADD COLUMN "notice_scope" VARCHAR(12) NOT NULL DEFAULT 'all',
  ADD CONSTRAINT "sd_itsm_settings_notice_scope_check" CHECK ("notice_scope" IN ('all', 'location', 'application'));
