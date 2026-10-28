-- TIM-40 licence requirements, as the design draws them: a requirement is for a role (designation) or a shift, a
-- licence type may carry a short note ("LMV endorsement"), HR may let a person with an expired COMPANY licence be
-- rostered with a reason (never a legal one), and "Ask to renew" is the once-a-day nudge.
ALTER TABLE "licence_types" ADD COLUMN "note" VARCHAR(100);

ALTER TABLE "shift_licence_requirements" DROP CONSTRAINT "shift_licence_requirements_key";
ALTER TABLE "shift_licence_requirements" ALTER COLUMN "shift_id" DROP NOT NULL;
ALTER TABLE "shift_licence_requirements" ADD COLUMN "designation_id" UUID;
ALTER TABLE "shift_licence_requirements" ADD CONSTRAINT "shift_licence_requirements_designation_fkey" FOREIGN KEY ("organization_id", "designation_id") REFERENCES "designations"("organization_id", "id");
ALTER TABLE "shift_licence_requirements" ADD CONSTRAINT "shift_licence_requirements_target_check" CHECK (("shift_id" IS NULL) <> ("designation_id" IS NULL));
ALTER TABLE "shift_licence_requirements" ADD CONSTRAINT "shift_licence_requirements_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "shift_id", "designation_id", "licence_type_id", "location_id");

CREATE TABLE "licence_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "licence_type_id" UUID NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    -- The override lasts until this day (inclusive); a renewal recorded earlier makes it moot.
    "until" DATE NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "licence_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "licence_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "licence_overrides_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "licence_overrides_type_fkey" FOREIGN KEY ("organization_id", "licence_type_id") REFERENCES "licence_types"("organization_id", "id"),
    CONSTRAINT "licence_overrides_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 5 AND 300)
);
CREATE INDEX "licence_overrides_person_idx" ON "licence_overrides"("organization_id", "employee_id", "licence_type_id");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "licence_overrides" FROM app_runtime;
ALTER TABLE "licence_overrides" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "licence_overrides"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "licence_overrides" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "nudges" DROP CONSTRAINT "nudges_item_check";
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_item_check" CHECK ("item" IN ('check_in', 'hybrid_plan', 'licence_renew'));
