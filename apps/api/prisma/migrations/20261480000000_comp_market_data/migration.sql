-- PRF-10 comp market data (founder answer 12, 3 Nov 2026): HR uploads a salary survey as CSV, one row per grade (min,
-- median, max), with its source, currency and as-of date, per company and legal entity. Each upload is a new version;
-- nothing is edited or deleted. Pay data: read only inside a pay scope, like comp proposals. Schema only; no data moves.
CREATE TABLE "comp_market_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source" VARCHAR(200) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "as_of" DATE NOT NULL,
    "file_name" VARCHAR(200),
    "row_count" INTEGER NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comp_market_surveys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_market_surveys_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "comp_market_surveys_version_key" UNIQUE ("organization_id", "legal_entity_id", "version"),
    CONSTRAINT "comp_market_surveys_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "comp_market_surveys_rows_ck" CHECK ("row_count" > 0)
);

CREATE TABLE "comp_market_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "min_amount" DECIMAL(14,2) NOT NULL,
    "median_amount" DECIMAL(14,2) NOT NULL,
    "max_amount" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "comp_market_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comp_market_rates_grade_key" UNIQUE ("survey_id", "grade_id"),
    CONSTRAINT "comp_market_rates_survey_fkey" FOREIGN KEY ("organization_id", "survey_id") REFERENCES "comp_market_surveys"("organization_id", "id"),
    CONSTRAINT "comp_market_rates_order_ck" CHECK ("min_amount" > 0 AND "min_amount" <= "median_amount" AND "median_amount" <= "max_amount")
);
CREATE INDEX "comp_market_surveys_entity_idx" ON "comp_market_surveys" ("organization_id", "legal_entity_id", "version" DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comp_market_surveys', 'comp_market_rates']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
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
-- Versions are kept: a new upload adds a version; nothing is changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "comp_market_surveys", "comp_market_rates" FROM app_runtime;
