-- CI's "No model or column without a migration" check (PR #221) found 11 differences between schema.prisma and the
-- migrations: ten foreign keys exist but without the ON UPDATE CASCADE that schema.prisma declares (and one under an
-- older name), and asmt_institutions has no index on organization_id. Ids never change, so ON UPDATE CASCADE changes no
-- behaviour; each key is dropped and re-added with the declared name and actions. The existing rows already satisfy
-- the same reference, so re-validating cannot fail.
ALTER TABLE "accommodation_requests" DROP CONSTRAINT IF EXISTS "accommodation_requests_invitation_fkey";
ALTER TABLE "accommodation_requests" ADD CONSTRAINT "accommodation_requests_invitation_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assistant_messages" DROP CONSTRAINT IF EXISTS "assistant_messages_conversation_fkey";
ALTER TABLE "assistant_messages" DROP CONSTRAINT IF EXISTS "assistant_messages_conversation_id_fkey";
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attempt_surveys" DROP CONSTRAINT IF EXISTS "attempt_surveys_attempt_fkey";
ALTER TABLE "attempt_surveys" ADD CONSTRAINT "attempt_surveys_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "connectivity_credits" DROP CONSTRAINT IF EXISTS "connectivity_credits_attempt_fkey";
ALTER TABLE "connectivity_credits" ADD CONSTRAINT "connectivity_credits_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integrity_incidents" DROP CONSTRAINT IF EXISTS "integrity_incidents_attempt_fkey";
ALTER TABLE "integrity_incidents" ADD CONSTRAINT "integrity_incidents_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integrity_appeals" DROP CONSTRAINT IF EXISTS "integrity_appeals_incident_fkey";
ALTER TABLE "integrity_appeals" ADD CONSTRAINT "integrity_appeals_incident_fkey" FOREIGN KEY ("incident_id") REFERENCES "integrity_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integrity_appeals" DROP CONSTRAINT IF EXISTS "integrity_appeals_attempt_fkey";
ALTER TABLE "integrity_appeals" ADD CONSTRAINT "integrity_appeals_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_revisions" DROP CONSTRAINT IF EXISTS "question_revisions_question_id_fkey";
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_translations" DROP CONSTRAINT IF EXISTS "question_translations_question_id_fkey";
ALTER TABLE "question_translations" ADD CONSTRAINT "question_translations_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_notices" DROP CONSTRAINT IF EXISTS "staff_notices_recipient_fkey";
ALTER TABLE "staff_notices" ADD CONSTRAINT "staff_notices_recipient_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "asmt_institutions_organization_id_idx" ON "asmt_institutions"("organization_id");
