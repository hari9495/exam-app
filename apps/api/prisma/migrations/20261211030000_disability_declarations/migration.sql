-- PPL-38 Disability declaration (Special class, RPwD Act 2016): voluntary, with consent, withdrawable. The person
-- declares; the HR diversity role (employee.disability.view) sees the list; managers never do. Category, percentage
-- and adjustments are sealed; withdrawing clears them (the audit trail keeps only that it happened).
CREATE TABLE "disability_declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "answer" VARCHAR(4) NOT NULL,
    "details_enc" TEXT,
    "certificate_document_id" UUID,
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "disability_declarations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disability_declarations_employee_key" UNIQUE ("organization_id", "employee_id"),
    CONSTRAINT "disability_declarations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "disability_declarations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "disability_declarations_certificate_fkey" FOREIGN KEY ("organization_id", "certificate_document_id") REFERENCES "documents"("organization_id", "id"),
    CONSTRAINT "disability_declarations_answer_check" CHECK ("answer" IN ('yes', 'no', 'skip')),
    CONSTRAINT "disability_declarations_details_check" CHECK (("answer" = 'yes' AND "withdrawn_at" IS NULL) = ("details_enc" IS NOT NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "disability_declarations" FROM app_runtime;

ALTER TABLE "disability_declarations" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "disability_declarations"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "disability_declarations" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

ALTER TABLE "document_types" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'disability_certificate', 'Disability certificate (UDID or medical board)', 'special', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 5, true, '{60,30}', ARRAY['person', 'hr']);
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'employee.disability.view', 'See disability declarations (Special): the HR diversity role')
ON CONFLICT DO NOTHING;
