-- Learning follow-ups (answers 2672, 2673).
-- 2672: the level each course skill gives on completion, in the order of `skills` (empty = level 2 for every skill).
ALTER TABLE "learning_courses" ADD COLUMN "skill_levels" SMALLINT[] NOT NULL DEFAULT '{}';
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_skill_levels_check"
  CHECK ((cardinality("skill_levels") = 0 OR cardinality("skill_levels") = cardinality("skills")) AND "skill_levels" <@ ARRAY[1, 2, 3, 4, 5]::SMALLINT[]);

-- 2673: a person adds a skill to their own profile; it waits for their manager to confirm.
ALTER TABLE "learning_skill_suggestions" DROP CONSTRAINT "learning_skill_suggestions_source_check";
ALTER TABLE "learning_skill_suggestions" ADD CONSTRAINT "learning_skill_suggestions_source_check" CHECK ("source" IN ('course', 'self'));
ALTER TABLE "learning_skill_levels" DROP CONSTRAINT "learning_skill_levels_source_check";
ALTER TABLE "learning_skill_levels" ADD CONSTRAINT "learning_skill_levels_source_check" CHECK ("source" IN ('course', 'manager', 'self'));
