-- Learning stage 2: asking for a course that needs approval (LRN-06). The request goes through the approvals engine
-- (the manager, then L&D); a refusal leaves the enrolment "declined" so the person may ask again. A course above the
-- bond threshold records when the person accepted the training bond.
ALTER TABLE "learning_enrolments"
    ADD COLUMN "wf_request_id" UUID,
    ADD COLUMN "bond_accepted_at" TIMESTAMPTZ(3),
    DROP CONSTRAINT "learning_enrolments_status_check",
    ADD CONSTRAINT "learning_enrolments_status_check" CHECK ("status" IN ('requested', 'enrolled', 'in_progress', 'completed', 'cancelled', 'declined'));
CREATE UNIQUE INDEX "learning_enrolments_wf_request_key" ON "learning_enrolments"("wf_request_id") WHERE "wf_request_id" IS NOT NULL;
