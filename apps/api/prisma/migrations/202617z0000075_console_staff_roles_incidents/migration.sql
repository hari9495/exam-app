-- Console staff roles after C-8 part 2 (answers 1058, 1086): incidents and the status page (`platform.incidents.manage`)
-- go to the Security lead, who also receives the breach reminders; the staff account type keeps no console key (C-8
-- part 2 granted it there). Runs after it in every database, whichever applied first.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "platform_role_keys" ("role", "key") VALUES ('security_lead', 'platform.incidents.manage') ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" WHERE "role" = 'super_admin' AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" LIKE 'platform.%');
