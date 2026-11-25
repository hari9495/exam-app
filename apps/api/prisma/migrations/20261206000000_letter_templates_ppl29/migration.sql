-- PPL-29 letter templates (founder 25 Oct 2026): several templates per letter type, each its own name with versions;
-- one active version per template (not per type). Starter rows remember the YukthiX revision they were made from;
-- the ones made before revisions existed are revision 1, so they are offered the improved starters as new drafts.
DROP INDEX "letter_templates_active_key";
CREATE UNIQUE INDEX "letter_templates_active_key" ON "letter_templates" ("organization_id", "letter_type", "name", COALESCE("legal_entity_id", '00000000-0000-0000-0000-000000000000'::uuid), "language") WHERE "status" = 'active';

ALTER TABLE "letter_templates" ADD COLUMN "starter_revision" SMALLINT;
ALTER TABLE "letter_templates" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "letter_templates" DISABLE ROW LEVEL SECURITY;
UPDATE "letter_templates" SET "starter_revision" = 1 WHERE "source" = 'starter';
ALTER TABLE "letter_templates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_starter_revision_check" CHECK (("source" = 'starter') = ("starter_revision" IS NOT NULL));
