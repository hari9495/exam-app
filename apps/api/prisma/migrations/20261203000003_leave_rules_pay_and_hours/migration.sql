-- Founder decisions of 20 Oct 2026.
-- 1. Pay is dated like the rules (TIM-27): whether a leave type is paid moves into its versions, so leave and payslips
--    of a day keep the pay in force that day. Run as the platform (forced RLS would otherwise see no rows), with the
--    in-force guard off for this one copy, and nothing is dropped unless every version got its pay.
SELECT set_config('app.is_super_admin', 'on', true);
ALTER TABLE "leave_type_versions" ADD COLUMN "paid" BOOLEAN;
ALTER TABLE "leave_type_versions" DISABLE TRIGGER "leave_type_versions_guard";
UPDATE "leave_type_versions" v SET "paid" = t."paid" FROM "leave_types" t WHERE t."organization_id" = v."organization_id" AND t."id" = v."leave_type_id";
ALTER TABLE "leave_type_versions" ENABLE TRIGGER "leave_type_versions_guard";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "leave_type_versions" WHERE "paid" IS NULL) THEN
    RAISE EXCEPTION 'leave type pay was not copied to every version';
  END IF;
END $$;
SELECT set_config('app.is_super_admin', 'off', true);
ALTER TABLE "leave_type_versions" ALTER COLUMN "paid" SET NOT NULL, ALTER COLUMN "paid" SET DEFAULT true;
ALTER TABLE "leave_types" DROP CONSTRAINT "leave_types_lop_check";
ALTER TABLE "leave_types" DROP COLUMN "paid";

-- Whether a leave type is paid on a day: the version in force then (the first one before it starts).
CREATE FUNCTION leave_type_paid_on(p_org UUID, p_type UUID, p_on DATE) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT v."paid" FROM "leave_type_versions" v WHERE v."organization_id" = p_org AND v."leave_type_id" = p_type AND v."valid_from" <= p_on ORDER BY v."valid_from" DESC LIMIT 1),
    (SELECT v."paid" FROM "leave_type_versions" v WHERE v."organization_id" = p_org AND v."leave_type_id" = p_type ORDER BY v."valid_from" LIMIT 1),
    true)
$$;

-- 2. Leave by the hour on a single day (a rule of the type): the hours asked, and the day's share of a full day.
ALTER TABLE "leave_requests" ADD COLUMN "hours" NUMERIC(4, 2);
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_hours_check" CHECK ("hours" IS NULL OR ("hours" > 0 AND "hours" <= 24 AND "from_on" = "to_on" AND "from_half" = 'full' AND "to_half" = 'full'));
ALTER TABLE "leave_request_days" DROP CONSTRAINT "leave_request_days_part_check";
ALTER TABLE "leave_request_days" ADD CONSTRAINT "leave_request_days_part_check" CHECK ("part" IN ('full', 'first', 'second', 'hours'));
ALTER TABLE "leave_request_days" DROP CONSTRAINT "leave_request_days_portion_check";
ALTER TABLE "leave_request_days" ADD CONSTRAINT "leave_request_days_portion_check" CHECK (("part" = 'hours' AND "portion" > 0 AND "portion" <= 1) OR ("part" <> 'hours' AND "portion" IN (0, 0.5, 1)));

-- 3. Binding check-in to one phone stays off until HR turns it on for a site (founder decision 20 Oct 2026).
ALTER TABLE "locations" ALTER COLUMN "bind_device" SET DEFAULT false;
