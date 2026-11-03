-- Founder 3 Nov 2026 (Q8): the "Performance set-up" role template gains perf.goal.view (the company goal map). Company
-- roles that still follow the template get it too: additive only (no key is removed), each change audited the way the
-- start-up template sync records it (access.role.template_synced). Roles someone edited (no longer following) are left
-- alone. Unchecked copies made before roles remembered their template are brought up by the template sync at start-up.
-- FORCE row-level security would otherwise skip every company's rows here.
SELECT set_config('app.is_super_admin', 'on', true);

WITH following AS (
  SELECT p.id, p.organization_id, p.name,
         (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT DISTINCT k FROM jsonb_array_elements_text(p.permissions_json::jsonb || '["perf.goal.view"]'::jsonb) AS k) s) AS keys
  FROM permission_profiles p
  WHERE p.template_key = 'performance_setup'
    AND p.template_set IS NOT NULL
    AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.permissions_json::jsonb) AS k)
      = (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.template_set::jsonb) AS k)
    AND NOT (p.permissions_json::jsonb ? 'perf.goal.view')
), changed AS (
  UPDATE permission_profiles p
  SET permissions_json = f.keys::text, template_set = f.keys::text, updated_at = now()
  FROM following f
  WHERE p.id = f.id
  RETURNING p.id, p.organization_id, p.name
)
INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT gen_random_uuid(), c.organization_id, 'access.role.template_synced', 'permission_profile', c.id::text,
       json_build_object('template', 'performance_setup', 'role', c.name, 'added', json_build_array('perf.goal.view'), 'notAddedConfidential', json_build_array(), 'by', 'migration 20261470000100')::text,
       now()
FROM changed c;
