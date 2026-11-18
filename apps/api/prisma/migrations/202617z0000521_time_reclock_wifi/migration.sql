-- Time batch (founder answer 2477, items 1 and 7).
-- Clock in again after clocking out: HR turns it on per shift, and on a location's default shift for people with no
-- roster or pattern. Off by default, so nothing changes until HR turns it on.
ALTER TABLE "shifts" ADD COLUMN "reclock_in" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "location_attendance_rules" ADD COLUMN "reclock_in" BOOLEAN NOT NULL DEFAULT false;
-- The office Wi-Fi names (SSIDs) the phone app reports at check-in; one more way to be "at the office", beside the
-- check-in points and the office networks (IP ranges). Empty by default.
ALTER TABLE "locations" ADD COLUMN "wifi_names" VARCHAR(32)[] NOT NULL DEFAULT '{}';
