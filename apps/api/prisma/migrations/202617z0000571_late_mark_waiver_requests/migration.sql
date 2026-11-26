-- Founder answer 2527: a manager asks HR to waive late marks of their own team (a reason of 10 or more characters);
-- HR waives or declines from the same Late marks list. Kept, never deleted; one open request per person and day.
-- Pay-related like late_mark_waivers: support sessions never see it.
CREATE TABLE "late_mark_waiver_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decline_reason" VARCHAR(500),
    CONSTRAINT "late_mark_waiver_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "late_mark_waiver_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "late_mark_waiver_requests_reason_check" CHECK (char_length(btrim("reason")) >= 10),
    CONSTRAINT "late_mark_waiver_requests_status_check" CHECK ("status" IN ('pending', 'waived', 'declined')),
    CONSTRAINT "late_mark_waiver_requests_decided_check" CHECK (("status" = 'pending') = ("decided_at" IS NULL) AND ("decided_at" IS NULL) = ("decided_by" IS NULL)),
    CONSTRAINT "late_mark_waiver_requests_decline_check" CHECK ("status" <> 'declined' OR char_length(btrim(coalesce("decline_reason", ''))) >= 10)
);
CREATE INDEX "late_mark_waiver_requests_entity_day_idx" ON "late_mark_waiver_requests"("organization_id", "legal_entity_id", "work_on");
-- One open request per person and day.
CREATE UNIQUE INDEX "late_mark_waiver_requests_open_key" ON "late_mark_waiver_requests"("organization_id", "employee_id", "work_on") WHERE "status" = 'pending';
REVOKE DELETE, TRUNCATE ON TABLE "late_mark_waiver_requests" FROM app_runtime;

ALTER TABLE "late_mark_waiver_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "late_mark_waiver_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "late_mark_waiver_requests" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "late_mark_waiver_requests" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
