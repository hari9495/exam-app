-- CMP-05 "No deductees this month" (founder answer 2, 2 Nov 2026): a month paid before the entity started on YukthiX
-- that genuinely had no salary TDS is recorded as such (who, when, why), so the quarter's return counts it complete with
-- zero rows. Undone (never deleted) until the return covering it is filed; one active record per entity and month.

CREATE TABLE "tds_nil_months" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undone_by" UUID,
    "undone_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tds_nil_months_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tds_nil_months_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tds_nil_months_first_day_check" CHECK (EXTRACT(DAY FROM "month") = 1),
    CONSTRAINT "tds_nil_months_undone_check" CHECK (("undone_at" IS NULL) = ("undone_by" IS NULL))
);
CREATE UNIQUE INDEX "tds_nil_months_one_active" ON "tds_nil_months" ("organization_id", "legal_entity_id", "month") WHERE "undone_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "tds_nil_months" FROM app_runtime;

-- Once undone a record never changes again.
CREATE FUNCTION tds_nil_months_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."undone_at" IS NOT NULL THEN RAISE EXCEPTION 'YX_NIL_MONTH_UNDONE'; END IF;
  IF NEW."reason" <> OLD."reason" OR NEW."month" <> OLD."month" OR NEW."legal_entity_id" <> OLD."legal_entity_id" OR NEW."recorded_by" <> OLD."recorded_by" THEN
    RAISE EXCEPTION 'YX_NIL_MONTH_FIXED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tds_nil_months_guard BEFORE UPDATE ON "tds_nil_months" FOR EACH ROW EXECUTE FUNCTION tds_nil_months_guard();

ALTER TABLE "tds_nil_months" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tds_nil_months"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "tds_nil_months" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "tds_nil_months" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
