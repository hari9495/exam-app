-- Request work from home (19 Oct 2026): an attendance request of kind 'wfh' for one day, through the approvals workflow
-- (the manager; HR too beyond the monthly limit). An approved day counts the person present, and web check-in that day
-- records where they are instead of refusing outside the geofence or office network.
ALTER TABLE "attendance_requests" DROP CONSTRAINT "attendance_requests_kind_check";
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_kind_check" CHECK ("kind" IN ('missed_in', 'missed_out', 'wrong_time', 'full_day', 'wfh'));
CREATE INDEX "attendance_requests_wfh_idx" ON "attendance_requests"("organization_id", "employee_id", "work_on") WHERE "kind" = 'wfh' AND "status" IN ('pending', 'approved');
