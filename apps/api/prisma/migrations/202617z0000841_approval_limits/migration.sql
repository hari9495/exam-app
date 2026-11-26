-- E2 part 3 (O26): approval limits, grade -> the largest amount someone of that grade approves, per request family
-- (expense, hiring, pay). Empty by default: a "up the chain until the limit covers it" step cannot be saved until the
-- family has limits. Company settings data (HR Admins edit it), so no support-session exclusion beyond the usual.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "approval_limits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "family" VARCHAR(20) NOT NULL,
  "grade_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "updated_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_limits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_limits_grade_fkey" FOREIGN KEY ("organization_id", "grade_id") REFERENCES "grades"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "approval_limits_family_check" CHECK ("family" IN ('expense', 'hiring', 'pay')),
  CONSTRAINT "approval_limits_amount_check" CHECK ("amount" >= 0)
);
CREATE UNIQUE INDEX "approval_limits_org_family_grade_key" ON "approval_limits" ("organization_id", "family", "grade_id");

GRANT DELETE ON TABLE "approval_limits" TO app_runtime;
ALTER TABLE "approval_limits" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "approval_limits" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
