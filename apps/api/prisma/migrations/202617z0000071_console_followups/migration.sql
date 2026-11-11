-- Console follow-ups (founder answers 1065, 1087, 1125; 12 Nov 2026).
-- 1087: the writer may withdraw a message while it waits for approval; a withdrawn message is never approved.
-- 1065: a notice about a published rule set is an admin message to the companies in the rule's country or state; one
--       live notice per rule set (a withdrawn or sent-back one may be written again).
-- 1125: Console › Platform settings has its own key.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "yukthix_messages" DROP CONSTRAINT "yukthix_messages_status_check";
ALTER TABLE "yukthix_messages" ADD CONSTRAINT "yukthix_messages_status_check" CHECK ("status" IN ('pending_approval', 'sent', 'rejected', 'withdrawn'));
ALTER TABLE "yukthix_messages" ADD COLUMN "rule_set_id" UUID;
ALTER TABLE "yukthix_messages" ADD CONSTRAINT "yukthix_messages_rule_set_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "statutory_rule_sets"("id");
CREATE UNIQUE INDEX "yukthix_messages_rule_set_key" ON "yukthix_messages" ("rule_set_id") WHERE "rule_set_id" IS NOT NULL AND "status" IN ('pending_approval', 'sent');

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.settings.manage', 'Change YukthiX platform settings (YukthiX staff, security key and a reason)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.settings.manage'
ON CONFLICT DO NOTHING;
