-- Assessments AS-1 (answers 2009, 2010): the question bank's review and versions, and translations.
-- Every new or changed question is reviewed by one other person before use; a collection can need a second approver
-- (company setting asmt.bank.second_approver_collections, none by default); AI drafts are reviewed like any other.
-- A big change (question text, options, answer key) makes a new version; old attempts keep theirs (an attempt's version
-- is the one approved before it started; item statistics count only answers to the current version). Translations are
-- per version and language, behind the language setting (asmt.languages, English only by default), each reviewed by a
-- person other than its writer. Only tables with forced RLS are touched: questions, and the two new tables.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "questions"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "image_alt" VARCHAR(500),
  ADD COLUMN "option_alts" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "last_approved_by" UUID,
  ADD COLUMN "last_approved_at" TIMESTAMPTZ(3);
ALTER TABLE "questions" ADD CONSTRAINT "questions_version_check" CHECK ("version" >= 1);

CREATE TABLE "question_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    -- The version this revision becomes when approved (a minor change keeps the number).
    "version" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "needs_second" BOOLEAN NOT NULL DEFAULT false,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "second_reviewer_id" UUID,
    "second_reviewed_at" TIMESTAMPTZ(3),
    "note" VARCHAR(1000),
    "field_comments" JSONB NOT NULL DEFAULT '{}',
    "duplicate_of" UUID,
    "duplicate_percent" SMALLINT,
    "duplicate_cleared_by" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "question_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "question_revisions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE,
    CONSTRAINT "question_revisions_duplicate_fkey" FOREIGN KEY ("duplicate_of") REFERENCES "questions"("id") ON DELETE SET NULL,
    CONSTRAINT "question_revisions_kind_check" CHECK ("kind" IN ('new', 'major', 'minor')),
    CONSTRAINT "question_revisions_state_check" CHECK ("state" IN ('draft', 'in_review', 'changes_requested', 'approved', 'withdrawn')),
    -- Four eyes, in the database too: nobody reviews their own question; the second approver is a third person.
    CONSTRAINT "question_revisions_reviewer_check" CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "author_id"),
    CONSTRAINT "question_revisions_second_check" CHECK ("second_reviewer_id" IS NULL OR ("second_reviewer_id" <> "author_id" AND "second_reviewer_id" <> "reviewer_id")),
    CONSTRAINT "question_revisions_approved_check" CHECK ("state" <> 'approved' OR ("reviewer_id" IS NOT NULL AND (NOT "needs_second" OR "second_reviewer_id" IS NOT NULL))),
    CONSTRAINT "question_revisions_duplicate_check" CHECK ("duplicate_percent" IS NULL OR ("duplicate_percent" BETWEEN 0 AND 100))
);
-- At most one open change per question.
CREATE UNIQUE INDEX "question_revisions_one_open" ON "question_revisions" ("question_id") WHERE "state" IN ('draft', 'in_review', 'changes_requested');
CREATE INDEX "question_revisions_queue_idx" ON "question_revisions" ("organization_id", "state", "submitted_at");
CREATE INDEX "question_revisions_question_idx" ON "question_revisions" ("question_id", "created_at");

CREATE TABLE "question_translations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "language" VARCHAR(5) NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "ai_assisted" BOOLEAN NOT NULL DEFAULT false,
    "author_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "question_translations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_translations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "question_translations_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE,
    CONSTRAINT "question_translations_language_check" CHECK ("language" IN ('hi', 'ta', 'te')),
    CONSTRAINT "question_translations_state_check" CHECK ("state" IN ('draft', 'in_review', 'changes_requested', 'approved')),
    CONSTRAINT "question_translations_reviewer_check" CHECK ("reviewer_id" IS NULL OR "reviewer_id" <> "author_id"),
    CONSTRAINT "question_translations_approved_check" CHECK ("state" <> 'approved' OR "reviewer_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "question_translations_one" ON "question_translations" ("question_id", "version", "language");
CREATE INDEX "question_translations_queue_idx" ON "question_translations" ("organization_id", "state");

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['question_revisions', 'question_translations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
  END LOOP;
END $$;
-- The review record is the history of a question: the app never deletes or empties it (the question's own deletion
-- cascades through the owner).
REVOKE DELETE, TRUNCATE ON TABLE "question_revisions", "question_translations" FROM app_runtime;
