-- TIM-31 Multi: a location can have several check-in points, each with its own radius. A punch is inside if it is
-- inside any of them. geo_lat / geo_lng / geo_radius_m stay as the first point (Settings › Locations, history, seeds).
ALTER TABLE "locations" ADD COLUMN "geo_points" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "locations" ADD CONSTRAINT "locations_geo_points_array" CHECK (jsonb_typeof("geo_points") = 'array' AND jsonb_array_length("geo_points") <= 20);

-- Every existing single-point location becomes one point, named after the location.
UPDATE "locations"
SET "geo_points" = jsonb_build_array(jsonb_build_object('name', "name"::text, 'lat', "geo_lat"::float8, 'lng', "geo_lng"::float8, 'radiusM', "geo_radius_m"))
WHERE "geo_lat" IS NOT NULL AND "geo_lng" IS NOT NULL AND "geo_radius_m" IS NOT NULL;
