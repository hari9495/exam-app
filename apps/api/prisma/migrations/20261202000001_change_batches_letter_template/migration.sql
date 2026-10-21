-- PPL-06 (founder 20 Oct 2026, additive): an annual increment batch may name the increment letter template HR chose.
-- The letters are made only once the batch is approved, from the approved salary revisions.
ALTER TABLE "employee_change_batches" ADD COLUMN "letter_template_id" UUID;
