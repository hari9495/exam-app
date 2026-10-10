-- Lifecycle batch 6d (M01-LIFECYCLE-BUILD-DESIGN §5.5, §10.7, §11): the last working day (P06 exit change), the
-- deprovisioning panel, the payroll hand-off record and the alumni login. Every table: forced RLS + tenant_isolation;
-- the hand-off also sits behind payroll's pay guard (app_pay_entities), as it holds money.

-- ---------------------------------------------------------------------------------------------- P06: exit
ALTER TABLE "employee_changes" DROP CONSTRAINT "employee_changes_type_check";
ALTER TABLE "employee_changes" ADD CONSTRAINT "employee_changes_type_check" CHECK ("change_type" IN ('join', 'promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction', 'notice', 'notice_withdrawal', 'exit'));

-- ---------------------------------------------------------------------------------------------- exit cases
ALTER TABLE "exit_cases"
  ADD COLUMN "lwd_notified_on" DATE,
  ADD COLUMN "settled_outside_on" DATE,
  ADD COLUMN "settled_outside_reason" VARCHAR(500),
  ADD COLUMN "settled_by" UUID,
  ADD CONSTRAINT "exit_cases_settled_by_fkey" FOREIGN KEY ("organization_id", "settled_by") REFERENCES "users"("organization_id", "id"),
  ADD CONSTRAINT "exit_cases_settled_check" CHECK (("settled_outside_on" IS NULL) = ("settled_outside_reason" IS NULL));

-- ---------------------------------------------------------------------------------------------- deprovisioning (§10.7)
CREATE TABLE "exit_deprovisioning" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "handler" VARCHAR(40) NOT NULL,
    "timing" VARCHAR(8) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "done_at" TIMESTAMPTZ(3),
    "done_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_deprovisioning_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exit_deprovisioning_handler_key" UNIQUE ("organization_id", "exit_case_id", "handler"),
    CONSTRAINT "exit_deprovisioning_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_deprovisioning_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "exit_deprovisioning_done_by_fkey" FOREIGN KEY ("organization_id", "done_by") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "exit_deprovisioning_timing_check" CHECK ("timing" IN ('at_lwd', 't0', 'cleared')),
    CONSTRAINT "exit_deprovisioning_status_check" CHECK ("status" IN ('pending', 'held', 'done', 'failed', 'manual')),
    CONSTRAINT "exit_deprovisioning_done_check" CHECK (("status" IN ('done', 'manual')) = ("done_at" IS NOT NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "exit_deprovisioning" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- the payroll hand-off (§11)
CREATE TABLE "exit_settlement_inputs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "cause" VARCHAR(24) NOT NULL,
    "exit_type" VARCHAR(24) NOT NULL,
    "lwd" DATE NOT NULL,
    "wages_due_by" DATE NOT NULL,
    "notice_period" VARCHAR(4) NOT NULL,
    "notice_served_days" INTEGER,
    "notice_arrangement" JSONB NOT NULL DEFAULT '[]',
    "recoveries" JSONB NOT NULL DEFAULT '[]',
    "holds" JSONB NOT NULL DEFAULT '{}',
    "frozen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),
    CONSTRAINT "exit_settlement_inputs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exit_settlement_inputs_revision_key" UNIQUE ("organization_id", "exit_case_id", "revision"),
    CONSTRAINT "exit_settlement_inputs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_settlement_inputs_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "exit_settlement_inputs_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "exit_settlement_inputs_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "exit_settlement_inputs_due_check" CHECK ("wages_due_by" > "lwd")
);
-- One current revision per exit; a frozen revision never changes except being superseded once.
CREATE UNIQUE INDEX "exit_settlement_inputs_current_key" ON "exit_settlement_inputs" ("organization_id", "exit_case_id") WHERE "superseded_at" IS NULL;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "exit_settlement_inputs" FROM app_runtime;
GRANT UPDATE ("superseded_at") ON TABLE "exit_settlement_inputs" TO app_runtime;

-- ---------------------------------------------------------------------------------------------- alumni login (T9-02)
CREATE TABLE "alumni_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alumni_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alumni_sessions_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "alumni_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "alumni_sessions_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "alumni_sessions" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exit_deprovisioning', 'exit_settlement_inputs', 'alumni_sessions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads them.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
-- The hand-off holds money: only a transaction the API opened to that legal entity reads or writes it (M03 pay guard).
CREATE POLICY pay_guard ON "exit_settlement_inputs" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
