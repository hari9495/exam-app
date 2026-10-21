-- Breaks on the attendance clock (19 Oct 2026): "Start break" and "End break" are punches like check-in and check-out,
-- with the same location and network check, each one kept (accepted or refused). The day engine takes the time on
-- punched breaks off the worked time (the larger of the breaks punched and the shift's break rule).
ALTER TABLE "punches" ALTER COLUMN "kind" TYPE VARCHAR(11);
ALTER TABLE "punches" DROP CONSTRAINT "punches_kind_check";
ALTER TABLE "punches" ADD CONSTRAINT "punches_kind_check" CHECK ("kind" IN ('in', 'out', 'break_start', 'break_end'));
