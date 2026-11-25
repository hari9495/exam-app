-- YukthiX console C-2, founder answers 1047, 1048 and 1058 (11 Nov 2026): tenant health, churn alerts and messages from
-- YukthiX staff to a company's System Admins.
--
-- Platform tables (platform_settings, yukthix_messages) carry no organization_id and are YukthiX staff only: RLS lets only
-- the platform (super-admin) context read or write them. A company sees the messages sent to it through its own copy,
-- company_messages, which has the standard forced RLS.
-- Writes the new permission key (data), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

-- Platform settings: the churn alert thresholds (and later platform-wide defaults). Values are checked by the API's
-- registry; a missing row means the default.
CREATE TABLE "platform_settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "platform_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL
);
ALTER TABLE "platform_settings" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "platform_settings" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));

-- A message from YukthiX staff to the System Admins of one or more companies. More than one company: a second staff
-- member (never the writer) approves it before it is sent.
CREATE TABLE "yukthix_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "company_ids" UUID[] NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "written_by" UUID NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "yukthix_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "yukthix_messages_written_by_fkey" FOREIGN KEY ("written_by") REFERENCES "users"("id"),
    CONSTRAINT "yukthix_messages_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id"),
    CONSTRAINT "yukthix_messages_status_check" CHECK ("status" IN ('pending_approval', 'sent', 'rejected')),
    CONSTRAINT "yukthix_messages_companies_check" CHECK (cardinality("company_ids") BETWEEN 1 AND 500),
    CONSTRAINT "yukthix_messages_subject_check" CHECK (char_length(btrim("subject")) BETWEEN 3 AND 120),
    CONSTRAINT "yukthix_messages_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 4000),
    -- The second approver is never the writer.
    CONSTRAINT "yukthix_messages_four_eyes_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "written_by")
);
CREATE INDEX "yukthix_messages_created_idx" ON "yukthix_messages" ("created_at" DESC);
ALTER TABLE "yukthix_messages" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "yukthix_messages" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "yukthix_messages" FROM app_runtime;

-- The company's own copy of each message sent to it (what its System Admins read).
CREATE TABLE "company_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "subject" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "company_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "yukthix_messages"("id")
);
CREATE UNIQUE INDEX "company_messages_org_message_key" ON "company_messages" ("organization_id", "message_id");
CREATE INDEX "company_messages_org_sent_idx" ON "company_messages" ("organization_id", "sent_at" DESC);
ALTER TABLE "company_messages" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company_messages" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
REVOKE UPDATE, TRUNCATE ON TABLE "company_messages" FROM app_runtime;

-- Answer 1058: the Customer success console key (also in prisma/seed.ts). Every platform.* key is YukthiX staff only.
-- Until staff roles exist, the one staff role holds it, like every other console key.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.customers.success', 'Customer success: tenant health, churn alerts and messages to company System Admins (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.customers.success'
ON CONFLICT DO NOTHING;
