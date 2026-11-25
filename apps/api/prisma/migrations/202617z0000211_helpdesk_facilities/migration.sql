-- Helpdesk plan item 4: the company's buildings (its existing locations), their floors or areas, and equipment with an
-- owner team (a team of a facilities desk). A facilities ticket or work order may name the building, area or equipment;
-- a recurring record may make its tickets for one piece of equipment. Retired areas and equipment can't be picked.
CREATE TABLE "sd_facility_areas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_facility_areas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_facility_areas_status_check" CHECK ("status" IN ('active', 'retired'))
);
CREATE UNIQUE INDEX "sd_facility_areas_name_key" ON "sd_facility_areas"("organization_id", "location_id", lower("name"));

CREATE TABLE "sd_equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "desk_id" UUID NOT NULL,
  "owner_group_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "area_id" UUID,
  "name" VARCHAR(100) NOT NULL,
  "tag" VARCHAR(40) NOT NULL,
  "category" VARCHAR(60),
  "status" VARCHAR(10) NOT NULL DEFAULT 'active',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_equipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_equipment_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "sd_equipment_status_check" CHECK ("status" IN ('active', 'retired'))
);
CREATE UNIQUE INDEX "sd_equipment_tag_key" ON "sd_equipment"("organization_id", lower("tag"));
CREATE INDEX "sd_equipment_place_idx" ON "sd_equipment"("organization_id", "location_id", "area_id");

ALTER TABLE "sd_tickets" ADD COLUMN "location_id" UUID, ADD COLUMN "area_id" UUID, ADD COLUMN "equipment_id" UUID;
CREATE INDEX "sd_tickets_equipment_idx" ON "sd_tickets"("organization_id", "equipment_id") WHERE "equipment_id" IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_facility_areas', 'sd_equipment']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
