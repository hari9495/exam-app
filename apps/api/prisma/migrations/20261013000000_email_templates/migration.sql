-- P04 Q5 / §4 Editing & Branding: companies brand and re-word the account emails YukthiX sends their people
-- (sign-in codes, invites, password reset, sign-in alerts, locks, two-step changes, admin alerts). The YukthiX
-- wording is the starter (D17); a row here overrides it for one email type and language. Tenants type plain text
-- only (no HTML, no links); the action link, codes, expiry, safety lines and sign-in details stay locked in code.

-- 1. Branding: one row per company. The From address stays YukthiX's verified domain; the display name is
-- "<sender_name> via YukthiX". The accent must keep white button text readable (WCAG AA 4.5:1, checked in the API).
CREATE TABLE "email_branding" (
    "organization_id" UUID NOT NULL,
    "show_logo" BOOLEAN NOT NULL DEFAULT true,
    "accent_color" VARCHAR(7),
    "sender_name" VARCHAR(60),
    "reply_to" VARCHAR(254),
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_branding_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "email_branding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "email_branding_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "email_branding_accent_check" CHECK ("accent_color" IS NULL OR "accent_color" ~ '^#[0-9A-F]{6}$'),
    -- A name, never an address or a header: no @, angle brackets, quotes or control characters.
    CONSTRAINT "email_branding_sender_check" CHECK ("sender_name" IS NULL OR ("sender_name" !~ '[@<>"[:cntrl:]]' AND char_length(btrim("sender_name")) BETWEEN 2 AND 60)),
    CONSTRAINT "email_branding_reply_to_check" CHECK ("reply_to" IS NULL OR "reply_to" ~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$')
);

-- 2. Wording overrides: one row per company × email type × language (English now).
CREATE TABLE "email_template_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "subject" VARCHAR(150) NOT NULL,
    "heading" VARCHAR(120) NOT NULL,
    "intro" VARCHAR(1000) NOT NULL DEFAULT '',
    "button_label" VARCHAR(40) NOT NULL DEFAULT '',
    "footer" VARCHAR(500) NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_template_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_template_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "email_template_overrides_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "email_template_overrides_type_check" CHECK ("type" ~ '^[a-z][a-z_]{1,39}$'),
    CONSTRAINT "email_template_overrides_language_check" CHECK ("language" IN ('en')),
    CONSTRAINT "email_template_overrides_text_check" CHECK (char_length(btrim("subject")) >= 1 AND char_length(btrim("heading")) >= 1),
    -- Plain text only: no markup can be stored, whatever the API does.
    CONSTRAINT "email_template_overrides_no_markup_check" CHECK (("subject" || "heading" || "intro" || "button_label" || "footer") !~ '[<>]')
);
CREATE UNIQUE INDEX "email_template_overrides_org_type_language_key" ON "email_template_overrides"("organization_id", "type", "language");
REVOKE TRUNCATE ON TABLE "email_branding", "email_template_overrides" FROM app_runtime;

-- Tenant isolation (YX-ORG-14): the standard forced RLS + tenant_isolation policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_branding', 'email_template_overrides']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- 3. Permission key (also in prisma/seed.ts): the System Admin by default; assignable to a company role.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'notification.template.manage', 'Brand and re-word the emails YukthiX sends your people')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'notification.template.manage'
ON CONFLICT DO NOTHING;
