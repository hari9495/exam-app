-- PAY-10 FailedIfsc (pay gaps, 2 Nov 2026): a failed bank payment can record why the bank refused it. "ifsc" means the
-- IFSC on file is not valid: the payslip then waits for the employee's corrected bank account before it is sent again
-- through the bank (a verified reimbursement account still works). Forward-only; RLS on payment_records is unchanged
-- (same rows, one new column); the table stays insert-only for the app role.
ALTER TABLE "payment_records" ADD COLUMN "cause" VARCHAR(8);
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_cause_check" CHECK ("cause" IS NULL OR ("cause" IN ('ifsc', 'account', 'other') AND "status" IN ('failed', 'returned')));
