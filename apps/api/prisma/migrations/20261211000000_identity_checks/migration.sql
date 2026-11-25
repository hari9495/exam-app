-- PPL-34 Identity panel: identity checks on a person beyond the day-1 check at joining (pre-boarding keeps that one).
-- HR attests that they checked the original ID, or asks the person for a fresh ID. Special class; append-only.
CREATE TABLE "person_identity_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "result" VARCHAR(10) NOT NULL,
    "note" VARCHAR(500),
    "by_user_id" UUID,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "person_identity_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_identity_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "person_identity_checks_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "person_identity_checks_result_check" CHECK ("result" IN ('attested', 'requested'))
);
CREATE INDEX "person_identity_checks_person_idx" ON "person_identity_checks"("organization_id", "person_id", "checked_at");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "person_identity_checks" FROM app_runtime;

ALTER TABLE "person_identity_checks" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "person_identity_checks"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "person_identity_checks" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
