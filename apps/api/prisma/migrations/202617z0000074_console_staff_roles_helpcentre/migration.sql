-- Console staff roles after C-8 part 1 and the console follow-ups (answers 1058, 1086): the help-centre writers' key
-- goes to the Support agent role and Platform settings to the Security lead; the staff account type keeps no console
-- key (those migrations granted them there). Runs after them in every database, whichever applied first.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "platform_role_keys" ("role", "key") VALUES
  ('support_agent', 'platform.helpcentre.write'),
  ('security_lead', 'platform.settings.manage')
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" WHERE "role" = 'super_admin' AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" LIKE 'platform.%');
