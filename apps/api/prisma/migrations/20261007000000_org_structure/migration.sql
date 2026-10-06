-- P01 Tenancy & organisation (§4.1–4.3, §4.6; YX-ORG-01..05, 08, 12, 14, 15, 18, 30): legal entities,
-- locations, structure masters, grade pay ranges and scoped settings. Every table: organization_id NOT NULL,
-- forced RLS (YX-ORG-14), composite (organization_id, id) keys so a row can never point at another
-- tenant's row, even through a bug (P01 §5 #5). Inter-table FKs are NO ACTION: a referenced master can be
-- archived, never deleted (YX-ORG-04); a company's own removal still cascades from organizations.

-- Dated pay ranges never overlap (P06 YX-HIS-02): GiST exclusion over uuid equality needs btree_gist
-- (a trusted extension: the schema owner may create it).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------------------------
-- 4.1 Legal entities. India identifiers are Confidential (P02 §4.4): the API returns them only to
-- org.entity.statutory.manage, and every reveal is audited.
CREATE TABLE "legal_entities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "short_name" CITEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'IN',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "fy_start_month" SMALLINT NOT NULL DEFAULT 4,
    -- Structured address (YX-ORG-28): {lines[], city, state (ISO 3166-2), postalCode, country (ISO 3166-1)}.
    "registered_address" JSONB,
    -- Region catalogue code (YX-ORG-30); fixed at creation (trigger below), moved only by a region move.
    "data_region" VARCHAR(8) NOT NULL DEFAULT 'IN',
    "pan" VARCHAR(10),
    "tan" VARCHAR(10),
    "gstin" VARCHAR(15),
    -- CIN for companies, LLPIN for LLPs.
    "cin" VARCHAR(21),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_entities_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "legal_entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "legal_entities_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "legal_entities_short_name_check" CHECK ("short_name" ~ '^[A-Za-z0-9][A-Za-z0-9 &.-]{0,29}$'),
    CONSTRAINT "legal_entities_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "legal_entities_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "legal_entities_fy_start_month_check" CHECK ("fy_start_month" BETWEEN 1 AND 12),
    CONSTRAINT "legal_entities_data_region_check" CHECK ("data_region" IN ('IN', 'ME-AE', 'ME-SA', 'EU', 'US', 'SG')),
    CONSTRAINT "legal_entities_address_check" CHECK ("registered_address" IS NULL OR jsonb_typeof("registered_address") = 'object'),
    CONSTRAINT "legal_entities_pan_check" CHECK ("pan" ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
    CONSTRAINT "legal_entities_tan_check" CHECK ("tan" ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'),
    CONSTRAINT "legal_entities_gstin_check" CHECK ("gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
    CONSTRAINT "legal_entities_cin_check" CHECK ("cin" ~ '^([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}|[A-Z]{3}-[0-9]{4})$'),
    -- YX-ORG-01: the default entity is always live.
    CONSTRAINT "legal_entities_default_live_check" CHECK (NOT ("is_default" AND "archived_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "legal_entities_short_name_key" ON "legal_entities"("organization_id", "short_name");
-- YX-ORG-01: at most one default per company (the service keeps exactly one).
CREATE UNIQUE INDEX "legal_entities_default_key" ON "legal_entities"("organization_id") WHERE "is_default";

CREATE FUNCTION legal_entities_fixed_region() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_region IS DISTINCT FROM OLD.data_region OR NEW.country IS DISTINCT FROM OLD.country THEN
    RAISE EXCEPTION 'a legal entity''s country and data region are fixed at creation (YX-ORG-30)';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER legal_entities_fixed_region BEFORE UPDATE ON "legal_entities"
  FOR EACH ROW EXECUTE FUNCTION legal_entities_fixed_region();

-- P01 §9.2 / YX-ORG-01: every existing company gets its default legal entity (existing tenants map to IN,
-- P21). Short name from the slug. Runs before RLS is enabled on the new table.
INSERT INTO "legal_entities" ("organization_id", "name", "short_name", "is_default")
SELECT "id", left("name", 200),
       left(regexp_replace(upper("slug"::text), '[^A-Z0-9]+', '-', 'g'), 30),
       true
FROM "organizations";

-- ---------------------------------------------------------------------------------------------
-- 4.2 Locations: one legal entity each; state and time zone mandatory (YX-ORG-02).
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    "address" JSONB NOT NULL,
    "country" CHAR(2) NOT NULL,
    -- ISO 3166-2, e.g. IN-KA: decides PT / LWF (P07).
    "state" VARCHAR(6) NOT NULL,
    -- IANA time zone: scheduled changes apply at 00:00 here (P06 YX-HIS-04).
    "timezone" VARCHAR(64) NOT NULL,
    "min_wage_zone" VARCHAR(40),
    "geo_lat" DECIMAL(9,6),
    "geo_lng" DECIMAL(9,6),
    "geo_radius_m" INTEGER,
    "ip_ranges" TEXT[] NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "locations_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "locations_legal_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "locations_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "locations_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "locations_address_check" CHECK (jsonb_typeof("address") = 'object'),
    CONSTRAINT "locations_state_check" CHECK ("state" ~ ('^' || "country" || '-[A-Z0-9]{1,3}$')),
    CONSTRAINT "locations_geofence_check" CHECK (
      ("geo_lat" IS NULL) = ("geo_lng" IS NULL) AND ("geo_lat" IS NULL) = ("geo_radius_m" IS NULL)
      AND ("geo_lat" IS NULL OR ("geo_lat" BETWEEN -90 AND 90 AND "geo_lng" BETWEEN -180 AND 180 AND "geo_radius_m" BETWEEN 10 AND 5000))),
    CONSTRAINT "locations_ip_ranges_check" CHECK (cardinality("ip_ranges") <= 50)
);
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("organization_id", "code");
CREATE UNIQUE INDEX "locations_name_key" ON "locations"("organization_id", "legal_entity_id", "name");

-- ---------------------------------------------------------------------------------------------
-- 4.3 Structure masters. Departments, designations, grades and employment types are shared
-- (owner_legal_entity_id NULL, optionally limited by applies_to_entities) or entity-only (YX-ORG-15);
-- names and codes are unique within that scope (YX-ORG-05).
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    "parent_id" UUID,
    -- Materialised path '/<root id>/.../<own id>/' for subtree queries (YX-ORG-03).
    "path" TEXT NOT NULL,
    "is_division" BOOLEAN NOT NULL DEFAULT false,
    "owner_legal_entity_id" UUID,
    "applies_to_entities" UUID[] NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "departments_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "departments_parent_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "departments"("organization_id", "id"),
    CONSTRAINT "departments_owner_fkey" FOREIGN KEY ("organization_id", "owner_legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "departments_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "departments_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "departments_parent_check" CHECK ("parent_id" IS DISTINCT FROM "id"),
    CONSTRAINT "departments_path_check" CHECK ("path" LIKE '%/' || "id"::text || '/'),
    -- Q7: a division is a top-level department (label only).
    CONSTRAINT "departments_division_check" CHECK (NOT "is_division" OR "parent_id" IS NULL),
    CONSTRAINT "departments_applies_to_check" CHECK ("owner_legal_entity_id" IS NULL OR cardinality("applies_to_entities") = 0)
);
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "code");
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "name");
CREATE INDEX "departments_path_idx" ON "departments"("organization_id", "path" text_pattern_ops);

CREATE TABLE "designations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    "job_family" VARCHAR(100),
    "owner_legal_entity_id" UUID,
    "applies_to_entities" UUID[] NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "designations_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "designations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "designations_owner_fkey" FOREIGN KEY ("organization_id", "owner_legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "designations_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "designations_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "designations_applies_to_check" CHECK ("owner_legal_entity_id" IS NULL OR cardinality("applies_to_entities") = 0)
);
CREATE UNIQUE INDEX "designations_code_key" ON "designations"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "code");
CREATE UNIQUE INDEX "designations_name_key" ON "designations"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "name");

CREATE TABLE "grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    -- Ordering used by policies (leave, expense, travel).
    "rank" INTEGER NOT NULL,
    "owner_legal_entity_id" UUID,
    "applies_to_entities" UUID[] NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "grades_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "grades_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grades_owner_fkey" FOREIGN KEY ("organization_id", "owner_legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "grades_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "grades_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "grades_rank_check" CHECK ("rank" BETWEEN 1 AND 1000),
    CONSTRAINT "grades_applies_to_check" CHECK ("owner_legal_entity_id" IS NULL OR cardinality("applies_to_entities") = 0)
);
CREATE UNIQUE INDEX "grades_code_key" ON "grades"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "code");
CREATE UNIQUE INDEX "grades_name_key" ON "grades"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "name");

CREATE TABLE "employment_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    -- Drives statutory and policy defaults (YX-ORG-20, matrix from P07).
    "category" VARCHAR(24) NOT NULL,
    "owner_legal_entity_id" UUID,
    "applies_to_entities" UUID[] NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employment_types_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "employment_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employment_types_owner_fkey" FOREIGN KEY ("organization_id", "owner_legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "employment_types_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "employment_types_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "employment_types_category_check" CHECK ("category" IN ('permanent', 'probation', 'fixed_term', 'intern', 'apprentice', 'consultant', 'deployed_contractor', 'retired_reemployed')),
    CONSTRAINT "employment_types_applies_to_check" CHECK ("owner_legal_entity_id" IS NULL OR cardinality("applies_to_entities") = 0)
);
CREATE UNIQUE INDEX "employment_types_code_key" ON "employment_types"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "code");
CREATE UNIQUE INDEX "employment_types_name_key" ON "employment_types"("organization_id", (COALESCE("owner_legal_entity_id", "organization_id")), "name");

-- Cost centres belong to one legal entity; a parent is always in the same entity (composite FK).
CREATE TABLE "cost_centres" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "code" CITEXT NOT NULL,
    "parent_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_centres_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_centres_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "cost_centres_org_entity_id_key" UNIQUE ("organization_id", "legal_entity_id", "id"),
    CONSTRAINT "cost_centres_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cost_centres_legal_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "cost_centres_parent_fkey" FOREIGN KEY ("organization_id", "legal_entity_id", "parent_id") REFERENCES "cost_centres"("organization_id", "legal_entity_id", "id"),
    CONSTRAINT "cost_centres_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "cost_centres_code_check" CHECK ("code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$'),
    CONSTRAINT "cost_centres_parent_check" CHECK ("parent_id" IS DISTINCT FROM "id")
);
CREATE UNIQUE INDEX "cost_centres_code_key" ON "cost_centres"("organization_id", "legal_entity_id", "code");
CREATE UNIQUE INDEX "cost_centres_name_key" ON "cost_centres"("organization_id", "legal_entity_id", "name");

-- Dated pay ranges per grade x entity x currency (P01 §4.3, P06 §4.1). Pay data (founder rule R1): only
-- pay.range.view reads it. Current rows never overlap (YX-HIS-02).
CREATE TABLE "grade_pay_ranges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "min" DECIMAL(14,2) NOT NULL,
    "mid" DECIMAL(14,2) NOT NULL,
    "max" DECIMAL(14,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_pay_ranges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "grade_pay_ranges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grade_pay_ranges_grade_fkey" FOREIGN KEY ("organization_id", "grade_id") REFERENCES "grades"("organization_id", "id"),
    CONSTRAINT "grade_pay_ranges_legal_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "grade_pay_ranges_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "grade_pay_ranges_amounts_check" CHECK (0 <= "min" AND "min" <= "mid" AND "mid" <= "max"),
    CONSTRAINT "grade_pay_ranges_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from"),
    CONSTRAINT "grade_pay_ranges_no_overlap" EXCLUDE USING gist (
      "organization_id" WITH =, "grade_id" WITH =, "legal_entity_id" WITH =, "currency" WITH =,
      daterange("valid_from", "valid_to", '[]') WITH &&)
);

-- ---------------------------------------------------------------------------------------------
-- 4.6 Scoped settings (YX-ORG-12, YX-ORG-18). Keys are registered in code (type, allowed scopes, dated);
-- scope_id is the organisation itself for scope 'tenant'. Dated keys carry valid_from.
CREATE TABLE "settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "valid_from" DATE,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "settings_scope_type_check" CHECK ("scope_type" IN ('tenant', 'legal_entity', 'pay_group', 'location', 'department', 'employment_type', 'grade', 'designation', 'employee')),
    CONSTRAINT "settings_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
    CONSTRAINT "settings_tenant_scope_check" CHECK ("scope_type" <> 'tenant' OR "scope_id" = "organization_id")
);
CREATE UNIQUE INDEX "settings_scope_key" ON "settings"("organization_id", "key", "scope_type", "scope_id", "valid_from") NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14): the standard forced RLS + tenant_isolation policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['legal_entities', 'locations', 'departments', 'designations', 'grades', 'employment_types', 'cost_centres', 'grade_pay_ranges', 'settings']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
