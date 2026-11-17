-- Assessments AS-6 part 2 (answer 2272): AI-allowed tests. A test may let candidates use the approved assistant inside
-- the runner; every message both ways is kept on the attempt's record for the markers. No data written.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "exams" ADD COLUMN "ai_allowed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "asmt_assistant_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "attempt_id" UUID NOT NULL,
    -- The question the candidate was on when they asked (empty when not on one).
    "question_id" UUID,
    "role" VARCHAR(10) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    CONSTRAINT "asmt_assistant_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asmt_assistant_messages_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_assistant_messages_role_check" CHECK ("role" IN ('candidate', 'assistant')),
    CONSTRAINT "asmt_assistant_messages_body_check" CHECK (char_length("body") BETWEEN 1 AND 8000)
);
CREATE INDEX "asmt_assistant_messages_attempt_idx" ON "asmt_assistant_messages" ("attempt_id", "created_at");
CREATE INDEX "asmt_assistant_messages_organization_id_idx" ON "asmt_assistant_messages" ("organization_id");
CREATE TRIGGER asmt_org BEFORE INSERT ON "asmt_assistant_messages" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
ALTER TABLE "asmt_assistant_messages" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asmt_assistant_messages"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- The log is the record the markers rely on: the runtime adds to it and never rewrites it (a data-rights erase may
-- still delete it with the candidate's other free text).
REVOKE UPDATE, TRUNCATE ON TABLE "asmt_assistant_messages" FROM app_runtime;
