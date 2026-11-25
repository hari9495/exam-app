-- Founder answer A, 29 Oct 2026 (docs/yukthix/time-design-map.md): Payroll reads the leave liability report without the
-- whole of leave.view (least privilege). The key opens only that report and its CSV export; money still needs
-- employee.salary.view. The Payroll Admin template carries it (role-templates.ts); company roles that follow the
-- template get it at start-up (access/template-sync.service.ts), so no profile is changed here.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'leave.liability.view', 'Open the leave liability report (unused leave that can be cashed in) and its export for the people in scope; money only with employee.salary.view')
ON CONFLICT DO NOTHING;
