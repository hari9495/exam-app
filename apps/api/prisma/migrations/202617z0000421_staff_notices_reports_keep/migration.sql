-- Answer 2221: the CERT-In and DPDP report reminders are staff notices too (kind breach_report_due; the email stays).
ALTER TABLE "staff_notices" DROP CONSTRAINT "staff_notices_kind_check";
ALTER TABLE "staff_notices" ADD CONSTRAINT "staff_notices_kind_check" CHECK ("kind" IN ('kept_records_removed', 'board_notice_due', 'breach_report_due'));

-- Answer 2222: read notices are deleted after notices.read_keep_days (a platform setting, 90 by default, at least 30).
-- The nightly job deletes as each staff member in turn, so the database lets a deletion reach only that person's own
-- notices, only read ones, and never one read in the last 30 days, whatever the setting says. Unread ones stay.
GRANT DELETE ON TABLE "staff_notices" TO app_runtime;
CREATE POLICY staff_notices_own_purge ON "staff_notices" FOR DELETE USING (
  "recipient_user_id" = (SELECT app_current_user_id()) AND "read_at" IS NOT NULL AND "read_at" < now() - interval '30 days'
);
