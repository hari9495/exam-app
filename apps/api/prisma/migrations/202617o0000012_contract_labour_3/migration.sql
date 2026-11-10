-- Contract labour CL-3 (answers 631, 678; T9-13): the contractor portal. A contractor's contacts (name, email) get access
-- from the compliance owner (invited, then active on the first sign-in) and sign in with a one-time code to their email;
-- a session is a random token kept only as its SHA-256 hash, with an expiry. Each contact sees only their own
-- contractor's licences, work orders, workers, deployments and gate passes. Licence alerts also go to these contacts.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "contractor_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" CITEXT NOT NULL,
    "portal" VARCHAR(8) NOT NULL DEFAULT 'invited',
    "invited_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_contacts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_contacts_portal_check" CHECK ("portal" IN ('invited', 'active', 'none'))
);
CREATE UNIQUE INDEX "contractor_contacts_email_key" ON "contractor_contacts" ("agency_id", "email");
CREATE INDEX "contractor_contacts_login_idx" ON "contractor_contacts" ("organization_id", "email");
ALTER TABLE "contractor_contacts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contractor_contacts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

CREATE TABLE "contractor_portal_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_portal_sessions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contractor_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "contractor_portal_sessions_token_key" ON "contractor_portal_sessions" ("token_hash");
ALTER TABLE "contractor_portal_sessions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contractor_portal_sessions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
