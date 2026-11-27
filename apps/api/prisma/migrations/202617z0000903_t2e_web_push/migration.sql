-- Batch T2-E item 52 (answers 2875 to 2878): push through the installable web app. One subscription per signed-in device
-- that allows notifications (removed on sign-out, or when the push service says it is gone); a Push choice per kind of
-- notification (NULL: the default for the kind); Pause push and quiet hours per person (21:00-08:00 India time).
CREATE TABLE "push_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" VARCHAR(1000) NOT NULL,
  "p256dh" VARCHAR(200) NOT NULL,
  "auth" VARCHAR(100) NOT NULL,
  "user_agent" VARCHAR(200),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sent_at" TIMESTAMPTZ(3),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" ("organization_id", "endpoint");
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" ("organization_id", "user_id");

GRANT DELETE ON TABLE "push_subscriptions" TO app_runtime;
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "push_subscriptions" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "push_subscriptions" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);

ALTER TABLE "user_notification_preferences" ADD COLUMN "push_enabled" BOOLEAN;
ALTER TABLE "users" ADD COLUMN "push_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "push_quiet_from" VARCHAR(5) NOT NULL DEFAULT '21:00';
ALTER TABLE "users" ADD COLUMN "push_quiet_to" VARCHAR(5) NOT NULL DEFAULT '08:00';
