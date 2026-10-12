-- M06-BUILD-DESIGN §4.1 change 1 (core HR, additive): a bulk change batch can come from a performance comp review
-- (PM7 applies approved merit and promotion proposals as one batch). Only the allowed value is added here.
ALTER TABLE "employee_change_batches" DROP CONSTRAINT "employee_change_batches_source_check";
ALTER TABLE "employee_change_batches" ADD CONSTRAINT "employee_change_batches_source_check" CHECK ("source" IN ('csv', 'reassign', 'comp_review'));
