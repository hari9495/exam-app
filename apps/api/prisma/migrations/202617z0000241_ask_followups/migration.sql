-- Ask YukthiX follow-ups (founder answers 2112, 2113, 2116, 16 Nov 2026).
-- 2112: a buying question in Ask YukthiX can send a sales request straight from the chat, into the existing sales-assist
-- queue, with the chat attached (masked) and once per chat (the unique index, and the chat's own pointer).
-- 2113: feature requests get their own console key, platform.feature_requests.manage (Support agent and Customer
-- success, so nobody who worked the list loses it). 2116 needs no schema: sd_kb_articles.assistant_use already exists
-- (default on). Writes data (the key), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "sales_assist_requests"
  ADD COLUMN "source" VARCHAR(12) NOT NULL DEFAULT 'nudge',
  ADD COLUMN "conversation_id" UUID,
  ADD COLUMN "chat" VARCHAR(10000);
ALTER TABLE "sales_assist_requests" ADD CONSTRAINT "sales_assist_requests_source_check" CHECK ("source" IN ('nudge', 'assistant'));
-- A chat request names its chat; a nudge request has none.
ALTER TABLE "sales_assist_requests" ADD CONSTRAINT "sales_assist_requests_chat_check" CHECK (("source" = 'assistant') = ("conversation_id" IS NOT NULL));
CREATE UNIQUE INDEX "sales_assist_requests_one_per_chat" ON "sales_assist_requests" ("conversation_id") WHERE "conversation_id" IS NOT NULL;

ALTER TABLE "assistant_conversations" ADD COLUMN "sales_request_id" UUID;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.feature_requests.manage', 'Decide the feature requests sent from Ask YukthiX and read its review (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "platform_role_keys" ("role", "key") VALUES
  ('support_agent', 'platform.feature_requests.manage'),
  ('customer_success', 'platform.feature_requests.manage')
ON CONFLICT DO NOTHING;
