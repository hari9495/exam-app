-- Step 4 · Time and leave, batch 2 (M02 Part B2–B7, P08 locks):
--   shifts      shift definitions with dated versions (night shifts across midnight, breaks, grace, thresholds),
--               weekly or N-day rotating patterns assigned by scope from a date (Q1 / Q2), roster entries (drafts and
--               published overrides), swaps through P03, the women's night-work guard (OSH Code, YX-AT-25: consents
--               and the establishment's safeguards);
--   overtime    OT rules by scope and date (Q7), OT requests through P03, comp-off credits into the leave ledger;
--   timesheets  simple projects, weekly timesheets with lines, through P03 (§B7, D1 Timesheet mode);
--   locks       attendance periods per legal entity and month (P08), enforced in the services and here by trigger;
--   payroll     the per-person feed, frozen when the period locks (§B6);
--   leave       maternity details on requests and HR eligibility overrides (founder decision 9 Oct 2026).
-- Every tenant table: organization_id NOT NULL, composite keys, forced RLS with the tenant_isolation policy.

-- ---------------------------------------------------------------------------------------------
-- P07: OT limits (Factories Act / OSH Code), the women's night-work window and safeguards (OSH Code), and the
-- muster and leave register formats per state (IN.REGISTERS, YX-STAT-16). Values are flagged verify (YX-STAT-03).
ALTER TABLE "statutory_rule_sets" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "statutory_rule_sets" DISABLE ROW LEVEL SECURITY;
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source") VALUES
  ('IN.FACTORIES', 'IN', '2025-osh-v1', '2025-11-21',
   '{"dailyMaxWorkMinutes":600,"quarterlyOtMinutes":7500,"rate":2}',
   'OSH Code 2020 s.25-27 with the Factories Act 1948 s.51, s.54, s.59, s.64 values as transitional state rules (overtime at twice the ordinary rate; at most 10 hours of work a day; quarterly overtime cap per state rules, 125 hours used here). Verify per state before go-live.'),
  ('IN.OSH', 'IN', '2025-v1', '2025-11-21',
   '{"nightWindow":{"start":1140,"end":360},"safeguards":[{"item":"transport","label":"Transport pick-up and drop"},{"item":"security","label":"Security and lighting"},{"item":"rest_room","label":"Rest room and toilets"},{"item":"group","label":"At least the minimum number of women on the shift"},{"item":"posh","label":"A working POSH internal committee"}]}',
   'Occupational Safety, Health and Working Conditions Code, 2020, s.43 (women at night between 7 pm and 6 am with consent and safeguards). Verify the state rules before go-live.'),
  ('IN.REGISTERS', 'IN-KA', '2025-v1', '2025-11-21',
   '{"registers":[{"type":"muster","title":"Register of attendance (muster roll)","form":"Karnataka Shops and Commercial Establishments Rules, register of employment","columns":[{"key":"sl","label":"Sl. no."},{"key":"code","label":"Employee code"},{"key":"name","label":"Name"},{"key":"designation","label":"Designation"},{"key":"days","label":"Day by day"},{"key":"present","label":"Days present"},{"key":"leave","label":"Days on leave"},{"key":"absent","label":"Days absent"},{"key":"ot","label":"Overtime hours"}]},{"type":"leave","title":"Register of leave","form":"Karnataka Shops and Commercial Establishments Rules, register of leave","columns":[{"key":"sl","label":"Sl. no."},{"key":"code","label":"Employee code"},{"key":"name","label":"Name"},{"key":"type","label":"Leave"},{"key":"opening","label":"Balance at the start"},{"key":"credited","label":"Credited"},{"key":"taken","label":"Taken"},{"key":"dates","label":"Dates taken"},{"key":"closing","label":"Balance at the end"}]}]}',
   'Karnataka Shops and Commercial Establishments Act, 1961 and Rules; OSH Code unified register formats where notified. Verify the form numbers before go-live.'),
  ('IN.REGISTERS', 'IN-TN', '2025-v1', '2025-11-21',
   '{"registers":[{"type":"muster","title":"Register of attendance (muster roll)","form":"Tamil Nadu Shops and Establishments Rules, register of employment","columns":[{"key":"sl","label":"Sl. no."},{"key":"code","label":"Employee code"},{"key":"name","label":"Name"},{"key":"designation","label":"Designation"},{"key":"days","label":"Day by day"},{"key":"present","label":"Days present"},{"key":"leave","label":"Days on leave"},{"key":"absent","label":"Days absent"},{"key":"ot","label":"Overtime hours"}]},{"type":"leave","title":"Register of leave","form":"Tamil Nadu Shops and Establishments Rules, register of leave","columns":[{"key":"sl","label":"Sl. no."},{"key":"code","label":"Employee code"},{"key":"name","label":"Name"},{"key":"type","label":"Leave"},{"key":"opening","label":"Balance at the start"},{"key":"credited","label":"Credited"},{"key":"taken","label":"Taken"},{"key":"dates","label":"Dates taken"},{"key":"closing","label":"Balance at the end"}]}]}',
   'Tamil Nadu Shops and Establishments Act, 1947 and Rules; OSH Code unified register formats where notified. Verify the form numbers before go-live.');
ALTER TABLE "statutory_rule_sets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------------
-- Shifts (§B2, Q3): the name stays; the times are dated versions (P06), never changed once in force.
CREATE TABLE "shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "colour" VARCHAR(10) NOT NULL DEFAULT 'blue',
    -- Counts for the night-shift allowance (payroll feed). The women's guard uses the legal window, not this flag.
    "night" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shifts_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "shifts_code_key" UNIQUE ("organization_id", "code"),
    CONSTRAINT "shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shifts_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9]{0,5}$'),
    CONSTRAINT "shifts_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "shifts_colour_check" CHECK ("colour" IN ('blue', 'green', 'teal', 'purple', 'orange', 'pink', 'grey', 'red'))
);
REVOKE DELETE, TRUNCATE ON TABLE "shifts" FROM app_runtime;

CREATE TABLE "shift_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    -- Local minutes of the day; an end before the start crosses midnight (attributed to the start date).
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "grace_minutes" SMALLINT NOT NULL DEFAULT 10,
    "half_day_minutes" SMALLINT NOT NULL DEFAULT 240,
    "full_day_minutes" SMALLINT NOT NULL DEFAULT 480,
    "break_minutes" SMALLINT NOT NULL DEFAULT 30,
    "break_above_minutes" SMALLINT NOT NULL DEFAULT 300,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shift_versions_key" UNIQUE ("organization_id", "shift_id", "valid_from"),
    CONSTRAINT "shift_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_versions_shift_fkey" FOREIGN KEY ("organization_id", "shift_id") REFERENCES "shifts"("organization_id", "id"),
    CONSTRAINT "shift_versions_minutes_check" CHECK ("start_minute" BETWEEN 0 AND 1439 AND "end_minute" BETWEEN 0 AND 1439 AND "start_minute" <> "end_minute"
      AND "grace_minutes" BETWEEN 0 AND 120 AND "half_day_minutes" BETWEEN 30 AND "full_day_minutes" AND "full_day_minutes" <= 960
      AND "break_minutes" BETWEEN 0 AND 120 AND "break_above_minutes" BETWEEN 0 AND 960)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "shift_versions" FROM app_runtime;

-- Q2: a weekly repeat (7 cells from Monday) or an N-day cycle from the assignment's date; a cell is a shift or off.
CREATE TABLE "shift_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" VARCHAR(6) NOT NULL,
    "cycle" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_patterns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shift_patterns_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "shift_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_patterns_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "shift_patterns_kind_check" CHECK ("kind" IN ('weekly', 'cycle')),
    CONSTRAINT "shift_patterns_cycle_check" CHECK (jsonb_typeof("cycle") = 'array' AND jsonb_array_length("cycle") BETWEEN 1 AND 56
      AND ("kind" <> 'weekly' OR jsonb_array_length("cycle") = 7))
);
-- The cycle never changes once made (people are rostered from it); a new pattern replaces it.
CREATE FUNCTION shift_patterns_fixed_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."cycle" IS DISTINCT FROM OLD."cycle" OR NEW."kind" IS DISTINCT FROM OLD."kind" THEN
    RAISE EXCEPTION 'A pattern''s days never change; make a new pattern';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shift_patterns_fixed_cycle BEFORE UPDATE ON "shift_patterns" FOR EACH ROW EXECUTE FUNCTION shift_patterns_fixed_cycle();
REVOKE DELETE, TRUNCATE ON TABLE "shift_patterns" FROM app_runtime;

-- Who follows a pattern, by scope (employee > department > location > legal entity > company, YX-ORG-18) from a
-- date; offset_days shifts an N-day cycle (crews A / B / C on one 3-shift rotation). Only a future row may be removed.
CREATE TABLE "shift_pattern_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pattern_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "offset_days" SMALLINT NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_pattern_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shift_pattern_assignments_key" UNIQUE ("organization_id", "scope_type", "scope_id", "valid_from"),
    CONSTRAINT "shift_pattern_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_pattern_assignments_pattern_fkey" FOREIGN KEY ("organization_id", "pattern_id") REFERENCES "shift_patterns"("organization_id", "id"),
    CONSTRAINT "shift_pattern_assignments_scope_check" CHECK ("scope_type" IN ('employee', 'department', 'location', 'legal_entity', 'tenant')),
    CONSTRAINT "shift_pattern_assignments_offset_check" CHECK ("offset_days" BETWEEN 0 AND 55)
);
REVOKE UPDATE, TRUNCATE ON TABLE "shift_pattern_assignments" FROM app_runtime;

-- The roster (§B2, YX-AT-07): an override per person and date on top of the pattern. "published" holds what is in
-- force (a shift, or a weekly off); "draft" holds the planner's unpublished change: 'off', 'pattern' (go back to the
-- pattern) or a shift id. Employees and the day engine see only the published value.
CREATE TABLE "roster_entries" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "shift_id" UUID,
    "is_off" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "draft" VARCHAR(40),
    "source" VARCHAR(8) NOT NULL DEFAULT 'manual',
    "published_at" TIMESTAMPTZ(3),
    "published_by" UUID,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("organization_id", "employee_id", "work_on"),
    CONSTRAINT "roster_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_entries_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "roster_entries_shift_fkey" FOREIGN KEY ("organization_id", "shift_id") REFERENCES "shifts"("organization_id", "id"),
    CONSTRAINT "roster_entries_published_check" CHECK (NOT "published" OR ("is_off" = ("shift_id" IS NULL))),
    CONSTRAINT "roster_entries_draft_check" CHECK ("draft" IS NULL OR "draft" IN ('off', 'pattern') OR "draft" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    CONSTRAINT "roster_entries_source_check" CHECK ("source" IN ('manual', 'swap'))
);
CREATE INDEX "roster_entries_day_idx" ON "roster_entries"("organization_id", "work_on");

-- Swap (§B4): the colleague agrees, then the manager approves (P03); the roster changes once, on approval.
CREATE TABLE "shift_swap_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "colleague_employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "my_shift_id" UUID,
    "their_shift_id" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "raised_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shift_swap_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "shift_swap_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shift_swap_requests_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "shift_swap_requests_colleague_fkey" FOREIGN KEY ("organization_id", "colleague_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "shift_swap_requests_people_check" CHECK ("employee_id" <> "colleague_employee_id"),
    CONSTRAINT "shift_swap_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "shift_swap_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
REVOKE DELETE, TRUNCATE ON TABLE "shift_swap_requests" FROM app_runtime;

-- YX-AT-25 / 26: a woman's written consent to night work at an establishment (recorded by HR; the P05 document comes
-- later), and the establishment's safeguards, each attested with a review date. Both append-only; withdrawal is a date.
CREATE TABLE "night_work_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "given_on" DATE NOT NULL,
    "withdrawn_on" DATE,
    "reference" VARCHAR(200) NOT NULL,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "night_work_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "night_work_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "night_work_consents_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "night_work_consents_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "night_work_consents_dates_check" CHECK ("withdrawn_on" IS NULL OR "withdrawn_on" >= "given_on"),
    CONSTRAINT "night_work_consents_reference_check" CHECK (char_length(btrim("reference")) BETWEEN 1 AND 200)
);
-- Only the withdrawal date may be set, once.
CREATE FUNCTION night_work_consents_withdraw_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."withdrawn_on" IS NOT NULL OR (to_jsonb(NEW) - 'withdrawn_on') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawn_on') THEN
    RAISE EXCEPTION 'A night-work consent is only ever withdrawn, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER night_work_consents_withdraw_once BEFORE UPDATE ON "night_work_consents" FOR EACH ROW EXECUTE FUNCTION night_work_consents_withdraw_once();
REVOKE DELETE, TRUNCATE ON TABLE "night_work_consents" FROM app_runtime;

CREATE TABLE "night_work_safeguards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "item" VARCHAR(30) NOT NULL,
    "attested_on" DATE NOT NULL,
    "review_due" DATE NOT NULL,
    "note" VARCHAR(300) NOT NULL,
    "attested_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "night_work_safeguards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "night_work_safeguards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "night_work_safeguards_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "night_work_safeguards_dates_check" CHECK ("review_due" > "attested_on" AND "review_due" <= "attested_on" + 400),
    CONSTRAINT "night_work_safeguards_note_check" CHECK (char_length(btrim("note")) BETWEEN 1 AND 300)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "night_work_safeguards" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Overtime (Q7, YX-AT-04): company rules by scope and date; never below the P07 limits, which cap what is paid.
CREATE TABLE "overtime_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "min_minutes" SMALLINT NOT NULL DEFAULT 30,
    "round_minutes" SMALLINT NOT NULL DEFAULT 15,
    "daily_cap_minutes" SMALLINT,
    "rate_normal" NUMERIC(4, 2) NOT NULL DEFAULT 2,
    "rate_weekly_off" NUMERIC(4, 2) NOT NULL DEFAULT 2,
    "rate_holiday" NUMERIC(4, 2) NOT NULL DEFAULT 2,
    "needs_approval" BOOLEAN NOT NULL DEFAULT true,
    -- Paid in payroll, or credited as comp-off (a half day from comp_off_half_minutes, a full day from comp_off_full_minutes).
    "settle" VARCHAR(8) NOT NULL DEFAULT 'pay',
    "comp_off_half_minutes" SMALLINT NOT NULL DEFAULT 240,
    "comp_off_full_minutes" SMALLINT NOT NULL DEFAULT 480,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "overtime_rules_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "overtime_rules_key" UNIQUE ("organization_id", "scope_type", "scope_id", "valid_from"),
    CONSTRAINT "overtime_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "overtime_rules_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "overtime_rules_scope_check" CHECK ("scope_type" IN ('employee', 'designation', 'grade', 'employment_type', 'department', 'location', 'legal_entity', 'tenant')),
    CONSTRAINT "overtime_rules_values_check" CHECK ("min_minutes" BETWEEN 0 AND 240 AND "round_minutes" IN (1, 5, 10, 15, 30, 60)
      AND ("daily_cap_minutes" IS NULL OR "daily_cap_minutes" BETWEEN 15 AND 720)
      AND "rate_normal" BETWEEN 1 AND 4 AND "rate_weekly_off" BETWEEN 1 AND 4 AND "rate_holiday" BETWEEN 1 AND 4
      AND "comp_off_half_minutes" BETWEEN 60 AND "comp_off_full_minutes" AND "comp_off_full_minutes" <= 720),
    CONSTRAINT "overtime_rules_settle_check" CHECK ("settle" IN ('pay', 'comp_off'))
);
REVOKE UPDATE, TRUNCATE ON TABLE "overtime_rules" FROM app_runtime;

-- An OT claim for one worked day, with the maths at the time it was raised (category, eligible, payable, over the cap).
CREATE TABLE "overtime_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "rule_id" UUID NOT NULL,
    "category" VARCHAR(10) NOT NULL,
    "scheduled_minutes" SMALLINT NOT NULL,
    "worked_minutes" SMALLINT NOT NULL,
    "eligible_minutes" SMALLINT NOT NULL,
    "payable_minutes" SMALLINT NOT NULL,
    "over_cap_minutes" SMALLINT NOT NULL DEFAULT 0,
    "rate" NUMERIC(4, 2) NOT NULL,
    "settle" VARCHAR(8) NOT NULL,
    "comp_off_days" NUMERIC(3, 1) NOT NULL DEFAULT 0,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "override_reason" VARCHAR(500),
    "overridden_by" UUID,
    "wf_request_id" UUID,
    "raised_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "overtime_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "overtime_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "overtime_requests_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "overtime_requests_rule_fkey" FOREIGN KEY ("organization_id", "rule_id") REFERENCES "overtime_rules"("organization_id", "id"),
    CONSTRAINT "overtime_requests_category_check" CHECK ("category" IN ('normal', 'weekly_off', 'holiday')),
    CONSTRAINT "overtime_requests_minutes_check" CHECK ("eligible_minutes" > 0 AND "payable_minutes" >= 0 AND "over_cap_minutes" >= 0 AND "payable_minutes" + "over_cap_minutes" = "eligible_minutes"),
    CONSTRAINT "overtime_requests_settle_check" CHECK ("settle" IN ('pay', 'comp_off')),
    CONSTRAINT "overtime_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "overtime_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
    CONSTRAINT "overtime_requests_override_check" CHECK (("override_reason" IS NULL) = ("overridden_by" IS NULL))
);
CREATE UNIQUE INDEX "overtime_requests_day_key" ON "overtime_requests"("organization_id", "employee_id", "work_on") WHERE "status" IN ('pending', 'approved');
REVOKE DELETE, TRUNCATE ON TABLE "overtime_requests" FROM app_runtime;

-- A comp-off credit from approved OT is a ledger entry of its own kind (YX-LV-01).
ALTER TABLE "leave_ledger" DROP CONSTRAINT "leave_ledger_kind_check";
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_kind_check" CHECK ("kind" IN ('opening', 'accrual', 'taken', 'cancelled', 'adjustment', 'carry_forward', 'lapse', 'comp_off'));

-- ---------------------------------------------------------------------------------------------
-- Timesheets (§B7, basic): simple projects with activities; a week per person, lines of hours per day.
CREATE TABLE "timesheet_projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- D4: the project manager approves (else the employee's manager).
    "manager_user_id" UUID,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "activities" TEXT[] NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_projects_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "timesheet_projects_code_key" UNIQUE ("organization_id", "code"),
    CONSTRAINT "timesheet_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timesheet_projects_manager_fkey" FOREIGN KEY ("organization_id", "manager_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "timesheet_projects_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9-]{0,11}$'),
    CONSTRAINT "timesheet_projects_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "timesheet_projects_activities_check" CHECK (cardinality("activities") <= 20)
);
REVOKE DELETE, TRUNCATE ON TABLE "timesheet_projects" FROM app_runtime;

CREATE TABLE "timesheets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "total_minutes" INTEGER NOT NULL DEFAULT 0,
    "wf_request_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheets_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "timesheets_week_key" UNIQUE ("organization_id", "employee_id", "week_start"),
    CONSTRAINT "timesheets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timesheets_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "timesheets_monday_check" CHECK (extract(isodow FROM "week_start") = 1),
    CONSTRAINT "timesheets_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'rejected')),
    CONSTRAINT "timesheets_total_check" CHECK ("total_minutes" BETWEEN 0 AND 10080)
);
REVOKE DELETE, TRUNCATE ON TABLE "timesheets" FROM app_runtime;

CREATE TABLE "timesheet_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "activity" VARCHAR(60),
    "billable" BOOLEAN NOT NULL DEFAULT false,
    -- Minutes for Monday … Sunday.
    "minutes" SMALLINT[] NOT NULL,
    "note" VARCHAR(200),

    CONSTRAINT "timesheet_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timesheet_lines_sheet_fkey" FOREIGN KEY ("organization_id", "timesheet_id") REFERENCES "timesheets"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "timesheet_lines_project_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "timesheet_projects"("organization_id", "id"),
    CONSTRAINT "timesheet_lines_minutes_check" CHECK (cardinality("minutes") = 7 AND 0 <= ALL("minutes") AND 1440 >= ALL("minutes"))
);
CREATE INDEX "timesheet_lines_sheet_idx" ON "timesheet_lines"("organization_id", "timesheet_id");

-- ---------------------------------------------------------------------------------------------
-- P08 attendance periods per legal entity and month. Locked dates refuse attendance, leave days, fixes, OT, rosters
-- and timesheets, in the services and by the trigger below. Lock / unlock history is in the audit log.
CREATE TABLE "period_locks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "period_type" VARCHAR(12) NOT NULL DEFAULT 'attendance',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "stage" VARCHAR(8) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(500),

    CONSTRAINT "period_locks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "period_locks_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "period_locks_key" UNIQUE ("organization_id", "legal_entity_id", "period_type", "period_start"),
    CONSTRAINT "period_locks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "period_locks_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "period_locks_type_check" CHECK ("period_type" IN ('attendance')),
    CONSTRAINT "period_locks_stage_check" CHECK ("stage" IN ('open', 'locked')),
    CONSTRAINT "period_locks_month_check" CHECK (extract(day FROM "period_start") = 1 AND "period_end" = ("period_start" + interval '1 month' - interval '1 day')::date)
);
REVOKE DELETE, TRUNCATE ON TABLE "period_locks" FROM app_runtime;

/** Is this employee's date inside a locked attendance period of the legal entity they belonged to on that date? */
CREATE FUNCTION yx_time_locked(p_org UUID, p_employee UUID, p_on DATE) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM period_locks pl
    JOIN employee_assignments a ON a.organization_id = pl.organization_id AND a.employee_id = p_employee AND a.superseded_at IS NULL
      AND p_on <@ daterange(a.valid_from, a.valid_to, '[]') AND a.legal_entity_id = pl.legal_entity_id
    WHERE pl.organization_id = p_org AND pl.period_type = 'attendance' AND pl.stage = 'locked' AND p_on BETWEEN pl.period_start AND pl.period_end)
$$;

-- TG_ARGV[0]: the date column. (A timesheet week may straddle a lock: the service checks its locked days.)
CREATE FUNCTION yx_time_lock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r jsonb;
  d date;
BEGIN
  FOREACH r IN ARRAY (CASE TG_OP WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)] WHEN 'DELETE' THEN ARRAY[to_jsonb(OLD)] ELSE ARRAY[to_jsonb(OLD), to_jsonb(NEW)] END) LOOP
    d := (r ->> TG_ARGV[0])::date;
    IF yx_time_locked((r ->> 'organization_id')::uuid, (r ->> 'employee_id')::uuid, d) THEN
      RAISE EXCEPTION 'YX_PERIOD_LOCKED: % is in a locked attendance period', d USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER punches_lock BEFORE INSERT OR UPDATE OR DELETE ON "punches" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');
CREATE TRIGGER attendance_days_lock BEFORE INSERT OR UPDATE OR DELETE ON "attendance_days" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');
CREATE TRIGGER attendance_requests_lock BEFORE INSERT OR UPDATE ON "attendance_requests" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');
CREATE TRIGGER leave_request_days_lock BEFORE INSERT OR UPDATE OR DELETE ON "leave_request_days" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('leave_on');
CREATE TRIGGER roster_entries_lock BEFORE INSERT OR UPDATE OR DELETE ON "roster_entries" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');
CREATE TRIGGER overtime_requests_lock BEFORE INSERT OR UPDATE ON "overtime_requests" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');
CREATE TRIGGER shift_swap_requests_lock BEFORE INSERT OR UPDATE ON "shift_swap_requests" FOR EACH ROW EXECUTE FUNCTION yx_time_lock_guard('work_on');

-- The day engine records the shift it judged the day by (registers, night-shift counts).
ALTER TABLE "attendance_days" ADD COLUMN "shift_id" UUID;

-- §B6 payroll feed: per person and period, frozen when the period locks (a new lock supersedes an older freeze).
CREATE TABLE "payroll_feed_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "lock_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "employee_id" UUID NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "calendar_days" SMALLINT NOT NULL,
    "paid_days" NUMERIC(5, 2) NOT NULL,
    "lop_days" NUMERIC(5, 2) NOT NULL,
    "ot_normal_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_weekly_off_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_holiday_minutes" INTEGER NOT NULL DEFAULT 0,
    "night_shifts" SMALLINT NOT NULL DEFAULT 0,
    "comp_off_days" NUMERIC(4, 1) NOT NULL DEFAULT 0,
    "timesheet_minutes" INTEGER NOT NULL DEFAULT 0,
    "frozen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),

    CONSTRAINT "payroll_feed_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_feed_rows_key" UNIQUE ("organization_id", "lock_id", "employee_id", "frozen_at"),
    CONSTRAINT "payroll_feed_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payroll_feed_rows_lock_fkey" FOREIGN KEY ("organization_id", "lock_id") REFERENCES "period_locks"("organization_id", "id"),
    CONSTRAINT "payroll_feed_rows_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "payroll_feed_rows_days_check" CHECK ("paid_days" >= 0 AND "lop_days" >= 0 AND "paid_days" + "lop_days" <= "calendar_days")
);
CREATE INDEX "payroll_feed_rows_period_idx" ON "payroll_feed_rows"("organization_id", "legal_entity_id", "period_start") WHERE "superseded_at" IS NULL;
-- Frozen figures never change; only superseded_at is set, once, when the period is unlocked.
CREATE FUNCTION payroll_feed_rows_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."superseded_at" IS NOT NULL OR (to_jsonb(NEW) - 'superseded_at') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'Frozen payroll feed rows never change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payroll_feed_rows_frozen BEFORE UPDATE ON "payroll_feed_rows" FOR EACH ROW EXECUTE FUNCTION payroll_feed_rows_frozen();
REVOKE DELETE, TRUNCATE ON TABLE "payroll_feed_rows" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Maternity (YX-LV-10, founder decision 9 Oct 2026): the expected date and the case on the request; HR may let one
-- person through an eligibility check with a reason (audited), for one leave type, until a date.
ALTER TABLE "leave_requests" ADD COLUMN "expected_on" DATE, ADD COLUMN "maternity_case" VARCHAR(12),
  ADD CONSTRAINT "leave_requests_maternity_check" CHECK ("maternity_case" IS NULL OR "maternity_case" IN ('birth', 'third_child', 'adoption', 'miscarriage', 'tubectomy'));

CREATE TABLE "leave_eligibility_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "valid_until" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_eligibility_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_eligibility_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_eligibility_overrides_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "leave_eligibility_overrides_type_fkey" FOREIGN KEY ("organization_id", "leave_type_id") REFERENCES "leave_types"("organization_id", "id"),
    CONSTRAINT "leave_eligibility_overrides_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "leave_eligibility_overrides" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Permission keys (P02).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'roster.manage', 'Plan and publish rosters for the people in scope (managers plan their own team without it)'),
  (gen_random_uuid(), 'attendance.lock', 'Lock and unlock attendance periods of the legal entities in scope (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'leave.eligibility.override', 'Let one person through a leave eligibility check (maternity, paternity) with a reason, for the people in scope')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('roster.manage', 'attendance.lock')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shifts', 'shift_versions', 'shift_patterns', 'shift_pattern_assignments', 'roster_entries', 'shift_swap_requests', 'night_work_consents', 'night_work_safeguards', 'overtime_rules', 'overtime_requests', 'timesheet_projects', 'timesheets', 'timesheet_lines', 'period_locks', 'payroll_feed_rows', 'leave_eligibility_overrides']
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
