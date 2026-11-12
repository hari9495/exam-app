-- Settings S-2 (founder answer 1324, 12 Nov 2026): the legal ceilings and floors of company settings come from the
-- country's rule set, set by YukthiX, never typed into a page. A company may always be more generous than the law: a
-- value past the limit is refused when saved (PUT org/settings) and on the page, naming the Act. One rule set for India
-- (state rules can narrow it later as their own versions). Marked verify, like every P07 value (GO-LIVE-CHECKLIST).
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify", "published_at") VALUES
  ('IN.SETTINGS.LIMITS', 'IN', '2026-v1', '1948-09-23',
   '{"limits":{"roster.max_daily_hours":{"max":9,"act":"Factories Act, 1948 s.54"},"roster.max_weekly_hours":{"max":48,"act":"Factories Act, 1948 s.51"},"roster.max_spread_over_hours":{"max":10.5,"act":"Factories Act, 1948 s.56"},"roster.min_weekly_offs":{"min":1,"act":"Factories Act, 1948 s.52"}}}',
   'Factories Act, 1948 s.51 (48 hours a week), s.52 (a weekly holiday), s.54 (9 hours a day), s.56 (spread-over 10.5 hours); the OSH Code 2020 s.25-26 keeps these as state rules. Shops and Establishments Acts differ by state. Verify before go-live.',
   true, now());
