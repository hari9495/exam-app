-- Founder decision 5c-D2 (9 Oct 2026): the skill class of a job (minimum-wage schedules pay by it) is a dated job fact,
-- changed and corrected through the P06 change history like the grade. Empty until HR sets it.
ALTER TABLE "employee_assignments"
  ADD COLUMN "skill_class" VARCHAR(16),
  ADD CONSTRAINT "employee_assignments_skill_check" CHECK ("skill_class" IS NULL OR "skill_class" IN ('unskilled', 'semi_skilled', 'skilled', 'highly_skilled'));
