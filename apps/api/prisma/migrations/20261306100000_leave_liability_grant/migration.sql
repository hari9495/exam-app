-- Founder answer A, 29 Oct 2026: Payroll reads the leave liability report. 20261306000000 only added the key and left the
-- grant to the template sync, which skips company roles edited by hand (template_key null), such as most real Payroll
-- roles. Like 20261305000000 did for attendance.lock.approve: every role that prepares payroll runs gets the key.
SELECT set_config('app.is_super_admin', 'on', true);

UPDATE "permission_profiles" p
SET "permissions_json" = n."keys",
    "template_set" = CASE WHEN p."template_set" IS NOT NULL AND p."permissions_json"::jsonb = p."template_set"::jsonb THEN n."keys" ELSE p."template_set" END
FROM (
  SELECT "id", (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text("permissions_json"::jsonb) AS k UNION SELECT 'leave.liability.view') x)::text AS "keys"
  FROM "permission_profiles"
  WHERE "permissions_json"::jsonb ? 'payroll.run.prepare' AND NOT ("permissions_json"::jsonb ? 'leave.liability.view')
) n
WHERE p."id" = n."id";
