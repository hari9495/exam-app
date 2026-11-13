-- Founder request "Ask YukthiX" (answers 2101 to 2108): a help assistant that answers questions about YukthiX from
-- approved YukthiX help content only, hands over to a Contact YukthiX ticket or a feature request, and is limited to
-- help.assistant.daily_questions (50) questions per person per day. Conversations are the asking person's own (RLS:
-- the company, then the person; YukthiX staff read them for the assistant review) and are deleted after
-- help.assistant.keep_days. Feature requests land in a staff list.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "assistant_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unhelpful" SMALLINT NOT NULL DEFAULT 0,
    "ticket_ref" VARCHAR(40),
    "feature_request_id" UUID,
    "handed_over_at" TIMESTAMPTZ(3),
    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "assistant_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "assistant_conversations_user_idx" ON "assistant_conversations" ("organization_id", "user_id", "last_at" DESC);
CREATE INDEX "assistant_conversations_last_idx" ON "assistant_conversations" ("last_at");

CREATE TABLE "assistant_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "outcome" VARCHAR(20),
    "feedback" VARCHAR(4),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_messages_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
    CONSTRAINT "assistant_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "assistant_messages_role_check" CHECK ("role" IN ('user', 'assistant')),
    CONSTRAINT "assistant_messages_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('answered', 'not_covered', 'needs_person', 'feature_request', 'buying', 'refused', 'error')),
    CONSTRAINT "assistant_messages_feedback_check" CHECK ("feedback" IS NULL OR "feedback" IN ('up', 'down')),
    -- Only the assistant's answers carry an outcome and thumbs.
    CONSTRAINT "assistant_messages_answer_check" CHECK ("role" = 'assistant' OR ("outcome" IS NULL AND "feedback" IS NULL))
);
CREATE INDEX "assistant_messages_conversation_idx" ON "assistant_messages" ("conversation_id", "created_at");
CREATE INDEX "assistant_messages_outcome_idx" ON "assistant_messages" ("created_at") WHERE "role" = 'assistant';

-- One row per person per India day: the questions asked. Counted with one atomic upsert that refuses past the limit.
CREATE TABLE "assistant_daily_counts" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "questions" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "assistant_daily_counts_pkey" PRIMARY KEY ("user_id", "day"),
    CONSTRAINT "assistant_daily_counts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "assistant_daily_counts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "assistant_daily_counts_questions_check" CHECK ("questions" >= 0)
);

CREATE TABLE "feature_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "requested_by" UUID,
    "requested_by_name" VARCHAR(200) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "details" VARCHAR(2000) NOT NULL DEFAULT '',
    "conversation_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'new',
    "duplicate_of" UUID,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "staff_note" VARCHAR(500),
    "notified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feature_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "feature_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "feature_requests_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE SET NULL,
    CONSTRAINT "feature_requests_duplicate_fkey" FOREIGN KEY ("duplicate_of") REFERENCES "feature_requests"("id") ON DELETE SET NULL,
    CONSTRAINT "feature_requests_status_check" CHECK ("status" IN ('new', 'planned', 'not_now', 'done')),
    CONSTRAINT "feature_requests_not_self_check" CHECK ("duplicate_of" IS NULL OR "duplicate_of" <> "id")
);
CREATE UNIQUE INDEX "feature_requests_number_key" ON "feature_requests" ("number");
CREATE INDEX "feature_requests_status_idx" ON "feature_requests" ("status", "created_at" DESC);
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_feature_request_fkey" FOREIGN KEY ("feature_request_id") REFERENCES "feature_requests"("id") ON DELETE SET NULL;

-- The company, then (restrictive) the person: nobody else in the company reads someone's chat. YukthiX staff
-- (super admin context) read all for the assistant review and the feature request list.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assistant_conversations', 'assistant_messages', 'assistant_daily_counts', 'feature_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['assistant_conversations', 'assistant_messages', 'assistant_daily_counts'] LOOP
    EXECUTE format('CREATE POLICY owner_only ON %I AS RESTRICTIVE USING ((SELECT app_is_super_admin()) OR user_id = (SELECT app_current_user_id())) WITH CHECK ((SELECT app_is_super_admin()) OR user_id = (SELECT app_current_user_id()))', t);
  END LOOP;
  -- A company sees its own feature requests only through the person who sent them.
  EXECUTE 'CREATE POLICY owner_only ON "feature_requests" AS RESTRICTIVE USING ((SELECT app_is_super_admin()) OR requested_by = (SELECT app_current_user_id())) WITH CHECK ((SELECT app_is_super_admin()) OR requested_by = (SELECT app_current_user_id()))';
END $$;
-- The app never deletes chats or requests: retention removes chats in the super-admin context; requests stay.
REVOKE DELETE, TRUNCATE ON TABLE "feature_requests" FROM app_runtime;
REVOKE TRUNCATE ON TABLE "assistant_conversations", "assistant_messages", "assistant_daily_counts" FROM app_runtime;
