-- Performance batch PM6 (M06-BUILD-DESIGN §5.7, §11, §13; PM-6.01 … 6.04): calibration sessions with a distribution
-- guide (a guide only: it never blocks sign-off and never moves anyone, Q5), every change with a reason (YX-PERF-08,
-- append-only), and the keys for facilitating and for reports. Forced RLS + tenant_isolation; support sessions never
-- read any of it; nothing erased, changes never edited.

CREATE TABLE "calibration_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "facilitator_user_id" UUID NOT NULL,
    "population" JSONB,
    "guide" JSONB,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "signed_off_by" UUID,
    "signed_off_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calibration_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calibration_sessions_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "calibration_sessions_cycle_fkey" FOREIGN KEY ("organization_id", "cycle_id") REFERENCES "review_cycles"("organization_id", "id"),
    CONSTRAINT "calibration_sessions_status_check" CHECK ("status" IN ('open', 'signed_off'))
);

ALTER TABLE "reviews" ADD COLUMN "calibration_session_id" UUID;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_calibration_fkey" FOREIGN KEY ("organization_id", "calibration_session_id") REFERENCES "calibration_sessions"("organization_id", "id");

CREATE TABLE "calibration_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "from_score" DECIMAL(5,2),
    "to_score" DECIMAL(5,2) NOT NULL,
    "from_band" VARCHAR(60),
    "to_band" VARCHAR(60),
    "reason" VARCHAR(500) NOT NULL,
    "by_user_id" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "calibration_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calibration_changes_session_fkey" FOREIGN KEY ("organization_id", "session_id") REFERENCES "calibration_sessions"("organization_id", "id"),
    CONSTRAINT "calibration_changes_review_fkey" FOREIGN KEY ("organization_id", "review_id") REFERENCES "reviews"("organization_id", "id")
);
CREATE INDEX "calibration_changes_session_idx" ON "calibration_changes" ("organization_id", "session_id", "at");

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calibration_sessions', 'calibration_changes']
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
-- YX-PERF-08: a change is a fact; it is never edited.
REVOKE UPDATE ON TABLE "calibration_changes" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- permission keys (§17)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.calibration.facilitate', 'Run calibration sessions: move ratings with a reason and sign off'),
  (gen_random_uuid(), 'perf.report.view', 'Performance reports of people in scope, with small groups suppressed')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('perf.calibration.facilitate', 'perf.report.view')
ON CONFLICT DO NOTHING;
