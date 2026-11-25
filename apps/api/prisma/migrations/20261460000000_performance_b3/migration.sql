-- Performance builder 3 (PRF-13 … PRF-17): hand-over decisions, dispute escalation with evidence export, manager coach.
-- Forward only. New tables are tenant tables with forced RLS; nothing is ever deleted by the app role.

-- ---------------------------------------------------------------------------------------------- PRF-13 hand-over decisions
-- A moved artefact that needs a decision (today: a goal aligned to the old manager's goal) is decided once, by the new
-- manager or HR; the decision and who made it stay on the row.
ALTER TABLE "perf_owner_transfers"
  ADD COLUMN "decision" VARCHAR(12),
  ADD COLUMN "decision_note" VARCHAR(500),
  ADD COLUMN "decided_by" UUID,
  ADD COLUMN "decided_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "perf_owner_transfers_decision_check" CHECK ("decision" IS NULL OR "decision" IN ('realigned', 'unaligned', 'kept')),
  ADD CONSTRAINT "perf_owner_transfers_decided_check" CHECK (("decision" IS NULL) = ("decided_at" IS NULL));

-- ---------------------------------------------------------------------------------------------- PRF-15 disputes
-- An employee whose disagreement HR answered may escalate it once per review, within perf.dispute.escalate_days.
-- Only holders of perf.dispute.manage read the case; every view and export is in the audit log.
CREATE TABLE "perf_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "ref" VARCHAR(20) NOT NULL,
    "review_id" UUID NOT NULL,
    "disagreement_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "grounds" VARCHAR(4000) NOT NULL,
    "sought" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'raised',
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "decision" VARCHAR(12),
    "decision_note" VARCHAR(2000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_disputes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_disputes_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "perf_disputes_review_key" UNIQUE ("organization_id", "review_id"),
    CONSTRAINT "perf_disputes_ref_key" UNIQUE ("organization_id", "ref"),
    CONSTRAINT "perf_disputes_review_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id"),
    CONSTRAINT "perf_disputes_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "perf_disputes_sought_check" CHECK ("sought" IN ('rereview', 'correct', 'other')),
    CONSTRAINT "perf_disputes_status_check" CHECK ("status" IN ('raised', 'resolved')),
    CONSTRAINT "perf_disputes_decision_check" CHECK ("decision" IS NULL OR "decision" IN ('upheld', 'not_upheld', 'rereview')),
    CONSTRAINT "perf_disputes_decided_check" CHECK (("status" = 'resolved') = ("decision" IS NOT NULL AND "decided_at" IS NOT NULL))
);
CREATE INDEX "perf_disputes_status_idx" ON "perf_disputes" ("organization_id", "status", "created_at");

-- The employee's attachments, stored through the shared file pipeline (type check, size cap, SHA-256, virus scan).
CREATE TABLE "perf_dispute_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_dispute_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_dispute_files_dispute_fkey" FOREIGN KEY ("organization_id", "dispute_id") REFERENCES "perf_disputes"("organization_id", "id")
);
CREATE INDEX "perf_dispute_files_dispute_idx" ON "perf_dispute_files" ("organization_id", "dispute_id");

-- Each evidence export: the items with their hashes at export time, the signatory named, who exported, and the file.
CREATE TABLE "perf_dispute_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "ref" VARCHAR(30) NOT NULL,
    "file_id" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "signatory_user_id" UUID NOT NULL,
    "exported_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_dispute_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_dispute_exports_ref_key" UNIQUE ("organization_id", "ref"),
    CONSTRAINT "perf_dispute_exports_dispute_fkey" FOREIGN KEY ("organization_id", "dispute_id") REFERENCES "perf_disputes"("organization_id", "id")
);
CREATE INDEX "perf_dispute_exports_dispute_idx" ON "perf_dispute_exports" ("organization_id", "dispute_id");

-- ---------------------------------------------------------------------------------------------- PRF-16 manager coach
-- A manager may turn coach nudges off for themselves (HR does not see the choice) and dismiss one nudge for the week.
CREATE TABLE "perf_coach_prefs" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_coach_prefs_pkey" PRIMARY KEY ("organization_id", "user_id")
);

CREATE TABLE "perf_coach_dismissals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nudge_key" VARCHAR(80) NOT NULL,
    "week_of" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "perf_coach_dismissals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "perf_coach_dismissals_one_key" UNIQUE ("organization_id", "user_id", "nudge_key", "week_of")
);

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['perf_disputes', 'perf_dispute_files', 'perf_dispute_exports', 'perf_coach_prefs', 'perf_coach_dismissals']
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

-- ---------------------------------------------------------------------------------------------- permission key
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.dispute.manage', 'Read escalated rating disputes, keep them on legal hold, record decisions and export evidence')
ON CONFLICT DO NOTHING;
