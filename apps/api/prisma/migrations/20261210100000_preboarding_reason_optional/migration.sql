-- PPL-15: a cancelled joiner always has an outcome; only a company withdrawal must say why (it is the one HR answers
-- for). Did not join and reneged may be recorded without a reason.
ALTER TABLE "preboardings" DROP CONSTRAINT "preboardings_cancel_check";
ALTER TABLE "preboardings"
  ADD CONSTRAINT "preboardings_cancel_check" CHECK ("status" <> 'cancelled' OR ("outcome" IS NOT NULL AND ("outcome" <> 'withdrawn' OR "outcome_reason" IS NOT NULL)));
