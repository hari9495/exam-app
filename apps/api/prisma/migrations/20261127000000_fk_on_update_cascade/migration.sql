-- ats_4 and ats_5 created these foreign keys inline with ON UPDATE NO ACTION; schema.prisma declares the relations
-- with Prisma's default ON UPDATE CASCADE. Bring the database in line with the schema (CI migration check: no drift).
ALTER TABLE "talent_pool_members" DROP CONSTRAINT "talent_pool_members_pool_id_fkey";
ALTER TABLE "talent_pool_members" ADD CONSTRAINT "talent_pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "talent_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard_items" DROP CONSTRAINT "scorecard_items_template_id_fkey";
ALTER TABLE "scorecard_items" ADD CONSTRAINT "scorecard_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "scorecard_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard_ratings" DROP CONSTRAINT "scorecard_ratings_scorecard_id_fkey";
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
