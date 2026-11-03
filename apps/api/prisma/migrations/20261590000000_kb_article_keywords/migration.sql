-- HLP-04 Knowledge base editor (Helpdesk design wiring, round 4): two article settings the approved design shows.
--   keywords: "Also suggest for these words" (comma-separated, up to 300 letters). Search finds the article by them,
--             weighted like the title.
--   assistant_use: "Use in assistant answers" (default on). The help assistant is not built yet; when it is, it reads
--             only articles with this on.
-- Both are columns of the existing tenant table sd_kb_articles (RLS already on). No rows are changed by hand.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "sd_kb_articles"
    ADD COLUMN "keywords" VARCHAR(300),
    ADD COLUMN "assistant_use" BOOLEAN NOT NULL DEFAULT true;

-- The search vector now takes the keywords too (a generated column cannot be changed in place).
DROP INDEX IF EXISTS "sd_kb_articles_search_idx";
ALTER TABLE "sd_kb_articles" DROP COLUMN "search";
ALTER TABLE "sd_kb_articles" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("keywords", '')), 'A')
    || setweight(to_tsvector('simple', coalesce("summary", '') || ' ' || coalesce("body_text", '')), 'B')) STORED;
CREATE INDEX "sd_kb_articles_search_idx" ON "sd_kb_articles" USING gin ("search");

SELECT set_config('app.is_super_admin', 'off', true);
