-- PPL-43 BFSI declarations (SEBI PIT Regulations / RBI fit-and-proper practice): the compliance officer names the
-- designated persons; each submits, every financial year, their holdings, related persons and conflicts of interest,
-- and attests the code of conduct with a fresh second factor. Holdings, related persons and conflict details are
-- Confidential and sealed to the person; only the compliance officer reads a submitted declaration (each look audited).
CREATE TABLE "bfsi_designations" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "designated_on" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bfsi_designations_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "bfsi_designations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bfsi_designations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE
);

CREATE TABLE "bfsi_declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "cycle" CHAR(7) NOT NULL,
    "holdings_enc" TEXT,
    "related_enc" TEXT,
    "coi" VARCHAR(3),
    "coi_enc" TEXT,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(3),
    "reminded_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bfsi_declarations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bfsi_declarations_cycle_key" UNIQUE ("organization_id", "employee_id", "cycle"),
    CONSTRAINT "bfsi_declarations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bfsi_declarations_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "bfsi_declarations_cycle_check" CHECK ("cycle" ~ '^[0-9]{4}-[0-9]{2}$'),
    CONSTRAINT "bfsi_declarations_status_check" CHECK ("status" IN ('draft', 'submitted') AND ("status" = 'submitted') = ("submitted_at" IS NOT NULL)),
    CONSTRAINT "bfsi_declarations_coi_check" CHECK ("coi" IS NULL OR "coi" IN ('yes', 'no'))
);
REVOKE DELETE, TRUNCATE ON TABLE "bfsi_declarations" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bfsi_designations', 'bfsi_declarations']
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
  END LOOP;
END $$;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'compliance.declaration.manage', 'Compliance officer: designated persons, their declarations and trading pre-clearance (Confidential)')
ON CONFLICT DO NOTHING;
