-- HIR-11 / HIR-12 (founder answers 202, 204): a hiring key for recruiting costs, ats.costs.manage, replacing
-- org:manage_settings on the costs routes. Granted like every new key: the System Admin role (org_admin) and the older
-- recruiter role get it; company roles that still follow the HR Admin template get ats.costs.manage and
-- ats.referral.manage (HR's All referrals), and those following the Recruiter template get ats.costs.manage (additive
-- only, audited like the start-up template sync; changed roles are left alone).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'ats.costs.manage', 'Hiring: recruiting costs (enter, change and delete; cost per hire)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT r.role, p."id" FROM "permissions" p CROSS JOIN (VALUES ('org_admin'), ('recruiter')) AS r(role) WHERE p."key" = 'ats.costs.manage'
ON CONFLICT DO NOTHING;

WITH wanted(template, add_keys) AS (
  VALUES ('hr_admin', '["ats.costs.manage", "ats.referral.manage"]'::jsonb), ('recruiter', '["ats.costs.manage"]'::jsonb)
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
       json_build_object('template', c.template, 'role', c.name, 'added', c.add_keys, 'notAddedConfidential', json_build_array(), 'by', 'migration 202617a0000002')::text,
       now()
FROM changed c;
