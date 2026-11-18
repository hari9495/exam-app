-- Batch C item 6 (answers 2505, 2506): attendance.lock holders waive late-mark penalties before payroll, with a reason of
-- 10 or more characters, only while the month is unlocked; a waiver is undone (kept, never deleted) before the lock.
-- The late mark stays on the day, shown as "waived"; only its penalty leaves the payroll feed. Pay-related: support
-- sessions never see it.
CREATE TABLE "late_mark_waivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "waived_by" UUID NOT NULL,
    "waived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_by" UUID,
    "undone_at" TIMESTAMPTZ(3),
    "undo_reason" VARCHAR(500),
    CONSTRAINT "late_mark_waivers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "late_mark_waivers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "late_mark_waivers_reason_check" CHECK (char_length(btrim("reason")) >= 10),
    CONSTRAINT "late_mark_waivers_undo_check" CHECK (("undone_at" IS NULL) = ("undone_by" IS NULL))
);
CREATE INDEX "late_mark_waivers_entity_day_idx" ON "late_mark_waivers"("organization_id", "legal_entity_id", "work_on");
-- One active waiver per person and day.
CREATE UNIQUE INDEX "late_mark_waivers_active_key" ON "late_mark_waivers"("organization_id", "employee_id", "work_on") WHERE "undone_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "late_mark_waivers" FROM app_runtime;

ALTER TABLE "late_mark_waivers" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "late_mark_waivers"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "late_mark_waivers" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "late_mark_waivers" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
