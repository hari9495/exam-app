-- Payroll batch 5i, PAY-9.03 (M03 YX-PAY-57, J24): the actuarial census per legal entity as at a valuation date (a
-- standard layout the actuary reads; kept encrypted with its hash) and the actuary's figures booked back as the gratuity
-- or leave provision: the journal is the closing obligation less the last booked one, posted by someone other than the
-- person who recorded the figures.
--   RLS as the rest of payroll; payroll staff of the entity only.

CREATE TABLE "actuarial_census_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "standard" VARCHAR(10) NOT NULL,
    "file_ref" VARCHAR(500) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "row_count" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actuarial_census_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "actuarial_census_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "actuarial_census_exports_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "actuarial_census_exports_check" CHECK ("standard" IN ('IND_AS_19', 'AS_15') AND "row_count" >= 0)
);

CREATE TABLE "actuarial_valuations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "valued_on" DATE NOT NULL,
    "standard" VARCHAR(10) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "census_id" UUID,
    "opening" DECIMAL(16,2) NOT NULL,
    "closing" DECIMAL(16,2) NOT NULL,
    "provision_delta" DECIMAL(16,2) NOT NULL,
    "report_ref" VARCHAR(500),
    "report_sha256" CHAR(64),
    "journal" JSONB NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'recorded',
    "created_by" UUID NOT NULL,
    "posted_by" UUID,
    "posted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actuarial_valuations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "actuarial_valuations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "actuarial_valuations_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "actuarial_valuations_census_fkey" FOREIGN KEY ("census_id") REFERENCES "actuarial_census_exports"("id"),
    CONSTRAINT "actuarial_valuations_check" CHECK ("standard" IN ('IND_AS_19', 'AS_15') AND "kind" IN ('gratuity', 'leave') AND "closing" >= 0 AND "status" IN ('recorded', 'posted') AND ("posted_by" IS NULL OR "posted_by" <> "created_by"))
);
CREATE UNIQUE INDEX "actuarial_valuations_key" ON "actuarial_valuations" ("organization_id", "legal_entity_id", "kind", "valued_on");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['actuarial_census_exports', 'actuarial_valuations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
END $$;
