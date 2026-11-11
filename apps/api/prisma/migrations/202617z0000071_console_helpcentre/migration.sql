-- YukthiX console C-8, YX-11 (answer 1057): the help-centre editor. YukthiX staff write help articles every company sees
-- in Help › This page. They are ordinary knowledge-base articles of the platform company (its public "YukthiX help"
-- space, created on first use), so no new table: only the console key. Writes data (the key), so the platform context
-- is set first.
SELECT set_config('app.is_super_admin', 'on', true);

-- Staff role (answer 1058): Support agent. Every platform.* key is YukthiX staff only, never in a company role.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.helpcentre.write', 'Write and publish the help articles every company sees in Help (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.helpcentre.write'
ON CONFLICT DO NOTHING;
