-- Tier 1 batch A item 7 (attendance-leave B4, answer 2310): hourly permission on the attendance request. A from and to
-- time on one day with a reason; it never uses leave. Company settings set how many a month and how long each may be.
ALTER TABLE "attendance_requests" DROP CONSTRAINT "attendance_requests_kind_check";
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_kind_check"
  CHECK (kind IN ('missed_in', 'missed_out', 'wrong_time', 'full_day', 'wfh', 'on_duty', 'permission'));
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_permission_check"
  CHECK (kind <> 'permission' OR (in_minute IS NOT NULL AND out_minute IS NOT NULL AND out_minute > in_minute));
