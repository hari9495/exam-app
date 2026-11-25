-- Helpdesk (founder answers 1661, 1662): the device an IT desk ticket is about (People asset register). IT agents set or
-- change it; the person raising a plain IT ticket may pick one of the devices assigned to them.
ALTER TABLE "sd_tickets" ADD COLUMN "asset_id" UUID;
CREATE INDEX "sd_tickets_asset_idx" ON "sd_tickets"("organization_id", "asset_id") WHERE "asset_id" IS NOT NULL;
