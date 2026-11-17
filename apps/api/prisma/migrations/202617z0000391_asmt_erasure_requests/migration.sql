-- Assessments AS-5 part 3 (PRC-28): a candidate asks a company to erase their recordings, clips and face data. The
-- nightly sweep erases them once nothing holds them (an undecided incident, an open appeal or its open window).
CREATE TABLE "asmt_erasure_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'waiting',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "done_at" TIMESTAMPTZ(3),
    CONSTRAINT "asmt_erasure_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asmt_erasure_requests_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_erasure_requests_candidate_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE,
    CONSTRAINT "asmt_erasure_requests_status_check" CHECK ("status" IN ('waiting', 'done')),
    CONSTRAINT "asmt_erasure_requests_done_check" CHECK (("status" = 'done') = ("done_at" IS NOT NULL))
);
-- One waiting request per candidate: asking twice records once.
CREATE UNIQUE INDEX "asmt_erasure_requests_waiting_key" ON "asmt_erasure_requests" ("candidate_id") WHERE "status" = 'waiting';
CREATE INDEX "asmt_erasure_requests_organization_id_idx" ON "asmt_erasure_requests" ("organization_id");
ALTER TABLE "asmt_erasure_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "asmt_erasure_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
