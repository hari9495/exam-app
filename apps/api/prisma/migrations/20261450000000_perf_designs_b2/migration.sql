-- Performance designs PRF-08, PRF-09 and PRF-11 made live (builder 2). Schema only; no data moves. The three tables
-- already have row-level security.
--   PRF-11  a 1:1 can repeat: every 7, 14 or 30 days. Marking one as held plans the next on that rhythm. Empty = one-off.
--   PRF-08  feedback can also be shown to HR ("them, their manager and HR"); the two earlier choices stay as they are.
--   PRF-09  the 9-box needs a potential rating (1 low, 2 medium, 3 high) per review; empty until someone sets it.
ALTER TABLE one_on_ones ADD COLUMN cadence_days smallint;
ALTER TABLE one_on_ones ADD CONSTRAINT one_on_ones_cadence_days_ck CHECK (cadence_days IN (7, 14, 30));

ALTER TABLE feedback_items DROP CONSTRAINT feedback_items_visibility_check;
ALTER TABLE feedback_items ADD CONSTRAINT feedback_items_visibility_check CHECK (visibility IN ('private', 'recipient_only', 'with_hr'));

ALTER TABLE reviews ADD COLUMN potential smallint;
ALTER TABLE reviews ADD CONSTRAINT reviews_potential_ck CHECK (potential BETWEEN 1 AND 3);
