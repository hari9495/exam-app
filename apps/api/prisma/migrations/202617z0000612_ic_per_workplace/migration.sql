-- Batch G1 answer 2592: one company Internal Committee by default, plus optional committees per workplace. A POSH complaint
-- goes to its workplace's committee when there is one, else to the company's; the case keeps which committee it went to.
ALTER TABLE "speakup_team_members" ADD COLUMN "location_id" UUID;
ALTER TABLE "speakup_team_members" ADD CONSTRAINT "speakup_team_members_location_ic_check" CHECK ("team" = 'ic' OR "location_id" IS NULL);
DROP INDEX "speakup_team_members_live_key";
CREATE UNIQUE INDEX "speakup_team_members_live_key" ON "speakup_team_members" ("organization_id", "team", "user_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "removed_at" IS NULL;
ALTER TABLE "speakup_cases" ADD COLUMN "ic_location_id" UUID;
