-- Recruitment batch AT5 (M10-BUILD-DESIGN §8, §9): the pipeline board, structured scorecards with a pass bar (D7: an
-- interviewer sees the other panellists' scorecards only after submitting their own), delayed rejection messages
-- with undo, and a test sent automatically when an application enters a stage.

-- ------------------------------------------------------------------------------------------------ pipeline
ALTER TABLE "pipeline_entries" ADD COLUMN "stage_entered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Backfills run as system work: these tables have forced RLS, so without it an UPDATE silently touches no rows.
SELECT set_config('app.is_super_admin', 'on', true);
UPDATE "pipeline_entries" SET "stage_entered_at" = "updated_at";
-- Fix forward: the AT1 department link and the AT3 job slug / published date / show-salary backfills ran without
-- this and changed no rows on databases that already had jobs. Same rules, only where still empty.
UPDATE "jobs" j SET "department_id" = d."id"
FROM "departments" d
WHERE d."organization_id" = j."organization_id" AND j."department_id" IS NULL AND j."department" IS NOT NULL
  AND lower(btrim(d."name")) = lower(btrim(j."department")) AND d."archived_at" IS NULL
  AND (SELECT count(*) FROM "departments" d2 WHERE d2."organization_id" = j."organization_id" AND d2."archived_at" IS NULL AND lower(btrim(d2."name")) = lower(btrim(j."department"))) = 1;
UPDATE "jobs" SET "slug" = left(trim(both '-' from regexp_replace(lower(coalesce("title", 'job') || coalesce(' ' || "location", '')), '[^a-z0-9]+', '-', 'g')), 100) || '-' || left(replace("id"::text, '-', ''), 6) WHERE "slug" IS NULL;
UPDATE "jobs" SET "slug" = 'job-' || left(replace("id"::text, '-', ''), 8) WHERE "slug" ~ '^-' OR "slug" = '';
UPDATE "jobs" SET "published_at" = "created_at" WHERE "list_on_careers" AND "published_at" IS NULL;
-- Fix forward: the AT1 standard pipeline made stages with no status, so nothing could sit on them. One status each,
-- named like its stage; an application that never got a status goes to the pipeline's first active status.
INSERT INTO "pipeline_statuses" ("id", "organization_id", "stage_id", "name", "position")
SELECT gen_random_uuid(), st."organization_id", st."id", st."name", 0 FROM "pipeline_stages" st
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_statuses" ps WHERE ps."stage_id" = st."id");
UPDATE "pipeline_entries" pe SET "status_id" = (
  SELECT ps."id" FROM "jobs" j JOIN "pipeline_stages" st ON st."pipeline_id" = j."pipeline_id" AND st."category" = 'active'
  JOIN "pipeline_statuses" ps ON ps."stage_id" = st."id" WHERE j."id" = pe."job_id" ORDER BY st."position", ps."position" LIMIT 1)
WHERE pe."status_id" IS NULL;
SELECT set_config('app.is_super_admin', '', true);

-- A linked test can be sent automatically when an application enters a stage (§9).
ALTER TABLE "job_exams" ADD COLUMN "send_on_stage_id" UUID REFERENCES "pipeline_stages"("id") ON DELETE SET NULL;

-- A rejection message waits (default 24 h) so a mistaken rejection can be undone before the candidate hears.
CREATE TABLE "pending_rejections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL REFERENCES "pipeline_entries"("id") ON DELETE CASCADE,
    "previous_status_id" UUID,
    "template_id" UUID,
    "subject" VARCHAR(300),
    "body" TEXT,
    "send_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),
    "undone_at" TIMESTAMPTZ(3),
    CONSTRAINT "pending_rejections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pending_rejections_open_key" ON "pending_rejections" ("entry_id") WHERE "sent_at" IS NULL AND "undone_at" IS NULL;
CREATE INDEX "pending_rejections_due_idx" ON "pending_rejections" ("send_at") WHERE "sent_at" IS NULL AND "undone_at" IS NULL;

-- ------------------------------------------------------------------------------------------------ scorecards (YX-ATS-51)
CREATE TABLE "scorecard_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "scale_max" INTEGER NOT NULL DEFAULT 4,
    "pass_bar" DECIMAL(4,2) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    CONSTRAINT "scorecard_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scorecard_templates_scale_check" CHECK ("scale_max" BETWEEN 3 AND 10),
    CONSTRAINT "scorecard_templates_bar_check" CHECK ("pass_bar" >= 1 AND "pass_bar" <= "scale_max")
);
CREATE UNIQUE INDEX "scorecard_templates_org_name_key" ON "scorecard_templates" ("organization_id", lower("name")) WHERE "archived_at" IS NULL;

CREATE TABLE "scorecard_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL REFERENCES "scorecard_templates"("id") ON DELETE CASCADE,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "guidance" VARCHAR(1000),
    "weight" INTEGER NOT NULL DEFAULT 1,
    "competency_id" UUID,
    CONSTRAINT "scorecard_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scorecard_items_weight_check" CHECK ("weight" BETWEEN 1 AND 10)
);
CREATE INDEX "scorecard_items_template_idx" ON "scorecard_items" ("template_id", "position");

ALTER TABLE "jobs" ADD COLUMN "scorecard_template_id" UUID REFERENCES "scorecard_templates"("id") ON DELETE SET NULL;
ALTER TABLE "interviews" ADD COLUMN "scorecard_template_id" UUID REFERENCES "scorecard_templates"("id") ON DELETE SET NULL;
ALTER TABLE "interview_panelists" ADD COLUMN "reminded_24h_at" TIMESTAMPTZ(3), ADD COLUMN "reminded_48h_at" TIMESTAMPTZ(3);

-- One scorecard per panellist per interview. A submitted scorecard is final.
CREATE TABLE "scorecards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL REFERENCES "interviews"("id") ON DELETE CASCADE,
    "panelist_user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL REFERENCES "scorecard_templates"("id"),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "recommendation" VARCHAR(12),
    "summary" TEXT,
    "weighted_score" DECIMAL(5,2),
    "passes" BOOLEAN,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scorecards_status_check" CHECK ("status" IN ('draft', 'submitted')),
    CONSTRAINT "scorecards_recommendation_check" CHECK ("recommendation" IS NULL OR "recommendation" IN ('strong_no', 'no', 'yes', 'strong_yes')),
    CONSTRAINT "scorecards_submitted_complete" CHECK ("status" = 'draft' OR ("submitted_at" IS NOT NULL AND "recommendation" IS NOT NULL AND "weighted_score" IS NOT NULL))
);
CREATE UNIQUE INDEX "scorecards_interview_panelist_key" ON "scorecards" ("interview_id", "panelist_user_id");

CREATE TABLE "scorecard_ratings" (
    "organization_id" UUID NOT NULL,
    "scorecard_id" UUID NOT NULL REFERENCES "scorecards"("id") ON DELETE CASCADE,
    "item_id" UUID NOT NULL REFERENCES "scorecard_items"("id"),
    "rating" INTEGER,
    "notes" TEXT,
    CONSTRAINT "scorecard_ratings_pkey" PRIMARY KEY ("scorecard_id", "item_id"),
    CONSTRAINT "scorecard_ratings_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 10)
);

-- A submitted scorecard can never be edited, by any code path.
CREATE FUNCTION scorecards_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'A submitted scorecard cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scorecards_freeze BEFORE UPDATE ON "scorecards" FOR EACH ROW EXECUTE FUNCTION scorecards_freeze();
CREATE FUNCTION scorecard_ratings_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM scorecards s WHERE s.id = COALESCE(OLD.scorecard_id, NEW.scorecard_id) AND s.status = 'submitted') THEN
    RAISE EXCEPTION 'A submitted scorecard cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER scorecard_ratings_freeze BEFORE INSERT OR UPDATE OR DELETE ON "scorecard_ratings" FOR EACH ROW EXECUTE FUNCTION scorecard_ratings_freeze();

-- ------------------------------------------------------------------------------------------------ RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pending_rejections', 'scorecard_templates', 'scorecard_items', 'scorecards', 'scorecard_ratings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  -- Hiring decisions are never read by YukthiX support (D14), like interview feedback.
  FOREACH t IN ARRAY ARRAY['scorecards', 'scorecard_ratings']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
REVOKE DELETE, TRUNCATE ON TABLE "scorecards" FROM app_runtime;
