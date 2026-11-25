-- Answer 1901: integration.manage lets IT staff run integrations (Settings 7.1, 7.6, 7.7: connected apps, the mail
-- server, SMS and WhatsApp providers, the HR system export, the AI key, API keys and webhooks) without being System
-- Admins. Every change still asks for the security key. Granted to the System Admin role; the Integrations admin role
-- template carries it for new company roles. MFA-sensitive (packages/shared auth/mfa.ts).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'integration.manage', 'Integrations: connected apps, mail server, SMS and WhatsApp providers, HR system export, the AI key, API keys and webhooks (Settings 7.1, 7.6, 7.7)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'integration.manage'
ON CONFLICT DO NOTHING;
