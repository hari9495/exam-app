-- Answer 2286: with a rubric, the AI suggests a mark per criterion (in the rubric's order), each with its reason; still
-- asked only after the marker's own mark. No data written.
ALTER TABLE answer_ai_suggestions ADD COLUMN criteria JSONB CHECK (criteria IS NULL OR jsonb_typeof(criteria) = 'array');
