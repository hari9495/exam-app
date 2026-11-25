-- PPL-32: an identity or bank change carries its proof (a document on the person's record) and, for a legal name,
-- the day it took effect. The proof replaces the free-text reason, which becomes optional.
ALTER TABLE "employee_profile_requests"
  ALTER COLUMN "reason" DROP NOT NULL,
  ADD COLUMN "proof_document_id" UUID,
  ADD COLUMN "effective_on" DATE,
  ADD CONSTRAINT "employee_profile_requests_proof_fkey" FOREIGN KEY ("organization_id", "proof_document_id") REFERENCES "documents"("organization_id", "id"),
  ADD CONSTRAINT "employee_profile_requests_effective_check" CHECK ("effective_on" IS NULL OR "kind" = 'legal_name');

ALTER TABLE "document_types" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'name_change_proof', 'Name change proof (gazette notification or marriage certificate)', 'confidential', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, false, '{}', ARRAY['person', 'hr']);
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;
