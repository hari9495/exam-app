-- Expenses batch E1 (M05-BUILD-DESIGN §5.2, §6, §7): categories, city tiers, dated policies with P19 "applies to"
-- conditions and their limit rows, mileage and per-diem rates, and GST registrations per entity and state. Company
-- configuration, so forced RLS + tenant_isolation only (no support exclusion, §5.8). fx_rates comes with E5, where it
-- is first used.

-- ---------------------------------------------------------------------------------------------- categories
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(18) NOT NULL,
    "receipt_above" DECIMAL(14,2),
    "gst_eligible" BOOLEAN NOT NULL DEFAULT false,
    "itc_blocked_reason" VARCHAR(40),
    "taxable" VARCHAR(12) NOT NULL DEFAULT 'never',
    "ledger_code" VARCHAR(40),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starter_key" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_categories_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "expense_categories_code_key" UNIQUE ("organization_id", "code"),
    CONSTRAINT "expense_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_categories_code_check" CHECK ("code" ~ '^[a-z][a-z0-9_]{1,29}$'),
    CONSTRAINT "expense_categories_kind_check" CHECK ("kind" IN ('spend', 'mileage', 'per_diem', 'company_paid_only')),
    CONSTRAINT "expense_categories_taxable_check" CHECK ("taxable" IN ('never', 'always', 'above_limit')),
    CONSTRAINT "expense_categories_receipt_check" CHECK ("receipt_above" IS NULL OR "receipt_above" >= 0),
    CONSTRAINT "expense_categories_itc_check" CHECK ("itc_blocked_reason" IS NULL OR "gst_eligible")
);

-- ---------------------------------------------------------------------------------------------- city tiers
CREATE TABLE "city_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "rank" INTEGER NOT NULL,
    "country" CHAR(2),
    "cities" TEXT[] NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starter_key" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "city_tiers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "city_tiers_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "city_tiers_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "city_tiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "city_tiers_rank_check" CHECK ("rank" BETWEEN 1 AND 99),
    CONSTRAINT "city_tiers_cities_check" CHECK (cardinality("cities") <= 500)
);

-- ---------------------------------------------------------------------------------------------- policies (dated)
CREATE TABLE "expense_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "applies_if" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "starter_key" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_policies_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "expense_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "expense_policies_status_check" CHECK ("status" IN ('active', 'retired')),
    CONSTRAINT "expense_policies_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "expense_policies_priority_check" CHECK ("priority" BETWEEN 1 AND 1000)
);
CREATE INDEX "expense_policies_active_idx" ON "expense_policies" ("organization_id", "status", "valid_from");

CREATE TABLE "expense_policy_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "category_code" VARCHAR(30) NOT NULL,
    "tier_id" UUID,
    "per_line" DECIMAL(14,2),
    "per_day" DECIMAL(14,2),
    "per_trip" DECIMAL(14,2),
    "per_month" DECIMAL(14,2),
    "currency" CHAR(3) NOT NULL,
    "over_limit" VARCHAR(20) NOT NULL DEFAULT 'justify_and_approve',
    "needs_justification" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "expense_policy_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_policy_rules_cell_key" UNIQUE NULLS NOT DISTINCT ("policy_id", "category_code", "tier_id"),
    CONSTRAINT "expense_policy_rules_policy_fkey" FOREIGN KEY ("organization_id", "policy_id") REFERENCES "expense_policies"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "expense_policy_rules_category_fkey" FOREIGN KEY ("organization_id", "category_code") REFERENCES "expense_categories"("organization_id", "code") ON UPDATE CASCADE,
    CONSTRAINT "expense_policy_rules_tier_fkey" FOREIGN KEY ("organization_id", "tier_id") REFERENCES "city_tiers"("organization_id", "id"),
    CONSTRAINT "expense_policy_rules_over_check" CHECK ("over_limit" IN ('justify_and_approve', 'block')),
    CONSTRAINT "expense_policy_rules_amounts_check" CHECK (COALESCE("per_line", 0) >= 0 AND COALESCE("per_day", 0) >= 0 AND COALESCE("per_trip", 0) >= 0 AND COALESCE("per_month", 0) >= 0),
    CONSTRAINT "expense_policy_rules_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "expense_policy_rules_policy_idx" ON "expense_policy_rules" ("organization_id", "policy_id");

-- ---------------------------------------------------------------------------------------------- rates (dated, no overlaps)
CREATE TABLE "mileage_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "vehicle" VARCHAR(16) NOT NULL,
    "rate_per_km" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "monthly_km_cap" INTEGER,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mileage_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mileage_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "mileage_rates_vehicle_check" CHECK ("vehicle" IN ('two_wheeler', 'car', 'ev_two_wheeler', 'ev_car', 'other')),
    CONSTRAINT "mileage_rates_rate_check" CHECK ("rate_per_km" > 0),
    CONSTRAINT "mileage_rates_cap_check" CHECK ("monthly_km_cap" IS NULL OR "monthly_km_cap" > 0),
    CONSTRAINT "mileage_rates_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "mileage_rates_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "mileage_rates_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "vehicle" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);

CREATE TABLE "per_diem_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "tier_id" UUID,
    "country" CHAR(2),
    "rate_per_day" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "partial_day_rule" VARCHAR(18) NOT NULL DEFAULT 'full',
    "meals_deduction" JSONB NOT NULL DEFAULT '{}',
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "per_diem_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "per_diem_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "per_diem_rates_tier_fkey" FOREIGN KEY ("organization_id", "tier_id") REFERENCES "city_tiers"("organization_id", "id"),
    CONSTRAINT "per_diem_rates_place_check" CHECK (("tier_id" IS NULL) <> ("country" IS NULL)),
    CONSTRAINT "per_diem_rates_rate_check" CHECK ("rate_per_day" > 0),
    CONSTRAINT "per_diem_rates_partial_check" CHECK ("partial_day_rule" IN ('full', 'half_after_hours')),
    CONSTRAINT "per_diem_rates_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "per_diem_rates_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "per_diem_rates_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, (COALESCE("tier_id"::text, "country")) WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);

-- ---------------------------------------------------------------------------------------------- GST registrations (§13.2, D7)
CREATE TABLE "entity_gst_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "state" CHAR(2) NOT NULL,
    "gstin" VARCHAR(15) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "entity_gst_registrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "entity_gst_registrations_gstin_key" UNIQUE ("organization_id", "gstin"),
    CONSTRAINT "entity_gst_registrations_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "entity_gst_registrations_gstin_check" CHECK ("gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' AND substr("gstin", 1, 2) = "state"),
    CONSTRAINT "entity_gst_registrations_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "entity_gst_registrations_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, "legal_entity_id" WITH =, "state" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
);

-- ---------------------------------------------------------------------------------------------- G1 translations (§6.4)
ALTER TABLE "content_translations" DROP CONSTRAINT "content_translations_subject_check";
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_subject_check" CHECK ("subject_type" IN ('leave_type', 'designation', 'department', 'grade', 'employment_type', 'location', 'journey_template', 'journey_task', 'expense_category', 'city_tier'));

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_categories', 'city_tiers', 'expense_policies', 'expense_policy_rules', 'mileage_rates', 'per_diem_rates', 'entity_gst_registrations']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- permission keys (§16)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'expense.policy.manage', 'Expense categories, city tiers, policies and limits, mileage and per-diem rates, GST registrations')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('expense.policy.manage')
ON CONFLICT DO NOTHING;
