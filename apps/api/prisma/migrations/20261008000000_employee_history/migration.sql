-- P06 effective-dated history (§4.2, §4.3, §5) on the P01 employee core (§4.4): employees, employments,
-- employee changes (the only write path for dated facts, YX-HIS-01) and the dated facts of this step:
-- assignment (location, department, designation, grade, employment type, manager, cost centres),
-- employment status, and compensation (pay data, founder rule R1).
--
-- Every table: organization_id NOT NULL + forced RLS (YX-ORG-14) and composite (organization_id, id) keys,
-- so no row can point at another company's row (P01 §5 #5). Dated rows are bitemporal-lite (P06 Q1):
-- valid_from / valid_to (business dates) plus recorded_at / superseded_at (when we believed it). They are
-- never updated or deleted by the app: a later change supersedes them (YX-HIS-07).

-- employees.user_id points at a login of the same company.
CREATE UNIQUE INDEX "users_organization_id_id_key" ON "users"("organization_id", "id");
-- An assignment's location must belong to the employment's legal entity (YX-ORG-08).
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_entity_id_key" UNIQUE ("organization_id", "legal_entity_id", "id");

-- ---------------------------------------------------------------------------------------------
-- P01 §4.4 employees (the person). Names, contacts and identifiers grow with the employee record (M01).
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "given_name" VARCHAR(100) NOT NULL,
    "family_name" VARCHAR(100),
    "preferred_name" VARCHAR(100),
    "work_email" CITEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employees_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employees_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE SET NULL ("user_id"),
    CONSTRAINT "employees_given_name_check" CHECK (char_length(btrim("given_name")) BETWEEN 1 AND 100),
    CONSTRAINT "employees_work_email_check" CHECK ("work_email" IS NULL OR "work_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
-- One employee record per login.
CREATE UNIQUE INDEX "employees_user_key" ON "employees"("organization_id", "user_id");

-- P01 §4.4 employments: a period with one employer (legal entity).
CREATE TABLE "employments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_code" CITEXT NOT NULL,
    -- YX-ORG-16: the legal entity or the company, per employee_code.scope when the code was given.
    "code_scope_key" UUID NOT NULL,
    "joined_on" DATE NOT NULL,
    "exited_on" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employments_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "employments_org_employee_id_key" UNIQUE ("organization_id", "employee_id", "id"),
    CONSTRAINT "employments_org_entity_employee_id_key" UNIQUE ("organization_id", "legal_entity_id", "employee_id", "id"),
    CONSTRAINT "employments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employments_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employments_legal_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "employments_code_check" CHECK ("employee_code" ~ '^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$'),
    CONSTRAINT "employments_code_scope_check" CHECK ("code_scope_key" IN ("legal_entity_id", "organization_id")),
    CONSTRAINT "employments_dates_check" CHECK ("exited_on" IS NULL OR "exited_on" >= "joined_on")
);
-- YX-ORG-16: one constraint serves both code scopes.
CREATE UNIQUE INDEX "employments_code_key" ON "employments"("organization_id", "code_scope_key", "employee_code");
-- YX-ORG-06 / P01 Q6: one open employment per person (no concurrent employments at launch).
CREATE UNIQUE INDEX "employments_one_open_key" ON "employments"("organization_id", "employee_id") WHERE "exited_on" IS NULL;

-- ---------------------------------------------------------------------------------------------
-- P06 §5 employee_changes: every dated fact row is written by one (YX-HIS-01). pending -> scheduled
-- (approved, effective date later) -> effective (applied by the daily job, YX-HIS-05); or rejected /
-- cancelled. payload holds the new values per fact; impact the preview shown before approval (YX-HIS-11).
CREATE TABLE "employee_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    -- Applies same-day changes in the order they were raised.
    "seq" BIGINT GENERATED ALWAYS AS IDENTITY,
    "change_type" VARCHAR(32) NOT NULL,
    "effective_date" DATE NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "payload" JSONB NOT NULL,
    "impact" JSONB,
    "reason" VARCHAR(1000) NOT NULL,
    -- YX-HIS-12: a change dated before the company's retro limit carries the override reason.
    "override_reason" VARCHAR(1000),
    "requested_by" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(1000),
    "applied_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_changes_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "employee_changes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_changes_employment_fkey" FOREIGN KEY ("organization_id", "employee_id", "employment_id") REFERENCES "employments"("organization_id", "employee_id", "id"),
    CONSTRAINT "employee_changes_type_check" CHECK ("change_type" IN ('join', 'promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction')),
    CONSTRAINT "employee_changes_status_check" CHECK ("status" IN ('pending', 'scheduled', 'effective', 'rejected', 'cancelled')),
    CONSTRAINT "employee_changes_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "employee_changes_reason_check" CHECK (char_length(btrim("reason")) >= 3),
    CONSTRAINT "employee_changes_applied_check" CHECK (("status" = 'effective') = ("applied_at" IS NOT NULL))
);
CREATE INDEX "employee_changes_employment_idx" ON "employee_changes"("organization_id", "employment_id", "effective_date", "seq");
-- The daily job's queue (YX-HIS-05).
CREATE INDEX "employee_changes_scheduled_idx" ON "employee_changes"("effective_date") WHERE "status" = 'scheduled';

-- ---------------------------------------------------------------------------------------------
-- Dated facts (P06 §4.2). Common columns: valid_from / valid_to (NULL = open), change_id (the change that
-- created the row), recorded_at, superseded_at + superseded_by_change_id. Current rows never overlap
-- (YX-HIS-02, GiST exclusion; btree_gist from the org-structure migration).

-- P01 §4.4 employee_assignments. legal_entity_id and employee_id copy the employment's, so the composite
-- keys prove the location and cost centres belong to the employer (YX-ORG-08) and a manager is never the
-- person themselves.
CREATE TABLE "employee_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "location_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "designation_id" UUID NOT NULL,
    "grade_id" UUID,
    "employment_type_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "change_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_change_id" UUID,

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_assignments_org_entity_id_key" UNIQUE ("organization_id", "legal_entity_id", "id"),
    CONSTRAINT "employee_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_assignments_employment_fkey" FOREIGN KEY ("organization_id", "legal_entity_id", "employee_id", "employment_id") REFERENCES "employments"("organization_id", "legal_entity_id", "employee_id", "id"),
    CONSTRAINT "employee_assignments_location_fkey" FOREIGN KEY ("organization_id", "legal_entity_id", "location_id") REFERENCES "locations"("organization_id", "legal_entity_id", "id"),
    CONSTRAINT "employee_assignments_department_fkey" FOREIGN KEY ("organization_id", "department_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "employee_assignments_designation_fkey" FOREIGN KEY ("organization_id", "designation_id") REFERENCES "designations"("organization_id", "id"),
    CONSTRAINT "employee_assignments_grade_fkey" FOREIGN KEY ("organization_id", "grade_id") REFERENCES "grades"("organization_id", "id"),
    CONSTRAINT "employee_assignments_employment_type_fkey" FOREIGN KEY ("organization_id", "employment_type_id") REFERENCES "employment_types"("organization_id", "id"),
    CONSTRAINT "employee_assignments_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_assignments_change_fkey" FOREIGN KEY ("organization_id", "change_id") REFERENCES "employee_changes"("organization_id", "id"),
    CONSTRAINT "employee_assignments_superseded_by_fkey" FOREIGN KEY ("organization_id", "superseded_by_change_id") REFERENCES "employee_changes"("organization_id", "id"),
    CONSTRAINT "employee_assignments_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "employee_assignments_superseded_check" CHECK (("superseded_at" IS NULL) = ("superseded_by_change_id" IS NULL)),
    -- YX-ORG-09: nobody reports to themselves (longer cycles are checked by the service on every write).
    CONSTRAINT "employee_assignments_manager_check" CHECK ("manager_employee_id" IS DISTINCT FROM "employee_id"),
    CONSTRAINT "employee_assignments_no_overlap" EXCLUDE USING gist ("employment_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&) WHERE ("superseded_at" IS NULL)
);
CREATE INDEX "employee_assignments_employee_idx" ON "employee_assignments"("organization_id", "employee_id") WHERE "superseded_at" IS NULL;
-- "My team" and reporting-chain walks (P02 §4.3, YX-SEC-06).
CREATE INDEX "employee_assignments_manager_idx" ON "employee_assignments"("organization_id", "manager_employee_id") WHERE "superseded_at" IS NULL;

-- P01 §4.4 / Q8: cost-centre split of an assignment; the rows total 100 % (checked at commit).
CREATE TABLE "assignment_cost_centres" (
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "cost_centre_id" UUID NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "assignment_cost_centres_pkey" PRIMARY KEY ("assignment_id", "cost_centre_id"),
    CONSTRAINT "assignment_cost_centres_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignment_cost_centres_assignment_fkey" FOREIGN KEY ("organization_id", "legal_entity_id", "assignment_id") REFERENCES "employee_assignments"("organization_id", "legal_entity_id", "id"),
    CONSTRAINT "assignment_cost_centres_cost_centre_fkey" FOREIGN KEY ("organization_id", "legal_entity_id", "cost_centre_id") REFERENCES "cost_centres"("organization_id", "legal_entity_id", "id"),
    CONSTRAINT "assignment_cost_centres_percent_check" CHECK ("percent" > 0 AND "percent" <= 100)
);

CREATE FUNCTION assignment_cost_centres_total() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT sum(percent) FROM assignment_cost_centres WHERE assignment_id = NEW.assignment_id) <> 100 THEN
    RAISE EXCEPTION 'an assignment''s cost centres total 100 percent (P01 Q8)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER assignment_cost_centres_total AFTER INSERT ON "assignment_cost_centres"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assignment_cost_centres_total();

-- P06 §4.1 employment status milestones.
CREATE TABLE "employment_status_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" VARCHAR(16) NOT NULL,
    "change_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_change_id" UUID,

    CONSTRAINT "employment_status_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employment_status_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employment_status_periods_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "employment_status_periods_change_fkey" FOREIGN KEY ("organization_id", "change_id") REFERENCES "employee_changes"("organization_id", "id"),
    CONSTRAINT "employment_status_periods_superseded_by_fkey" FOREIGN KEY ("organization_id", "superseded_by_change_id") REFERENCES "employee_changes"("organization_id", "id"),
    CONSTRAINT "employment_status_periods_status_check" CHECK ("status" IN ('probation', 'confirmed', 'notice')),
    CONSTRAINT "employment_status_periods_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "employment_status_periods_superseded_check" CHECK (("superseded_at" IS NULL) = ("superseded_by_change_id" IS NULL)),
    CONSTRAINT "employment_status_periods_no_overlap" EXCLUDE USING gist ("employment_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&) WHERE ("superseded_at" IS NULL)
);

-- P06 §4.1 compensation (CTC; components arrive with M03). Pay data, founder rule R1: read only with
-- employee.salary.view (or by the employee themselves), every other person's view audited (YX-SEC-09).
CREATE TABLE "compensations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "currency" CHAR(3) NOT NULL,
    "annual_ctc" DECIMAL(14,2) NOT NULL,
    "change_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),
    "superseded_by_change_id" UUID,

    CONSTRAINT "compensations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compensations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "compensations_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "compensations_change_fkey" FOREIGN KEY ("organization_id", "change_id") REFERENCES "employee_changes"("organization_id", "id"),
    CONSTRAINT "compensations_superseded_by_fkey" FOREIGN KEY ("organization_id", "superseded_by_change_id") REFERENCES "employee_changes"("organization_id", "id"),
    CONSTRAINT "compensations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "compensations_amount_check" CHECK ("annual_ctc" > 0),
    CONSTRAINT "compensations_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "compensations_superseded_check" CHECK (("superseded_at" IS NULL) = ("superseded_by_change_id" IS NULL)),
    CONSTRAINT "compensations_no_overlap" EXCLUDE USING gist ("employment_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&) WHERE ("superseded_at" IS NULL)
);

-- YX-HIS-01: a dated fact row comes from an approved change (scheduled or effective), never a direct write.
-- YX-HIS-07: rows are immutable; the only update is superseding a current row, once.
CREATE FUNCTION dated_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM employee_changes c WHERE c.organization_id = NEW.organization_id AND c.id = NEW.change_id AND c.status IN ('scheduled', 'effective')) THEN
      RAISE EXCEPTION 'dated facts are written only through approved employee changes (YX-HIS-01)' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new dated fact row is current (YX-HIS-07)' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL THEN
    RAISE EXCEPTION 'a superseded dated fact row stays as it was (YX-HIS-07)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_assignments', 'employment_status_periods', 'compensations']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION dated_fact_guard()', t || '_guard', t);
    -- Never deleted or rewritten by the app; FK cascades still work (referential actions run as the owner).
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
    EXECUTE format('GRANT UPDATE ("superseded_at", "superseded_by_change_id") ON TABLE %I TO app_runtime', t);
  END LOOP;
END $$;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "assignment_cost_centres" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14): the standard forced RLS + tenant_isolation policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees', 'employments', 'employee_changes', 'employee_assignments', 'assignment_cost_centres', 'employment_status_periods', 'compensations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
