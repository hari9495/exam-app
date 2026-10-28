-- Leave v2 (TIM-17…25, 29, 30, 39, 42): company block dates, comp-off claims, encashment requests, long absences,
-- block-leave plans and public-holiday feeds. Comp-off credits and their expiry stay in the one leave ledger.

CREATE TABLE "leave_block_dates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL DEFAULT 'tenant',
    "scope_id" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_block_dates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_block_dates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_block_dates_range_check" CHECK ("to_on" >= "from_on" AND "to_on" - "from_on" <= 31),
    CONSTRAINT "leave_block_dates_scope_check" CHECK (("scope_type" = 'tenant' AND "scope_id" IS NULL) OR ("scope_type" IN ('legal_entity', 'location') AND "scope_id" IS NOT NULL)),
    CONSTRAINT "leave_block_dates_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 200)
);
CREATE INDEX "leave_block_dates_org_range_idx" ON "leave_block_dates" ("organization_id", "from_on", "to_on");

CREATE TABLE "comp_off_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "worked_on" DATE NOT NULL,
    "day_kind" VARCHAR(10) NOT NULL,
    "worked_minutes" SMALLINT NOT NULL,
    "days" DECIMAL(3,1) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comp_off_claims_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_off_claims_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comp_off_claims_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "comp_off_claims_days_check" CHECK ("days" IN (0.5, 1)),
    CONSTRAINT "comp_off_claims_kind_check" CHECK ("day_kind" IN ('weekly_off', 'holiday')),
    CONSTRAINT "comp_off_claims_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn'))
);
-- One live claim per person and day: a repeat or a double click is refused by the database too.
CREATE UNIQUE INDEX "comp_off_claims_one_live_idx" ON "comp_off_claims" ("organization_id", "employee_id", "worked_on") WHERE "status" IN ('pending', 'approved');

CREATE TABLE "leave_encashments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "daily_rate" DECIMAL(12,2),
    "amount" DECIMAL(14,2),
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "one_time_pay_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_encashments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_encashments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_encashments_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "leave_encashments_type_fkey" FOREIGN KEY ("organization_id", "leave_type_id") REFERENCES "leave_types"("organization_id", "id"),
    CONSTRAINT "leave_encashments_days_check" CHECK ("days" > 0 AND "days" <= 90),
    CONSTRAINT "leave_encashments_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn'))
);
-- One request waiting at a time per person.
CREATE UNIQUE INDEX "leave_encashments_one_pending_idx" ON "leave_encashments" ("organization_id", "employee_id") WHERE "status" = 'pending';

CREATE TABLE "long_absences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "planned_to_on" DATE NOT NULL,
    "accrues" BOOLEAN NOT NULL,
    "request_id" UUID,
    "return_asked_on" DATE,
    "return_asked_note" VARCHAR(500),
    "note" VARCHAR(500) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "long_absences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "long_absences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "long_absences_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "long_absences_kind_check" CHECK ("kind" IN ('maternity', 'sabbatical', 'lwp')),
    CONSTRAINT "long_absences_range_check" CHECK ("to_on" >= "from_on" AND "to_on" - "from_on" <= 731)
);
CREATE INDEX "long_absences_person_idx" ON "long_absences" ("organization_id", "employee_id", "from_on");

CREATE TABLE "block_leave_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year_start" DATE NOT NULL,
    "from_on" DATE,
    "to_on" DATE,
    "access_pause" VARCHAR(10) NOT NULL DEFAULT 'none',
    "nudged_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "block_leave_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "block_leave_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "block_leave_plans_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "block_leave_plans_pause_check" CHECK ("access_pause" IN ('none', 'scheduled')),
    CONSTRAINT "block_leave_plans_range_check" CHECK (("from_on" IS NULL AND "to_on" IS NULL) OR "to_on" >= "from_on")
);
CREATE UNIQUE INDEX "block_leave_plans_year_idx" ON "block_leave_plans" ("organization_id", "employee_id", "year_start");

CREATE TABLE "holiday_feeds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "state" VARCHAR(10) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "checked_at" TIMESTAMPTZ(3),
    "check_error" VARCHAR(300),
    "removed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "holiday_feeds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holiday_feeds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "holiday_feeds_state_idx" ON "holiday_feeds" ("organization_id", "state") WHERE "removed_at" IS NULL;

CREATE TABLE "holiday_feed_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "feed_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "action" VARCHAR(6) NOT NULL,
    "holiday_on" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "holiday_id" UUID,
    "status" VARCHAR(8) NOT NULL DEFAULT 'waiting',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "holiday_feed_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holiday_feed_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "holiday_feed_changes_action_check" CHECK ("action" IN ('add', 'remove')),
    CONSTRAINT "holiday_feed_changes_status_check" CHECK ("status" IN ('waiting', 'accepted', 'ignored'))
);
-- A change is found once per calendar, date, action and name, however often the feed is checked.
CREATE UNIQUE INDEX "holiday_feed_changes_once_idx" ON "holiday_feed_changes" ("organization_id", "calendar_id", "holiday_on", "action", "name");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leave_block_dates', 'comp_off_claims', 'leave_encashments', 'long_absences', 'block_leave_plans', 'holiday_feeds', 'holiday_feed_changes']
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
-- Records are corrected by new rows or a state change, never deleted.
REVOKE DELETE, TRUNCATE ON TABLE "leave_block_dates", "comp_off_claims", "leave_encashments", "long_absences", "block_leave_plans", "holiday_feeds", "holiday_feed_changes" FROM app_runtime;
