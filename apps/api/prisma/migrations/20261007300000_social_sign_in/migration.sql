-- "Continue with Google / Microsoft" on the YukthiX sign-in screen (founder request 7 Oct 2026; P12 Q2).
-- YukthiX's own platform OIDC apps, company not known up front. A company opts in per method (off by
-- default); SSO-only turns both off.
ALTER TABLE "tenant_security_policies"
  ADD COLUMN "google_sign_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "microsoft_sign_in" BOOLEAN NOT NULL DEFAULT false;

-- The stable subject an account has signed in with (Google `sub`, Microsoft `tid:oid`), linked after
-- its first complete sign-in (every factor). Later sign-ins match the link before any email, and an
-- account linked to one subject is never matched by email for another (account takeover, "nOAuth").
CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "external_identities_provider_check" CHECK ("provider" IN ('google', 'microsoft'))
);
CREATE UNIQUE INDEX "external_identities_user_id_provider_key" ON "external_identities"("user_id", "provider");
CREATE INDEX "external_identities_provider_subject_idx" ON "external_identities"("provider", "subject");
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_identities" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "external_identities"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
