-- Lifecycle batch 6e (M01-LIFECYCLE-BUILD-DESIGN §16.5; M01 §3.5, §3.7): rehire on the same record, campus batches,
-- onboarding buddies, death in service (nominations, payees, nominee login), the absconding timeline, retirement and
-- contract ends, retrenchment / lay-off / closure with the government permission, VRS schemes, and the in-app letter
-- editor. Every new table: forced RLS + tenant_isolation; personal ones are excluded from support sessions.

-- ---------------------------------------------------------------------------------------------- rehire (YX-LC-11 / 18)
-- A rehire is a new employment on the same employee record and may keep its old code (rehire policy "reuse"): a code
-- now belongs to one employee, across their employments, instead of to one employment.
DROP INDEX "employments_code_key";
ALTER TABLE "employments" ADD CONSTRAINT "employments_code_owner_excl" EXCLUDE USING gist ("organization_id" WITH =, "code_scope_key" WITH =, (lower("employee_code"::text)) WITH =, "employee_id" WITH <>);
CREATE UNIQUE INDEX "employments_code_open_key" ON "employments" ("organization_id", "code_scope_key", "employee_code") WHERE "exited_on" IS NULL;
ALTER TABLE "employments"
  ADD COLUMN "rehire_of" UUID,
  ADD COLUMN "contract_end_on" DATE,
  ADD COLUMN "contract_reminded" INTEGER[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "employments_rehire_of_fkey" FOREIGN KEY ("organization_id", "rehire_of") REFERENCES "employments"("organization_id", "id"),
  ADD CONSTRAINT "employments_contract_end_check" CHECK ("contract_end_on" IS NULL OR "contract_end_on" >= "joined_on");

ALTER TABLE "preboardings"
  ADD COLUMN "person_type" VARCHAR(8) NOT NULL DEFAULT 'new',
  ADD COLUMN "rehire_of" UUID,
  ADD COLUMN "rehire_options" JSONB,
  ADD COLUMN "rehire_overrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "batch_id" UUID,
  ADD COLUMN "buddy_employee_id" UUID,
  ADD CONSTRAINT "preboardings_person_type_check" CHECK ("person_type" IN ('new', 'rehire') AND (("person_type" = 'rehire') = ("rehire_of" IS NOT NULL))),
  ADD CONSTRAINT "preboardings_rehire_of_fkey" FOREIGN KEY ("organization_id", "rehire_of") REFERENCES "employments"("organization_id", "id"),
  ADD CONSTRAINT "preboardings_buddy_fkey" FOREIGN KEY ("organization_id", "buddy_employee_id") REFERENCES "employees"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------- campus batches (PPL-14)
CREATE TABLE "joiner_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "joining_on" DATE NOT NULL,
    "touchpoints" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "joiner_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "joiner_batches_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "joiner_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "joiner_batches_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "joiner_batches_status_check" CHECK ("status" IN ('open', 'closed'))
);
REVOKE DELETE, TRUNCATE ON TABLE "joiner_batches" FROM app_runtime;
ALTER TABLE "preboardings" ADD CONSTRAINT "preboardings_batch_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "joiner_batches"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------- buddy (PPL-41)
ALTER TABLE "journey_template_tasks" DROP CONSTRAINT "journey_template_tasks_owner_check";
ALTER TABLE "journey_template_tasks" ADD CONSTRAINT "journey_template_tasks_owner_check" CHECK ("owner_type" IN ('hr', 'it', 'admin', 'finance', 'payroll', 'manager', 'person', 'user', 'group', 'buddy'));

-- ---------------------------------------------------------------------------------------------- nominations and payees (YX-LC-16)
CREATE TABLE "employee_nominations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "scheme" VARCHAR(12) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "relation" VARCHAR(40) NOT NULL,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "source" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_nominations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_nominations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_nominations_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_nominations_scheme_check" CHECK ("scheme" IN ('gratuity', 'pf', 'all')),
    CONSTRAINT "employee_nominations_share_check" CHECK ("share_percent" > 0 AND "share_percent" <= 100)
);
CREATE INDEX "employee_nominations_employee_idx" ON "employee_nominations" ("organization_id", "employee_id");
REVOKE DELETE, TRUNCATE ON TABLE "employee_nominations" FROM app_runtime;

CREATE TABLE "exit_payees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "relation" VARCHAR(40) NOT NULL,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "email" CITEXT,
    "document_id" UUID,
    "removed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_payees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exit_payees_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "exit_payees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_payees_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "exit_payees_document_fkey" FOREIGN KEY ("organization_id", "document_id") REFERENCES "documents"("organization_id", "id"),
    CONSTRAINT "exit_payees_kind_check" CHECK ("kind" IN ('nominee', 'legal_heir')),
    CONSTRAINT "exit_payees_heir_check" CHECK ("kind" <> 'legal_heir' OR "document_id" IS NOT NULL),
    CONSTRAINT "exit_payees_share_check" CHECK ("share_percent" > 0 AND "share_percent" <= 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "exit_payees" FROM app_runtime;
ALTER TABLE "exit_settlement_inputs" ADD COLUMN "payees" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "alumni_sessions" ADD COLUMN "payee_id" UUID, ADD CONSTRAINT "alumni_sessions_payee_fkey" FOREIGN KEY ("organization_id", "payee_id") REFERENCES "exit_payees"("organization_id", "id");

ALTER TABLE "document_types" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'death_certificate', 'Death certificate', 'confidential', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 10, false, '{}', ARRAY['hr']),
  (NULL, 'succession_certificate', 'Succession or legal-heir certificate', 'confidential', true, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 10, false, '{}', ARRAY['hr']);
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------------- absconding (YX-LC-17)
CREATE TABLE "absconding_timelines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "last_present_on" DATE NOT NULL,
    "steps" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'running',
    "exit_case_id" UUID,
    "stopped_reason" VARCHAR(500),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "absconding_timelines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "absconding_timelines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "absconding_timelines_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "absconding_timelines_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "absconding_timelines_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "absconding_timelines_status_check" CHECK ("status" IN ('running', 'stopped', 'abandoned'))
);
CREATE UNIQUE INDEX "absconding_timelines_live_key" ON "absconding_timelines" ("organization_id", "employment_id") WHERE "status" = 'running';
REVOKE DELETE, TRUNCATE ON TABLE "absconding_timelines" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- retrenchment, VRS (YX-LC-27)
ALTER TABLE "exit_cases" DROP CONSTRAINT "exit_cases_type_check";
ALTER TABLE "exit_cases" ADD CONSTRAINT "exit_cases_type_check" CHECK ("exit_type" IN ('resignation', 'termination', 'probation_termination', 'end_of_contract', 'retirement', 'death', 'absconding', 'retrenchment', 'vrs'));
ALTER TABLE "exit_cases" DROP CONSTRAINT "exit_cases_initiated_check";
ALTER TABLE "exit_cases" ADD CONSTRAINT "exit_cases_initiated_check" CHECK ("initiated_by" IN ('employee', 'company') AND ("exit_type" IN ('resignation', 'vrs')) = ("initiated_by" = 'employee'));
ALTER TABLE "exit_cases"
  ADD COLUMN "retrenchment" JSONB,
  ADD COLUMN "ir_permission_id" UUID,
  ADD COLUMN "vrs_scheme_id" UUID;

CREATE TABLE "ir_permission_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "workers_affected" INTEGER NOT NULL,
    "reasons" VARCHAR(2000) NOT NULL,
    "applied_on" DATE NOT NULL,
    "authority" VARCHAR(200) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'applied',
    "decided_on" DATE,
    "order_document_id" UUID,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ir_permission_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ir_permission_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "ir_permission_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ir_permission_requests_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "ir_permission_requests_kind_check" CHECK ("kind" IN ('retrenchment', 'layoff', 'closure')),
    CONSTRAINT "ir_permission_requests_status_check" CHECK ("status" IN ('applied', 'granted', 'deemed', 'refused')),
    CONSTRAINT "ir_permission_requests_workers_check" CHECK ("workers_affected" > 0),
    CONSTRAINT "ir_permission_requests_decided_check" CHECK (("status" = 'applied') = ("decided_on" IS NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "ir_permission_requests" FROM app_runtime;

CREATE TABLE "vrs_schemes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "legal_entity_id" UUID,
    "opens_on" DATE NOT NULL,
    "closes_on" DATE NOT NULL,
    "min_age" INTEGER NOT NULL DEFAULT 40,
    "min_service_years" INTEGER NOT NULL DEFAULT 10,
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vrs_schemes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vrs_schemes_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "vrs_schemes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vrs_schemes_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "vrs_schemes_dates_check" CHECK ("closes_on" >= "opens_on"),
    CONSTRAINT "vrs_schemes_status_check" CHECK ("status" IN ('open', 'closed'))
);
REVOKE DELETE, TRUNCATE ON TABLE "vrs_schemes" FROM app_runtime;
ALTER TABLE "exit_cases"
  ADD CONSTRAINT "exit_cases_ir_permission_fkey" FOREIGN KEY ("organization_id", "ir_permission_id") REFERENCES "ir_permission_requests"("organization_id", "id"),
  ADD CONSTRAINT "exit_cases_vrs_fkey" FOREIGN KEY ("organization_id", "vrs_scheme_id") REFERENCES "vrs_schemes"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------- letter editor (PPL-29)
ALTER TABLE "letter_templates" DROP CONSTRAINT "letter_templates_source_check";
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_source_check" CHECK ("source" IN ('upload', 'starter', 'editor'));

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['joiner_batches', 'employee_nominations', 'exit_payees', 'absconding_timelines', 'ir_permission_requests', 'vrs_schemes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  -- P02 Q8: YukthiX support never reads nominations, a deceased person's payees or an absconding timeline.
  FOREACH t IN ARRAY ARRAY['employee_nominations', 'exit_payees', 'absconding_timelines']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
