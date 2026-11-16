-- Assessments AS-2 (Settings 6.5 asmt.high_stakes): a test expected to reach more candidates than the company's number
-- needs a second person to approve it before publishing. The approval holds for the test as approved (a fingerprint of
-- what candidates would get); any later change asks for approval again. exams already has forced RLS (tenant_isolation).
-- No rows are written here.
ALTER TABLE "exams"
  ADD COLUMN "expected_candidates" INTEGER,
  ADD COLUMN "approval_requested_by" UUID,
  ADD COLUMN "approval_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "approved_by" UUID,
  ADD COLUMN "approved_at" TIMESTAMPTZ(3),
  ADD COLUMN "approved_fingerprint" VARCHAR(64);

ALTER TABLE "exams" ADD CONSTRAINT "exams_expected_candidates_check"
  CHECK ("expected_candidates" IS NULL OR "expected_candidates" BETWEEN 1 AND 1000000);
-- Four eyes, also in the database: the approver is neither the person who asked nor the test's author, and an approval
-- always says who asked and what was approved.
ALTER TABLE "exams" ADD CONSTRAINT "exams_approver_check"
  CHECK ("approved_by" IS NULL OR ("approval_requested_by" IS NOT NULL AND "approved_at" IS NOT NULL AND "approved_fingerprint" IS NOT NULL
    AND "approved_by" <> "approval_requested_by" AND "approved_by" <> "created_by"));
