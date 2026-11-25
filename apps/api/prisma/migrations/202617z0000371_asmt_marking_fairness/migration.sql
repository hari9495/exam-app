-- Assessments AS-6 (answers 2019, 2154, 2165): marking and fairness. Section cut-offs, each marker's own mark (blind,
-- a second marker and moderation when the company asks for it), the AI suggestion kept apart from the marks, a
-- candidate's voluntary self-description used only in aggregate, and the review of a fairness finding. No data written.
SELECT set_config('app.is_super_admin', 'on', true);

-- 2154: a section may need its own least percentage; the sections that missed it, on the result.
ALTER TABLE "exam_sections" ADD COLUMN "cutoff_percent" INTEGER;
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_cutoff_check" CHECK ("cutoff_percent" IS NULL OR "cutoff_percent" BETWEEN 1 AND 100);
ALTER TABLE "results" ADD COLUMN "cutoff_missed" UUID[] NOT NULL DEFAULT '{}';

-- PRC-19: each person's mark on one answer. round 1 and 2 are the blind markers; 3 is the moderator.
CREATE TABLE "answer_marks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "marker_user_id" UUID NOT NULL,
    "round" SMALLINT NOT NULL,
    "marks" INTEGER NOT NULL,
    "feedback" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "answer_marks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "answer_marks_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "answer_marks_round_check" CHECK ("round" BETWEEN 1 AND 3),
    CONSTRAINT "answer_marks_marks_check" CHECK ("marks" >= 0)
);
-- One mark per person per answer, and one per round: two presses at once, or two people in one round, record once.
CREATE UNIQUE INDEX "answer_marks_marker_key" ON "answer_marks" ("attempt_id", "question_id", "marker_user_id");
CREATE UNIQUE INDEX "answer_marks_round_key" ON "answer_marks" ("attempt_id", "question_id", "round");
CREATE INDEX "answer_marks_organization_id_idx" ON "answer_marks" ("organization_id");
CREATE TRIGGER asmt_org BEFORE INSERT ON "answer_marks" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
ALTER TABLE "answer_marks" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "answer_marks"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- A mark is never changed or removed: a moderator's mark settles a disagreement.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "answer_marks" FROM app_runtime;

-- PRC-19: the AI's suggested mark for an answer, shown only to someone who has marked it (never for an under-18).
CREATE TABLE "answer_ai_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "marks" INTEGER NOT NULL,
    "reason" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "answer_ai_suggestions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "answer_ai_suggestions_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "answer_ai_suggestions_marks_check" CHECK ("marks" >= 0)
);
CREATE UNIQUE INDEX "answer_ai_suggestions_answer_key" ON "answer_ai_suggestions" ("attempt_id", "question_id");
CREATE INDEX "answer_ai_suggestions_organization_id_idx" ON "answer_ai_suggestions" ("organization_id");
CREATE TRIGGER asmt_org BEFORE INSERT ON "answer_ai_suggestions" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
ALTER TABLE "answer_ai_suggestions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "answer_ai_suggestions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- 2019: how a candidate chose to describe themselves after a test (voluntary, used only in aggregate).
CREATE TABLE "attempt_self_descriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "attempt_id" UUID NOT NULL,
    "gender" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attempt_self_descriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attempt_self_descriptions_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "attempt_self_descriptions_gender_check" CHECK ("gender" IN ('woman', 'man', 'another', 'not_say'))
);
CREATE UNIQUE INDEX "attempt_self_descriptions_attempt_key" ON "attempt_self_descriptions" ("attempt_id");
CREATE INDEX "attempt_self_descriptions_organization_id_idx" ON "attempt_self_descriptions" ("organization_id");
CREATE TRIGGER asmt_org BEFORE INSERT ON "attempt_self_descriptions" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
ALTER TABLE "attempt_self_descriptions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attempt_self_descriptions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
REVOKE UPDATE, TRUNCATE ON TABLE "attempt_self_descriptions" FROM app_runtime;

-- 2019: a fairness finding on a test opens a review: keep with a reason, revise or retire.
CREATE TABLE "asmt_fairness_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "finding" VARCHAR(500) NOT NULL,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" VARCHAR(10),
    "reason" VARCHAR(2000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "asmt_fairness_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asmt_fairness_reviews_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_fairness_reviews_exam_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_fairness_reviews_decision_check" CHECK ("decision" IS NULL OR ("decision" IN ('keep', 'revise', 'retire') AND "decided_by" IS NOT NULL AND char_length(btrim(coalesce("reason", ''))) >= 10))
);
-- One open review per test at a time.
CREATE UNIQUE INDEX "asmt_fairness_reviews_open_key" ON "asmt_fairness_reviews" ("exam_id") WHERE "decision" IS NULL;
CREATE INDEX "asmt_fairness_reviews_organization_id_idx" ON "asmt_fairness_reviews" ("organization_id");
ALTER TABLE "asmt_fairness_reviews" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asmt_fairness_reviews"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
