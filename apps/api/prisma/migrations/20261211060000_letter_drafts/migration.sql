-- PPL-15: a letter an event makes (an offer withdrawn) waits as a draft, unnumbered, until HR issues it.
ALTER TABLE "letter_issues" DROP CONSTRAINT "letter_issues_status_check";
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_status_check" CHECK ("status" IN ('draft', 'pending_approval', 'rejected', 'rendering', 'awaiting_signature', 'issued', 'superseded', 'withdrawn'));
