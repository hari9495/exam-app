-- Founder decision 6 (29 Oct 2026): the employee enters previous-employer income (Form 12B) in the tax workspace
-- (PAY-22) and payroll checks it in the proof queue (PAY-23). previous_employment_income stays import-only and
-- append-only; an employee's own entry lives here, one per employment and tax year, and counts only once approved.

CREATE TABLE "form12b_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "employer_name" VARCHAR(200),
    "employer_tan" VARCHAR(10) NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "exemptions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(14,2) NOT NULL,
    "file" JSONB NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "verifier_id" UUID,
    "verifier_comment" VARCHAR(500),
    "verified_at" TIMESTAMPTZ(3),
    "submitted_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form12b_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form12b_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form12b_submissions_key" UNIQUE ("organization_id", "employment_id", "tax_year"),
    CONSTRAINT "form12b_submissions_tan_check" CHECK ("employer_tan" ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
    CONSTRAINT "form12b_submissions_amount_check" CHECK ("gross" >= 0 AND "exemptions" >= 0 AND "tds" >= 0 AND "tds" <= "gross"),
    CONSTRAINT "form12b_submissions_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
REVOKE DELETE, TRUNCATE ON TABLE "form12b_submissions" FROM app_runtime;

-- Whoever checks a Form 12B is never the employee it belongs to (also checked in code).
CREATE FUNCTION form12b_submissions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."verifier_id" IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = NEW.organization_id AND e.id = NEW.employee_id AND e.user_id = NEW.verifier_id) THEN
    RAISE EXCEPTION 'YX_TAX_SELF_VERIFY: an employee never verifies their own Form 12B';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER form12b_submissions_guard BEFORE INSERT OR UPDATE ON "form12b_submissions" FOR EACH ROW EXECUTE FUNCTION form12b_submissions_guard();

ALTER TABLE "form12b_submissions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "form12b_submissions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "form12b_submissions" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "form12b_submissions" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]));
