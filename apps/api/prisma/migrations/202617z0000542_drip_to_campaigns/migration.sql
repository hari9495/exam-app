-- Retire /v2 (answers 2433, 2512, 2513): each older drip campaign is moved once into a draft HIR-20 talent campaign
-- (its steps as email templates and waits, an empty talent pool for the recruiter to fill with consenting people).
-- The link makes the move safe to run again: a drip campaign with a link is never moved twice.
ALTER TABLE "drip_campaigns" ADD COLUMN "migrated_campaign_id" UUID;
CREATE UNIQUE INDEX "drip_campaigns_migrated_campaign_key" ON "drip_campaigns" ("migrated_campaign_id");
