-- Question bank follow-ups (founder answers 2121, 2125, 2126, 2129, 16 Nov 2026).
-- 2129: once a day, each bank writer with questions waiting for their review gets one bell note. This table is the
-- "already told today" mark: the sweep inserts (person, India day) first and tells only when the insert happened, so a
-- re-run, a retry or two servers never send a second note. Kept 30 days by the same sweep.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "question_review_nudges" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "waiting" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "question_review_nudges_pkey" PRIMARY KEY ("organization_id", "user_id", "day"),
    CONSTRAINT "question_review_nudges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "question_review_nudges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "question_review_nudges_waiting_check" CHECK ("waiting" > 0)
);
ALTER TABLE "question_review_nudges" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "question_review_nudges" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
