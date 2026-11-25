-- Tier 1 batch A D12 (attendance-leave D12, answers 2311 and 2324): cancel some days of approved leave and extend it.
-- leave_changes holds "cancel these days" asked by the employee (to the approver) or done by HR at once (audited).
-- An extension is a new leave request linked to the one it extends.
CREATE TABLE "leave_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "days" DATE[] NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "raised_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "leave_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_changes_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "leave_changes_request_fkey" FOREIGN KEY ("request_id") REFERENCES "leave_requests"("id") ON DELETE CASCADE,
    CONSTRAINT "leave_changes_kind_check" CHECK ("kind" IN ('cancel_days')),
    CONSTRAINT "leave_changes_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "leave_changes_days_check" CHECK (cardinality("days") BETWEEN 1 AND 366),
    CONSTRAINT "leave_changes_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
-- One change waiting per request at a time.
CREATE UNIQUE INDEX "leave_changes_one_pending_key" ON "leave_changes" ("request_id") WHERE "status" = 'pending';
CREATE INDEX "leave_changes_organization_id_idx" ON "leave_changes" ("organization_id");
ALTER TABLE "leave_changes" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leave_changes"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "leave_requests" ADD COLUMN "extends_request_id" UUID REFERENCES "leave_requests"("id") ON DELETE SET NULL;
