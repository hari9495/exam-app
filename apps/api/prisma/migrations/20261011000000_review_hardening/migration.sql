-- Review hardening of the organisation and employee core (P02 YX-SEC-04/06/13/15).

-- YX-SEC-04/06: the department head's implicit view runs only from the day they became head (never the
-- department's earlier history). A head set before this column existed counts from today.
ALTER TABLE "departments" ADD COLUMN "head_since" DATE;
SELECT set_config('app.is_super_admin', 'on', true);
UPDATE "departments" SET "head_since" = (now() AT TIME ZONE 'Asia/Kolkata')::date WHERE "head_employee_id" IS NOT NULL;
SELECT set_config('app.is_super_admin', 'off', true);
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_since_check" CHECK (("head_employee_id" IS NULL) = ("head_since" IS NULL));

-- YX-SEC-13: the notice of an identity / bank change goes to the contacts on file when it was raised (the
-- "previous contact"), so changing one's personal email first cannot redirect it.
ALTER TABLE "employee_profile_requests" ADD COLUMN "notify_contacts" TEXT[] NOT NULL DEFAULT '{}';

-- YX-SEC-15: auditor access to employee records is time-boxed, so it comes from an expiring role grant
-- (Roles & access, the Auditor template), not the permanent base role.
DELETE FROM "role_permissions" WHERE "role" = 'auditor' AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'employee.profile.view');
