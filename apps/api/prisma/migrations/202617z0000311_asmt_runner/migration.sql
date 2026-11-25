-- Assessments AS-4a: the designed test runner (PRC-26) and released or held results (PRC-27).
SELECT set_config('app.is_super_admin', 'on', true);

-- Answer 2122: the question version each answer saw (questions.version, AS-1), and when the candidate's device saved it
-- (answers kept on the device while offline are sent later; an older copy never overwrites a newer one).
ALTER TABLE "answers" ADD COLUMN "question_version" INTEGER;
ALTER TABLE "answers" ADD COLUMN "client_saved_at" TIMESTAMPTZ(3);

-- Per test: the calculator offered (none, basic or scientific) and the breaks a candidate may take (count, minutes each).
ALTER TABLE "exams" ADD COLUMN "calculator" VARCHAR(12) NOT NULL DEFAULT 'none';
ALTER TABLE "exams" ADD COLUMN "breaks_allowed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "exams" ADD COLUMN "break_minutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "exams" ADD CONSTRAINT "exams_calculator_check" CHECK ("calculator" IN ('none', 'basic', 'scientific'));
ALTER TABLE "exams" ADD CONSTRAINT "exams_breaks_check" CHECK ("breaks_allowed" BETWEEN 0 AND 5 AND "break_minutes" BETWEEN 1 AND 30);

-- Per attempt: breaks taken, and the time given back for a lost connection (capped by asmt.time_credit_cap).
ALTER TABLE "attempts" ADD COLUMN "breaks_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attempts" ADD COLUMN "offline_credit_ms" INTEGER NOT NULL DEFAULT 0;

-- The optional after-test survey: one per attempt; never affects the score; reported only in groups of 5 or more.
CREATE TABLE "attempt_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "clear_instructions" BOOLEAN,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attempt_surveys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attempt_surveys_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "attempt_surveys_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "attempt_surveys_attempt_key" ON "attempt_surveys" ("attempt_id");
CREATE INDEX "attempt_surveys_organization_id_idx" ON "attempt_surveys" ("organization_id");
CREATE TRIGGER asmt_org BEFORE INSERT ON "attempt_surveys" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
ALTER TABLE "attempt_surveys" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attempt_surveys"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- A survey answer is never changed or removed by the app.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "attempt_surveys" FROM app_runtime;
