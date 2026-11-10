-- Visitors slice 4 (founder answers 607, 608, 612, 617): the badge PDF, reports from the counts kept after deletion, and
-- the emergency roll-call. No new table: reports read `visits` and `visit_counts` (both under forced RLS). One key:
-- the roll-call (who is on site now: visitors and employees), for reception, security and HR at the locations in scope.
SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'visitors.rollcall.view', 'Visitors: the emergency roll-call (visitors and employees on site now) at the locations in scope')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'visitors.rollcall.view'
ON CONFLICT DO NOTHING;
