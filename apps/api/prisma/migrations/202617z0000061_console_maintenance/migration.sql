-- YukthiX console C-5, founder answers 948 and 1053 (12 Nov 2026): planned maintenance windows. Staff schedule a window
-- (YX-10 Maintenance) and a second staff member approves it; every company then sees the availability banner the day
-- before and during it (6.5 Availability). A window never blocks sign-in by itself.
--
-- Windows are platform data, not one company's (no organization_id, like products and What's new): every signed-in
-- session may read them, only the platform (super-admin) context may write them, and they are cancelled, never deleted.
-- Writes the new permission key (data), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "maintenance_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(120) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "written_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "maintenance_windows_written_by_fkey" FOREIGN KEY ("written_by") REFERENCES "users"("id"),
    CONSTRAINT "maintenance_windows_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id"),
    CONSTRAINT "maintenance_windows_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id"),
    CONSTRAINT "maintenance_windows_status_check" CHECK ("status" IN ('pending_approval', 'scheduled', 'cancelled')),
    CONSTRAINT "maintenance_windows_times_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "maintenance_windows_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 120),
    -- The approver is never the person who scheduled it.
    CONSTRAINT "maintenance_windows_four_eyes_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "written_by")
);
CREATE INDEX "maintenance_windows_starts_idx" ON "maintenance_windows" ("starts_at");
ALTER TABLE "maintenance_windows" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_read ON "maintenance_windows" FOR SELECT USING (true);
CREATE POLICY maintenance_platform_insert ON "maintenance_windows" FOR INSERT WITH CHECK ((SELECT app_is_super_admin()));
CREATE POLICY maintenance_platform_update ON "maintenance_windows" FOR UPDATE USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "maintenance_windows" FROM app_runtime;

-- The console key (also in prisma/seed.ts). Every platform.* key is YukthiX staff only.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.maintenance.manage', 'Schedule, approve and cancel planned maintenance windows (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.maintenance.manage'
ON CONFLICT DO NOTHING;
