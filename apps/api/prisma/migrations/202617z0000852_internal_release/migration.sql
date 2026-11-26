-- Answer 2761: with hiring.internal.manager_release on, the current manager is asked to release someone who applies for an
-- internal job (an approvals-engine request); no offer until they agree. No answer in 5 working days hands it to HR.
-- release_status: NULL = no release needed (the setting was off or there is no manager), 'pending', 'approved', 'refused'.
ALTER TABLE "internal_applications"
  ADD COLUMN "release_status" VARCHAR(10),
  ADD COLUMN "release_wf_request_id" UUID,
  ADD COLUMN "release_asked_at" TIMESTAMPTZ(3),
  ADD COLUMN "release_hr_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "internal_applications_release_status_check" CHECK ("release_status" IN ('pending', 'approved', 'refused'));
CREATE INDEX "internal_applications_release_idx" ON "internal_applications" ("organization_id", "release_status") WHERE "release_status" = 'pending';
