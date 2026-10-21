-- PPL-03 family, nominees and emergency contacts (founder 22 Oct 2026). Personal class (P02 §4.4): the person and
-- HR with employee.personal.view read them; HR with employee.profile.edit changes family and nominations, the
-- person keeps their own emergency contacts. Every change is audited without values.

-- Family members are never deleted (a nomination may point at one); removing one stamps removed_at.
CREATE TABLE "employee_family_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "relation" VARCHAR(40) NOT NULL,
    "date_of_birth" DATE,
    "dependant" BOOLEAN NOT NULL DEFAULT false,
    "position" SMALLINT NOT NULL DEFAULT 0,
    "removed_at" TIMESTAMPTZ(3),
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_family_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_family_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_family_members_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_family_members_dob_check" CHECK ("date_of_birth" IS NULL OR "date_of_birth" >= DATE '1900-01-01')
);
CREATE UNIQUE INDEX "employee_family_members_org_employee_id_key" ON "employee_family_members" ("organization_id", "employee_id", "id");
REVOKE DELETE, TRUNCATE ON TABLE "employee_family_members" FROM app_runtime;

-- Emergency contacts in the order to call them (position 0 first). Phones are E.164 (YX-ORG-28).
CREATE TABLE "employee_emergency_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "relation" VARCHAR(40) NOT NULL,
    "phone" VARCHAR(16) NOT NULL,
    "position" SMALLINT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_emergency_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_emergency_contacts_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "employee_emergency_contacts_phone_check" CHECK ("phone" ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE UNIQUE INDEX "employee_emergency_contacts_position_key" ON "employee_emergency_contacts" ("organization_id", "employee_id", "position");

-- Nominations (YX-LC-16) now name a family member of the same person; a review supersedes the rows it replaces
-- (the table stays append-only for the app). Joiner rows from before keep a null member.
ALTER TABLE "employee_nominations" ADD COLUMN "family_member_id" UUID, ADD COLUMN "superseded_at" TIMESTAMPTZ(3);
ALTER TABLE "employee_nominations" ADD CONSTRAINT "employee_nominations_member_fkey" FOREIGN KEY ("organization_id", "employee_id", "family_member_id") REFERENCES "employee_family_members"("organization_id", "employee_id", "id");
ALTER TABLE "employee_nominations" DROP CONSTRAINT "employee_nominations_scheme_check";
ALTER TABLE "employee_nominations" ADD CONSTRAINT "employee_nominations_scheme_check" CHECK ("scheme" IN ('gratuity', 'pf', 'eps', 'group_term', 'all'));

-- Tenant isolation (YX-ORG-14), as for employee_personal_details (Personal class: no support-session guard).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_family_members', 'employee_emergency_contacts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
