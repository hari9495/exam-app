-- Tier 1 batch A item 9 (attendance-leave D11): HR marks a holiday or a weekly off as a working day on a holiday
-- calendar (a make-up Saturday, a holiday moved by the state). Only for today or later; leave already booked that day
-- counts again. No data written.
CREATE TABLE "exceptional_working_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "exceptional_working_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exceptional_working_days_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "exceptional_working_days_calendar_fkey" FOREIGN KEY ("calendar_id") REFERENCES "holiday_calendars"("id") ON DELETE CASCADE,
    CONSTRAINT "exceptional_working_days_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 5 AND 300)
);
-- One mark per calendar and date: marking twice records once.
CREATE UNIQUE INDEX "exceptional_working_days_calendar_on_key" ON "exceptional_working_days" ("calendar_id", "work_on");
CREATE INDEX "exceptional_working_days_organization_id_idx" ON "exceptional_working_days" ("organization_id");
ALTER TABLE "exceptional_working_days" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "exceptional_working_days"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
