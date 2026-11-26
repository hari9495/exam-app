-- Batch T2-F item 43 (People B2): a joining or leaving checklist may apply to one employment type (as specific as a
-- department when the most specific template is picked). NULL = any type.
ALTER TABLE "journey_templates" ADD COLUMN "employment_type_id" UUID;
