-- Assessments AS-5 part 3 (answer 2269): the candidate replies to their proctor in the same thread.
ALTER TABLE "candidate_messages" ALTER COLUMN "sent_by_user_id" DROP NOT NULL;
ALTER TABLE "candidate_messages" ADD COLUMN "from_candidate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_sender_check" CHECK ("from_candidate" OR "sent_by_user_id" IS NOT NULL);
