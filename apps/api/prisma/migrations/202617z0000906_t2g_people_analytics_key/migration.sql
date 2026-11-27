-- T2-G 47 (answer 2747): headcount and attrition (People › Headcount and attrition, the report library). The figures are
-- the whole company's and are read with people.analytics.view (System Admins; the HR Admin template). Nothing is stored:
-- they are worked out from employments, assignments and exit cases when asked.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'people.analytics.view', 'See headcount and attrition for the whole company')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'people.analytics.view'
ON CONFLICT DO NOTHING;
