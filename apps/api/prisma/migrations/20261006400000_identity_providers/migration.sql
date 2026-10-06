-- P12 Part 1e: several identity providers per company -- any SAML IdP, Google and Microsoft Entra
-- (OIDC) and generic OIDC -- routed by email domain, with just-in-time provisioning (YX-IAM-04/05,
-- Q2 wave 1). Replaces the single SAML configuration held on `organizations`.

CREATE TABLE "identity_providers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'disabled',
    "saml_entity_id" VARCHAR(1000),
    "saml_sso_url" VARCHAR(1000),
    "saml_certificate" TEXT,
    "oidc_issuer" VARCHAR(1000),
    "oidc_client_id" VARCHAR(1000),
    "oidc_client_secret_encrypted" TEXT,
    "entra_tenant_id" UUID,
    "jit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "jit_role" VARCHAR(32),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_providers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "identity_providers_organization_id_idx" ON "identity_providers"("organization_id");
-- Target of the domains' composite key, so a domain can only point at its own company's provider.
CREATE UNIQUE INDEX "identity_providers_id_organization_id_key" ON "identity_providers"("id", "organization_id");
ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "identity_providers"
  ADD CONSTRAINT "identity_providers_type_check" CHECK ("type" IN ('saml', 'oidc_google', 'oidc_entra', 'oidc_generic')),
  ADD CONSTRAINT "identity_providers_status_check" CHECK ("status" IN ('active', 'disabled')),
  -- Each type carries only its own settings, and an active provider is complete.
  ADD CONSTRAINT "identity_providers_shape_check" CHECK (
    ("type" = 'saml'
      AND "oidc_issuer" IS NULL AND "oidc_client_id" IS NULL AND "oidc_client_secret_encrypted" IS NULL AND "entra_tenant_id" IS NULL
      AND ("status" = 'disabled' OR ("saml_entity_id" IS NOT NULL AND "saml_sso_url" IS NOT NULL AND "saml_certificate" IS NOT NULL)))
    OR ("type" <> 'saml'
      AND "saml_entity_id" IS NULL AND "saml_sso_url" IS NULL AND "saml_certificate" IS NULL
      AND "oidc_issuer" IS NOT NULL
      AND ("status" = 'disabled' OR ("oidc_client_id" IS NOT NULL AND "oidc_client_secret_encrypted" IS NOT NULL)))),
  -- Google and Entra trust exactly one issuer; Entra is pinned to the company's own directory
  -- (never common / organizations / consumers).
  ADD CONSTRAINT "identity_providers_issuer_check" CHECK (
    ("type" <> 'oidc_google' OR "oidc_issuer" = 'https://accounts.google.com')
    AND (("type" = 'oidc_entra') = ("entra_tenant_id" IS NOT NULL))
    AND ("type" <> 'oidc_entra' OR "oidc_issuer" = 'https://login.microsoftonline.com/' || "entra_tenant_id"::text || '/v2.0')),
  -- JIT never hands out an admin role (YX-IAM-05); the service also refuses any role whose
  -- permissions are sensitive.
  ADD CONSTRAINT "identity_providers_jit_check" CHECK (
    NOT "jit_enabled" OR ("jit_role" IS NOT NULL AND "jit_role" NOT IN ('org_admin', 'super_admin')));

-- Email domains a provider signs in for. A domain routes to one provider per company.
CREATE TABLE "identity_provider_domains" (
    "organization_id" UUID NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "identity_provider_id" UUID NOT NULL,

    CONSTRAINT "identity_provider_domains_pkey" PRIMARY KEY ("organization_id", "domain")
);
CREATE INDEX "identity_provider_domains_identity_provider_id_idx" ON "identity_provider_domains"("identity_provider_id");
ALTER TABLE "identity_provider_domains" ADD CONSTRAINT "identity_provider_domains_provider_fkey"
  FOREIGN KEY ("identity_provider_id", "organization_id") REFERENCES "identity_providers"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity_provider_domains" ADD CONSTRAINT "identity_provider_domains_domain_check"
  CHECK ("domain" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$');

-- The existing per-company SAML set-up becomes that company's first provider (no domains: it
-- signs in existing accounts only, exactly as before). Partial set-ups could never be enabled.
INSERT INTO "identity_providers" ("id", "organization_id", "type", "name", "status", "saml_entity_id", "saml_sso_url", "saml_certificate")
SELECT gen_random_uuid(), "id", 'saml', 'SAML', CASE WHEN "saml_enabled" THEN 'active' ELSE 'disabled' END,
       "saml_idp_entity_id", "saml_idp_sso_url", "saml_idp_certificate"
FROM "organizations"
WHERE "saml_idp_entity_id" IS NOT NULL AND "saml_idp_sso_url" IS NOT NULL AND "saml_idp_certificate" IS NOT NULL;

ALTER TABLE "organizations"
  DROP COLUMN "saml_enabled",
  DROP COLUMN "saml_idp_entity_id",
  DROP COLUMN "saml_idp_sso_url",
  DROP COLUMN "saml_idp_certificate";

-- A sign-in code now records how the IdP signed the person in, and whether it asserted MFA
-- (P12 §3: SSO is AAL2 only where the IdP enforces MFA).
ALTER TABLE "sso_login_codes"
  ADD COLUMN "method" VARCHAR(16) NOT NULL DEFAULT 'saml',
  ADD COLUMN "mfa_asserted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sso_login_codes" ADD CONSTRAINT "sso_login_codes_method_check" CHECK ("method" IN ('saml', 'oidc'));

-- Tenant isolation: the standard forced RLS + tenant_isolation policy.
ALTER TABLE "identity_providers" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "identity_providers"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "identity_provider_domains" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "identity_provider_domains"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
