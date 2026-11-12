-- Console tidy, second part (founder answer 1263): the person who asked may withdraw a retire request while it waits.
SELECT set_config('app.is_super_admin', 'on', true);
ALTER TABLE "help_article_retirements" DROP CONSTRAINT "help_article_retirements_status_check";
ALTER TABLE "help_article_retirements" ADD CONSTRAINT "help_article_retirements_status_check" CHECK ("status" IN ('pending', 'approved', 'withdrawn'));
