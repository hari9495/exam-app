-- People core (step 2c): the P01 person across roles (§4.5a, J15), dotted-line managers on the assignment
-- (P01 §4.4, M01 Q5), probation plans (M01 §3.4, §4) and bulk change batches (M01 §3.3, one approval).
--
-- Every table: organization_id NOT NULL + forced RLS (YX-ORG-14) and composite (organization_id, …) keys,
-- so no row can point at another company's row, even with the platform's RLS bypass.

-- ---------------------------------------------------------------------------------------------
-- P01 §4.5a persons: one per human per company, never shared or matched across companies (YX-ORG-26).
CREATE TABLE "persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "family_name" VARCHAR(100),
    "preferred_name" VARCHAR(100),
    "primary_email" CITEXT,
    -- E.164 (YX-ORG-28).
    "primary_phone" VARCHAR(16),
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "merged_into" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "persons_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "persons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "persons_merged_into_fkey" FOREIGN KEY ("organization_id", "merged_into") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "persons_given_name_check" CHECK (char_length(btrim("given_name")) BETWEEN 1 AND 100),
    CONSTRAINT "persons_email_check" CHECK ("primary_email" IS NULL OR "primary_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    CONSTRAINT "persons_phone_check" CHECK ("primary_phone" IS NULL OR "primary_phone" ~ '^\+[1-9][0-9]{6,14}$'),
    CONSTRAINT "persons_status_check" CHECK ("status" IN ('active', 'merged', 'erased')),
    CONSTRAINT "persons_merged_check" CHECK (("status" = 'merged') = ("merged_into" IS NOT NULL))
);
-- YX-ORG-27: an email or phone is a deterministic key, so it belongs to one live person in a company.
CREATE UNIQUE INDEX "persons_email_key" ON "persons"("organization_id", "primary_email") WHERE "status" = 'active' AND "primary_email" IS NOT NULL;
CREATE UNIQUE INDEX "persons_phone_key" ON "persons"("organization_id", "primary_phone") WHERE "status" = 'active' AND "primary_phone" IS NOT NULL;

-- P01 §4.5a person_roles: every way the person appears in the company, each pointing at its own record.
-- Identities stay separate (a login stays a users row); the role only links them.
CREATE TABLE "person_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_type" VARCHAR(24) NOT NULL,
    "source_table" VARCHAR(40) NOT NULL,
    "source_id" UUID NOT NULL,
    "start_on" DATE NOT NULL,
    "end_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "person_roles_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "person_roles_type_check" CHECK ("role_type" IN ('applicant', 'candidate', 'campus_registrant', 'test_taker', 'employee', 'alumnus', 'nominee', 'consultant', 'contract_worker', 'vendor_worker', 'external_login', 'login')),
    CONSTRAINT "person_roles_source_check" CHECK ("source_table" ~ '^[a-z_]{1,40}$'),
    CONSTRAINT "person_roles_dates_check" CHECK ("end_on" IS NULL OR "end_on" >= "start_on")
);
-- One role row per source record (a role record belongs to exactly one person, YX-ORG-26).
CREATE UNIQUE INDEX "person_roles_source_key" ON "person_roles"("organization_id", "role_type", "source_table", "source_id");
CREATE INDEX "person_roles_person_idx" ON "person_roles"("organization_id", "person_id");

-- P01 §4.5a person_link_log: append-only record of every link, proposal, merge and unmerge (YX-ORG-27).
CREATE TABLE "person_link_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "action" VARCHAR(12) NOT NULL,
    "person_id" UUID NOT NULL,
    "other_person_id" UUID,
    "role_id" UUID,
    "basis" VARCHAR(40) NOT NULL,
    "decided_by" UUID,
    "reason" VARCHAR(1000),
    "before" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_link_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "person_link_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "person_link_log_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "person_link_log_other_fkey" FOREIGN KEY ("organization_id", "other_person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "person_link_log_action_check" CHECK ("action" IN ('auto_link', 'proposed', 'confirmed', 'rejected', 'merge', 'unmerge'))
);
CREATE INDEX "person_link_log_person_idx" ON "person_link_log"("organization_id", "person_id", "created_at");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "person_link_log" FROM app_runtime;

-- Every existing employee record gets its person (and an employee role per employment, a login role per
-- linked login). employees already has forced RLS, so the backfill reads it with the platform flag set for
-- this transaction only.
SELECT set_config('app.is_super_admin', 'on', true);
ALTER TABLE "employees" ADD COLUMN "person_id" UUID;
UPDATE "employees" SET "person_id" = gen_random_uuid();
INSERT INTO "persons" ("id", "organization_id", "given_name", "family_name", "preferred_name", "primary_email", "created_by", "created_at")
SELECT e."person_id", e."organization_id", e."given_name", e."family_name", e."preferred_name",
       -- A shared work email stays on the first record only (the key is unique per company).
       CASE WHEN row_number() OVER (PARTITION BY e."organization_id", e."work_email" ORDER BY e."created_at", e."id") = 1 THEN e."work_email" END,
       e."created_by", e."created_at"
FROM "employees" e;
INSERT INTO "person_roles" ("organization_id", "person_id", "role_type", "source_table", "source_id", "start_on", "end_on")
SELECT m."organization_id", e."person_id", 'employee', 'employments', m."id", m."joined_on", m."exited_on"
FROM "employments" m JOIN "employees" e ON e."organization_id" = m."organization_id" AND e."id" = m."employee_id";
INSERT INTO "person_roles" ("organization_id", "person_id", "role_type", "source_table", "source_id", "start_on")
SELECT e."organization_id", e."person_id", 'login', 'users', e."user_id", e."created_at"::date
FROM "employees" e WHERE e."user_id" IS NOT NULL;

ALTER TABLE "employees" ALTER COLUMN "person_id" SET NOT NULL;
-- P01 §4.4: employees.person_id is unique, one employee record per person (all employments under it).
ALTER TABLE "employees" ADD CONSTRAINT "employees_person_key" UNIQUE ("organization_id", "person_id");
ALTER TABLE "employees" ADD CONSTRAINT "employees_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------
-- P01 §4.4 / M01 Q5: dotted-line (secondary) managers of an assignment: visibility and feedback only, never
-- an approver unless a policy names them (YX-EMP-04). Part of the dated assignment: written with it,
-- never changed afterwards (YX-HIS-07).
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_org_employee_id_key" UNIQUE ("organization_id", "employee_id", "id");
CREATE TABLE "assignment_dotted_line_managers" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "manager_employee_id" UUID NOT NULL,

    CONSTRAINT "assignment_dotted_line_managers_pkey" PRIMARY KEY ("assignment_id", "manager_employee_id"),
    CONSTRAINT "assignment_dotted_line_managers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignment_dotted_line_managers_assignment_fkey" FOREIGN KEY ("organization_id", "employee_id", "assignment_id") REFERENCES "employee_assignments"("organization_id", "employee_id", "id"),
    CONSTRAINT "assignment_dotted_line_managers_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "assignment_dotted_line_managers_self_check" CHECK ("manager_employee_id" <> "employee_id")
);
CREATE INDEX "assignment_dotted_line_managers_manager_idx" ON "assignment_dotted_line_managers"("organization_id", "manager_employee_id");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "assignment_dotted_line_managers" FROM app_runtime;

-- P06 Q1 (bitemporal-lite): "recorded at" and "superseded at" are the database's clock, never the caller's,
-- so the "as recorded at T" history cannot be back-dated. Replaces the 2b guard with the same checks.
CREATE OR REPLACE FUNCTION dated_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM employee_changes c WHERE c.organization_id = NEW.organization_id AND c.id = NEW.change_id AND c.status IN ('scheduled', 'effective')) THEN
      RAISE EXCEPTION 'dated facts are written only through approved employee changes (YX-HIS-01)' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new dated fact row is current (YX-HIS-07)' USING ERRCODE = 'check_violation';
    END IF;
    NEW.recorded_at := now();
  ELSIF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'a superseded dated fact row stays as it was (YX-HIS-07)' USING ERRCODE = 'check_violation';
  ELSE
    NEW.superseded_at := now();
  END IF;
  RETURN NEW;
END $$;

-- YX-HIS-07: an assignment's children (cost-centre split, dotted lines) are written in the same
-- transaction as the assignment row and never added to it later.
CREATE FUNCTION assignment_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employee_assignments a WHERE a.id = NEW.assignment_id AND a.superseded_at IS NULL AND a.recorded_at = now()::timestamptz(3)) THEN
    RAISE EXCEPTION 'an assignment''s details are written with it, never afterwards (YX-HIS-07)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignment_cost_centres_guard BEFORE INSERT ON "assignment_cost_centres" FOR EACH ROW EXECUTE FUNCTION assignment_child_guard();
CREATE TRIGGER assignment_dotted_line_managers_guard BEFORE INSERT ON "assignment_dotted_line_managers" FOR EACH ROW EXECUTE FUNCTION assignment_child_guard();

-- ---------------------------------------------------------------------------------------------
-- M01 §3.4 / §4 probations: the plan for one employment. The outcome is the dated employment status
-- (P06: probation -> confirmed through an approved confirmation change); this row keeps the dates, the
-- extensions and the reminder / escalation marks of the daily job (YX-LC-01).
CREATE TABLE "probations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "start_on" DATE NOT NULL,
    "original_end_on" DATE NOT NULL,
    "planned_end_on" DATE NOT NULL,
    "extended_months" INTEGER NOT NULL DEFAULT 0,
    "review_reminded_on" DATE,
    "escalated_on" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "probations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "probations_employment_key" UNIQUE ("organization_id", "employment_id"),
    CONSTRAINT "probations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "probations_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "probations_dates_check" CHECK ("original_end_on" >= "start_on" AND "planned_end_on" >= "original_end_on"),
    CONSTRAINT "probations_extended_check" CHECK ("extended_months" BETWEEN 0 AND 60)
);
-- The daily job's queue: plans not yet escalated.
CREATE INDEX "probations_open_idx" ON "probations"("planned_end_on") WHERE "escalated_on" IS NULL;

-- Employments on probation today get the starter plan (M01 Q3: 6 months).
INSERT INTO "probations" ("organization_id", "employment_id", "start_on", "original_end_on", "planned_end_on")
SELECT m."organization_id", m."id", m."joined_on", (m."joined_on" + interval '6 months')::date - 1, (m."joined_on" + interval '6 months')::date - 1
FROM "employments" m
WHERE m."exited_on" IS NULL AND EXISTS (
  SELECT 1 FROM "employment_status_periods" s
  WHERE s."organization_id" = m."organization_id" AND s."employment_id" = m."id" AND s."superseded_at" IS NULL AND s."status" = 'probation'
    AND s."valid_from" = m."joined_on");
SELECT set_config('app.is_super_admin', 'off', true);

-- ---------------------------------------------------------------------------------------------
-- M01 §3.3 bulk changes: many P06 changes raised together and approved once, all or nothing.
CREATE TABLE "employee_change_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "source" VARCHAR(16) NOT NULL,
    "file_name" VARCHAR(200),
    "reason" VARCHAR(1000) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(1000),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_change_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_change_batches_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "employee_change_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_change_batches_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT "employee_change_batches_source_check" CHECK ("source" IN ('csv', 'reassign')),
    CONSTRAINT "employee_change_batches_reason_check" CHECK (char_length(btrim("reason")) >= 3),
    CONSTRAINT "employee_change_batches_rows_check" CHECK ("row_count" BETWEEN 1 AND 1000)
);
ALTER TABLE "employee_changes" ADD COLUMN "batch_id" UUID;
ALTER TABLE "employee_changes" ADD CONSTRAINT "employee_changes_batch_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "employee_change_batches"("organization_id", "id");
CREATE INDEX "employee_changes_batch_idx" ON "employee_changes"("organization_id", "batch_id") WHERE "batch_id" IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14): the standard forced RLS + tenant_isolation policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['persons', 'person_roles', 'person_link_log', 'assignment_dotted_line_managers', 'probations', 'employee_change_batches']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
