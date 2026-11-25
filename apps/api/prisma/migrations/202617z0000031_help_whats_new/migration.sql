-- Help and onboarding H-4, founder answer 943 (12 Nov 2026): What's new. YukthiX staff write the entries in the console
-- (PLT-50 is the one design); each person sees the entries for their role and their company's products, with unread
-- marked. Entries are platform data (no organization_id, like products): every signed-in session may read them, only the
-- platform (YukthiX staff, the super-admin context) may write them. Read marks are company data with forced RLS.
-- Writes only permission keys (no other data).
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "whats_new_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    -- Product codes (products.code); at least one.
    "products" VARCHAR(32)[] NOT NULL,
    -- Who it is for: everyone, employee, manager, hr, payroll, admin; at least one.
    "audiences" VARCHAR(16)[] NOT NULL,
    "publish_on" DATE NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "whats_new_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whats_new_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "whats_new_entries_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 120),
    CONSTRAINT "whats_new_entries_body_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 1000),
    CONSTRAINT "whats_new_entries_products_check" CHECK (cardinality("products") >= 1),
    CONSTRAINT "whats_new_entries_audiences_check" CHECK (cardinality("audiences") >= 1 AND "audiences" <@ ARRAY['everyone', 'employee', 'manager', 'hr', 'payroll', 'admin']::VARCHAR(16)[])
);
CREATE INDEX "whats_new_entries_publish_idx" ON "whats_new_entries" ("publish_on" DESC);
-- Read by everyone signed in; written only in the platform (super-admin) context. Entries are withdrawn, never deleted.
ALTER TABLE "whats_new_entries" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY whats_new_read ON "whats_new_entries" FOR SELECT USING (true);
CREATE POLICY whats_new_platform_insert ON "whats_new_entries" FOR INSERT WITH CHECK ((SELECT app_is_super_admin()));
CREATE POLICY whats_new_platform_update ON "whats_new_entries" FOR UPDATE USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "whats_new_entries" FROM app_runtime;

-- Which entries a person has read (company data).
CREATE TABLE "whats_new_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whats_new_reads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whats_new_reads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "whats_new_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "whats_new_reads_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "whats_new_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "whats_new_reads_user_entry_key" ON "whats_new_reads" ("organization_id", "user_id", "entry_id");
ALTER TABLE "whats_new_reads" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "whats_new_reads" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- The console key (also in prisma/seed.ts). Every platform.* key is YukthiX staff only, never in a company role.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.news.manage', 'Write the What''s new entries people see in Help (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.news.manage'
ON CONFLICT DO NOTHING;
