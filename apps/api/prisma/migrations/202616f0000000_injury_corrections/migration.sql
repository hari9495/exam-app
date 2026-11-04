-- HLP-12 founder answer 93 (4 Nov 2026): injury leave approved after its month is locked becomes a correction for the next
-- open month's run, for payroll to review (shown on the run's Inputs card, never applied by itself). It reuses the late
-- correction record: kind 'leave', source 'injury_leave', status 'approved' (the leave itself is approved), the locked
-- month's period, and the next open month as the month it is shown in.
ALTER TABLE "pay_corrections" DROP CONSTRAINT "pay_corrections_source_check";
ALTER TABLE "pay_corrections" ADD CONSTRAINT "pay_corrections_source_check" CHECK ("source" IN ('late_request', 'hr', 'device_backfill', 'injury_leave'));
