-- Answers 2423 and 2510 (retiring /v2 Business hours): a candidate's self-booking is checked against the Settings 6.1
-- interview hours (from, until, days; India time) and the company's holiday calendars. A company that had set /v2
-- business hours keeps them: its open days, its earliest opening (down to the half hour) and its latest closing (up to
-- the half hour, at most 23:30). The old columns stay until the founder has decided on the holidays found only in the
-- old list (scripts/v2-holiday-compare.ts lists them); nothing is added to a holiday calendar here.
SELECT set_config('app.is_super_admin', 'on', true);

WITH o AS (
  SELECT "id", "business_hours_json"::jsonb AS bh FROM "organizations" WHERE "business_hours_json" IS NOT NULL AND "business_hours_json" <> ''
), d AS (
  SELECT o."id", e.k AS day, (e.v->>'open')::time AS op, (e.v->>'close')::time AS cl
  FROM o, jsonb_each(o.bh->'days') AS e(k, v)
  WHERE (e.v->>'enabled')::boolean AND e.k IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
), a AS (
  SELECT "id",
    string_agg(day, ',' ORDER BY array_position(ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], day)) AS days,
    to_char(date_trunc('hour', min(op)) + CASE WHEN extract(minute FROM min(op)) >= 30 THEN interval '30 minutes' ELSE interval '0' END, 'HH24:MI') AS f,
    max(cl) AS cl
  FROM d GROUP BY "id"
), r AS (
  SELECT "id", days, f,
    CASE WHEN cl > time '23:30' THEN '23:30'
         ELSE to_char(date_trunc('hour', cl) + CASE WHEN extract(minute FROM cl) = 0 THEN interval '0' WHEN extract(minute FROM cl) <= 30 THEN interval '30 minutes' ELSE interval '60 minutes' END, 'HH24:MI') END AS t
  FROM a
), v AS (
  SELECT "id", 'hiring.interview_hours.from' AS key, f AS value FROM r WHERE f < t
  UNION ALL SELECT "id", 'hiring.interview_hours.to', t FROM r WHERE f < t
  UNION ALL SELECT "id", 'hiring.interview_hours.days', days FROM r WHERE f < t
)
INSERT INTO "settings" ("organization_id", "scope_type", "scope_id", "key", "value")
SELECT v."id", 'tenant', v."id", v.key, to_jsonb(v.value)
FROM v
WHERE NOT EXISTS (SELECT 1 FROM "settings" s WHERE s."organization_id" = v."id" AND s."key" = v.key AND s."scope_type" = 'tenant');
