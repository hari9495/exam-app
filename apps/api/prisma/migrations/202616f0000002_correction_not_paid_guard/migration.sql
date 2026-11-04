-- HLP-12 founder answer 121: the correction guard (5a: "decided only once") also allows a late injury correction to move
-- between approved and not_paid, changing only its status and the not_paid_* columns. Everything else stays as before.
CREATE OR REPLACE FUNCTION pay_corrections_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."source" = 'injury_leave' AND OLD."status" IN ('approved', 'not_paid') AND NEW."status" IN ('approved', 'not_paid')
     AND (to_jsonb(NEW) - 'status' - 'not_paid_reason' - 'not_paid_by' - 'not_paid_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status' - 'not_paid_reason' - 'not_paid_by' - 'not_paid_at') THEN
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'pending'
     OR (to_jsonb(NEW) - 'status' - 'decided_at' - 'wf_request_id' - 'target_period') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'wf_request_id' - 'target_period') THEN
    RAISE EXCEPTION 'A correction is only ever decided once';
  END IF;
  RETURN NEW;
END $$;
