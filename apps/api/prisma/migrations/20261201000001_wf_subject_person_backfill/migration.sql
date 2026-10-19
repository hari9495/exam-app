-- The backfill in 20261201000000_home_parity ran under forced row-level security, so it saw no rows. Run it again as
-- the platform (the same way 20261009000000_people_core backfills): each request gets the person it is about.
SELECT set_config('app.is_super_admin', 'on', true);

UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "leave_requests" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'leave_request' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "attendance_requests" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'attendance_request' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "overtime_requests" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'overtime_request' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "timesheets" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'timesheet' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "expense_claims" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'expense_claim' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = e."person_id"
FROM "trips" s JOIN "employees" e ON e."id" = s."employee_id"
WHERE r."subject_type" = 'trip' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
UPDATE "wf_requests" r SET "subject_person_id" = s."person_id"
FROM "exit_cases" s
WHERE r."subject_type" = 'exit_case' AND r."subject_id" = s."id" AND r."subject_person_id" IS NULL;
