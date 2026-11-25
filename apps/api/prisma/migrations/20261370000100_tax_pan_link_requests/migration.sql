-- PAY-22 NoPan (2 Nov 2026): an employee whose PAN is inoperative sends the portal's link confirmation; payroll
-- (tax.proof.verify) checks it in the proof queue (PAY-23) and, on approval, the workspace's PAN is operative again
-- (normal-rate tax from the next payslip). The file goes through the shared file pipeline (type and size checks,
-- virus scan; nothing is served until it is clean). One open request per workspace; nobody decides their own.
CREATE TABLE "tax_pan_link_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "file_id" UUID NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "verifier_id" UUID,
    "verifier_comment" VARCHAR(500),
    "verified_at" TIMESTAMPTZ(3),
    "submitted_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_pan_link_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_pan_link_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_pan_link_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "tax_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_pan_link_requests_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tax_pan_link_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    -- A refusal always says why.
    CONSTRAINT "tax_pan_link_requests_reason_check" CHECK ("status" <> 'rejected' OR "verifier_comment" IS NOT NULL)
);
CREATE UNIQUE INDEX "tax_pan_link_requests_one_pending" ON "tax_pan_link_requests" ("organization_id", "workspace_id") WHERE "status" = 'pending';
CREATE INDEX "tax_pan_link_requests_queue" ON "tax_pan_link_requests" ("organization_id", "legal_entity_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "tax_pan_link_requests" FROM app_runtime;

CREATE FUNCTION tax_pan_link_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."verifier_id" IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = NEW.organization_id AND e.id = NEW.employee_id AND e.user_id = NEW.verifier_id) THEN
    RAISE EXCEPTION 'YX_TAX_SELF_VERIFY: an employee never approves their own PAN link';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_pan_link_requests_guard BEFORE INSERT OR UPDATE ON "tax_pan_link_requests" FOR EACH ROW EXECUTE FUNCTION tax_pan_link_requests_guard();

ALTER TABLE "tax_pan_link_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_pan_link_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "tax_pan_link_requests" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "tax_pan_link_requests" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]));
