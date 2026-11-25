-- PAY-58 (2 Nov 2026): GET/POST payroll/me/equity now need a key, payroll.equity.own, so a company can take a person's
-- own equity page away and the person sees the designed No access state. Nobody loses access today: the key goes to
-- every base role an employee signs in with (not the fixed read-only auditor role), to every company role (permission
-- profile, which replaces the base role's keys) and to every company override of a base role.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.equity.own', 'See your own equity grants and vesting, and exercise your vested units')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r, "id" FROM "permissions", unnest(ARRAY['org_admin', 'panel', 'hiring_manager', 'recruiter']) r WHERE "key" = 'payroll.equity.own'
ON CONFLICT DO NOTHING;

-- A role still equal to its template keeps following it (template_set moves with it).
UPDATE "permission_profiles" p
SET "permissions_json" = n."keys",
    "template_set" = CASE WHEN p."template_set" IS NOT NULL AND p."permissions_json"::jsonb = p."template_set"::jsonb THEN n."keys" ELSE p."template_set" END
FROM (
  SELECT "id", (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text("permissions_json"::jsonb) AS k UNION SELECT 'payroll.equity.own') x)::text AS "keys"
  FROM "permission_profiles"
  WHERE NOT ("permissions_json"::jsonb ? 'payroll.equity.own')
) n
WHERE p."id" = n."id";

UPDATE "org_role_permissions" o
SET "permissions_json" = (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text(o."permissions_json"::jsonb) AS k UNION SELECT 'payroll.equity.own') x)::text
WHERE NOT (o."permissions_json"::jsonb ? 'payroll.equity.own');
