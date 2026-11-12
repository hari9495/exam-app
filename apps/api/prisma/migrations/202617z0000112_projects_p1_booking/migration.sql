-- Projects P-1 (answer 1404): companies that already kept Time's projects had nobody allocated, so "only allocated
-- people book time" (on by default) would stop all their timesheets the day Projects came on for them (migration
-- 202617z0000111). For those companies the rule starts off; a System Admin turns it on in Settings › Projects &
-- timesheets once the teams are in. New companies keep the default (on).
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "settings" ("organization_id", "scope_type", "scope_id", "key", "value")
SELECT DISTINCT p."organization_id", 'tenant', p."organization_id", 'projects.booking.allocated_only', '"off"'::jsonb
FROM "timesheet_projects" p
WHERE NOT EXISTS (SELECT 1 FROM "project_allocations" a WHERE a."organization_id" = p."organization_id")
  AND NOT EXISTS (SELECT 1 FROM "settings" s WHERE s."organization_id" = p."organization_id" AND s."key" = 'projects.booking.allocated_only' AND s."scope_type" = 'tenant');
