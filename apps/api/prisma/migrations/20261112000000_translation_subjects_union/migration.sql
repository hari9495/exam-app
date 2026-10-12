-- Restates the full list of translatable subjects (G1 + M05 expenses E1 + M06 performance PM1). Expenses E1 and
-- performance PM1 each replaced this constraint; depending on the order a database applied them in, one branch's
-- subjects could be missing. This later migration makes every database end with the same, complete list.
ALTER TABLE "content_translations" DROP CONSTRAINT "content_translations_subject_check";
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_subject_check" CHECK ("subject_type" IN ('leave_type', 'designation', 'department', 'grade', 'employment_type', 'location', 'journey_template', 'journey_task', 'expense_category', 'city_tier', 'rating_level', 'rating_band', 'review_section', 'competency'));
