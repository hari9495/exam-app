-- Performance batch PM5 (M06-BUILD-DESIGN §5.6, §10, §15.3; PM-5.01 … 5.03): peer and 360° feedback in a review cycle.
-- A cycle may ask for feedback from colleagues (min / max nominees, a deadline); the employee nominates, the manager
-- approves, declines or adds, HR can add; only approved nominees answer (YX-PERF-04). HR blocks a pair from reviewing
-- each other without saying why. Forced RLS + tenant_isolation; support sessions never read any of it; nothing erased.

ALTER TABLE "review_cycles" ADD COLUMN "peer_feedback" JSONB;

CREATE TABLE "feedback_nominations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "reviewer_employee_id" UUID NOT NULL,
    "relationship" VARCHAR(8) NOT NULL,
    "proposed_by" VARCHAR(8) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'proposed',
    "decided_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_nominations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedback_nominations_one_key" UNIQUE ("review_id", "reviewer_employee_id"),
    CONSTRAINT "feedback_nominations_review_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id"),
    CONSTRAINT "feedback_nominations_reviewer_fkey" FOREIGN KEY ("organization_id", "reviewer_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "feedback_nominations_relationship_check" CHECK ("relationship" IN ('peer', 'report', 'other')),
    CONSTRAINT "feedback_nominations_proposed_by_check" CHECK ("proposed_by" IN ('employee', 'manager', 'hr')),
    CONSTRAINT "feedback_nominations_status_check" CHECK ("status" IN ('proposed', 'approved', 'declined', 'withdrawn', 'submitted'))
);
CREATE INDEX "feedback_nominations_reviewer_idx" ON "feedback_nominations" ("organization_id", "reviewer_employee_id", "status");

CREATE TABLE "reviewer_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_a" UUID NOT NULL,
    "employee_b" UUID NOT NULL,
    "reason_code" VARCHAR(20) NOT NULL,
    "until_on" DATE,
    "set_by" UUID,
    "ended_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviewer_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviewer_blocks_a_fkey" FOREIGN KEY ("organization_id", "employee_a") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "reviewer_blocks_b_fkey" FOREIGN KEY ("organization_id", "employee_b") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "reviewer_blocks_pair_check" CHECK ("employee_a" <> "employee_b"),
    CONSTRAINT "reviewer_blocks_reason_check" CHECK ("reason_code" IN ('conflict', 'confidential_matter'))
);
CREATE INDEX "reviewer_blocks_pair_idx" ON "reviewer_blocks" ("organization_id", "employee_a", "employee_b");

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feedback_nominations', 'reviewer_blocks']
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

-- ---------------------------------------------------------------------------------------------- permission key (§10.3)
-- Revealing the author of an anonymous answer, only to investigate abuse; in no template and no role by default.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.feedback.investigate', 'Reveal the author of one anonymous review answer, with a reason, to investigate abuse')
ON CONFLICT DO NOTHING;
