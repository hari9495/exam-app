-- Founder decision 1 (29 Oct 2026): HR chooses which leave types a company block date stops.
-- Empty (every existing row) keeps today's rule: planned leave only (not sick, maternity, paternity or unpaid leave).
ALTER TABLE "leave_block_dates" ADD COLUMN "leave_type_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "leave_block_dates" ADD CONSTRAINT "leave_block_dates_types_check" CHECK (cardinality("leave_type_ids") <= 50);
