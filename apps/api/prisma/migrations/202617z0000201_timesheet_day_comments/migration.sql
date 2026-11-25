-- Founder change (13 Nov 2026, answer 1787): a comment per day, not per row. Each day of a timesheet row has its own
-- comment, beside its minutes (seven entries, Monday to Sunday; empty text for none). A row's note from the per-row
-- version (1731 to 1736) moves to the first day of the row with hours, and the row note is cleared (one way only).
-- Writes data, so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "timesheet_lines" ADD COLUMN "day_comments" TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "timesheet_lines_day_comments_check" CHECK (cardinality("day_comments") IN (0, 7));

UPDATE "timesheet_lines" l
SET "day_comments" = (
      SELECT array_agg(CASE WHEN d.k = f.first THEN btrim(l."note") ELSE '' END ORDER BY d.k)
      FROM generate_series(1, 7) AS d(k)
    ),
    "note" = NULL
FROM (
  SELECT x.id, coalesce((SELECT min(i) FROM generate_subscripts(x."minutes", 1) AS i WHERE x."minutes"[i] > 0), 1) AS first
  FROM "timesheet_lines" x
  WHERE x."note" IS NOT NULL AND btrim(x."note") <> ''
) f
WHERE l.id = f.id;
