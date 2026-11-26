-- G3 port onto PR #210 Learning: a session's reaction (each attendee once) and the manager's later check (LRN-12),
-- the learner's own overdue reminder (answer 2609: the manager after 7 days, HR after 14), and the day managers were
-- asked to check a confirmed session.

ALTER TABLE "learning_reminders" DROP CONSTRAINT "learning_reminders_kind_check";
ALTER TABLE "learning_reminders" ADD CONSTRAINT "learning_reminders_kind_check" CHECK ("kind" IN ('before_7', 'before_2', 'overdue', 'overdue_manager', 'overdue_hr'));

ALTER TABLE "learning_sessions" ADD COLUMN "check_sent_at" TIMESTAMPTZ(3);

CREATE TABLE "learning_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "enrolment_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "by_user_id" UUID NOT NULL,
    "overall" SMALLINT,
    "trainer" SMALLINT,
    "applying" VARCHAR(8),
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_feedback_once" UNIQUE ("enrolment_id", "kind"),
    CONSTRAINT "learning_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "learning_feedback_session_fkey" FOREIGN KEY ("session_id") REFERENCES "learning_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_feedback_enrolment_fkey" FOREIGN KEY ("enrolment_id") REFERENCES "learning_enrolments"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_feedback_kind_check" CHECK ("kind" IN ('reaction', 'check')),
    CONSTRAINT "learning_feedback_scores_check" CHECK (("kind" = 'reaction' AND "overall" BETWEEN 1 AND 5 AND "trainer" BETWEEN 1 AND 5 AND "applying" IS NULL)
      OR ("kind" = 'check' AND "overall" IS NULL AND "trainer" IS NULL AND "applying" IN ('yes', 'partly', 'no', 'early')))
);
CREATE INDEX "learning_feedback_session_idx" ON "learning_feedback"("organization_id", "session_id");

ALTER TABLE "learning_feedback" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "learning_feedback"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "learning_feedback" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
