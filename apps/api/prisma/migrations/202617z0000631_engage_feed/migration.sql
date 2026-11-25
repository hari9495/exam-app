-- Batch G2 item 100 (M09 Q1-Q2, answer 2601): the feed. Spaces for the company, each location and each department (made
-- when first read); updates posted to a space; likes, comments and reports; the moderation queue. Team, department and
-- location spaces are open to their members; on the company space announcers post directly and others after approval;
-- a moderator can switch any space to approval. Blocked words hold a post; enough reports hide it until a moderator acts.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'engage.moderate', 'Review held and reported posts and comments in the feed: approve, restore, keep hidden, delete or warn the author; switch a space to approval')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'engage.moderate'
ON CONFLICT DO NOTHING;

CREATE TABLE "eng_spaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "ref_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "approval" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_spaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_spaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_spaces_kind_check" CHECK ("kind" IN ('company', 'location', 'department')),
    CONSTRAINT "eng_spaces_ref_check" CHECK (("kind" = 'company') = ("ref_id" IS NULL))
);
CREATE UNIQUE INDEX "eng_spaces_key" ON "eng_spaces" ("organization_id", "kind", COALESCE("ref_id", '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "eng_posts" DROP CONSTRAINT "eng_posts_state_check";
ALTER TABLE "eng_posts" ADD CONSTRAINT "eng_posts_state_check" CHECK ("state" IN ('published', 'pending', 'held', 'hidden', 'deleted'));
ALTER TABLE "eng_posts" ADD COLUMN "held_reason" VARCHAR(200), ADD COLUMN "reports" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "eng_posts" ADD CONSTRAINT "eng_posts_space_fkey" FOREIGN KEY ("space_id") REFERENCES "eng_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eng_posts" ADD CONSTRAINT "eng_posts_update_check" CHECK ("kind" <> 'update' OR ("space_id" IS NOT NULL AND "author_user_id" IS NOT NULL AND char_length("body") <= 3000));

CREATE TABLE "eng_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "state" VARCHAR(10) NOT NULL DEFAULT 'published',
    "held_reason" VARCHAR(200),
    "reports" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "eng_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_comments_state_check" CHECK ("state" IN ('published', 'held', 'hidden', 'deleted')),
    CONSTRAINT "eng_comments_body_check" CHECK (char_length(btrim("body")) >= 1)
);
CREATE INDEX "eng_comments_post_idx" ON "eng_comments"("post_id", "created_at");

CREATE TABLE "eng_reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_reactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_reactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "eng_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "eng_reactions_key" ON "eng_reactions"("post_id", "user_id");

CREATE TABLE "eng_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "target" VARCHAR(8) NOT NULL,
    "target_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_reports_target_check" CHECK ("target" IN ('post', 'comment'))
);
CREATE UNIQUE INDEX "eng_reports_key" ON "eng_reports"("target", "target_id", "reporter_user_id");

CREATE TABLE "eng_mod_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "target" VARCHAR(8) NOT NULL,
    "target_id" UUID NOT NULL,
    "author_user_id" UUID,
    "action" VARCHAR(10) NOT NULL,
    "note" VARCHAR(1000),
    "by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_mod_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_mod_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_mod_actions_target_check" CHECK ("target" IN ('post', 'comment')),
    CONSTRAINT "eng_mod_actions_action_check" CHECK ("action" IN ('approve', 'restore', 'hide', 'delete', 'warn'))
);
CREATE INDEX "eng_mod_actions_author_idx" ON "eng_mod_actions"("organization_id", "author_user_id");

ALTER TABLE "eng_spaces" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_spaces"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_spaces" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_spaces" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_comments" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_comments"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_comments" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_comments" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_reactions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_reactions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_reactions" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_reactions" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_reports" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_reports"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_reports" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_reports" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_mod_actions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_mod_actions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_mod_actions" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_mod_actions" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
