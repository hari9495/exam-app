-- Time batch (founder answer 2477, items 3, 4 and 6): dated versions of a leave type's rules and pay. A change applies
-- from a chosen date; leave follows the rules in force on its first day, and the payroll feed reads whether the type is
-- paid on each leave day. Past requests and balances do not change. Today's rules and pay move into version 1, in force
-- from the start. leave_types.rules and leave_types.paid stay as the copy in force today (refreshed with the accrual run).
CREATE TABLE "leave_type_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "leave_type_id" UUID NOT NULL REFERENCES "leave_types"("id") ON DELETE CASCADE,
  "valid_from" DATE NOT NULL,
  "rules" JSONB NOT NULL DEFAULT '{}',
  "paid" BOOLEAN NOT NULL,
  "note" VARCHAR(300),
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_type_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_type_versions_from_key" ON "leave_type_versions" ("organization_id", "leave_type_id", "valid_from");

-- A version already in force is history: it is never changed or removed (a version that has not started yet may be).
CREATE FUNCTION leave_type_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'YX_VERSION_IN_FORCE: a leave type version in force does not change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER leave_type_versions_guard BEFORE UPDATE OR DELETE ON "leave_type_versions" FOR EACH ROW EXECUTE FUNCTION leave_type_version_guard();
REVOKE TRUNCATE ON TABLE "leave_type_versions" FROM app_runtime;

ALTER TABLE "leave_type_versions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "leave_type_versions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY portal_none ON "leave_type_versions" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

INSERT INTO "leave_type_versions" ("organization_id", "leave_type_id", "valid_from", "rules", "paid", "note", "created_by", "created_at")
SELECT "organization_id", "id", DATE '2000-01-01', "rules", "paid", 'Version 1: the rules before dated versions', "created_by", "created_at" FROM "leave_types";

-- Leave during the notice period may be taken as unpaid (a type's rule or the company's): the request remembers it, and
-- the payroll feed pays none of its days.
ALTER TABLE "leave_requests" ADD COLUMN "unpaid_in_notice" BOOLEAN NOT NULL DEFAULT false;
