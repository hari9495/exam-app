-- Founder 3 Nov 2026 (Expenses round 2): HR sees the Expense policy page without editing it. New view-only key
-- expense.policy.view (every edit still needs expense.policy.manage). The HR Admin role template gains it; company roles
-- that still follow the template get it too: additive only (no key is removed), each change audited the way the
-- start-up template sync records it (access.role.template_synced). Roles someone edited are left alone.
-- FORCE row-level security would otherwise skip every company's rows here.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'expense.policy.view', 'See the expense policy: limits, rates, categories, city tiers, GST registrations and exchange rates, without changing them')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'expense.policy.view'
ON CONFLICT DO NOTHING;

WITH following AS (
  SELECT p.id, p.organization_id, p.name,
         (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT DISTINCT k FROM jsonb_array_elements_text(p.permissions_json::jsonb || '["expense.policy.view"]'::jsonb) AS k) s) AS keys
  FROM permission_profiles p
  WHERE p.template_key = 'hr_admin'
    AND p.template_set IS NOT NULL
    AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.permissions_json::jsonb) AS k)
      = (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.template_set::jsonb) AS k)
    AND NOT (p.permissions_json::jsonb ? 'expense.policy.view')
    -- Only roles of companies that still exist (the audit row needs its company).
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id)
), changed AS (
  UPDATE permission_profiles p
  SET permissions_json = f.keys::text, template_set = f.keys::text, updated_at = now()
  FROM following f
  WHERE p.id = f.id
  RETURNING p.id, p.organization_id, p.name
)
INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT gen_random_uuid(), c.organization_id, 'access.role.template_synced', 'permission_profile', c.id::text,
       json_build_object('template', 'hr_admin', 'role', c.name, 'added', json_build_array('expense.policy.view'), 'notAddedConfidential', json_build_array(), 'by', 'migration 20261530000000')::text,
       now()
FROM changed c;
