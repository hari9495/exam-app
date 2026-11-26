-- G4 (answers 2690-2692): scheduled report emails from the report library (each recipient's own copy, built with their
-- own rights at send time) and the key for the export log.

CREATE TABLE "report_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "report_id" VARCHAR(60) NOT NULL,
    "frequency" VARCHAR(10) NOT NULL,
    "recipients" UUID[] NOT NULL,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "last_run_at" TIMESTAMPTZ(3),
    "last_result" VARCHAR(300),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "report_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "report_schedules_frequency_check" CHECK ("frequency" IN ('daily', 'weekdays', 'weekly', 'monthly')),
    CONSTRAINT "report_schedules_recipients_check" CHECK (cardinality("recipients") BETWEEN 1 AND 50)
);
CREATE INDEX "report_schedules_org_idx" ON "report_schedules"("organization_id", "created_by");
CREATE INDEX "report_schedules_due_idx" ON "report_schedules"("next_run_at") WHERE "active";

ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "report_schedules"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "report_schedules" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'exports.log.view', 'See the export log: every report, register and data export anyone in the company made')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p."id" FROM "permissions" p CROSS JOIN (VALUES ('org_admin'), ('auditor')) AS r(role) WHERE p."key" = 'exports.log.view'
ON CONFLICT DO NOTHING;
