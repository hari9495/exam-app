-- YX-ORG-16: each legal entity can set the prefix of the employee codes made for new people (KF-0001).
-- NULL keeps the original E0001 series. Capital letters, digits, "-" and "/" only, so it is safe in a regex.
ALTER TABLE "legal_entities" ADD COLUMN "employee_code_prefix" VARCHAR(12);
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_employee_code_prefix_check"
  CHECK ("employee_code_prefix" IS NULL OR "employee_code_prefix" ~ '^[A-Z0-9][A-Z0-9/-]{0,11}$');
