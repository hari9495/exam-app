-- PPL-23: the family's compassionate contact on a death in service (an HR user of the company).
ALTER TABLE "exit_cases"
  ADD COLUMN "family_contact_user_id" UUID,
  ADD CONSTRAINT "exit_cases_family_contact_fkey" FOREIGN KEY ("organization_id", "family_contact_user_id") REFERENCES "users"("organization_id", "id"),
  ADD CONSTRAINT "exit_cases_family_contact_check" CHECK ("family_contact_user_id" IS NULL OR "exit_type" = 'death');
