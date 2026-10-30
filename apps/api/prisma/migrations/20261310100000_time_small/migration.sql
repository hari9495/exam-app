-- Time small items (30 Oct 2026): TIM-26 clone / state template drafts, TIM-28 policy order, TIM-13 kiosk training.

-- TIM-26: when HR last published a draft into this calendar (null: holidays were added one by one).
ALTER TABLE "holiday_calendars" ADD COLUMN "published_at" TIMESTAMPTZ(3);

-- TIM-26: holidays waiting for HR to publish (a calendar cloned to next year, or started from a state template).
-- Employees never see these; publishing copies them into "holidays" and removes the draft.
CREATE TABLE "holiday_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "holiday_on" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "half_day" BOOLEAN NOT NULL DEFAULT false,
    -- A festival copied from last year keeps last year's day and month until HR confirms its date.
    "confirm" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(8) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "holiday_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holiday_drafts_day_key" UNIQUE ("organization_id", "calendar_id", "holiday_on"),
    CONSTRAINT "holiday_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "holiday_drafts_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "holiday_calendars"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "holiday_drafts_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "holiday_drafts_kind_check" CHECK ("kind" IN ('national', 'state', 'festival', 'optional', 'restricted')),
    CONSTRAINT "holiday_drafts_source_check" CHECK ("source" IN ('clone', 'template'))
);

-- TIM-28: the policy order from a date. When a person matches more than one policy, the one higher in the order
-- wins. No row: the most specific rule wins (YX-ORG-18), as before.
CREATE TABLE "leave_policy_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "policy_ids" UUID[] NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_policy_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_policy_orders_from_key" UNIQUE ("organization_id", "valid_from"),
    CONSTRAINT "leave_policy_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_policy_orders_size_check" CHECK (cardinality("policy_ids") BETWEEN 1 AND 200)
);

-- TIM-13: a training session at a location; people mark themselves present at that location's kiosk.
CREATE TABLE "training_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "room" VARCHAR(80),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "training_sessions_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "training_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "training_sessions_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
    CONSTRAINT "training_sessions_time_check" CHECK ("ends_at" > "starts_at" AND "ends_at" - "starts_at" <= INTERVAL '12 hours')
);
CREATE INDEX "training_sessions_loc_idx" ON "training_sessions" ("organization_id", "location_id", "starts_at");

CREATE TABLE "training_attendance" (
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "device_id" UUID,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("organization_id", "session_id", "employee_id"),
    CONSTRAINT "training_attendance_session_fkey" FOREIGN KEY ("organization_id", "session_id") REFERENCES "training_sessions"("organization_id", "id"),
    CONSTRAINT "training_attendance_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['holiday_drafts', 'leave_policy_orders', 'training_sessions', 'training_attendance']
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
-- Orders and training records are corrected by new rows or a state change, never deleted (drafts are removed on publish).
REVOKE DELETE, TRUNCATE ON TABLE "leave_policy_orders", "training_sessions", "training_attendance" FROM app_runtime;
