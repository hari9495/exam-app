-- HLP-12 founder answer 65 (4 Nov 2026): payroll's injury days fill each month from approved injury leave in Time.
-- A row the app fills is source 'leave' (no person entered it; it follows the leave, and drops to 0 days when the leave
-- is cancelled, as the app may not delete). Payroll editing it makes it source 'payroll': the app never changes it again.
-- in_feed_days: the part of the days Time's attendance feed already counts as unpaid (an unpaid injury leave type), so
-- the calculation does not take those days off twice. A locked month is never changed (the fill checks the period).

ALTER TABLE "special_days"
  ADD COLUMN "source" VARCHAR(8) NOT NULL DEFAULT 'payroll',
  ADD COLUMN "in_feed_days" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ALTER COLUMN "entered_by" DROP NOT NULL,
  DROP CONSTRAINT "special_days_days_check",
  ADD CONSTRAINT "special_days_source_check" CHECK ("source" IN ('payroll', 'leave')),
  ADD CONSTRAINT "special_days_leave_kind_check" CHECK ("source" = 'payroll' OR "kind" = 'injury'),
  ADD CONSTRAINT "special_days_entered_by_check" CHECK ("source" = 'leave' OR "entered_by" IS NOT NULL),
  ADD CONSTRAINT "special_days_days_check" CHECK ("days" <= 31 AND "days_before" >= 0 AND ("days" > 0 OR ("source" = 'leave' AND "days" = 0))),
  ADD CONSTRAINT "special_days_in_feed_check" CHECK ("in_feed_days" >= 0 AND "in_feed_days" <= "days");
