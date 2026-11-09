-- HIR-03 / HIR-24 job pay range (9 Nov 2026; founder decision 7, docs/yukthix/hiring-design-map.md). A job keeps the pay
-- period of its range and whether the application asks about current or past pay. Whether a location's law requires
-- the range on the ad and bans the pay-history question comes from the rule set HIR.PAY_TRANSPARENCY by location
-- (state code, then country, then a country list), never code. India has no such law: showing the range is the
-- company's choice (setting hiring.pay_range.show). Every row is marked verify until counsel checks it.
ALTER TABLE "jobs" ADD COLUMN "salary_period" VARCHAR(5) NOT NULL DEFAULT 'year';
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_salary_period_check" CHECK ("salary_period" IN ('year', 'month', 'hour'));
ALTER TABLE "jobs" ADD COLUMN "ask_pay_history" BOOLEAN NOT NULL DEFAULT false;

SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('HIR.PAY_TRANSPARENCY', 'IN', '2026-v1', '1950-01-26',
   '{"rangeRequired":false,"historyBanned":false,"name":"India"}',
   'No Indian central or state law requires a pay range in a job advertisement or bans asking about past pay (Code on Wages 2019 s.3 bars pay discrimination only). Showing the range is the company''s choice. Verify with counsel.', true),
  ('HIR.PAY_TRANSPARENCY', 'US-NY', '2023-v1', '2023-09-17',
   '{"rangeRequired":true,"historyBanned":true,"name":"New York pay transparency law"}',
   'New York Labor Law s.194-b (from 17 Sep 2023): a good-faith pay range on every advertised job; NYC Admin Code s.8-107(32) (from 1 Nov 2022) also covers New York City. Pay-history questions banned: Labor Law s.194-a (from 6 Jan 2020). Verify with counsel.', true),
  ('HIR.PAY_TRANSPARENCY', 'US-CA', '2023-v1', '2023-01-01',
   '{"rangeRequired":true,"historyBanned":true,"name":"California pay transparency law"}',
   'California Labor Code s.432.3 (SB 1162, from 1 Jan 2023, employers of 15 or more): pay scale in job postings; asking about salary history banned (s.432.3, from 2018). Verify with counsel.', true),
  ('HIR.PAY_TRANSPARENCY', 'US-CO', '2021-v1', '2021-01-01',
   '{"rangeRequired":true,"historyBanned":true,"name":"Colorado Equal Pay for Equal Work Act"}',
   'Colorado Equal Pay for Equal Work Act, C.R.S. 8-5-201 (from 1 Jan 2021): pay range in every job posting; asking about wage history banned. Verify with counsel.', true),
  ('HIR.PAY_TRANSPARENCY', 'US-WA', '2023-v1', '2023-01-01',
   '{"rangeRequired":true,"historyBanned":true,"name":"Washington Equal Pay and Opportunities Act"}',
   'Washington RCW 49.58.110 (from 1 Jan 2023, employers of 15 or more): wage scale in job postings; RCW 49.58.100 bans asking about wage history. Verify with counsel.', true),
  ('HIR.PAY_TRANSPARENCY', 'US-IL', '2025-v1', '2025-01-01',
   '{"rangeRequired":true,"historyBanned":true,"name":"Illinois Equal Pay Act"}',
   'Illinois Equal Pay Act 820 ILCS 112/10 (HB 3129, from 1 Jan 2025, employers of 15 or more): pay scale in job postings; wage-history questions banned since 2019. Verify with counsel.', true),
  ('HIR.PAY_TRANSPARENCY', 'EU', '2026-v1', '2026-06-07',
   '{"rangeRequired":true,"historyBanned":true,"name":"EU Pay Transparency Directive","countries":["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]}',
   'Directive (EU) 2023/970, Art. 5 (member states transpose by 7 Jun 2026): the initial pay or its range in the vacancy notice or before the interview; asking about pay history banned. Each country''s own transposition law decides the details. Verify with counsel per country.', true)
ON CONFLICT DO NOTHING;
