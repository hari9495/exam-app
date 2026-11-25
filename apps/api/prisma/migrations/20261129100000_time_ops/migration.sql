-- Time ops (attendance, overtime, periods), 29 Oct 2026. Additive only.
--   attendance_resolutions   HR resolves an attendance exception (TIM-04, TIM-03 HrFix) or marks people present in bulk
--                            (TIM-02) with a reason: present (with or without times) or absent. The day engine reads the
--                            latest one; frozen / locked dates refuse it like every attendance input (yx_time_lock_guard).
--   pay_periods              HR sends a month for payroll approval (TIM-11, setting attendance.lock_flow = two_step):
--                            who sent it and when.
--   industrial_action_events strike / lockout / lay-off at one establishment (TIM-37): the day engine marks the days,
--                            the payroll feed pays them by type and legality.
--   attendance_days.status   + strike, lockout, layoff.
--   presence_consents /      presence-based attendance (TIM-36): a person's consent (given, withdrawn) and the presence
--   presence_signals         states their desktop app or Teams reports; read only with consent in force on the day.
--   payroll_feed_rows        + layoff_days (paid at the lay-off rate by payroll), held_days (pay on hold while the
--                            legality of an industrial action is undetermined), late_lop_days (late marks over the free
--                            number turned into unpaid days, setting attendance.late_mark_penalty).

CREATE TABLE "attendance_resolutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "how" VARCHAR(8) NOT NULL,
    "in_minute" SMALLINT,
    "out_minute" SMALLINT,
    "reason" VARCHAR(500) NOT NULL,
    "batch_id" UUID,
    "resolved_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_resolutions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_resolutions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_resolutions_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "attendance_resolutions_how_check" CHECK ("how" IN ('present', 'absent')),
    CONSTRAINT "attendance_resolutions_minutes_check" CHECK (("in_minute" IS NULL OR "in_minute" BETWEEN 0 AND 1439) AND ("out_minute" IS NULL OR "out_minute" BETWEEN 0 AND 2879)),
    CONSTRAINT "attendance_resolutions_times_check" CHECK ("how" = 'present' OR ("in_minute" IS NULL AND "out_minute" IS NULL))
);
CREATE INDEX "attendance_resolutions_day_idx" ON "attendance_resolutions" ("organization_id", "employee_id", "work_on");
-- History: a resolution is never changed or removed; a later one replaces it.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "attendance_resolutions" FROM app_runtime;
CREATE TRIGGER attendance_resolutions_lock BEFORE INSERT ON "attendance_resolutions" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');

ALTER TABLE "pay_periods" ADD COLUMN "lock_requested_by" UUID, ADD COLUMN "lock_requested_at" TIMESTAMPTZ(3);

CREATE TABLE "industrial_action_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "department_id" UUID,
    "kind" VARCHAR(8) NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "legality" VARCHAR(12) NOT NULL DEFAULT 'undetermined',
    "legality_set_at" TIMESTAMPTZ(3),
    "legality_set_by" UUID,
    "notice" VARCHAR(200) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "industrial_action_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "industrial_action_events_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "industrial_action_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "industrial_action_events_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "industrial_action_events_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "industrial_action_events_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "industrial_action_events_kind_check" CHECK ("kind" IN ('strike', 'lockout', 'layoff')),
    CONSTRAINT "industrial_action_events_legality_check" CHECK ("legality" IN ('legal', 'illegal', 'undetermined')),
    CONSTRAINT "industrial_action_events_status_check" CHECK ("status" IN ('active', 'cancelled')),
    CONSTRAINT "industrial_action_events_dates_check" CHECK ("to_on" >= "from_on" AND "to_on" - "from_on" < 366)
);
CREATE INDEX "industrial_action_events_dates_idx" ON "industrial_action_events" ("organization_id", "location_id", "from_on", "to_on") WHERE "status" = 'active';

ALTER TABLE "attendance_days" DROP CONSTRAINT "attendance_days_status_check";
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_status_check" CHECK ("status" IN ('present', 'half_day', 'absent', 'leave', 'holiday', 'weekly_off', 'missing_in', 'missing_out', 'no_timesheet', 'not_started', 'strike', 'lockout', 'layoff'));

CREATE TABLE "presence_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "notice_version" VARCHAR(40) NOT NULL,
    "given_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),
    CONSTRAINT "presence_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "presence_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "presence_consents_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "presence_consents_dates_check" CHECK ("withdrawn_at" IS NULL OR "withdrawn_at" >= "given_at")
);
-- One consent in force per person at a time.
CREATE UNIQUE INDEX "presence_consents_open_key" ON "presence_consents" ("organization_id", "employee_id") WHERE "withdrawn_at" IS NULL;

CREATE TABLE "presence_signals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "state" VARCHAR(10) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "presence_signals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "presence_signals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "presence_signals_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "presence_signals_state_check" CHECK ("state" IN ('active', 'idle', 'offline')),
    CONSTRAINT "presence_signals_source_check" CHECK ("source" IN ('desktop_app', 'teams', 'dev_fake')),
    CONSTRAINT "presence_signals_key" UNIQUE ("organization_id", "employee_id", "at", "state")
);
CREATE INDEX "presence_signals_day_idx" ON "presence_signals" ("organization_id", "employee_id", "work_on");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "presence_signals" FROM app_runtime;
CREATE TRIGGER presence_signals_lock BEFORE INSERT ON "presence_signals" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');

ALTER TABLE "payroll_feed_rows"
  ADD COLUMN "layoff_days" NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "held_days" NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "late_lop_days" NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Tenant isolation (YX-ORG-14).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_resolutions', 'industrial_action_events', 'presence_consents', 'presence_signals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format('CREATE POLICY portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;
