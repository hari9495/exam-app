-- Time · rosters, devices and field (TIM-05/08/13/14/32/33/34/35/38/40/41/43), additive only:
--   licences     licence types, each person's licences with expiry, and the licences a shift needs (TIM-40);
--   open shifts  shifts offered to eligible people, with bids and a fair award (TIM-35);
--   standby      standby slots and call-outs with a paid minimum (TIM-38);
--   auto-roster  demand per location, shift and weekday, and the runs that draft a week from it (TIM-34);
--   hybrid       each person's planned office / home days (TIM-41; the policy itself is settings);
--   devices      kiosks and employees' phones with approval and revoke, kiosk PINs and face enrolment references,
--                and receipts that make an offline punch sync safe to repeat (TIM-13 / TIM-14);
--   field        location-tracking consent, the location trail (kept for a set number of days) and visits (TIM-32/33);
--   tools        a person's connected calendar / work tools for timesheet suggestions (TIM-43).
-- Every tenant table: organization_id NOT NULL, composite keys, forced RLS with the tenant_isolation policy.

-- Roster entries may now also come from an open shift award, the auto-roster or a call-out move.
ALTER TABLE "roster_entries" DROP CONSTRAINT "roster_entries_source_check";
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_source_check" CHECK ("source" IN ('manual', 'swap', 'open', 'auto', 'callout'));
-- Why a published day was changed inside the notice window (YX-AT-07: a published roster changes only with notice or a reason).
ALTER TABLE "roster_entries" ADD COLUMN "change_reason" VARCHAR(300);

-- ---------------------------------------------------------------------------------------------- licences (TIM-40)
CREATE TABLE "licence_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- Required by law for the work (a boiler attendant, a forklift / crane operator), not only by company policy.
    "legal" BOOLEAN NOT NULL DEFAULT false,
    "remind_days" INTEGER[] NOT NULL DEFAULT ARRAY[60, 30, 7],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "licence_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "licence_types_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "licence_types_code_key" UNIQUE ("organization_id", "code"),
    CONSTRAINT "licence_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "licence_types_remind_check" CHECK (cardinality("remind_days") <= 5 AND 0 < ALL("remind_days") AND 366 > ALL("remind_days"))
);

CREATE TABLE "employee_licences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "licence_type_id" UUID NOT NULL,
    "number" VARCHAR(60),
    "valid_from" DATE NOT NULL,
    -- NULL: does not expire.
    "expires_on" DATE,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    CONSTRAINT "employee_licences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_licences_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "employee_licences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_licences_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_licences_type_fkey" FOREIGN KEY ("organization_id", "licence_type_id") REFERENCES "licence_types"("organization_id", "id"),
    CONSTRAINT "employee_licences_dates_check" CHECK ("expires_on" IS NULL OR "expires_on" >= "valid_from")
);
CREATE INDEX "employee_licences_person_idx" ON "employee_licences"("organization_id", "employee_id", "licence_type_id");

CREATE TABLE "shift_licence_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "licence_type_id" UUID NOT NULL,
    -- NULL: at every location.
    "location_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shift_licence_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shift_licence_requirements_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "shift_id", "licence_type_id", "location_id"),
    CONSTRAINT "shift_licence_requirements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_licence_requirements_shift_fkey" FOREIGN KEY ("organization_id", "shift_id") REFERENCES "shifts"("organization_id", "id"),
    CONSTRAINT "shift_licence_requirements_type_fkey" FOREIGN KEY ("organization_id", "licence_type_id") REFERENCES "licence_types"("organization_id", "id"),
    CONSTRAINT "shift_licence_requirements_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id")
);

-- One reminder per licence and lead time, so the reminder job is safe to re-run.
CREATE TABLE "licence_reminders" (
    "organization_id" UUID NOT NULL,
    "employee_licence_id" UUID NOT NULL,
    "days_before" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "licence_reminders_pkey" PRIMARY KEY ("organization_id", "employee_licence_id", "days_before"),
    CONSTRAINT "licence_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "licence_reminders_licence_fkey" FOREIGN KEY ("organization_id", "employee_licence_id") REFERENCES "employee_licences"("organization_id", "id")
);

-- ---------------------------------------------------------------------------------------------- open shifts (TIM-35)
CREATE TABLE "open_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "licence_type_id" UUID,
    "rule" VARCHAR(13) NOT NULL,
    "status" VARCHAR(9) NOT NULL DEFAULT 'open',
    "closes_at" TIMESTAMPTZ(3),
    "note" VARCHAR(300),
    "awarded_employee_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "open_shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "open_shifts_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "open_shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "open_shifts_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "open_shifts_shift_fkey" FOREIGN KEY ("organization_id", "shift_id") REFERENCES "shifts"("organization_id", "id"),
    CONSTRAINT "open_shifts_licence_fkey" FOREIGN KEY ("organization_id", "licence_type_id") REFERENCES "licence_types"("organization_id", "id"),
    CONSTRAINT "open_shifts_awarded_fkey" FOREIGN KEY ("organization_id", "awarded_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "open_shifts_rule_check" CHECK ("rule" IN ('manager_picks', 'first_come')),
    CONSTRAINT "open_shifts_status_check" CHECK ("status" IN ('open', 'awarded', 'cancelled')),
    CONSTRAINT "open_shifts_awarded_check" CHECK (("status" = 'awarded') = ("awarded_employee_id" IS NOT NULL))
);
CREATE INDEX "open_shifts_day_idx" ON "open_shifts"("organization_id", "location_id", "work_on");

CREATE TABLE "open_shift_bids" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "open_shift_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" VARCHAR(9) NOT NULL DEFAULT 'waiting',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "open_shift_bids_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "open_shift_bids_once_key" UNIQUE ("organization_id", "open_shift_id", "employee_id"),
    CONSTRAINT "open_shift_bids_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "open_shift_bids_shift_fkey" FOREIGN KEY ("organization_id", "open_shift_id") REFERENCES "open_shifts"("organization_id", "id"),
    CONSTRAINT "open_shift_bids_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "open_shift_bids_status_check" CHECK ("status" IN ('waiting', 'won', 'lost', 'withdrawn'))
);

-- ---------------------------------------------------------------------------------------------- standby (TIM-38)
CREATE TABLE "standby_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(9) NOT NULL DEFAULT 'planned',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standby_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "standby_slots_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "standby_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "standby_slots_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "standby_slots_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "standby_slots_span_check" CHECK ("ends_at" > "starts_at" AND "ends_at" <= "starts_at" + interval '24 hours'),
    CONSTRAINT "standby_slots_status_check" CHECK ("status" IN ('planned', 'cancelled'))
);
CREATE INDEX "standby_slots_time_idx" ON "standby_slots"("organization_id", "starts_at");

CREATE TABLE "call_outs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "standby_slot_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,
    "worked_minutes" INTEGER NOT NULL,
    -- At least the company's call-out minimum (standby.call_out_minimum_hours), whatever was worked.
    "paid_minutes" INTEGER NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "client_ref" UUID NOT NULL,
    "logged_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "call_outs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "call_outs_client_ref_key" UNIQUE ("organization_id", "client_ref"),
    CONSTRAINT "call_outs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "call_outs_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "call_outs_slot_fkey" FOREIGN KEY ("organization_id", "standby_slot_id") REFERENCES "standby_slots"("organization_id", "id"),
    CONSTRAINT "call_outs_span_check" CHECK ("ended_at" > "started_at" AND "paid_minutes" >= "worked_minutes" AND "worked_minutes" > 0)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "call_outs" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- auto-roster (TIM-34)
CREATE TABLE "roster_demands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    -- ISO weekday, 1 = Monday.
    "weekday" SMALLINT NOT NULL,
    "need" SMALLINT NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roster_demands_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roster_demands_key" UNIQUE ("organization_id", "location_id", "shift_id", "weekday"),
    CONSTRAINT "roster_demands_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_demands_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "roster_demands_shift_fkey" FOREIGN KEY ("organization_id", "shift_id") REFERENCES "shifts"("organization_id", "id"),
    CONSTRAINT "roster_demands_values_check" CHECK ("weekday" BETWEEN 1 AND 7 AND "need" BETWEEN 0 AND 500)
);

CREATE TABLE "auto_roster_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "week" DATE NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'running',
    "result" JSONB,
    "error" VARCHAR(500),
    "started_by" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    CONSTRAINT "auto_roster_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auto_roster_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "auto_roster_runs_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "auto_roster_runs_status_check" CHECK ("status" IN ('running', 'done', 'failed'))
);
-- Only one run of a location's week at a time (two planners pressing Generate together).
CREATE UNIQUE INDEX "auto_roster_runs_one_running" ON "auto_roster_runs"("organization_id", "location_id", "week") WHERE "status" = 'running';

-- ---------------------------------------------------------------------------------------------- hybrid (TIM-41)
CREATE TABLE "hybrid_plan_days" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "place" VARCHAR(6) NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hybrid_plan_days_pkey" PRIMARY KEY ("organization_id", "employee_id", "work_on"),
    CONSTRAINT "hybrid_plan_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hybrid_plan_days_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "hybrid_plan_days_place_check" CHECK ("place" IN ('office', 'home'))
);

-- ---------------------------------------------------------------------------------------------- devices (TIM-13 / TIM-14)
CREATE TABLE "time_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(6) NOT NULL,
    -- Kiosks: a code, the place and its location; phones: the employee.
    "code" VARCHAR(30),
    "place" VARCHAR(100),
    "location_id" UUID,
    "mode" VARCHAR(10),
    "employee_id" UUID,
    "model" VARCHAR(100),
    "app_version" VARCHAR(20),
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    -- SHA-256 of the device's bearer secret (never the secret itself), of a kiosk's one-time set-up code, and of a
    -- phone's install id.
    "token_hash" CHAR(64),
    "enrol_code_hash" CHAR(64),
    "enrol_expires_at" TIMESTAMPTZ(3),
    "install_hash" CHAR(64),
    "request_reason" VARCHAR(300),
    "replaces_lost" BOOLEAN NOT NULL DEFAULT false,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" VARCHAR(300),
    "last_seen_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "time_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "time_devices_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "time_devices_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "time_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "time_devices_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "time_devices_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "time_devices_kind_check" CHECK (("kind" = 'kiosk' AND "location_id" IS NOT NULL AND "code" IS NOT NULL AND "employee_id" IS NULL) OR ("kind" = 'phone' AND "employee_id" IS NOT NULL)),
    CONSTRAINT "time_devices_mode_check" CHECK ("mode" IS NULL OR "mode" IN ('attendance', 'visitor')),
    CONSTRAINT "time_devices_status_check" CHECK ("status" IN ('pending', 'active', 'rejected', 'revoked', 'lost'))
);
CREATE UNIQUE INDEX "time_devices_kiosk_code_key" ON "time_devices"("organization_id", "code") WHERE "kind" = 'kiosk' AND "status" IN ('pending', 'active');
-- One approved phone per person; one waiting request per person.
CREATE UNIQUE INDEX "time_devices_one_phone" ON "time_devices"("organization_id", "employee_id") WHERE "kind" = 'phone' AND "status" = 'active';
CREATE UNIQUE INDEX "time_devices_one_request" ON "time_devices"("organization_id", "employee_id") WHERE "kind" = 'phone' AND "status" = 'pending';

CREATE TABLE "kiosk_credentials" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    -- argon2id of the PIN (never the PIN).
    "pin_hash" VARCHAR(200),
    "failed" SMALLINT NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    -- Rotating this voids every printed ID-card QR of the person.
    "qr_nonce" UUID NOT NULL DEFAULT gen_random_uuid(),
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kiosk_credentials_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "kiosk_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "kiosk_credentials_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);

-- Face match is a provider (to decide); YukthiX keeps only the provider's reference and the consent, never an image.
CREATE TABLE "kiosk_face_enrolments" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "provider_ref" VARCHAR(200),
    "consented_at" TIMESTAMPTZ(3) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    CONSTRAINT "kiosk_face_enrolments_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "kiosk_face_enrolments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "kiosk_face_enrolments_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);

-- A device's punch, once: the device's own id for it (made when it was taken, even offline) and what came of it.
CREATE TABLE "device_punch_receipts" (
    "organization_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "client_ref" UUID NOT NULL,
    "punch_id" UUID,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "device_punch_receipts_pkey" PRIMARY KEY ("organization_id", "device_id", "client_ref"),
    CONSTRAINT "device_punch_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "device_punch_receipts_device_fkey" FOREIGN KEY ("organization_id", "device_id") REFERENCES "time_devices"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "device_punch_receipts" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- field force (TIM-32 / TIM-33)
-- DPDP Act 2023 s.6: consent for location tracking is given for one purpose, with the notice version, and may be withdrawn.
CREATE TABLE "field_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "notice_version" VARCHAR(20) NOT NULL,
    "given_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),
    CONSTRAINT "field_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "field_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "field_consents_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);
CREATE UNIQUE INDEX "field_consents_one_open" ON "field_consents"("organization_id", "employee_id") WHERE "withdrawn_at" IS NULL;

-- The trail: kept field.trail_retention_days, then deleted by the retention job.
CREATE TABLE "location_pings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "lat" DECIMAL(9, 6) NOT NULL,
    "lng" DECIMAL(9, 6) NOT NULL,
    "accuracy_m" INTEGER NOT NULL,
    -- Integrity signals (never a penalty by themselves): mock location reported by the phone, an impossible jump.
    "flags" VARCHAR(20)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(20)[],
    "client_ref" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "location_pings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_pings_client_ref_key" UNIQUE ("organization_id", "employee_id", "client_ref"),
    CONSTRAINT "location_pings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "location_pings_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "location_pings_values_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180 AND "accuracy_m" >= 0)
);
CREATE INDEX "location_pings_person_idx" ON "location_pings"("organization_id", "employee_id", "at");
CREATE INDEX "location_pings_age_idx" ON "location_pings"("organization_id", "work_on");

CREATE TABLE "field_visits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "place" VARCHAR(150) NOT NULL,
    "lat" DECIMAL(9, 6),
    "lng" DECIMAL(9, 6),
    "radius_m" INTEGER NOT NULL DEFAULT 200,
    -- Minutes after midnight (the location's time zone); NULL: any time that day.
    "planned_minute" SMALLINT,
    "planned" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(8) NOT NULL DEFAULT 'upcoming',
    "check_in_at" TIMESTAMPTZ(3),
    "check_in_lat" DECIMAL(9, 6),
    "check_in_lng" DECIMAL(9, 6),
    "check_in_accuracy_m" INTEGER,
    "inside" BOOLEAN,
    "check_out_at" TIMESTAMPTZ(3),
    "outcome" VARCHAR(40),
    "note" VARCHAR(500),
    "client_ref" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "field_visits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "field_visits_client_ref_key" UNIQUE ("organization_id", "employee_id", "client_ref"),
    CONSTRAINT "field_visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "field_visits_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "field_visits_status_check" CHECK ("status" IN ('upcoming', 'on_site', 'done', 'missed')),
    CONSTRAINT "field_visits_values_check" CHECK ("radius_m" BETWEEN 25 AND 5000 AND ("planned_minute" IS NULL OR "planned_minute" BETWEEN 0 AND 1439))
);
CREATE INDEX "field_visits_day_idx" ON "field_visits"("organization_id", "employee_id", "work_on");

-- ---------------------------------------------------------------------------------------------- work tools (TIM-43)
CREATE TABLE "tool_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "account_label" VARCHAR(150),
    "status" VARCHAR(9) NOT NULL DEFAULT 'connected',
    "connected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "tool_connections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tool_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tool_connections_status_check" CHECK ("status" IN ('connected', 'revoked'))
);
CREATE UNIQUE INDEX "tool_connections_one_live" ON "tool_connections"("organization_id", "user_id", "provider") WHERE "status" = 'connected';

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['licence_types', 'employee_licences', 'shift_licence_requirements', 'licence_reminders', 'open_shifts', 'open_shift_bids', 'standby_slots', 'call_outs', 'roster_demands', 'auto_roster_runs', 'hybrid_plan_days', 'time_devices', 'kiosk_credentials', 'kiosk_face_enrolments', 'device_punch_receipts', 'field_consents', 'location_pings', 'field_visits', 'tool_connections']
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
