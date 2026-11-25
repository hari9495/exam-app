-- Settings S-4 (founder answer 1324, 12 Nov 2026): the audit log is kept at least 8 years (the Companies (Accounts) Rules,
-- 2014 r.3(1) audit trail, kept as books of account under the Companies Act, 2013 s.128(5)). A new version of the
-- country's limits (a published version never changes); the earlier limits are carried over unchanged.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify", "published_at") VALUES
  ('IN.SETTINGS.LIMITS', 'IN', '2026-v3', '2026-11-12',
   '{"limits":{"roster.max_daily_hours":{"max":9,"act":"Factories Act, 1948 s.54"},"roster.max_weekly_hours":{"max":48,"act":"Factories Act, 1948 s.51"},"roster.max_spread_over_hours":{"max":10.5,"act":"Factories Act, 1948 s.56"},"roster.min_weekly_offs":{"min":1,"act":"Factories Act, 1948 s.52"},"payroll.standard_daily_hours":{"max":9,"act":"Factories Act, 1948 s.54"},"payroll.document_retention_years":{"min":8,"act":"Companies Act, 2013 s.128(5)"},"audit.retention_years":{"min":8,"act":"Companies (Accounts) Rules, 2014 r.3(1) with the Companies Act, 2013 s.128(5)"}}}',
   'Factories Act, 1948 s.51, s.52, s.54, s.56 (OSH Code 2020 s.25-26 as state rules); Companies Act, 2013 s.128(5) and the Companies (Accounts) Rules, 2014 r.3(1) (books and their audit trail kept 8 years). Shops and Establishments Acts differ by state. Verify before go-live.',
   true, now());
