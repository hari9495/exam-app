-- HIR-27 bulk interview day: one day of a job's hiring with several panels and fixed slots. Each candidate on it gets an
-- ordinary interview (the HIR-06 interview with its panel, scorecard and notices) when the invites are sent; a row keeps
-- the candidate's place, the interview it became and the result of its own send. New tables only; no data is written.
CREATE TABLE "interview_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "day" DATE NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    -- Start of each slot, minutes after midnight in time_zone; every slot lasts slot_minutes (company setting when made).
    "slots" INTEGER[] NOT NULL,
    "slot_minutes" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    -- Set while invites are being sent, so a double click or a second person never sends twice.
    "sending_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interview_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_days_status_check" CHECK ("status" IN ('draft', 'sent')),
    CONSTRAINT "interview_days_slot_minutes_check" CHECK ("slot_minutes" BETWEEN 15 AND 240),
    CONSTRAINT "interview_days_slots_check" CHECK (cardinality("slots") BETWEEN 1 AND 20)
);
CREATE INDEX "interview_days_org_day_idx" ON "interview_days" ("organization_id", "day");

CREATE TABLE "interview_day_panels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "room" VARCHAR(120) NOT NULL,
    "member_user_ids" UUID[] NOT NULL,
    CONSTRAINT "interview_day_panels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interview_day_panels_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "interview_days"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_day_panels_members_check" CHECK (cardinality("member_user_ids") BETWEEN 1 AND 10)
);
CREATE INDEX "interview_day_panels_day_idx" ON "interview_day_panels" ("organization_id", "day_id", "position");

CREATE TABLE "interview_day_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "pipeline_entry_id" UUID NOT NULL,
    "panel_id" UUID,
    "slot_start" INTEGER,
    "interview_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'unassigned',
    "error" VARCHAR(300),
    "sent_at" TIMESTAMPTZ(3),
    CONSTRAINT "interview_day_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interview_day_rows_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "interview_days"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_day_rows_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "interview_day_panels"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "interview_day_rows_status_check" CHECK ("status" IN ('unassigned', 'assigned', 'sent', 'failed'))
);
CREATE UNIQUE INDEX "interview_day_rows_entry_key" ON "interview_day_rows" ("day_id", "pipeline_entry_id");
-- One candidate per panel and slot.
CREATE UNIQUE INDEX "interview_day_rows_cell_key" ON "interview_day_rows" ("day_id", "panel_id", "slot_start") WHERE "panel_id" IS NOT NULL;
CREATE INDEX "interview_day_rows_day_idx" ON "interview_day_rows" ("organization_id", "day_id");

ALTER TABLE "interview_days" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "interview_days"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "interview_day_panels" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "interview_day_panels"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "interview_day_rows" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "interview_day_rows"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
