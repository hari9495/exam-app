-- PPL-03 "Additional details": the company's own fields on the employee record reuse custom_field_definitions /
-- custom_field_values (entity_type 'employee'). Each field carries a data class (P02 §4.4) that decides who reads
-- and edits its values; existing rows (candidate / job fields) take 'internal', which nothing there reads.
-- Both tables keep their forced row-level security from the tenant_rls migration.
ALTER TABLE "custom_field_definitions" ADD COLUMN "data_class" VARCHAR(20) NOT NULL DEFAULT 'internal';
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_data_class_check" CHECK ("data_class" IN ('public', 'internal', 'personal', 'confidential'));
