-- Settings S-6, 2.4 Approvals (founder answer 1330): a company's own approval steps per request type, on the shared
-- approvals engine (the steps are copied into each request when it is sent, so a change applies to new requests only).
-- The reminder (24 hours) and escalation (48 hours) are company settings in the registry (approval.remind_hours,
-- approval.escalate_hours), with no table. Schema only.
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_type" VARCHAR(60) NOT NULL,
    "steps" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "approval_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "approval_policies_steps_check" CHECK (jsonb_typeof("steps") = 'array' AND jsonb_array_length("steps") BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "approval_policies_organization_id_request_type_key" ON "approval_policies" ("organization_id", "request_type");
ALTER TABLE "approval_policies" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "approval_policies"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "approval_policies" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
