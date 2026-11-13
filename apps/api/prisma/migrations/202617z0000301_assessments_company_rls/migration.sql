-- Assessments AS-0 (founder answer 2005): candidate answers, evidence, face data, results and the test structure get
-- the company column and the same forced row-level security as every other area. Until now these fourteen tables had
-- no organization_id, so isolation rested on each query joining up to the exam's company.
--
-- For each table: add organization_id, fill it from the parent (question, exam, section or attempt), make it required,
-- index it, keep it filled on every new row by a BEFORE INSERT trigger (the app never has to send it; a parent of
-- another company is invisible under RLS, so the column stays empty and the insert fails), then ENABLE + FORCE RLS
-- with the tenant_isolation policy of 20261005000001_tenant_rls.
--
-- The backfill reads exams, questions and the parents above through forced RLS, so it runs as system work: the
-- super-admin context is set first, before any data is written, and cleared at the end.
SELECT set_config('app.is_super_admin', 'on', false);

-- 1. Columns.
ALTER TABLE "question_options"        ADD COLUMN "organization_id" UUID;
ALTER TABLE "exam_sections"           ADD COLUMN "organization_id" UUID;
ALTER TABLE "exam_section_questions"  ADD COLUMN "organization_id" UUID;
ALTER TABLE "exam_section_pool_tags"  ADD COLUMN "organization_id" UUID;
ALTER TABLE "invitations"             ADD COLUMN "organization_id" UUID;
ALTER TABLE "attempts"                ADD COLUMN "organization_id" UUID;
ALTER TABLE "answers"                 ADD COLUMN "organization_id" UUID;
ALTER TABLE "results"                 ADD COLUMN "organization_id" UUID;
ALTER TABLE "proctoring_events"       ADD COLUMN "organization_id" UUID;
ALTER TABLE "face_enrolments"         ADD COLUMN "organization_id" UUID;
ALTER TABLE "proctoring_analyses"     ADD COLUMN "organization_id" UUID;
ALTER TABLE "integrity_analyses"      ADD COLUMN "organization_id" UUID;
ALTER TABLE "attempt_insights"        ADD COLUMN "organization_id" UUID;
ALTER TABLE "candidate_messages"      ADD COLUMN "organization_id" UUID;

-- 2. Fill from the parent (parents first: sections before their links, attempts before their children).
UPDATE "question_options" x SET "organization_id" = p."organization_id" FROM "questions" p WHERE p."id" = x."question_id";
UPDATE "exam_sections" x SET "organization_id" = p."organization_id" FROM "exams" p WHERE p."id" = x."exam_id";
UPDATE "exam_section_questions" x SET "organization_id" = p."organization_id" FROM "exam_sections" p WHERE p."id" = x."section_id";
UPDATE "exam_section_pool_tags" x SET "organization_id" = p."organization_id" FROM "exam_sections" p WHERE p."id" = x."section_id";
UPDATE "invitations" x SET "organization_id" = p."organization_id" FROM "exams" p WHERE p."id" = x."exam_id";
UPDATE "attempts" x SET "organization_id" = p."organization_id" FROM "exams" p WHERE p."id" = x."exam_id";
UPDATE "answers" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "results" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "proctoring_events" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "face_enrolments" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "proctoring_analyses" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "integrity_analyses" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "attempt_insights" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";
UPDATE "candidate_messages" x SET "organization_id" = p."organization_id" FROM "attempts" p WHERE p."id" = x."attempt_id";

-- 3. Keep it filled: one trigger function per parent column. Plain (SECURITY INVOKER): the parent is read under the
--    inserting session's own context, so a parent of another company is never found.
CREATE FUNCTION asmt_org_from_question() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" IS NULL THEN
    SELECT q."organization_id" INTO NEW."organization_id" FROM "questions" q WHERE q."id" = NEW."question_id";
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION asmt_org_from_exam() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" IS NULL THEN
    SELECT e."organization_id" INTO NEW."organization_id" FROM "exams" e WHERE e."id" = NEW."exam_id";
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION asmt_org_from_section() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" IS NULL THEN
    SELECT s."organization_id" INTO NEW."organization_id" FROM "exam_sections" s WHERE s."id" = NEW."section_id";
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION asmt_org_from_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" IS NULL THEN
    SELECT a."organization_id" INTO NEW."organization_id" FROM "attempts" a WHERE a."id" = NEW."attempt_id";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER asmt_org BEFORE INSERT ON "question_options"       FOR EACH ROW EXECUTE FUNCTION asmt_org_from_question();
CREATE TRIGGER asmt_org BEFORE INSERT ON "exam_sections"          FOR EACH ROW EXECUTE FUNCTION asmt_org_from_exam();
CREATE TRIGGER asmt_org BEFORE INSERT ON "exam_section_questions" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_section();
CREATE TRIGGER asmt_org BEFORE INSERT ON "exam_section_pool_tags" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_section();
CREATE TRIGGER asmt_org BEFORE INSERT ON "invitations"            FOR EACH ROW EXECUTE FUNCTION asmt_org_from_exam();
CREATE TRIGGER asmt_org BEFORE INSERT ON "attempts"               FOR EACH ROW EXECUTE FUNCTION asmt_org_from_exam();
CREATE TRIGGER asmt_org BEFORE INSERT ON "answers"                FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "results"                FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "proctoring_events"      FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "face_enrolments"        FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "proctoring_analyses"    FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "integrity_analyses"     FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "attempt_insights"       FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();
CREATE TRIGGER asmt_org BEFORE INSERT ON "candidate_messages"     FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();

-- 4. Required, indexed, and isolated like every other company table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['question_options', 'exam_sections', 'exam_section_questions', 'exam_section_pool_tags', 'invitations',
    'attempts', 'answers', 'results', 'proctoring_events', 'face_enrolments', 'proctoring_analyses', 'integrity_analyses',
    'attempt_insights', 'candidate_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "organization_id" SET NOT NULL', t);
    EXECUTE format('CREATE INDEX %I ON %I ("organization_id")', t || '_organization_id_idx', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

SELECT set_config('app.is_super_admin', '', false);
