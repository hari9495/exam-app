-- Fix (late corrections paid): an attendance or leave correction approved after its month locked (a late request, HR's
-- correction, a late device batch) is paid by the next regular run, and payroll may mark it "Not paid" with a reason on
-- that run, as answer 121 allowed for late injury leave. The check and the guard now allow every correction a run lists.
ALTER TABLE "pay_corrections" DROP CONSTRAINT "pay_corrections_not_paid_check",
  ADD CONSTRAINT "pay_corrections_not_paid_check" CHECK (
    ("status" = 'not_paid' AND "source" IN ('injury_leave', 'late_request', 'hr', 'device_backfill') AND length(coalesce("not_paid_reason", '')) >= 3 AND "not_paid_by" IS NOT NULL AND "not_paid_at" IS NOT NULL)
    OR ("status" <> 'not_paid' AND "not_paid_reason" IS NULL AND "not_paid_by" IS NULL AND "not_paid_at" IS NULL));

CREATE OR REPLACE FUNCTION pay_corrections_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."source" IN ('injury_leave', 'late_request', 'hr', 'device_backfill') AND OLD."status" IN ('approved', 'not_paid') AND NEW."status" IN ('approved', 'not_paid')
     AND (to_jsonb(NEW) - 'status' - 'not_paid_reason' - 'not_paid_by' - 'not_paid_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status' - 'not_paid_reason' - 'not_paid_by' - 'not_paid_at') THEN
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'pending'
     OR (to_jsonb(NEW) - 'status' - 'decided_at' - 'wf_request_id' - 'target_period') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'wf_request_id' - 'target_period') THEN
    RAISE EXCEPTION 'A correction is only ever decided once';
  END IF;
  RETURN NEW;
END $$;
