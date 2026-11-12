-- YukthiX console C-8, YX-09: product analytics. Which features companies use, counted from the audit log's action
-- families only (never the record, the metadata, a person or HR content); groups of fewer than
-- `analytics.min_companies` (platform setting, default 5, never under 5) are hidden. No new table: only the key.
-- Writes data (the key), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

-- Staff role (answers 1058, 1086): Customer success.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.analytics.view', 'See product analytics: which features companies use, counts only (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "platform_role_keys" ("role", "key") VALUES ('customer_success', 'platform.analytics.view') ON CONFLICT DO NOTHING;
