-- PPL-28 Held letters: a letter can wait, held, before it is made (for example a relieving letter while the exit's
-- letters are on hold until clearance is done). It keeps who held it, when and why; no reference number is taken
-- while held (numbers stay gap-free), and releasing it makes and issues it as usual.
ALTER TABLE "letter_issues" ADD COLUMN "hold_reason" VARCHAR(500), ADD COLUMN "held_by" UUID, ADD COLUMN "held_at" TIMESTAMPTZ(3);
ALTER TABLE "letter_issues" DROP CONSTRAINT "letter_issues_status_check";
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_status_check" CHECK ("status" IN ('draft', 'discarded', 'pending_approval', 'rejected', 'held', 'rendering', 'awaiting_signature', 'issued', 'superseded', 'withdrawn'));
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_held_check" CHECK ("status" <> 'held' OR ("hold_reason" IS NOT NULL AND "held_at" IS NOT NULL));
