-- Performance batch PM8 (M06-BUILD-DESIGN §5.9, §13; PM-8.01 … 8.03): performance improvement plans.
-- The manager proposes a plan, HR approves it through P03 'perf.pip'; the employee acknowledges (agreeing or not);
-- check-ins on a fixed schedule; outcome met / extended (once) / not met. "Not met" never opens an exit by itself: HR may
-- start a company-initiated exit linked back to the plan (§4.1 change 4: exit_cases.source_type / source_id).
-- Forced RLS + tenant_isolation; support sessions never read any of it; nothing erased.

ALTER TABLE "exit_cases" ADD COLUMN "source_type" VARCHAR(16), ADD COLUMN "source_id" UUID,
  ADD CONSTRAINT "exit_cases_source_check" CHECK (("source_type" IS NULL AND "source_id" IS NULL) OR ("source_type" IN ('pip') AND "source_id" IS NOT NULL));

CREATE TABLE "pips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "manager_employee_id" UUID NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "expectations" VARCHAR(4000) NOT NULL,
    "support" VARCHAR(2000) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "checkin_every_days" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'proposed',
    "wf_request_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(3),
    "employee_comment" VARCHAR(2000),
    "employee_told_on" DATE,
    "extended_from" DATE,
    "extend_reason" VARCHAR(1000),
    "outcome_note" VARCHAR(2000),
    "outcome_by" UUID,
    "outcome_at" TIMESTAMPTZ(3),
    "letter_id" UUID,
    "exit_case_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pips_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "pips_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "pips_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "pips_status_check" CHECK ("status" IN ('proposed', 'declined', 'active', 'extended', 'met', 'not_met', 'withdrawn')),
    CONSTRAINT "pips_dates_check" CHECK ("ends_on" > "starts_on"),
    CONSTRAINT "pips_checkin_check" CHECK ("checkin_every_days" BETWEEN 7 AND 30),
    CONSTRAINT "pips_extended_check" CHECK (("extended_from" IS NULL) = ("extend_reason" IS NULL))
);
-- One live plan per employment.
CREATE UNIQUE INDEX "pips_live_key" ON "pips" ("organization_id", "employment_id") WHERE "status" IN ('proposed', 'active', 'extended');
CREATE INDEX "pips_employee_idx" ON "pips" ("organization_id", "employee_id");
CREATE INDEX "pips_manager_idx" ON "pips" ("organization_id", "manager_employee_id", "status");
CREATE UNIQUE INDEX "pips_wf_key" ON "pips" ("wf_request_id") WHERE "wf_request_id" IS NOT NULL;

CREATE TABLE "pip_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pip_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "goal_id" UUID,
    "text" VARCHAR(500) NOT NULL,
    "measure" VARCHAR(500) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    CONSTRAINT "pip_goals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pip_goals_pip_fkey" FOREIGN KEY ("organization_id", "pip_id") REFERENCES "pips"("organization_id", "id"),
    CONSTRAINT "pip_goals_status_check" CHECK ("status" IN ('open', 'met', 'not_met'))
);
CREATE INDEX "pip_goals_pip_idx" ON "pip_goals" ("organization_id", "pip_id");

CREATE TABLE "pip_checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pip_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "held_on" DATE,
    "manager_note" VARCHAR(2000),
    "employee_note" VARCHAR(2000),
    "status" VARCHAR(8) NOT NULL DEFAULT 'due',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pip_checkins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pip_checkins_one_key" UNIQUE ("pip_id", "due_on"),
    CONSTRAINT "pip_checkins_pip_fkey" FOREIGN KEY ("organization_id", "pip_id") REFERENCES "pips"("organization_id", "id"),
    CONSTRAINT "pip_checkins_status_check" CHECK ("status" IN ('due', 'held', 'missed', 'cancelled')),
    CONSTRAINT "pip_checkins_held_check" CHECK (("status" = 'held') = ("held_on" IS NOT NULL AND "manager_note" IS NOT NULL))
);
CREATE INDEX "pip_checkins_due_idx" ON "pip_checkins" ("status", "due_on");

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pips', 'pip_goals', 'pip_checkins']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- permission key (§19)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.pip.manage', 'Approve, see and close performance improvement plans of people in scope')
ON CONFLICT DO NOTHING;
