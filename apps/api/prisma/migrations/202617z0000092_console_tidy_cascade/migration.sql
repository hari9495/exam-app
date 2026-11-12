-- Console tidy (answer 1203): a retire request goes with its article (removing an article is a database-owner or
-- test clean-up action; the app never deletes either).
ALTER TABLE "help_article_retirements" DROP CONSTRAINT "help_article_retirements_article_fkey";
ALTER TABLE "help_article_retirements" ADD CONSTRAINT "help_article_retirements_article_fkey" FOREIGN KEY ("article_id") REFERENCES "sd_kb_articles"("id") ON DELETE CASCADE;
