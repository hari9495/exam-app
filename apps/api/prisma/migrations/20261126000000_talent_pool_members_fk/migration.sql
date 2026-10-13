-- ats_4 created this foreign key inline with ON UPDATE NO ACTION; schema.prisma declares the relation with Prisma's
-- default ON UPDATE CASCADE. Bring the database in line with the schema (CI migration check: no drift).
ALTER TABLE "talent_pool_members" DROP CONSTRAINT "talent_pool_members_pool_id_fkey";
ALTER TABLE "talent_pool_members" ADD CONSTRAINT "talent_pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "talent_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
