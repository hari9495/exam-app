-- Founder answers 2 and 3 (30 Oct 2026), PAY-22.
-- (2) A change of residential status waits for HR: the employee sends it with the tax residency certificate (TRC) and
--     confirms Form 10F is filed; payroll (tax.proof.verify) approves or rejects it in the proof queue (PAY-23), as with
--     Form 12B. Only an approved request changes the workspace. Nobody decides their own.
-- (3) After the regime cut-off the employee asks HR to change the regime, with a reason, through Approvals; the
--     approver holds tax.regime.override. On approval the regime changes (audited). One open request of each kind
--     per workspace at a time.

CREATE TABLE "tax_residency_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "from_status" VARCHAR(12) NOT NULL,
    "residential_status" VARCHAR(12) NOT NULL,
    "trc_valid_to" DATE,
    "dtaa_country" CHAR(2),
    "form10f_filed" BOOLEAN NOT NULL DEFAULT false,
    "file" JSONB,
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "verifier_id" UUID,
    "verifier_comment" VARCHAR(500),
    "verified_at" TIMESTAMPTZ(3),
    "submitted_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_residency_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_residency_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_residency_requests_status_values" CHECK ("residential_status" IN ('resident', 'non_resident') AND "from_status" IN ('resident', 'non_resident')),
    CONSTRAINT "tax_residency_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
    -- A non-resident claim always carries the certificate and the Form 10F confirmation.
    CONSTRAINT "tax_residency_requests_nr_check" CHECK ("residential_status" = 'resident' OR ("file" IS NOT NULL AND "form10f_filed" AND "trc_valid_to" IS NOT NULL))
);
CREATE UNIQUE INDEX "tax_residency_requests_one_pending" ON "tax_residency_requests" ("organization_id", "workspace_id") WHERE "status" = 'pending';
CREATE INDEX "tax_residency_requests_queue" ON "tax_residency_requests" ("organization_id", "legal_entity_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "tax_residency_requests" FROM app_runtime;

CREATE FUNCTION tax_residency_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."verifier_id" IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = NEW.organization_id AND e.id = NEW.employee_id AND e.user_id = NEW.verifier_id) THEN
    RAISE EXCEPTION 'YX_TAX_SELF_VERIFY: an employee never approves their own residential status';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_residency_requests_guard BEFORE INSERT OR UPDATE ON "tax_residency_requests" FOR EACH ROW EXECUTE FUNCTION tax_residency_requests_guard();

ALTER TABLE "tax_residency_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_residency_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "tax_residency_requests" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "tax_residency_requests" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]));

CREATE TABLE "tax_regime_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "from_regime" VARCHAR(3) NOT NULL,
    "to_regime" VARCHAR(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_regime_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_regime_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tax_regime_requests_regime_check" CHECK ("from_regime" IN ('new', 'old') AND "to_regime" IN ('new', 'old') AND "from_regime" <> "to_regime"),
    CONSTRAINT "tax_regime_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);
CREATE UNIQUE INDEX "tax_regime_requests_one_pending" ON "tax_regime_requests" ("organization_id", "workspace_id") WHERE "status" = 'pending';
REVOKE DELETE, TRUNCATE ON TABLE "tax_regime_requests" FROM app_runtime;

CREATE FUNCTION tax_regime_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."decided_by" IS NOT NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.organization_id = NEW.organization_id AND e.id = NEW.employee_id AND e.user_id = NEW.decided_by) THEN
    RAISE EXCEPTION 'YX_TAX_SELF_APPROVE: an employee never approves their own regime change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tax_regime_requests_guard BEFORE INSERT OR UPDATE ON "tax_regime_requests" FOR EACH ROW EXECUTE FUNCTION tax_regime_requests_guard();

ALTER TABLE "tax_regime_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tax_regime_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "tax_regime_requests" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "tax_regime_requests" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]));
