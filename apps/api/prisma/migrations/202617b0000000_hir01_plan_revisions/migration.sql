-- HIR-01 headcount plan board (9 Nov 2026). An approved plan can be revised: the revision (note and lines) waits on the
-- plan while it is drafted and approved through P03 'ats.headcount_plan'; requisitions keep drawing on the approved
-- lines until it is approved, then the lines are updated in place (line ids kept, so jobs stay linked) and the plan's
-- revision number goes up. Columns only; no data is written (RLS on headcount_plans is unchanged).
ALTER TABLE "headcount_plans"
  ADD COLUMN "revision_no" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "revision" JSONB,
  ADD COLUMN "revision_status" VARCHAR(12),
  ADD COLUMN "revision_wf_request_id" UUID;
