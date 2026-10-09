-- Step 4 · Time and leave batch 2, founder decisions of 9 Oct 2026 (M02 §11):
--   night work   the protection covers people recorded as female or transgender, and anyone who opts in (self-service,
--                audited; only the person turns it off): night_work_opt_ins. A consent HR records needs the worker's
--                own confirmation in the app with a one-time code before night shifts can be scheduled: confirmed_at.
--   factory OT   P07 IN.FACTORIES names the employment categories the Act covers; where the dated setting
--                attendance.factories_act says "covered", approved OT is always paid at the legal rate (verify list).

-- A consent is confirmed once by the worker and withdrawn once; nothing else about it changes.
ALTER TABLE "night_work_consents" ADD COLUMN "confirmed_at" TIMESTAMPTZ(3), ADD COLUMN "confirmed_by" UUID;
CREATE OR REPLACE FUNCTION night_work_consents_withdraw_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."withdrawn_on" IS NOT NULL AND NEW."withdrawn_on" IS DISTINCT FROM OLD."withdrawn_on")
     OR (OLD."confirmed_at" IS NOT NULL AND (NEW."confirmed_at", NEW."confirmed_by") IS DISTINCT FROM (OLD."confirmed_at", OLD."confirmed_by"))
     OR (to_jsonb(NEW) - 'withdrawn_on' - 'confirmed_at' - 'confirmed_by') IS DISTINCT FROM (to_jsonb(OLD) - 'withdrawn_on' - 'confirmed_at' - 'confirmed_by') THEN
    RAISE EXCEPTION 'A night-work consent is only ever confirmed once and withdrawn once';
  END IF;
  RETURN NEW;
END $$;

-- Opt-in to the night-work protection (a row while opted in; the audit log keeps the history).
CREATE TABLE "night_work_opt_ins" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "since" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "night_work_opt_ins_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "night_work_opt_ins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "night_work_opt_ins_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);
REVOKE UPDATE, TRUNCATE ON TABLE "night_work_opt_ins" FROM app_runtime;
ALTER TABLE "night_work_opt_ins" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "night_work_opt_ins"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "night_work_opt_ins" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

-- P07: the employment categories the Factories Act / OSH Code counts as workers (verify list, YX-STAT-03).
ALTER TABLE "statutory_rule_sets" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "statutory_rule_sets" DISABLE ROW LEVEL SECURITY;
UPDATE "statutory_rule_sets"
   SET "values" = "values" || '{"coveredCategories":["permanent","probation","fixed_term","deployed_contractor","retired_reemployed"]}'::jsonb
 WHERE "statute" = 'IN.FACTORIES' AND "jurisdiction" = 'IN' AND "version" = '2025-osh-v1';
ALTER TABLE "statutory_rule_sets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
