-- Helpdesk (founder answer 1647): where a raised ticket came from, when it came from the help articles: the article the
-- person was reading, or the search they made. The knowledge base's content gaps list the articles that led to tickets.
ALTER TABLE "sd_tickets" ADD COLUMN "origin_article_id" UUID;
ALTER TABLE "sd_tickets" ADD COLUMN "origin_query" VARCHAR(200);
CREATE INDEX "sd_tickets_origin_article_idx" ON "sd_tickets"("organization_id", "origin_article_id") WHERE "origin_article_id" IS NOT NULL;
