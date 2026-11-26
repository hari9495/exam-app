-- Batch T2-C item 2661 (answer 2846): the review shows the period's kudos (Engage) as context, never scored. The person may
-- hide any one until the manager submits the review; hidden ones are never shown to reviewers. The kudos ids hidden.
ALTER TABLE "reviews" ADD COLUMN "hidden_kudos" UUID[] NOT NULL DEFAULT '{}';
