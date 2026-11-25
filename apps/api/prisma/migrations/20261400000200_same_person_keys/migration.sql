-- PPL-36 Possible same person: a joiner's own answers (pre-boarding portal) give their PAN, UAN and date of birth. The
-- PAN and UAN are kept here only as the company's keyed hashes (the same hash as employee_identifiers), so a joiner who
-- already has an employee record (often a former employee) is proposed on PAN, on UAN, or on name + date of birth;
-- never on the name alone.
ALTER TABLE "preboardings" ADD COLUMN "pan_hash" CHAR(64), ADD COLUMN "uan_hash" CHAR(64), ADD COLUMN "date_of_birth" DATE;
CREATE INDEX "employee_identifiers_pan_hash_idx" ON "employee_identifiers"("organization_id", "pan_hash") WHERE "pan_hash" IS NOT NULL;
CREATE INDEX "employee_identifiers_uan_hash_idx" ON "employee_identifiers"("organization_id", "uan_hash") WHERE "uan_hash" IS NOT NULL;
