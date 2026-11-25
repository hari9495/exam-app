-- Batch G2 item 12 (M09, answers 2601-2602): Engage starts with announcements. A post table shared by everything Engage
-- shows in the feed (announcements now; updates, polls, kudos and celebrations in the next items), and who read and
-- acknowledged each announcement. The audience is the company's locations and departments (empty = everyone), read
-- against people's jobs on the day, so someone who joins the audience later also receives it.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'engage.announce', 'Write and publish company announcements, choose who they go to and see who read and acknowledged them')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'engage.announce'
ON CONFLICT DO NOTHING;

CREATE TABLE "eng_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "space_id" UUID,
    "author_user_id" UUID,
    "title" VARCHAR(200),
    "body" TEXT NOT NULL,
    "location_ids" UUID[] NOT NULL DEFAULT '{}',
    "department_ids" UUID[] NOT NULL DEFAULT '{}',
    "email" BOOLEAN NOT NULL DEFAULT false,
    "ack_required" BOOLEAN NOT NULL DEFAULT false,
    "ack_due_on" DATE,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "state" VARCHAR(10) NOT NULL DEFAULT 'published',
    "publish_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(3),
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "reminded_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_posts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_posts_kind_check" CHECK ("kind" IN ('announcement', 'update', 'poll', 'kudos', 'celebration')),
    CONSTRAINT "eng_posts_state_check" CHECK ("state" IN ('published', 'held', 'hidden', 'deleted')),
    CONSTRAINT "eng_posts_body_check" CHECK (char_length("body") BETWEEN 1 AND 10000),
    CONSTRAINT "eng_posts_announcement_check" CHECK ("kind" <> 'announcement' OR ("title" IS NOT NULL AND char_length(btrim("title")) >= 3)),
    CONSTRAINT "eng_posts_ack_check" CHECK ("ack_required" OR "ack_due_on" IS NULL)
);
CREATE INDEX "eng_posts_feed_idx" ON "eng_posts"("organization_id", "kind", "publish_at" DESC);

CREATE TABLE "eng_post_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acked_at" TIMESTAMPTZ(3),
    CONSTRAINT "eng_post_reads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_post_reads_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "eng_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "eng_post_reads_key" ON "eng_post_reads"("post_id", "user_id");

ALTER TABLE "eng_posts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_posts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_posts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_posts" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "eng_post_reads" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_post_reads"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_post_reads" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_post_reads" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
