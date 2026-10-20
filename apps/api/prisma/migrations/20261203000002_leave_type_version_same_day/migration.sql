-- A leave type version starting today may still be corrected today (a same-day fix of a change made this morning);
-- a version used on an earlier day never changes.
CREATE OR REPLACE FUNCTION leave_type_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.valid_from < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'YX_VERSION_IN_FORCE: a leave type version used on an earlier day does not change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
