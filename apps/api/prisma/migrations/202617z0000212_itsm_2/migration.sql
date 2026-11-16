-- Helpdesk ITSM-2 (docs/yukthix/helpdesk-itsm-plan.md; answers 1932-1938, 1943): a change request is a change ticket
-- of an IT desk with its change record: kind, risk from the desk's questions (a lower risk needs a reason), the service
-- (a business application), the window (inside the company's change window, never in a freeze unless an emergency with
-- a reason), the plan and way back, the approval request, the implementation checklist, the outcome and the review.
-- No data is written, so no platform context is needed.
CREATE TABLE "sd_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "desk_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "change_kind" VARCHAR(10) NOT NULL,
  "risk" VARCHAR(6) NOT NULL,
  -- The risk the answers give, and why a lower one was chosen (answer 1933).
  "risk_from_answers" VARCHAR(6),
  "risk_answers" JSONB NOT NULL DEFAULT '{}',
  "risk_reason" VARCHAR(500),
  "app_id" UUID,
  "service" VARCHAR(100) NOT NULL,
  "window_from" TIMESTAMPTZ(3) NOT NULL,
  "window_to" TIMESTAMPTZ(3) NOT NULL,
  -- Answer 1936: an emergency change in a freeze says why.
  "freeze_reason" VARCHAR(500),
  "plan" VARCHAR(4000),
  "backout" VARCHAR(2000) NOT NULL,
  "banner" BOOLEAN NOT NULL DEFAULT true,
  "banner_id" UUID,
  "template_id" UUID,
  "tasks" JSONB NOT NULL DEFAULT '[]',
  "stage" VARCHAR(12) NOT NULL,
  "approval_request_id" UUID,
  "outcome" VARCHAR(20),
  "outcome_note" VARCHAR(2000),
  "outcome_by" UUID,
  "outcome_at" TIMESTAMPTZ(3),
  -- Answer 1938: a review after a high-risk, emergency or failed change, due within the desk's working days.
  "review_due" TIMESTAMPTZ(3),
  "review" VARCHAR(4000),
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_changes_ticket_key" UNIQUE ("organization_id", "ticket_id"),
  CONSTRAINT "sd_changes_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "sd_changes_kind_check" CHECK ("change_kind" IN ('standard', 'normal', 'emergency')),
  CONSTRAINT "sd_changes_risk_check" CHECK ("risk" IN ('low', 'medium', 'high') AND ("risk_from_answers" IS NULL OR "risk_from_answers" IN ('low', 'medium', 'high'))),
  CONSTRAINT "sd_changes_stage_check" CHECK ("stage" IN ('approval', 'scheduled', 'in_progress', 'review', 'closed', 'backed_out', 'rejected')),
  CONSTRAINT "sd_changes_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('done', 'done_with_problems', 'backed_out')),
  CONSTRAINT "sd_changes_window_check" CHECK ("window_to" > "window_from")
);
CREATE INDEX "sd_changes_desk_idx" ON "sd_changes"("organization_id", "desk_id", "window_from");

ALTER TABLE "sd_changes" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sd_changes"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
