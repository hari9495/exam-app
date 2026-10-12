-- Performance batch PM4 (M06-BUILD-DESIGN §5.5, §9; PM-4.01 … 4.07): review cycles with a frozen template and scale,
-- who is reviewed and why (J11), one review per person per cycle, the entries of each stage, the visible trail of
-- stages (U73), disagreements after release and the manager hand-over list (D7).
-- Forced RLS + tenant_isolation; support sessions never read any of it (§5.10). Decisions are never erased (§15.2).

CREATE TABLE "review_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "template_id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "population" JSONB,
    "stages" JSONB NOT NULL,
    "eligibility_rules" JSONB NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'draft',
    "launched_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_cycles_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "review_cycles_template_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "review_templates"("organization_id", "id"),
    CONSTRAINT "review_cycles_scale_fkey" FOREIGN KEY ("organization_id", "scale_id") REFERENCES "rating_scales"("organization_id", "id"),
    CONSTRAINT "review_cycles_kind_check" CHECK ("kind" IN ('annual', 'half_yearly', 'quarterly', 'project', 'probation')),
    CONSTRAINT "review_cycles_status_check" CHECK ("status" IN ('draft', 'launched', 'calibrating', 'released', 'closed')),
    CONSTRAINT "review_cycles_period_check" CHECK ("period_to" > "period_from")
);

CREATE TABLE "review_eligibility" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "rule" VARCHAR(16) NOT NULL,
    "eligible_months" DECIMAL(4,1) NOT NULL,
    "proration" DECIMAL(5,4) NOT NULL,
    "reviewed" BOOLEAN NOT NULL,
    "override_reason" VARCHAR(500),
    "by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_eligibility_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_eligibility_one_key" UNIQUE ("cycle_id", "employee_id"),
    CONSTRAINT "review_eligibility_cycle_fkey" FOREIGN KEY ("organization_id", "cycle_id") REFERENCES "review_cycles"("organization_id", "id"),
    CONSTRAINT "review_eligibility_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "review_eligibility_rule_check" CHECK ("rule" IN ('included', 'excluded_cutoff', 'leaver', 'transfer_split', 'protected_leave', 'override'))
);

CREATE TABLE "reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "manager_employee_id" UUID NOT NULL,
    "stage" VARCHAR(12) NOT NULL,
    "status" VARCHAR(14) NOT NULL DEFAULT 'open',
    "section_scores" JSONB,
    "excluded_sections" JSONB,
    "final_score" DECIMAL(5,2),
    "band" VARCHAR(60),
    "calibrated_score" DECIMAL(5,2),
    "released_at" TIMESTAMPTZ(3),
    "acknowledged_at" TIMESTAMPTZ(3),
    "acknowledge_comment" VARCHAR(2000),
    "disagreement" BOOLEAN NOT NULL DEFAULT false,
    "reopened_reason" VARCHAR(500),
    "reminded_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "reviews_one_key" UNIQUE ("cycle_id", "employee_id"),
    CONSTRAINT "reviews_cycle_fkey" FOREIGN KEY ("organization_id", "cycle_id") REFERENCES "review_cycles"("organization_id", "id"),
    CONSTRAINT "reviews_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "reviews_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "reviews_stage_check" CHECK ("stage" IN ('self', 'manager', 'skip', 'calibration', 'release', 'done')),
    CONSTRAINT "reviews_status_check" CHECK ("status" IN ('open', 'in_calibration', 'ready', 'released', 'acknowledged', 'closed'))
);
CREATE INDEX "reviews_manager_idx" ON "reviews" ("organization_id", "manager_employee_id", "status");

CREATE TABLE "review_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "stage" VARCHAR(8) NOT NULL,
    "author_user_id" UUID NOT NULL,
    "author_employee_id" UUID,
    "relationship" VARCHAR(8) NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "overall_rating" DECIMAL(4,1),
    "comment" VARCHAR(5000),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(3),
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_entries_one_key" UNIQUE ("review_id", "stage", "author_user_id"),
    CONSTRAINT "review_entries_review_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id"),
    CONSTRAINT "review_entries_stage_check" CHECK ("stage" IN ('self', 'manager', 'peer', 'skip', 'other')),
    CONSTRAINT "review_entries_relationship_check" CHECK ("relationship" IN ('self', 'manager', 'peer', 'report', 'skip', 'other')),
    CONSTRAINT "review_entries_status_check" CHECK ("status" IN ('draft', 'submitted'))
);

CREATE TABLE "review_stage_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "stage" VARCHAR(12) NOT NULL,
    "from_owner" UUID,
    "to_owner" UUID,
    "event" VARCHAR(12) NOT NULL,
    "reason" VARCHAR(500),
    "by_user_id" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_stage_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_stage_log_review_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id"),
    CONSTRAINT "review_stage_log_event_check" CHECK ("event" IN ('opened', 'submitted', 'skipped', 'reassigned', 'reopened', 'sent_back', 'released', 'acknowledged'))
);
CREATE INDEX "review_stage_log_review_idx" ON "review_stage_log" ("organization_id", "review_id", "at");

CREATE TABLE "review_disagreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "hr_note" VARCHAR(2000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "review_disagreements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "review_disagreements_review_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id"),
    CONSTRAINT "review_disagreements_status_check" CHECK ("status" IN ('open', 'answered', 'upheld', 'not_upheld'))
);

CREATE TABLE "perf_owner_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "old_manager_employee_id" UUID,
    "new_manager_employee_id" UUID,
    "effective_on" DATE NOT NULL,
    "artefact_type" VARCHAR(20) NOT NULL,
    "artefact_id" UUID NOT NULL,
    "decision_needed" BOOLEAN NOT NULL DEFAULT false,
    "by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_owner_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_owner_transfers_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['review_cycles', 'review_eligibility', 'reviews', 'review_entries', 'review_stage_log', 'review_disagreements', 'perf_owner_transfers']
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

-- ---------------------------------------------------------------------------------------------- permission keys (§17)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.cycle.manage', 'Create, launch, release, reopen and close review cycles; eligibility overrides'),
  (gen_random_uuid(), 'perf.review.view', 'Reviews and ratings of people in scope, before and after release')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('perf.cycle.manage', 'perf.review.view')
ON CONFLICT DO NOTHING;
