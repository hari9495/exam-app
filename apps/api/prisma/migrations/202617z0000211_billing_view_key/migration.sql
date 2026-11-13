-- Answer 1884: billing.view lets finance people read the plan, usage and invoices (Settings 8.1 to 8.3), without the
-- System Admin's billing key. Granted like every new key: the System Admin role (org_admin), and company roles that still
-- follow the Finance or Finance approver templates (additive only, audited like the start-up template sync; changed
-- roles are left alone).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'billing.view', 'Billing: read the plan, usage and invoices (Settings 8.1 to 8.3)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'billing.view'
ON CONFLICT DO NOTHING;

WITH wanted(template, add_keys) AS (
  VALUES ('finance', '["billing.view"]'::jsonb), ('finance_approver', '["billing.view"]'::jsonb)
), following AS (
  SELECT p.id, p.organization_id, p.name, w.template, w.add_keys,
         (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT DISTINCT k FROM jsonb_array_elements_text(p.permissions_json::jsonb || w.add_keys) AS k) s) AS keys
  FROM permission_profiles p
  JOIN wanted w ON w.template = p.template_key
  WHERE p.template_set IS NOT NULL
    AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.permissions_json::jsonb) AS k)
      = (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.template_set::jsonb) AS k)
    AND NOT (p.permissions_json::jsonb @> w.add_keys)
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id)
), changed AS (
  UPDATE permission_profiles p
  SET permissions_json = f.keys::text, template_set = f.keys::text, updated_at = now()
  FROM following f
  WHERE p.id = f.id
  RETURNING p.id, p.organization_id, p.name, f.template, f.add_keys
)
INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT gen_random_uuid(), c.organization_id, 'access.role.template_synced', 'permission_profile', c.id::text,
       json_build_object('template', c.template, 'role', c.name, 'added', c.add_keys, 'notAddedConfidential', json_build_array(), 'by', 'migration 202617z0000211')::text,
       now()
FROM changed c;
