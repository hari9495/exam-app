-- Answer 2510 follow-up (lead, 18 Nov 2026): the /v2 business hours and holiday list are retired. Their hours were copied
-- to the Settings 6.1 interview hours (202617z0000541) and the old holiday list was empty in every database checked, so
-- the columns go. Holidays live only in the company holiday calendars.
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "business_hours_json";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "holidays_json";
