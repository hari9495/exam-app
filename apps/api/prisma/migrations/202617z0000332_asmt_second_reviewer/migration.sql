-- AS-5 part 1 (PRC-17): the first reviewer names the second reviewer for an attempt invalidation; only that person
-- confirms it (YX-EVAL-01), never the first.
ALTER TABLE "integrity_incidents" ADD COLUMN "second_reviewer_id" UUID;
ALTER TABLE "integrity_incidents" ADD CONSTRAINT "integrity_incidents_second_reviewer_check" CHECK (
  ("status" = 'second_review') <= ("second_reviewer_id" IS NOT NULL AND "second_reviewer_id" <> "decided_by")
  AND ("confirmed_by" IS NULL OR "confirmed_by" = "second_reviewer_id"));
