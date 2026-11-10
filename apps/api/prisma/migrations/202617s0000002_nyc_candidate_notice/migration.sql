-- Answer 474: the New York City candidate notice. Local Law 144 asks for a notice to candidates at least 10 business
-- days before an automated tool is used, and another process on request. The 10 business days are data in the rule
-- set: a published version never changes, so 2023-v1 is withdrawn and 2023-v2 (the same rules plus the notice) is
-- published from the same day (verify with counsel, GO-LIVE-CHECKLIST). A candidate's request is kept on the application.
SELECT set_config('app.is_super_admin', 'on', true);

UPDATE "statutory_rule_sets" SET "status" = 'withdrawn', "withdrawn_at" = now()
WHERE "statute" = 'HIR.BIAS_AUDIT' AND "jurisdiction" = 'US-NY' AND "version" = '2023-v1' AND "status" = 'published';

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify")
SELECT 'HIR.BIAS_AUDIT', 'US-NY', '2023-v2', '2023-07-05',
       "values" || '{"noticeBusinessDays":10}'::jsonb,
       'NYC Admin Code s.20-870 to 20-874 (Local Law 144 of 2021) and DCWP rules 6 RCNY s.5-300 to 5-304 (enforced from 5 Jul 2023): an independent bias audit within one year before using an AEDT for a job in New York City, its summary published, impact ratios by sex and race/ethnicity (EEO-1); candidates told at least 10 business days before use, with what it assesses and how to ask for another process. Verify with counsel.',
       true
FROM "statutory_rule_sets"
WHERE "statute" = 'HIR.BIAS_AUDIT' AND "jurisdiction" = 'US-NY' AND "version" = '2023-v1'
ON CONFLICT DO NOTHING;

ALTER TABLE "pipeline_entries" ADD COLUMN "alternative_requested_at" TIMESTAMPTZ(3);
