-- PPL-15 (founder 27 Oct 2026): a drafted letter (the offer withdrawal) is reviewed before it is issued, and HR may
-- discard one it will not send, with the reason. The row is kept for the audit, never deleted.
ALTER TABLE "letter_issues" DROP CONSTRAINT "letter_issues_status_check";
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_status_check" CHECK ("status" IN ('draft', 'discarded', 'pending_approval', 'rejected', 'rendering', 'awaiting_signature', 'issued', 'superseded', 'withdrawn'));
ALTER TABLE "letter_issues" ADD COLUMN "discard_reason" VARCHAR(500);
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_discard_check" CHECK (("status" = 'discarded') = ("discard_reason" IS NOT NULL));
