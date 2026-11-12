-- Projects P-2, line-by-line timesheet approvals (PRJ-02; founder answers 1406 to 1408, 1442; settles parked item 914).
-- With Projects on, each line of a submitted week is decided on its own by its approver (the project's manager; else
-- the person's manager; else HR): approved, reduced (to fewer minutes, with a reason) or rejected (with a reason the
-- person sees). The week is decided when every line is. A project may ask its client to approve its hours (off by
-- default) in the client portal, line by line. Columns only; forced RLS already covers both tables.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "timesheet_projects" ADD COLUMN "client_approves_hours" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "timesheet_lines"
  ADD COLUMN "status" VARCHAR(10),
  ADD COLUMN "approver_user_ids" UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN "approved_minutes" SMALLINT[],
  ADD COLUMN "reason" VARCHAR(300),
  ADD COLUMN "decided_by" UUID,
  ADD COLUMN "decided_at" TIMESTAMPTZ(3),
  ADD COLUMN "unallocated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "client_status" VARCHAR(10),
  ADD COLUMN "client_note" VARCHAR(500),
  ADD COLUMN "client_contact_id" UUID,
  ADD COLUMN "client_decided_at" TIMESTAMPTZ(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "timesheet_lines_status_check" CHECK ("status" IS NULL OR "status" IN ('pending', 'approved', 'reduced', 'rejected')),
  ADD CONSTRAINT "timesheet_lines_reason_check" CHECK ("status" NOT IN ('reduced', 'rejected') OR char_length(btrim(coalesce("reason", ''))) >= 3),
  ADD CONSTRAINT "timesheet_lines_client_status_check" CHECK ("client_status" IS NULL OR "client_status" IN ('waiting', 'approved', 'sent_back'));

CREATE INDEX "timesheet_lines_pending_idx" ON "timesheet_lines" ("organization_id", "status") WHERE "status" = 'pending';
CREATE INDEX "timesheet_lines_client_idx" ON "timesheet_lines" ("organization_id", "client_status") WHERE "client_status" IS NOT NULL;
