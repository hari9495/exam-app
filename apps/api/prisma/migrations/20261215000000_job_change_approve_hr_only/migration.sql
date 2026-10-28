-- Founder decision 28 Oct 2026: job changes (promotions, salary revisions, transfers, manager changes) are approved by
-- HR only, not by payroll and not by the System Admin. The role templates and seeds lose the key; this brings existing
-- data along. The template sync only ever adds keys, so it cannot do this.
SELECT set_config('app.is_super_admin', 'on', true);

-- The System Admin base role (the global default; seeds only add role keys).
DELETE FROM "role_permissions" WHERE "role" = 'org_admin' AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'employee.change.approve');

-- Company roles still following the Payroll Admin or Payroll Approver template (keys unchanged since the template gave
-- them) lose it too and keep following. A role the company edited is its own and is left alone.
UPDATE "permission_profiles" p SET "permissions_json" = n."keys", "template_set" = n."keys"
FROM (
  SELECT "id", (SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb) FROM jsonb_array_elements_text("permissions_json"::jsonb) k WHERE k <> 'employee.change.approve')::text AS "keys"
  FROM "permission_profiles"
  WHERE "template_key" IN ('payroll_admin', 'payroll_approver')
    AND "permissions_json" LIKE '%"employee.change.approve"%'
    AND "permissions_json"::jsonb = "template_set"::jsonb
) n
WHERE p."id" = n."id";
