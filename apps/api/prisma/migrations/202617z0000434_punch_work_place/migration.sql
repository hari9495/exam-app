-- Tier 1 batch A A9 (attendance-leave A9, answer 2312): each punch records office, remote or unknown, worked out at punch
-- time from the geofence and office-network checks. Punches made before this stay NULL (locked months can't be updated);
-- the API works their place out from the stored verdict in the same way.
ALTER TABLE "punches" ADD COLUMN "work_place" VARCHAR(7);
ALTER TABLE "punches" ADD CONSTRAINT "punches_work_place_check" CHECK ("work_place" IS NULL OR "work_place" IN ('office', 'remote', 'unknown'));
