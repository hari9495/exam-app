-- Founder answer 367: the candidate erase also redacts a scorecard's own summary and its rating notes (comments were
-- already redacted). A submitted scorecard stays frozen for everything else: the only change allowed is the redaction,
-- marked by redacted_at, with the text set to 'Redacted' (or kept empty). Schema only, no data write.
ALTER TABLE "scorecards" ADD COLUMN "redacted_at" TIMESTAMPTZ(3);

CREATE OR REPLACE FUNCTION scorecards_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    -- The erase: once, only summary (to 'Redacted' or empty) and redacted_at (and the updated_at Prisma keeps).
    IF OLD.redacted_at IS NULL AND NEW.redacted_at IS NOT NULL
       AND (NEW.summary IS NULL OR NEW.summary = 'Redacted')
       AND ROW(NEW.id, NEW.organization_id, NEW.interview_id, NEW.panelist_user_id, NEW.template_id, NEW.status, NEW.recommendation, NEW.weighted_score, NEW.passes, NEW.submitted_at, NEW.created_at)
           IS NOT DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.interview_id, OLD.panelist_user_id, OLD.template_id, OLD.status, OLD.recommendation, OLD.weighted_score, OLD.passes, OLD.submitted_at, OLD.created_at) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A submitted scorecard cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION scorecard_ratings_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM scorecards s WHERE s.id = COALESCE(OLD.scorecard_id, NEW.scorecard_id) AND s.status = 'submitted') THEN
    -- The erase: a redacted scorecard's rating notes may become 'Redacted' (or empty); nothing else, never a delete.
    IF TG_OP = 'UPDATE'
       AND EXISTS (SELECT 1 FROM scorecards s WHERE s.id = OLD.scorecard_id AND s.redacted_at IS NOT NULL)
       AND (NEW.notes IS NULL OR NEW.notes = 'Redacted')
       AND ROW(NEW.organization_id, NEW.scorecard_id, NEW.item_id, NEW.rating) IS NOT DISTINCT FROM ROW(OLD.organization_id, OLD.scorecard_id, OLD.item_id, OLD.rating) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A submitted scorecard cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
