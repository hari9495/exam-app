-- Step 4 · Time and leave, batch 1 (M02 Part A leave, Part B attendance basics):
--   holidays    calendars per location (national / state / festival / optional / restricted, half days keep the
--               calendar's working half, like the desk business calendar);
--   leave       types (counting rules), policies with dated versions and scoped, dated assignments (P01 YX-ORG-18
--               precedence), an append-only ledger (balance = sum, YX-LV-01), requests with a per-day breakdown;
--   attendance  a dated default shift and weekly offs per location, punches (accepted and refused, YX-AT-23),
--               evaluated days, regularisation requests (through P03);
--   statutory   P07 rule sets as dated, read-only data with no tenant key (YX-STAT-01/10): state Shops and
--               Establishments leave floors (Karnataka, Tamil Nadu) and the Maternity Benefit Act weeks.
-- Every tenant table: organization_id NOT NULL, composite keys, forced RLS with the tenant_isolation policy.

-- ---------------------------------------------------------------------------------------------
-- P07: statutory rule sets (global, read-only to the app).
CREATE TABLE "statutory_rule_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statute" VARCHAR(20) NOT NULL,
    "jurisdiction" VARCHAR(8) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "values" JSONB NOT NULL,
    "source" VARCHAR(500) NOT NULL,
    -- YX-STAT-03 team action: the compliance owner confirms the value with the partner CA firm, then clears it.
    "verify" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_rule_sets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "statutory_rule_sets_version_key" UNIQUE ("statute", "jurisdiction", "version"),
    CONSTRAINT "statutory_rule_sets_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);

-- Floors: per group of leave kinds, the least days a year the law gives (a company may give more, never less);
-- carry: the least the law lets an employee carry forward (a company cap below it is raised to it).
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source") VALUES
  ('IN.SE', 'IN-KA', '1961-v1', '2000-01-01',
   '{"floors":[{"kinds":["earned"],"days":18},{"kinds":["casual"],"days":12},{"kinds":["sick"],"days":12}],"carry":{"earned":30}}',
   'Karnataka Shops and Commercial Establishments Act, 1961, s.15 (leave with wages, sickness and casual leave). Verify before go-live.'),
  ('IN.SE', 'IN-TN', '1947-v1', '2000-01-01',
   '{"floors":[{"kinds":["earned"],"days":12},{"kinds":["casual","sick"],"days":12}],"carry":{"earned":24}}',
   'Tamil Nadu Shops and Establishments Act, 1947, s.14 (privilege leave 12 days; casual or sickness leave 12 days; privilege leave accumulates to 24 days). Verify before go-live.'),
  ('IN.LEAVE', 'IN', '2017-v1', '2017-04-01',
   '{"maternityWeeks":26,"maternityWeeksThirdChild":12,"beforeDeliveryWeeks":8,"eligibilityDaysWorked":80}',
   'Maternity Benefit Act, 1961 as amended by the Maternity Benefit (Amendment) Act, 2017, s.5.');
-- Seeded above before forced RLS (which binds the owner too); the app only reads.
ALTER TABLE "statutory_rule_sets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY read_all ON "statutory_rule_sets" FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "statutory_rule_sets" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Holidays (M02 §A2, L2: the calendar follows the employee's work location).
CREATE TABLE "holiday_calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- NULL: the company calendar for locations without their own.
    "location_id" UUID,
    -- A half-day holiday keeps this half of the working day (as the desk business calendar, founder 8 Oct 2026).
    "half_day_open_half" VARCHAR(6) NOT NULL DEFAULT 'first',
    -- Optional / restricted holidays: an employee chooses up to this many a year (N of M).
    "optional_limit" SMALLINT NOT NULL DEFAULT 2,
    -- E19 / YX-AT-11: a public holiday on a weekly off (starter none).
    "on_weekly_off" VARCHAR(10) NOT NULL DEFAULT 'none',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_calendars_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holiday_calendars_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "holiday_calendars_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "holiday_calendars_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "holiday_calendars_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "holiday_calendars_half_check" CHECK ("half_day_open_half" IN ('first', 'second')),
    CONSTRAINT "holiday_calendars_optional_check" CHECK ("optional_limit" BETWEEN 0 AND 20),
    CONSTRAINT "holiday_calendars_wo_check" CHECK ("on_weekly_off" IN ('none', 'substitute', 'comp_off'))
);
CREATE UNIQUE INDEX "holiday_calendars_location_key" ON "holiday_calendars"("organization_id", "location_id") WHERE "location_id" IS NOT NULL;
CREATE UNIQUE INDEX "holiday_calendars_company_key" ON "holiday_calendars"("organization_id") WHERE "location_id" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "holiday_calendars" FROM app_runtime;

CREATE TABLE "holidays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "holiday_on" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'national',
    "half_day" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holidays_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "holidays_day_key" UNIQUE ("organization_id", "calendar_id", "holiday_on"),
    CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "holidays_calendar_fkey" FOREIGN KEY ("organization_id", "calendar_id") REFERENCES "holiday_calendars"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "holidays_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "holidays_kind_check" CHECK ("kind" IN ('national', 'state', 'festival', 'optional', 'restricted')),
    CONSTRAINT "holidays_half_check" CHECK (NOT ("half_day" AND "kind" IN ('optional', 'restricted')))
);

CREATE TABLE "optional_holiday_choices" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "holiday_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optional_holiday_choices_pkey" PRIMARY KEY ("organization_id", "employee_id", "holiday_id"),
    CONSTRAINT "optional_holiday_choices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "optional_holiday_choices_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "optional_holiday_choices_holiday_fkey" FOREIGN KEY ("organization_id", "holiday_id") REFERENCES "holidays"("organization_id", "id") ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------------------------
-- Leave types: counting rules as checked JSON (sandwich, half days, notice, min / max, certificate, negative limit,
-- HR step); kind drives statutory floors and whether the type carries a balance (YX-LV-14).
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "colour" VARCHAR(10) NOT NULL DEFAULT 'blue',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_types_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "leave_types_code_key" UNIQUE ("organization_id", "code"),
    CONSTRAINT "leave_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_types_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9]{0,7}$'),
    CONSTRAINT "leave_types_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "leave_types_kind_check" CHECK ("kind" IN ('earned', 'casual', 'sick', 'lop', 'comp_off', 'maternity', 'paternity', 'other')),
    CONSTRAINT "leave_types_lop_check" CHECK ("kind" <> 'lop' OR NOT "paid")
);
REVOKE DELETE, TRUNCATE ON TABLE "leave_types" FROM app_runtime;

CREATE TABLE "leave_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_policies_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "leave_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_policies_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "leave_policies" FROM app_runtime;

-- P06: what a policy grants, from a date. A version never changes; a later one supersedes it from its own date.
CREATE TABLE "leave_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "lines" JSONB NOT NULL,
    "note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_policy_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_policy_versions_from_key" UNIQUE ("organization_id", "policy_id", "valid_from"),
    CONSTRAINT "leave_policy_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_policy_versions_policy_fkey" FOREIGN KEY ("organization_id", "policy_id") REFERENCES "leave_policies"("organization_id", "id")
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "leave_policy_versions" FROM app_runtime;

-- Which policy applies, by scope (employee > designation > grade > employment type > department > location >
-- legal entity > company, YX-ORG-18), from a date. Only a future-dated row may be removed.
CREATE TABLE "leave_policy_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_policy_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_policy_assignments_key" UNIQUE ("organization_id", "scope_type", "scope_id", "valid_from"),
    CONSTRAINT "leave_policy_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_policy_assignments_policy_fkey" FOREIGN KEY ("organization_id", "policy_id") REFERENCES "leave_policies"("organization_id", "id"),
    CONSTRAINT "leave_policy_assignments_scope_check" CHECK ("scope_type" IN ('employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'legal_entity', 'tenant'))
);
REVOKE UPDATE, TRUNCATE ON TABLE "leave_policy_assignments" FROM app_runtime;

-- YX-LV-01: the only source of a balance. Append-only; a correction is another entry. period_key makes the jobs
-- idempotent (one accrual per type per month, one lapse per year).
CREATE TABLE "leave_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "entry_on" DATE NOT NULL,
    "kind" VARCHAR(14) NOT NULL,
    "days" NUMERIC(7, 2) NOT NULL,
    "request_id" UUID,
    "period_key" VARCHAR(40),
    "reason" VARCHAR(500) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_ledger_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "leave_ledger_type_fkey" FOREIGN KEY ("organization_id", "leave_type_id") REFERENCES "leave_types"("organization_id", "id"),
    CONSTRAINT "leave_ledger_kind_check" CHECK ("kind" IN ('opening', 'accrual', 'taken', 'cancelled', 'adjustment', 'carry_forward', 'lapse')),
    CONSTRAINT "leave_ledger_days_check" CHECK ("days" <> 0 AND abs("days") <= 400),
    CONSTRAINT "leave_ledger_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "leave_ledger_period_key" ON "leave_ledger"("organization_id", "employee_id", "leave_type_id", "period_key") WHERE "period_key" IS NOT NULL;
CREATE INDEX "leave_ledger_balance_idx" ON "leave_ledger"("organization_id", "employee_id", "leave_type_id", "entry_on");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "leave_ledger" FROM app_runtime;

CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    -- The first day may start at the second half; the last day may end after the first half.
    "from_half" VARCHAR(6) NOT NULL DEFAULT 'full',
    "to_half" VARCHAR(6) NOT NULL DEFAULT 'full',
    "days" NUMERIC(6, 2) NOT NULL,
    "status" VARCHAR(14) NOT NULL DEFAULT 'pending',
    -- Special data for a medical leave type (YX-LV-09): read by the employee and by leave.medical.view (audited).
    "reason" VARCHAR(1000),
    "certificate" VARCHAR(8) NOT NULL DEFAULT 'none',
    "delegate_user_id" UUID,
    "wf_request_id" UUID,
    "cancel_wf_request_id" UUID,
    "raised_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_requests_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "leave_requests_type_fkey" FOREIGN KEY ("organization_id", "leave_type_id") REFERENCES "leave_types"("organization_id", "id"),
    CONSTRAINT "leave_requests_delegate_fkey" FOREIGN KEY ("organization_id", "delegate_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "leave_requests_dates_check" CHECK ("to_on" >= "from_on" AND "to_on" <= "from_on" + 366),
    CONSTRAINT "leave_requests_half_check" CHECK ("from_half" IN ('full', 'second') AND "to_half" IN ('full', 'first') AND ("from_on" < "to_on" OR "from_half" = 'full' OR "to_half" = 'full')),
    CONSTRAINT "leave_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'cancel_pending', 'cancelled')),
    CONSTRAINT "leave_requests_cert_check" CHECK ("certificate" IN ('none', 'pending', 'verified')),
    CONSTRAINT "leave_requests_days_check" CHECK ("days" > 0)
);
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests"("organization_id", "employee_id", "from_on");
REVOKE DELETE, TRUNCATE ON TABLE "leave_requests" FROM app_runtime;

-- The per-day breakdown (M02 data model): what each date counts, for overlap checks, calendars, the desk and
-- attendance. "active" while the request is pending, approved or waiting for its cancellation.
CREATE TABLE "leave_request_days" (
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_on" DATE NOT NULL,
    "part" VARCHAR(6) NOT NULL,
    "portion" NUMERIC(3, 2) NOT NULL,
    "counted_as" VARCHAR(10) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_request_days_pkey" PRIMARY KEY ("organization_id", "request_id", "leave_on"),
    CONSTRAINT "leave_request_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_request_days_request_fkey" FOREIGN KEY ("organization_id", "request_id") REFERENCES "leave_requests"("organization_id", "id"),
    CONSTRAINT "leave_request_days_part_check" CHECK ("part" IN ('full', 'first', 'second')),
    CONSTRAINT "leave_request_days_portion_check" CHECK ("portion" IN (0, 0.5, 1)),
    CONSTRAINT "leave_request_days_counted_check" CHECK ("counted_as" IN ('leave', 'sandwich', 'holiday', 'weekly_off'))
);
CREATE INDEX "leave_request_days_day_idx" ON "leave_request_days"("organization_id", "employee_id", "leave_on") WHERE "active";
REVOKE DELETE, TRUNCATE ON TABLE "leave_request_days" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Attendance basics (M02 §B1–§B4). The default shift and weekly offs of a location, dated (P06). Rosters and
-- shift patterns arrive later and take precedence (Q1: employee override > pattern / roster > location default).
CREATE TABLE "location_attendance_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "shift_name" VARCHAR(60) NOT NULL DEFAULT 'General',
    "shift_start" SMALLINT NOT NULL,
    "shift_end" SMALLINT NOT NULL,
    "grace_minutes" SMALLINT NOT NULL DEFAULT 10,
    "half_day_minutes" SMALLINT NOT NULL DEFAULT 240,
    "full_day_minutes" SMALLINT NOT NULL DEFAULT 480,
    -- Q3: a fixed unpaid break deducted above a worked-hours threshold (default 30 min above 5 h).
    "break_minutes" SMALLINT NOT NULL DEFAULT 30,
    "break_above_minutes" SMALLINT NOT NULL DEFAULT 300,
    -- Q1 location default: [{"weekday":7},{"weekday":6,"nth":[2,4]}] (ISO weekday, nth occurrence in the month).
    "weekly_offs" JSONB NOT NULL DEFAULT '[{"weekday":7}]',
    -- Q6: restricted (inside a geofence or an allowed network) or field (location recorded, not restricted).
    "check_in" VARCHAR(10) NOT NULL DEFAULT 'restricted',
    -- Other locations whose geofence or network also counts (multiple allowed locations).
    "also_allowed" UUID[] NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_attendance_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "location_attendance_rules_key" UNIQUE ("organization_id", "location_id", "valid_from"),
    CONSTRAINT "location_attendance_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "location_attendance_rules_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "location_attendance_rules_minutes_check" CHECK ("shift_start" BETWEEN 0 AND 1439 AND "shift_end" BETWEEN 0 AND 1439 AND "shift_start" <> "shift_end"
      AND "grace_minutes" BETWEEN 0 AND 120 AND "half_day_minutes" BETWEEN 30 AND "full_day_minutes" AND "full_day_minutes" <= 960
      AND "break_minutes" BETWEEN 0 AND 120 AND "break_above_minutes" BETWEEN 0 AND 960),
    CONSTRAINT "location_attendance_rules_check_in_check" CHECK ("check_in" IN ('restricted', 'field'))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "location_attendance_rules" FROM app_runtime;

-- YX-AT-01 / 23: every punch, accepted or refused (a refused attempt is logged with its reason, never silently).
CREATE TABLE "punches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "punched_at" TIMESTAMPTZ(3) NOT NULL,
    -- The working day it belongs to, in the location's time zone (a night shift belongs to the day it started).
    "work_on" DATE NOT NULL,
    "kind" VARCHAR(3) NOT NULL,
    "source" VARCHAR(10) NOT NULL DEFAULT 'web',
    "accepted" BOOLEAN NOT NULL,
    "refusal" VARCHAR(200),
    "lat" NUMERIC(9, 6),
    "lng" NUMERIC(9, 6),
    "accuracy_m" INTEGER,
    "distance_m" INTEGER,
    "verdict" VARCHAR(12) NOT NULL,
    "location_id" UUID,
    "ip" VARCHAR(45),
    "device" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "punches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "punches_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "punches_kind_check" CHECK ("kind" IN ('in', 'out')),
    CONSTRAINT "punches_source_check" CHECK ("source" IN ('web', 'mobile', 'kiosk', 'biometric')),
    CONSTRAINT "punches_verdict_check" CHECK ("verdict" IN ('inside', 'outside', 'network', 'no_fence', 'field', 'coarse', 'no_location')),
    CONSTRAINT "punches_refusal_check" CHECK ("accepted" = ("refusal" IS NULL))
);
CREATE INDEX "punches_day_idx" ON "punches"("organization_id", "employee_id", "work_on", "punched_at");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "punches" FROM app_runtime;

-- The day engine's result (YX-AT-03), recomputed when its inputs change and by the hourly job.
CREATE TABLE "attendance_days" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "status" VARCHAR(14) NOT NULL,
    "leave_part" VARCHAR(6),
    "first_in" TIMESTAMPTZ(3),
    "last_out" TIMESTAMPTZ(3),
    "worked_minutes" INTEGER,
    "late_minutes" INTEGER,
    "regularised" BOOLEAN NOT NULL DEFAULT false,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("organization_id", "employee_id", "work_on"),
    CONSTRAINT "attendance_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_days_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "attendance_days_mode_check" CHECK ("mode" IN ('punch', 'assumed_present', 'timesheet')),
    CONSTRAINT "attendance_days_status_check" CHECK ("status" IN ('present', 'half_day', 'absent', 'leave', 'holiday', 'weekly_off', 'missing_in', 'missing_out', 'no_timesheet', 'not_started'))
);
REVOKE DELETE, TRUNCATE ON TABLE "attendance_days" FROM app_runtime;

-- Regularisation (M02 §B4, Q5) through P03.
CREATE TABLE "attendance_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    -- Local minutes of the day for the corrected check-in / check-out.
    "in_minute" SMALLINT,
    "out_minute" SMALLINT,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "raised_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "attendance_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_requests_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "attendance_requests_kind_check" CHECK ("kind" IN ('missed_in', 'missed_out', 'wrong_time', 'full_day')),
    CONSTRAINT "attendance_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "attendance_requests_minutes_check" CHECK (("in_minute" IS NULL OR "in_minute" BETWEEN 0 AND 1439) AND ("out_minute" IS NULL OR "out_minute" BETWEEN 0 AND 1439)),
    CONSTRAINT "attendance_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
CREATE INDEX "attendance_requests_employee_idx" ON "attendance_requests"("organization_id", "employee_id", "work_on");
REVOKE DELETE, TRUNCATE ON TABLE "attendance_requests" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Permission keys (P02): set-up, HR views in scope, balance adjustment, the HR approval step, Special medical data.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'leave.settings.manage', 'Set up leave types, policies, holiday calendars, shifts and weekly offs, and run year end'),
  (gen_random_uuid(), 'leave.view', 'View leave requests, balances and the team leave calendar of the people in scope'),
  (gen_random_uuid(), 'leave.balance.adjust', 'Adjust leave balances of the people in scope, with a reason'),
  (gen_random_uuid(), 'leave.approve', 'Approve leave and attendance requests at the HR step for the people in scope'),
  (gen_random_uuid(), 'leave.medical.view', 'View medical leave reasons and certificates (Special, every view recorded)'),
  (gen_random_uuid(), 'attendance.view', 'View punches, days and the muster of the people in scope')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('leave.settings.manage', 'leave.view', 'attendance.view')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['holiday_calendars', 'holidays', 'optional_holiday_choices', 'leave_types', 'leave_policies', 'leave_policy_versions', 'leave_policy_assignments', 'leave_ledger', 'leave_requests', 'leave_request_days', 'location_attendance_rules', 'punches', 'attendance_days', 'attendance_requests']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- An outside requester's portal session never reads leave or attendance.
    EXECUTE format('CREATE POLICY portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;
