-- Batch G1 answer 2591: an Internal Committee member records whether she is a woman and when the term ends (the POSH Act:
-- a senior woman presides, at least half are women, a term is at most 3 years). Asked only for the committee list; older
-- rows stay empty and the IC console warns about them.
ALTER TABLE "speakup_team_members" ADD COLUMN "woman" BOOLEAN, ADD COLUMN "term_ends_on" DATE;
ALTER TABLE "speakup_team_members" ADD CONSTRAINT "speakup_team_members_ic_only_check" CHECK ("team" = 'ic' OR ("woman" IS NULL AND "term_ends_on" IS NULL));
