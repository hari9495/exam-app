-- Learning stage 3: a request for external training (LRN-06 "external"): a course or certification outside the
-- catalogue, its provider and fees, and why it helps the person's work. It goes to the manager, then L&D, through the
-- approvals engine; above the bond threshold the person accepts the training bond.
CREATE TABLE "learning_external_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "provider" VARCHAR(200) NOT NULL,
    "cost" NUMERIC(12, 2) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "bond_accepted_at" TIMESTAMPTZ(3),
    "status" VARCHAR(10) NOT NULL DEFAULT 'requested',
    "wf_request_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "learning_external_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_external_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_external_requests_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_external_requests_status_check" CHECK ("status" IN ('requested', 'approved', 'declined')),
    CONSTRAINT "learning_external_requests_cost_check" CHECK ("cost" >= 0)
);
CREATE INDEX "learning_external_requests_employee_idx" ON "learning_external_requests"("organization_id", "employee_id");
CREATE UNIQUE INDEX "learning_external_requests_wf_key" ON "learning_external_requests"("wf_request_id") WHERE "wf_request_id" IS NOT NULL;

ALTER TABLE "learning_external_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "learning_external_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "learning_external_requests" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
