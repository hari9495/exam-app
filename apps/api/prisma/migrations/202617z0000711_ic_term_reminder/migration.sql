-- Answer 2623: the System Admin is reminded once, 30 days before an Internal Committee member's term ends (cleared when
-- the term is changed, so a new term is reminded again).
ALTER TABLE "speakup_team_members" ADD COLUMN "term_reminded_at" TIMESTAMPTZ(3);
