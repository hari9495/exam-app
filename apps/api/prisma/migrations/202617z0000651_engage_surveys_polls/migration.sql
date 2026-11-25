-- Batch G2 items 74 and 75 (M09 Q3, Q8; answer 2604): surveys, pulse and eNPS, their results and action plans; polls in the
-- feed. Engagement, pulse and eNPS surveys are anonymous: a response row never holds who answered, only coarse slices
-- (department, location, the manager's team) used for results above the smallest group; whether someone answered is
-- kept apart, in the invitation, only for reminders. Onboarding and exit surveys may be named. The mode is locked at launch.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'engage.survey.manage', 'Build, launch and close engagement, pulse, eNPS, onboarding and exit surveys; see company results above the smallest group and every action plan')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'engage.survey.manage'
ON CONFLICT DO NOTHING;

CREATE TABLE "eng_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "type" VARCHAR(12) NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "min_group" INTEGER NOT NULL DEFAULT 5,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "location_ids" UUID[] NOT NULL DEFAULT '{}',
    "department_ids" UUID[] NOT NULL DEFAULT '{}',
    "opens_on" DATE NOT NULL,
    "closes_on" DATE NOT NULL,
    "remind" BOOLEAN NOT NULL DEFAULT true,
    "reminded_on" DATE,
    "launched_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_surveys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_surveys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_surveys_type_check" CHECK ("type" IN ('engagement', 'pulse', 'enps', 'onboarding', 'exit')),
    CONSTRAINT "eng_surveys_named_check" CHECK ("anonymous" OR "type" IN ('onboarding', 'exit')),
    CONSTRAINT "eng_surveys_min_check" CHECK ("min_group" BETWEEN 3 AND 10),
    CONSTRAINT "eng_surveys_dates_check" CHECK ("closes_on" >= "opens_on")
);

CREATE TABLE "eng_survey_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "eng_survey_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_survey_invites_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "eng_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "eng_survey_invites_key" ON "eng_survey_invites"("survey_id", "user_id");

-- No answered-at time on the invitation either: a time could be matched with a response's time.
CREATE TABLE "eng_survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "department_id" UUID,
    "location_id" UUID,
    "team_manager_id" UUID,
    "named_user_id" UUID,
    "submitted_on" DATE NOT NULL,
    CONSTRAINT "eng_survey_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "eng_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "eng_survey_responses_survey_idx" ON "eng_survey_responses"("survey_id");

CREATE TABLE "eng_action_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "manager_user_id" UUID NOT NULL,
    "focus" VARCHAR(300) NOT NULL,
    "focus_score" VARCHAR(40),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_action_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_action_plans_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "eng_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_action_plans_status_check" CHECK ("status" IN ('draft', 'shared', 'completed'))
);
CREATE UNIQUE INDEX "eng_action_plans_key" ON "eng_action_plans"("survey_id", "manager_user_id");

-- Item 75: one vote per person on a poll (a feed post with options).
ALTER TABLE "eng_posts" ADD COLUMN "poll_options" JSONB, ADD COLUMN "poll_closes_on" DATE;
ALTER TABLE "eng_posts" ADD CONSTRAINT "eng_posts_poll_check" CHECK (("kind" = 'poll') = ("poll_options" IS NOT NULL));
CREATE TABLE "eng_poll_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "option" INTEGER NOT NULL,
    CONSTRAINT "eng_poll_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_poll_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "eng_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_poll_votes_option_check" CHECK ("option" BETWEEN 0 AND 4)
);
CREATE UNIQUE INDEX "eng_poll_votes_key" ON "eng_poll_votes"("post_id", "user_id");

ALTER TABLE "eng_surveys" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_surveys"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_surveys" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_surveys" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_survey_invites" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_survey_invites"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_survey_invites" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_survey_invites" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_survey_responses" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_survey_responses"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_survey_responses" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_survey_responses" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_action_plans" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_action_plans"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_action_plans" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_action_plans" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_poll_votes" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_poll_votes"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_poll_votes" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_poll_votes" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
