-- PPL-28 (founder 26 Oct 2026): a person holds one issued letter of some types (appointment, confirmation, relieving,
-- experience ...); another is refused unless it is a correction. A company policy on each template, set by HR.
ALTER TABLE "letter_templates" ADD COLUMN "one_per_person" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "letter_templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "letter_templates" DISABLE ROW LEVEL SECURITY;
UPDATE "letter_templates" SET "one_per_person" = true WHERE "letter_type" IN ('appointment', 'letter_of_intent', 'confirmation', 'no_dues', 'relieving', 'fnf_statement', 'experience');
ALTER TABLE "letter_templates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
