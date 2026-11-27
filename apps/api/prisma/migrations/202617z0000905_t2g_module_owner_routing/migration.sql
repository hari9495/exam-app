-- T2-G 44 (answer 2745): a named owner per module (company settings org.module_owner.<module>, Settings › Modules). A
-- helpdesk category may name its module and be "answered by the module's owner": a new ticket in it goes to that person
-- (as "answered by the manager" does, item 33); with no owner named the desk answers. Never for a sensitive or private
-- category (the existing confidential check covers 'owner' too).
ALTER TABLE "sd_categories" ADD COLUMN "module" VARCHAR(20);
ALTER TABLE "sd_categories" DROP CONSTRAINT "sd_categories_answered_by_check";
ALTER TABLE "sd_categories" ADD CONSTRAINT "sd_categories_answered_by_check" CHECK ("answered_by" IN ('desk', 'manager', 'owner')),
  ADD CONSTRAINT "sd_categories_owner_module_check" CHECK ("answered_by" <> 'owner' OR "module" IS NOT NULL);
