-- Batch T2-D item 60 (answer 2871): the projects reporting key. Its holders see the hours reports of every project; a
-- project's manager sees their own projects' reports without it. The System Admin holds it (also in prisma/seed.ts).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'projects.reporting', 'Projects reports: hours by person and by task for every project, with CSV export')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'projects.reporting'
ON CONFLICT DO NOTHING;
