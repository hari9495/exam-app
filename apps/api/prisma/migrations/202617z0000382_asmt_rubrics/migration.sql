-- Answer 2271: a rubric per written (essay) and code question: criteria with marks that add up to the question's marks,
-- written and reviewed in the question bank; markers mark criterion by criterion (PRC-19).
ALTER TABLE questions ADD COLUMN rubric JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(rubric) = 'array' AND jsonb_array_length(rubric) <= 10);

-- A marker's marks per criterion, in the rubric's order (empty when the question had no rubric).
ALTER TABLE answer_marks ADD COLUMN criteria JSONB CHECK (criteria IS NULL OR jsonb_typeof(criteria) = 'array');
