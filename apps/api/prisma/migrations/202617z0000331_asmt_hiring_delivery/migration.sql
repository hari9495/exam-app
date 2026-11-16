-- Assessments AS-3 (answers 2013, 2001; PRC-07, PRC-32): hiring delivery. invitations already has forced RLS.
-- No rows are written here.

-- PRC-32 (answer 2013): a candidate may use their earlier result on the same test instead of taking it again (within the
-- company's months, asmt.result_reuse_months). The invitation is then 'reused' and links the earlier attempt (linked,
-- not copied: the earlier result stays the record).
ALTER TABLE "invitations"
  ADD COLUMN "reused_attempt_id" UUID,
  ADD COLUMN "reused_at" TIMESTAMPTZ(3),
  -- PRC-07: a missed invitation is re-invited once, with a reason.
  ADD COLUMN "reinvited_at" TIMESTAMPTZ(3),
  ADD COLUMN "reinvite_reason" VARCHAR(500);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_reused_attempt_fkey" FOREIGN KEY ("reused_attempt_id") REFERENCES "attempts"("id") ON DELETE SET NULL;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_reuse_check"
  CHECK (("status" <> 'reused' OR "reused_at" IS NOT NULL) AND ("reused_attempt_id" IS NULL OR "status" = 'reused'));
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_reinvite_check"
  CHECK ("reinvited_at" IS NULL OR char_length(btrim(coalesce("reinvite_reason", ''))) >= 10);
