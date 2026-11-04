-- HLP-14 founder answer 111 (4 Nov 2026): the first industry law table. Annual leave with wages in a factory, under the
-- Factories Act 1948 (ss.79-82) until the OSH Code 2020 replaced it (s.32, in force 21 Nov 2025), linked to
-- Manufacturing and Food and consumer goods. Only figures the Act states as a number are checked (the carry-forward
-- minimum); the entitlement itself is a rate (days worked per day of leave), so it is listed in "notes" and shown as
-- "ask counsel". Both rows are marked verify. Time's leave minimums do not read industry tables (question 131).

SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify") VALUES
  ('IN.FACTORIES.LEAVE', 'IN', '1948-v1', '1949-04-01', '2025-11-20',
   '{"floors":[],"carry":{"earned":30},"notes":["Annual leave with wages in a factory is one day for every twenty days worked in the previous year (one for every fifteen for a child), for workers with 240 days or more: a rate, not a fixed number a year, so it is not checked."]}',
   'Factories Act, 1948: s.79(1) after 240 days worked in a calendar year, one day for every twenty days worked (adult) or fifteen (child) in the previous year; s.79(5) unused leave carries forward, not more than thirty days (adult) or forty (child); ss.80-82 wages and payment. Replaced by the OSH Code 2020 from 21 Nov 2025. Verify before go-live.', true),
  ('IN.FACTORIES.LEAVE', 'IN', '2020-v1', '2025-11-21', NULL,
   '{"floors":[],"carry":{"earned":30},"notes":["Annual leave with wages in a factory is one day for every twenty days worked in the year (one for every fifteen for an adolescent), for workers with 180 days or more: a rate, not a fixed number a year, so it is not checked."]}',
   'OSH Code 2020, s.32 (in force 21 Nov 2025; replaces Factories Act 1948 ss.79-82): after 180 days worked in a calendar year (was 240), one day for every twenty days worked (adolescent: fifteen); carry forward not more than thirty days; encashment at year end. Verify the Gazette text before go-live.', true);

UPDATE "policy_industries" SET "law_statutes" = ARRAY['IN.FACTORIES.LEAVE']::varchar[] WHERE "code" IN ('manufacturing', 'fmcg');
