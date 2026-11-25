-- HIR-02 / HIR-26 founder answers 253 and 255 (10 Nov 2026). A requisition (a job) can be cancelled with a reason, by
-- whom and when (the job is closed; refused once filled; audited by the API). A hiring manager may suggest a past
-- candidate to the requisition's recruiter once per candidate per requisition (a bell notice, audited).
ALTER TABLE "jobs" ADD COLUMN "requisition_cancelled_at" TIMESTAMPTZ(3);
ALTER TABLE "jobs" ADD COLUMN "requisition_cancel_reason" VARCHAR(500);
ALTER TABLE "jobs" ADD COLUMN "requisition_cancelled_by" UUID;

CREATE TABLE "requisition_suggestions" (
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "suggested_by" UUID NOT NULL,
    "suggested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requisition_suggestions_pkey" PRIMARY KEY ("job_id", "candidate_id"),
    CONSTRAINT "requisition_suggestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "requisition_suggestions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "requisition_suggestions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "requisition_suggestions_org_job_idx" ON "requisition_suggestions" ("organization_id", "job_id");
ALTER TABLE "requisition_suggestions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "requisition_suggestions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
