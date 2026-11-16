-- Answer 2093: a notice list for YukthiX staff in the console header. Each notice is for one staff member: only that
-- person reads it or marks it read (app.current_user_id), never another staff member, even with platform access. The
-- console's own system work (sweeps) writes them; nobody changes a notice except to mark it read, and nobody deletes one.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "staff_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "link_path" VARCHAR(500),
    "entity_type" VARCHAR(40),
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),
    CONSTRAINT "staff_notices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_notices_recipient_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "staff_notices_kind_check" CHECK ("kind" IN ('kept_records_removed', 'board_notice_due'))
);
CREATE INDEX "staff_notices_recipient_idx" ON "staff_notices" ("recipient_user_id", "read_at", "created_at" DESC);

ALTER TABLE "staff_notices" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
-- Read and mark read: only the person it is for (platform access does not widen this).
CREATE POLICY staff_notices_own_read ON "staff_notices" FOR SELECT USING ("recipient_user_id" = (SELECT app_current_user_id()));
CREATE POLICY staff_notices_own_mark ON "staff_notices" FOR UPDATE USING ("recipient_user_id" = (SELECT app_current_user_id())) WITH CHECK ("recipient_user_id" = (SELECT app_current_user_id()));
-- Written by the console's system work, for a YukthiX staff account (no company).
CREATE POLICY staff_notices_system_write ON "staff_notices" FOR INSERT WITH CHECK (
  (SELECT app_is_super_admin()) AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = "recipient_user_id" AND u."organization_id" IS NULL AND u."role" = 'super_admin')
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "staff_notices" FROM app_runtime;
GRANT UPDATE ("read_at") ON TABLE "staff_notices" TO app_runtime;
