-- T2-G 42 (answer 2745): rule-based groups. One groups feature: the company's groups (user_groups, Roles & access ›
-- Groups) may be worked out from rules (legal entity, location, department and its sub-departments, grade, employment
-- type) instead of picked by hand. Members are worked out on save and every night (scheduled sweep): the active users of
-- today's employees who match every rule. A rule group never joins hiring's own groups (directory, mine), so it gives no
-- record visibility. Announcements, surveys and learning rules may name groups as their audience (any of them, together
-- with their location and department choices); approvals already pick a group. people.group.manage: HR and System
-- Admins keep the groups (besides the older users:manage_groups).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'people.group.manage', 'Keep the company''s groups: hand-picked or worked out from rules')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'people.group.manage'
ON CONFLICT DO NOTHING;

-- rules: null for a hand-picked group; else {"legalEntityIds":[],"locationIds":[],"departmentIds":[],"gradeIds":[],"employmentTypeIds":[]}.
ALTER TABLE "user_groups" ADD COLUMN "rules" JSONB,
  ADD COLUMN "members_refreshed_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "user_groups_rules_object_check" CHECK ("rules" IS NULL OR jsonb_typeof("rules") = 'object');

ALTER TABLE "eng_posts" ADD COLUMN "group_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "eng_surveys" ADD COLUMN "group_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "learning_rules" ADD COLUMN "group_ids" UUID[] NOT NULL DEFAULT '{}';
