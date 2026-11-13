-- Helpdesk ITSM-3 and ITSM-4 (docs/yukthix/helpdesk-itsm-plan.md; answers 1939-1941, 1951, 1955): the problem record of
-- a problem ticket (incidents link to it as "tracked by"; a change "fixes" it), and on changes: cancel or withdraw before
-- they start (1951) and the warning when one runs past its window (1955). No data is written.
CREATE TABLE "sd_problems" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "desk_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  -- open | investigating | known_error | fixed | closed
  "state" VARCHAR(12) NOT NULL DEFAULT 'open',
  -- The category the repeat suggestion came from (answer 1939), if any.
  "category_id" UUID,
  "root_cause" VARCHAR(4000),
  "workaround" VARCHAR(4000),
  -- Answer 1940: the draft article made from the workaround, and the known-issue notice.
  "kb_article_id" UUID,
  "banner_id" UUID,
  -- Answer 1941: the one reply every open linked incident gets when the problem closes.
  "closing_reply" VARCHAR(2000),
  "closed_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_problems_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_problems_ticket_key" UNIQUE ("organization_id", "ticket_id"),
  CONSTRAINT "sd_problems_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "sd_problems_state_check" CHECK ("state" IN ('open', 'investigating', 'known_error', 'fixed', 'closed'))
);
CREATE INDEX "sd_problems_desk_idx" ON "sd_problems"("organization_id", "desk_id", "state");

ALTER TABLE "sd_problems" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sd_problems"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "sd_changes" DROP CONSTRAINT "sd_changes_stage_check",
  ADD CONSTRAINT "sd_changes_stage_check" CHECK ("stage" IN ('approval', 'scheduled', 'in_progress', 'review', 'closed', 'backed_out', 'rejected', 'cancelled')),
  ADD COLUMN "cancel_reason" VARCHAR(500),
  ADD COLUMN "cancelled_by" UUID,
  ADD COLUMN "overrun_warned_at" TIMESTAMPTZ(3);
