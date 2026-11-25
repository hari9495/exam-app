-- PAY-25 payroll reports (30 Oct 2026). 20261309000000 added payroll.reports.view for the role templates; the template
-- sync skips company roles edited by hand (template_key null), such as most real Payroll and Finance roles. As
-- 20261306100000 and 20261308000200 did: every role that prepares or approves payroll runs gets the key. HR roles
-- without payroll keys do not.
SELECT set_config('app.is_super_admin', 'on', true);

UPDATE "permission_profiles" p
SET "permissions_json" = n."keys",
    "template_set" = CASE WHEN p."template_set" IS NOT NULL AND p."permissions_json"::jsonb = p."template_set"::jsonb THEN n."keys" ELSE p."template_set" END
FROM (
  SELECT "id", (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text("permissions_json"::jsonb) AS k UNION SELECT 'payroll.reports.view') x)::text AS "keys"
  FROM "permission_profiles"
  WHERE ("permissions_json"::jsonb ? 'payroll.run.prepare' OR "permissions_json"::jsonb ? 'payroll.run.approve') AND NOT ("permissions_json"::jsonb ? 'payroll.reports.view')
) n
WHERE p."id" = n."id";
