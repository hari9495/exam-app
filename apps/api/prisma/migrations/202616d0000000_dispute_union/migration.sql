-- HLP-13 founder answer 85 (4 Nov 2026): when the dispute's legal entity has unions in payroll's union register
-- (PAY-36), the dispute names one of them; the approved settlement then carries it into the PAY-37 wage settlement.
-- Free text (union_name alone) stays only for an entity with no register entries. Set when the dispute is recorded;
-- the table stays append-only for the app role. No data changes.
ALTER TABLE "ir_disputes"
  ADD COLUMN "union_id" UUID,
  ADD CONSTRAINT "ir_disputes_union_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id");
