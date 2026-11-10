-- Founder answer 511 (13 Nov 2026): the interviewer keys (results:view, interview:view_assigned) leave the default employee
-- role (panel). Being on an interview's panel is what opens interviews and scorecards now, not a role key. The global
-- default changes; a company override of the panel role changes only while it still equals the old default exactly
-- (an edited override is left alone); company-made roles (permission profiles) are never touched. Every change is
-- recorded in the audit log. The old default, for the exact-match check: interview:view_assigned, org:view,
-- payroll.equity.own, results:view.
SELECT set_config('app.is_super_admin', 'on', true);

-- Company overrides still equal to the old default: audit first (with before and after), then change.
INSERT INTO "audit_logs" ("id", "organization_id", "action", "entity_type", "entity_id", "actor_name", "metadata_json")
SELECT gen_random_uuid(), o."organization_id", 'access.role_default.changed', 'org_role_permission', o."id"::text, 'System (migration 202617t0000000)',
       json_build_object('role', 'panel', 'reason', 'Founder answer 511: interviews open by panel membership', 'from', o."permissions_json"::jsonb, 'to', '["org:view","payroll.equity.own"]'::jsonb)::text
FROM "org_role_permissions" o
WHERE o."role" = 'panel'
  AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(o."permissions_json"::jsonb) k) = '["interview:view_assigned","org:view","payroll.equity.own","results:view"]'::jsonb;

UPDATE "org_role_permissions" o
SET "permissions_json" = '["org:view","payroll.equity.own"]', "updated_at" = CURRENT_TIMESTAMP
WHERE o."role" = 'panel'
  AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(o."permissions_json"::jsonb) k) = '["interview:view_assigned","org:view","payroll.equity.own","results:view"]'::jsonb;

-- The global default (one audit row for the platform, no company).
INSERT INTO "audit_logs" ("id", "organization_id", "action", "entity_type", "entity_id", "actor_name", "metadata_json")
SELECT gen_random_uuid(), NULL, 'access.role_default.changed', 'role_permission', 'panel', 'System (migration 202617t0000000)',
       json_build_object('role', 'panel', 'reason', 'Founder answer 511: interviews open by panel membership', 'removed', '["interview:view_assigned","results:view"]'::jsonb)::text
WHERE EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" p ON p."id" = rp."permission_id" WHERE rp."role" = 'panel' AND p."key" IN ('results:view', 'interview:view_assigned'));

DELETE FROM "role_permissions" rp
USING "permissions" p
WHERE p."id" = rp."permission_id" AND rp."role" = 'panel' AND p."key" IN ('results:view', 'interview:view_assigned');
