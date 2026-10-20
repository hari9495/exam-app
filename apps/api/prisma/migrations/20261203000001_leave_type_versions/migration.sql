-- Dated versions of a leave type's rules (TIM-27, founder decision 20 Oct 2026): a change applies from a chosen date,
-- and leave keeps the rules in force on its first day. Each type's rules move into version 1, in force from the day
-- the type was made (India time). The name, code, kind, pay and colour stay on the type.
CREATE TABLE "leave_type_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "note" VARCHAR(300),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_type_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_type_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "leave_type_versions_type_fkey" FOREIGN KEY ("organization_id", "leave_type_id") REFERENCES "leave_types"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "leave_type_versions_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "leave_type_versions_number_key" ON "leave_type_versions"("organization_id", "leave_type_id", "version");
CREATE UNIQUE INDEX "leave_type_versions_from_key" ON "leave_type_versions"("organization_id", "leave_type_id", "valid_from");
-- A version in force is history: the app adds versions and may change one that has not started yet, never removes one.
REVOKE DELETE, TRUNCATE ON TABLE "leave_type_versions" FROM app_runtime;
CREATE FUNCTION leave_type_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'YX_VERSION_IN_FORCE: a leave type version in force does not change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_type_versions_guard BEFORE UPDATE ON "leave_type_versions" FOR EACH ROW EXECUTE FUNCTION leave_type_version_guard();

ALTER TABLE "leave_type_versions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leave_type_versions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

INSERT INTO "leave_type_versions" ("organization_id", "leave_type_id", "version", "valid_from", "rules", "created_by", "created_at")
SELECT "organization_id", "id", 1, ("created_at" AT TIME ZONE 'Asia/Kolkata')::date, "rules", "created_by", "created_at" FROM "leave_types";

ALTER TABLE "leave_types" DROP COLUMN "rules", DROP COLUMN "version";
