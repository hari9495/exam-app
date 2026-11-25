-- Help and onboarding H-1 (answer 942): a help article names the pages it explains (route prefixes such as
-- /yx/time/leave); the Help drawer's "This page" tab lists the published ones for the page the person is on.
ALTER TABLE "sd_kb_articles" ADD COLUMN "pages" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "sd_kb_articles" ADD CONSTRAINT "sd_kb_articles_pages_check" CHECK (cardinality("pages") <= 20);
CREATE INDEX "sd_kb_articles_pages_idx" ON "sd_kb_articles" USING GIN ("pages");
