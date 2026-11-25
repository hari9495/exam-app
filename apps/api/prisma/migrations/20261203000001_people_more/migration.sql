-- People menu, the rest of the designed pages: the buddy pool (PPL-41), the union register (PPL-39) and succession
-- (PPL-26). Employee import (PPL-07) writes through the hire path and needs no table.

-- Colleagues who volunteer as buddies, with how many joiners each looks after at a time.
CREATE TABLE "buddy_pool" (
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "cap" SMALLINT NOT NULL DEFAULT 2,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "buddy_pool_pkey" PRIMARY KEY ("organization_id", "employee_id"),
    CONSTRAINT "buddy_pool_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "buddy_pool_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "buddy_pool_cap_check" CHECK ("cap" BETWEEN 1 AND 5)
);

-- The union register: the establishment, recognition and its basis, the recognition period and the office bearers.
ALTER TABLE "unions"
    ADD COLUMN "location_id" UUID,
    ADD COLUMN "recognition" VARCHAR(16) NOT NULL DEFAULT 'not_recognised',
    ADD COLUMN "basis" VARCHAR(200),
    ADD COLUMN "valid_from" DATE,
    ADD COLUMN "valid_to" DATE,
    ADD COLUMN "bearers" VARCHAR(500),
    ADD CONSTRAINT "unions_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id"),
    ADD CONSTRAINT "unions_recognition_check" CHECK ("recognition" IN ('recognised', 'not_recognised')),
    ADD CONSTRAINT "unions_valid_check" CHECK ("valid_to" IS NULL OR "valid_from" IS NULL OR "valid_to" >= "valid_from");

-- Succession: critical positions and the people nominated to step into them, with readiness. Confidential.
CREATE TABLE "succession_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "incumbent_employee_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "succession_positions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "succession_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "succession_positions_incumbent_fkey" FOREIGN KEY ("incumbent_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
    CONSTRAINT "succession_positions_title_check" CHECK (length(btrim("title")) > 0)
);
CREATE UNIQUE INDEX "succession_positions_title_key" ON "succession_positions"("organization_id", lower("title"));

CREATE TABLE "successors" (
    "organization_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "readiness" VARCHAR(8) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "successors_pkey" PRIMARY KEY ("position_id", "employee_id"),
    CONSTRAINT "successors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "successors_position_fkey" FOREIGN KEY ("position_id") REFERENCES "succession_positions"("id") ON DELETE CASCADE,
    CONSTRAINT "successors_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
    CONSTRAINT "successors_readiness_check" CHECK ("readiness" IN ('now', '1_2y', '3y'))
);
CREATE INDEX "successors_org_idx" ON "successors"("organization_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['buddy_pool', 'succession_positions', 'successors']
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
  (gen_random_uuid(), 'succession.manage', 'See and edit succession plans: critical positions and nominated successors (Confidential)')
ON CONFLICT DO NOTHING;
-- Confidential: not a System Admin default; HR Admin roles carry it (role templates).
