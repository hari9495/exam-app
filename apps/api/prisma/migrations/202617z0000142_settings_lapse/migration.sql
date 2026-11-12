-- Settings (founder answer 1523): a payroll setting change that nobody decides lapses after the company's
-- payroll.settings.lapse_days (default 14), by the nightly sweep, as the system (no person decides it).
ALTER TABLE "setting_change_requests" DROP CONSTRAINT "setting_change_requests_status_check";
ALTER TABLE "setting_change_requests" ADD CONSTRAINT "setting_change_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'lapsed'));
ALTER TABLE "setting_change_requests" DROP CONSTRAINT "setting_change_requests_decided_check";
ALTER TABLE "setting_change_requests" ADD CONSTRAINT "setting_change_requests_decided_check" CHECK (
  ("status" = 'pending' AND "decided_by" IS NULL AND "decided_at" IS NULL)
  OR ("status" IN ('approved', 'rejected') AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
  OR ("status" = 'lapsed' AND "decided_by" IS NULL AND "decided_at" IS NOT NULL));
