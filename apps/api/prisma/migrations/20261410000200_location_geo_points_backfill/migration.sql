-- TIM-31 Multi follow-up: 20261410000000 copied each single point into geo_points, but "locations" is under FORCE row
-- level security and that migration set no context, so the copy touched no rows. Same copy, with the super-admin flag
-- (as other data migrations do). Reads fall back to geo_lat / geo_lng / geo_radius_m, so nothing was refused meanwhile.
SELECT set_config('app.is_super_admin', 'on', true);

UPDATE "locations"
SET "geo_points" = jsonb_build_array(jsonb_build_object('name', "name"::text, 'lat', "geo_lat"::float8, 'lng', "geo_lng"::float8, 'radiusM', "geo_radius_m"))
WHERE "geo_lat" IS NOT NULL AND "geo_lng" IS NOT NULL AND "geo_radius_m" IS NOT NULL AND jsonb_array_length("geo_points") = 0;
