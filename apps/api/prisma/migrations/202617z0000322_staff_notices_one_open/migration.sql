-- Answer 2093: the hourly Board nudge keeps one open notice per staff member per containment, not a new one each hour.
-- A new one may follow once the staff member has read the last. Inserts use ON CONFLICT DO NOTHING (no SELECT needed under RLS).
-- Older duplicates (before this index) are marked read so the index can be built; the newest stays open.
-- FORCE is lifted only for this one-off owner cleanup (forced RLS hides every row from the owner) and restored at once.
ALTER TABLE "staff_notices" NO FORCE ROW LEVEL SECURITY;
UPDATE "staff_notices" n SET "read_at" = now()
WHERE n."kind" = 'board_notice_due' AND n."read_at" IS NULL AND n."entity_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "staff_notices" m WHERE m."kind" = 'board_notice_due' AND m."read_at" IS NULL
    AND m."recipient_user_id" = n."recipient_user_id" AND m."entity_id" = n."entity_id"
    AND (m."created_at", m."id") > (n."created_at", n."id"));
ALTER TABLE "staff_notices" FORCE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "staff_notices_one_open_board_notice" ON "staff_notices" ("recipient_user_id", "entity_id") WHERE "kind" = 'board_notice_due' AND "read_at" IS NULL;
