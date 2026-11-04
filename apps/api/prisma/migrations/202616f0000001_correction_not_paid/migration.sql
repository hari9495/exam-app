-- HLP-12 founder answer 121 (4 Nov 2026): a late injury correction on a run can be marked "Not paid" with a reason (kept,
-- audited); it then leaves the run and is never raised again (the fill counts it as raised). Undone only while that run
-- is open: the status goes back to approved and the reason is cleared (the audit log keeps both steps).
ALTER TABLE "pay_corrections" DROP CONSTRAINT "pay_corrections_status_check";
ALTER TABLE "pay_corrections"
  ADD CONSTRAINT "pay_corrections_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn', 'not_paid')),
  ADD COLUMN "not_paid_reason" VARCHAR(500),
  ADD COLUMN "not_paid_by" UUID,
  ADD COLUMN "not_paid_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "pay_corrections_not_paid_check" CHECK (
    ("status" = 'not_paid' AND "source" = 'injury_leave' AND length(coalesce("not_paid_reason", '')) >= 3 AND "not_paid_by" IS NOT NULL AND "not_paid_at" IS NOT NULL)
    OR ("status" <> 'not_paid' AND "not_paid_reason" IS NULL AND "not_paid_by" IS NULL AND "not_paid_at" IS NULL));
