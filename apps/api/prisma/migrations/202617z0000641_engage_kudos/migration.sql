-- Batch G2 item 73 (M09 Q4, answer 2603): kudos with a company value and an optional badge (badges only: no points). A kudos
-- is a post on the company space (the feed and the recognition wall), naming the people thanked.
CREATE TABLE "eng_kudos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "giver_user_id" UUID NOT NULL,
    "receiver_ids" UUID[] NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "badge" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_kudos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_kudos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_kudos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "eng_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_kudos_receivers_check" CHECK (cardinality("receiver_ids") BETWEEN 1 AND 20 AND NOT ("giver_user_id" = ANY("receiver_ids")))
);
CREATE UNIQUE INDEX "eng_kudos_post_key" ON "eng_kudos"("post_id");
CREATE INDEX "eng_kudos_receivers_idx" ON "eng_kudos" USING GIN ("receiver_ids");

ALTER TABLE "eng_kudos" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_kudos"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_kudos" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_kudos" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
