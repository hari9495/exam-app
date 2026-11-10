-- Answer 452: recruiters read the staffing desk's clients and bill rates (ats.staffing.view), in effect only while the
-- company's desk is on (staffing.desk.enabled; the staffing routes refuse otherwise). Granted like every new key: the
-- older recruiter role gets it; company roles that still follow the Recruiter template get it (additive only, audited
-- like the start-up template sync; changed roles are left alone).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'recruiter', p."id" FROM "permissions" p WHERE p."key" = 'ats.staffing.view'
ON CONFLICT DO NOTHING;

WITH wanted(template, add_keys) AS (
  VALUES ('recruiter', '["ats.staffing.view"]'::jsonb)
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
       json_build_object('template', c.template, 'role', c.name, 'added', c.add_keys, 'notAddedConfidential', json_build_array(), 'by', 'migration 202617s0000001')::text,
       now()
FROM changed c;
