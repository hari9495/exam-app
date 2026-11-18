-- Retire /v2 (answers 2421 and 2431): system logs and a cross-company user search move into the staff console.
-- Two console keys; the company-side audit:view no longer reads system logs (the API route is gone).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.systemlogs.view', 'Read the system logs: errors and warnings from every company (YukthiX staff)'),
  (gen_random_uuid(), 'platform.users.search', 'Find a user of any company by email or name (YukthiX staff)')
ON CONFLICT DO NOTHING;
-- Who: support agents and the security lead read the logs; support agents, customer success and the security lead search users.
INSERT INTO "platform_role_keys" ("role", "key") VALUES
  ('support_agent', 'platform.systemlogs.view'),
  ('security_lead', 'platform.systemlogs.view'),
  ('support_agent', 'platform.users.search'),
  ('customer_success', 'platform.users.search'),
  ('security_lead', 'platform.users.search')
ON CONFLICT DO NOTHING;
