-- HIR-10 BGV tracker (manual checks, founder decision 3) and HIR-07 scorecard comments (founder answer 322), 12 Nov 2026.
-- BGV: a check records who checked it and on which day, and which version of the person's BGV report document is its
-- evidence (one report document per person keeps every upload as a version). A discrepancy goes to a person, who
-- records the decision (proceed / do not proceed) with a reason; nothing is ever withdrawn automatically.
-- Scorecard comments: append-only notes under a submitted scorecard. Rows are never edited: the only change allowed is
-- the candidate erase redacting the text. Columns and a new table only; no data is written.
ALTER TABLE "bgv_checks"
  ADD COLUMN "checked_by" UUID,
  ADD COLUMN "checked_on" DATE,
  ADD COLUMN "result_version" INTEGER,
  ADD COLUMN "decision" VARCHAR(12),
  ADD COLUMN "decision_note" VARCHAR(1000),
  ADD COLUMN "decided_by" UUID,
  ADD COLUMN "decided_at" TIMESTAMPTZ(3);
ALTER TABLE "bgv_checks" ADD CONSTRAINT "bgv_checks_decision_check" CHECK ("decision" IS NULL OR "decision" IN ('proceed', 'stop'));

CREATE TABLE "scorecard_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "scorecard_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    -- The client's key for one Post press: a retry or double click returns the same comment.
    "request_id" UUID,
    "redacted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scorecard_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scorecard_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scorecard_comments_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "scorecard_comments_scorecard_idx" ON "scorecard_comments" ("organization_id", "scorecard_id", "created_at");
CREATE INDEX "scorecard_comments_interview_idx" ON "scorecard_comments" ("organization_id", "interview_id");
CREATE UNIQUE INDEX "scorecard_comments_request_key" ON "scorecard_comments" ("organization_id", "author_user_id", "request_id") WHERE "request_id" IS NOT NULL;
ALTER TABLE "scorecard_comments" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "scorecard_comments"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Append-only: an update may only redact the text (candidate erase); everything else stays as written.
CREATE FUNCTION scorecard_comments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.organization_id, NEW.scorecard_id, NEW.interview_id, NEW.author_user_id, NEW.request_id, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.scorecard_id, OLD.interview_id, OLD.author_user_id, OLD.request_id, OLD.created_at)
     OR (NEW.body IS DISTINCT FROM OLD.body AND (NEW.body <> 'Redacted' OR NEW.redacted_at IS NULL)) THEN
    RAISE EXCEPTION 'scorecard comments are append-only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scorecard_comments_guard BEFORE UPDATE ON "scorecard_comments" FOR EACH ROW EXECUTE FUNCTION scorecard_comments_guard();
