-- Clock in again after clocking out (founder decision 21 Oct 2026): split shifts and field staff. HR turns it on per
-- shift, and on a location's default shift for people with no roster or pattern. Off by default, so nothing changes
-- until HR turns it on.
ALTER TABLE "shifts" ADD COLUMN "reclock_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "location_attendance_rules" ADD COLUMN "reclock_in" BOOLEAN NOT NULL DEFAULT false;
