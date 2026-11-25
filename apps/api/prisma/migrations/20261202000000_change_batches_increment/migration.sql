-- PPL-06 (People, additive): a bulk change batch can come from the annual increment wizard (a raise by rating or by
-- percentage for the people chosen). Only the allowed value is added here.
ALTER TABLE "employee_change_batches" DROP CONSTRAINT "employee_change_batches_source_check";
ALTER TABLE "employee_change_batches" ADD CONSTRAINT "employee_change_batches_source_check" CHECK ("source" IN ('csv', 'reassign', 'comp_review', 'increment'));
