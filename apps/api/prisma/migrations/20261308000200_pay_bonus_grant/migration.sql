-- PAY-24 statutory bonus (29 Oct 2026). 20261308000000 added payroll.bonus.manage / .approve for the role templates; the
-- template sync skips company roles edited by hand (template_key null), such as most real Payroll roles. As 20261306100000
-- did for leave.liability.view: roles that prepare runs get bonus.manage, roles that approve runs get bonus.approve.
-- The maker never approves their own bonus: the service and a database check refuse that, whatever the keys.
SELECT set_config('app.is_super_admin', 'on', true);

UPDATE "permission_profiles" p
SET "permissions_json" = n."keys",
    "template_set" = CASE WHEN p."template_set" IS NOT NULL AND p."permissions_json"::jsonb = p."template_set"::jsonb THEN n."keys" ELSE p."template_set" END
FROM (
  SELECT "id", (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text("permissions_json"::jsonb) AS k UNION SELECT 'payroll.bonus.manage') x)::text AS "keys"
  FROM "permission_profiles"
  WHERE "permissions_json"::jsonb ? 'payroll.run.prepare' AND NOT ("permissions_json"::jsonb ? 'payroll.bonus.manage')
) n
WHERE p."id" = n."id";

UPDATE "permission_profiles" p
SET "permissions_json" = n."keys",
    "template_set" = CASE WHEN p."template_set" IS NOT NULL AND p."permissions_json"::jsonb = p."template_set"::jsonb THEN n."keys" ELSE p."template_set" END
FROM (
  SELECT "id", (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text("permissions_json"::jsonb) AS k UNION SELECT 'payroll.bonus.approve') x)::text AS "keys"
  FROM "permission_profiles"
  WHERE "permissions_json"::jsonb ? 'payroll.run.approve' AND NOT ("permissions_json"::jsonb ? 'payroll.bonus.approve')
) n
WHERE p."id" = n."id";
