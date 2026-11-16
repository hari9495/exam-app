-- Answers 2141 and 2142: a question is usable only once approved (questions.last_approved_at). Questions that were in
-- use before the review flow (AS-1) count as approved: those in use now, and those retired that a person wrote (they
-- were usable when written). AI drafts that were discarded were never approved and stay so.
SELECT set_config('app.is_super_admin', 'on', true);
UPDATE "questions" SET "last_approved_at" = "created_at"
WHERE "last_approved_at" IS NULL AND ("status" = 'active' OR ("status" = 'archived' AND NOT "ai_generated"));
