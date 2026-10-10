-- Lifecycle batch 6c (M01-LIFECYCLE-BUILD-DESIGN §5.4, §10): probation reviews, exit cases (resignation and company
-- exits), HR-only exit facts, clearance, exit interviews and the shared asset list (D3). Every table: forced RLS +
-- tenant_isolation; HR-only facts and interview answers also need app.lifecycle_confidential = on, which the API sets
-- per transaction only after the confidential key and scope check (§15).

-- ---------------------------------------------------------------------------------------------- P06: notice
-- Accepting a resignation puts the employment on notice from that day; a withdrawal ends it. Both are system changes.
ALTER TABLE "employee_changes" DROP CONSTRAINT "employee_changes_type_check";
ALTER TABLE "employee_changes" ADD CONSTRAINT "employee_changes_type_check" CHECK ("change_type" IN ('join', 'promotion', 'transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction', 'notice', 'notice_withdrawal'));

-- ---------------------------------------------------------------------------------------------- exit cases
CREATE TABLE "exit_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "exit_type" VARCHAR(24) NOT NULL,
    "initiated_by" VARCHAR(8) NOT NULL,
    "reason_code" VARCHAR(40),
    "reason_text" VARCHAR(1000),
    "submitted_on" DATE NOT NULL,
    "requested_lwd" DATE,
    "notice_period" VARCHAR(4) NOT NULL,
    "standard_lwd" DATE NOT NULL,
    "approved_lwd" DATE,
    "notice_arrangement" JSONB,
    "status" VARCHAR(12) NOT NULL,
    "wf_request_id" UUID,
    "change_wf_request_id" UUID,
    "change_kind" VARCHAR(16),
    "change_payload" JSONB,
    "accepted_at" TIMESTAMPTZ(3),
    "withdrawn_at" TIMESTAMPTZ(3),
    "letters_held" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exit_cases_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "exit_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_cases_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "exit_cases_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "exit_cases_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "exit_cases_wf_fkey" FOREIGN KEY ("organization_id", "wf_request_id") REFERENCES "wf_requests"("organization_id", "id"),
    CONSTRAINT "exit_cases_change_wf_fkey" FOREIGN KEY ("organization_id", "change_wf_request_id") REFERENCES "wf_requests"("organization_id", "id"),
    CONSTRAINT "exit_cases_created_by_fkey" FOREIGN KEY ("organization_id", "created_by") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "exit_cases_type_check" CHECK ("exit_type" IN ('resignation', 'termination', 'probation_termination', 'end_of_contract', 'retirement', 'death', 'absconding')),
    CONSTRAINT "exit_cases_initiated_check" CHECK ("initiated_by" IN ('employee', 'company') AND ("exit_type" = 'resignation') = ("initiated_by" = 'employee')),
    CONSTRAINT "exit_cases_status_check" CHECK ("status" IN ('submitted', 'accepted', 'rejected', 'withdrawn', 'cleared', 'exited', 'closed')),
    CONSTRAINT "exit_cases_notice_check" CHECK ("notice_period" ~ '^[0-9]{1,3}[dm]$'),
    -- A resignation's last day is never before it was given; a company exit may record a past day (death, absconding).
    CONSTRAINT "exit_cases_lwd_check" CHECK ("initiated_by" = 'company' OR ("standard_lwd" >= "submitted_on" AND ("approved_lwd" IS NULL OR "approved_lwd" >= "submitted_on"))),
    CONSTRAINT "exit_cases_accepted_check" CHECK ("status" IN ('submitted', 'rejected') OR "status" = 'withdrawn' OR "approved_lwd" IS NOT NULL),
    CONSTRAINT "exit_cases_change_check" CHECK ("change_kind" IS NULL OR "change_kind" IN ('withdrawal', 'early_release', 'buyout', 'lwd_change'))
);
-- One live exit per employment.
CREATE UNIQUE INDEX "exit_cases_live_key" ON "exit_cases" ("organization_id", "employment_id") WHERE "status" IN ('submitted', 'accepted', 'cleared');
CREATE INDEX "exit_cases_status_idx" ON "exit_cases" ("organization_id", "status");
REVOKE DELETE, TRUNCATE ON TABLE "exit_cases" FROM app_runtime;

-- HR-only facts (YX-LC-23): rehire, regretted, backfill, open-case flags, the hold reason. Never shown to the manager.
CREATE TABLE "exit_case_hr" (
    "exit_case_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "rehire_eligible" BOOLEAN,
    "rehire_reason" VARCHAR(500),
    "regretted" BOOLEAN,
    "backfill_requested" BOOLEAN NOT NULL DEFAULT false,
    "open_case_flags" JSONB NOT NULL DEFAULT '{}',
    "hold_reason" VARCHAR(500),
    "hold_review_on" DATE,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_case_hr_pkey" PRIMARY KEY ("exit_case_id"),
    CONSTRAINT "exit_case_hr_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_case_hr_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "exit_case_hr" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- assets (D3: one shared list)
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "tag" VARCHAR(60) NOT NULL,
    "serial" VARCHAR(100),
    "legal_entity_id" UUID,
    "location_id" UUID,
    "purchased_on" DATE,
    "cost" DECIMAL(14,2),
    "status" VARCHAR(10) NOT NULL DEFAULT 'in_stock',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assets_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assets_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "assets_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "assets_status_check" CHECK ("status" IN ('in_stock', 'assigned', 'in_repair', 'retired', 'lost')),
    CONSTRAINT "assets_cost_check" CHECK ("cost" IS NULL OR "cost" >= 0)
);
CREATE UNIQUE INDEX "assets_tag_key" ON "assets" ("organization_id", lower("tag"));
REVOKE DELETE, TRUNCATE ON TABLE "assets" FROM app_runtime;

CREATE TABLE "asset_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "issued_on" DATE NOT NULL,
    "issue_condition" VARCHAR(200) NOT NULL,
    "issued_by" UUID,
    "ack_evidence" JSONB,
    "returned_on" DATE,
    "return_condition" VARCHAR(200),
    "returned_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_assignments_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "asset_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "asset_assignments_asset_fkey" FOREIGN KEY ("organization_id", "asset_id") REFERENCES "assets"("organization_id", "id"),
    CONSTRAINT "asset_assignments_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "asset_assignments_return_check" CHECK (("returned_on" IS NULL) = ("return_condition" IS NULL) AND ("returned_on" IS NULL OR "returned_on" >= "issued_on"))
);
-- One open assignment per asset.
CREATE UNIQUE INDEX "asset_assignments_open_key" ON "asset_assignments" ("organization_id", "asset_id") WHERE "returned_on" IS NULL;
CREATE INDEX "asset_assignments_person_idx" ON "asset_assignments" ("organization_id", "person_id");
REVOKE DELETE, TRUNCATE ON TABLE "asset_assignments" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- clearance
CREATE TABLE "clearance_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "department" VARCHAR(20) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "owner_user_id" UUID,
    "owner_group_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "note" VARCHAR(1000),
    "recovery_amount" DECIMAL(14,2),
    "recovery_reason" VARCHAR(300),
    "asset_assignment_id" UUID,
    "signed_off_by" UUID,
    "signed_off_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clearance_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clearance_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "clearance_items_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "clearance_items_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "clearance_items_assignment_fkey" FOREIGN KEY ("organization_id", "asset_assignment_id") REFERENCES "asset_assignments"("organization_id", "id"),
    CONSTRAINT "clearance_items_department_check" CHECK ("department" IN ('manager_handover', 'it', 'admin', 'finance', 'hr', 'asset', 'custom')),
    CONSTRAINT "clearance_items_status_check" CHECK ("status" IN ('open', 'cleared', 'waived')),
    CONSTRAINT "clearance_items_owner_check" CHECK ("owner_user_id" IS NOT NULL OR "owner_group_id" IS NOT NULL),
    CONSTRAINT "clearance_items_recovery_check" CHECK (("recovery_amount" IS NULL OR ("recovery_amount" > 0 AND "recovery_reason" IS NOT NULL))),
    CONSTRAINT "clearance_items_signed_check" CHECK (("status" = 'open') = ("signed_off_at" IS NULL)),
    CONSTRAINT "clearance_items_waive_check" CHECK ("status" <> 'waived' OR "note" IS NOT NULL)
);
CREATE INDEX "clearance_items_case_idx" ON "clearance_items" ("organization_id", "exit_case_id");
REVOKE DELETE, TRUNCATE ON TABLE "clearance_items" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- exit interview
CREATE TABLE "exit_interviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "form_version" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'sent',
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_interviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exit_interviews_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "exit_interviews_case_key" UNIQUE ("organization_id", "exit_case_id"),
    CONSTRAINT "exit_interviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_interviews_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "exit_interviews_status_check" CHECK ("status" IN ('sent', 'submitted', 'skipped')),
    CONSTRAINT "exit_interviews_submitted_check" CHECK (("status" = 'submitted') = ("submitted_at" IS NOT NULL))
);
REVOKE DELETE, TRUNCATE ON TABLE "exit_interviews" FROM app_runtime;

-- The answers, sealed with the company key (YX-LC-09): HR with the confidential key only.
CREATE TABLE "exit_interview_answers" (
    "exit_interview_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "answers_enc" TEXT NOT NULL,
    "hr_notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_interview_answers_pkey" PRIMARY KEY ("exit_interview_id"),
    CONSTRAINT "exit_interview_answers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exit_interview_answers_interview_fkey" FOREIGN KEY ("organization_id", "exit_interview_id") REFERENCES "exit_interviews"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "exit_interview_answers" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- probation reviews (LIFE-3.01)
CREATE TABLE "probation_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "outcome" VARCHAR(10) NOT NULL,
    "months" INTEGER,
    "comments" VARCHAR(2000) NOT NULL,
    "rating" INTEGER,
    "change_id" UUID,
    "exit_case_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "probation_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "probation_reviews_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "probation_reviews_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "probation_reviews_reviewer_fkey" FOREIGN KEY ("organization_id", "reviewer_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "probation_reviews_case_fkey" FOREIGN KEY ("organization_id", "exit_case_id") REFERENCES "exit_cases"("organization_id", "id"),
    CONSTRAINT "probation_reviews_outcome_check" CHECK ("outcome" IN ('confirm', 'extend', 'terminate') AND (("outcome" = 'extend') = ("months" IS NOT NULL))),
    CONSTRAINT "probation_reviews_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5)
);
CREATE INDEX "probation_reviews_employment_idx" ON "probation_reviews" ("organization_id", "employment_id");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "probation_reviews" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exit_cases', 'exit_case_hr', 'assets', 'asset_assignments', 'clearance_items', 'exit_interviews', 'exit_interview_answers', 'probation_reviews']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  -- P02 Q8: YukthiX support never reads exit cases, clearance, interviews or probation reviews.
  FOREACH t IN ARRAY ARRAY['exit_cases', 'exit_case_hr', 'clearance_items', 'exit_interviews', 'exit_interview_answers', 'probation_reviews']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
  -- §15: HR-only facts and interview answers need the per-transaction confidential flag the API sets after its checks.
  FOREACH t IN ARRAY ARRAY['exit_case_hr', 'exit_interview_answers']
  LOOP
    EXECUTE format(
      'CREATE POLICY lifecycle_confidential ON %I AS RESTRICTIVE
         USING (current_setting(''app.lifecycle_confidential'', true) = ''on'')
         WITH CHECK (current_setting(''app.lifecycle_confidential'', true) = ''on'')',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- permission keys (§6)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'lifecycle.exit.view', 'See the exit cases of the people in scope (never the HR-only facts)'),
  (gen_random_uuid(), 'lifecycle.exit.manage', 'Start company exits, accept resignations on the HR step, change last working days, set holds and clearance'),
  (gen_random_uuid(), 'lifecycle.exit.confidential.view', 'Read HR-only exit facts (open-case flags, rehire, hold reasons) and confidential exit interview answers'),
  (gen_random_uuid(), 'asset.view', 'See the company asset list and who holds what'),
  (gen_random_uuid(), 'asset.manage', 'Add assets, issue them to people and take them back')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('lifecycle.exit.view', 'lifecycle.exit.manage', 'asset.view', 'asset.manage')
ON CONFLICT DO NOTHING;
