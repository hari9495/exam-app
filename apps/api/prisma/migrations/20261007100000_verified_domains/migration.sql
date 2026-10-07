-- Email-first sign-in (founder decision 7 Oct 2026: no company-code box). An email domain routes
-- straight to a company's identity provider only after the company has proven it owns the domain
-- with a DNS TXT record (P12 YX-IAM-04). One row per (company, verified domain); deleting the row
-- (or the company) withdraws the claim. A domain verified by two companies never auto-routes.
CREATE TABLE "verified_domains" (
    "organization_id" UUID NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verified_domains_pkey" PRIMARY KEY ("organization_id", "domain")
);
CREATE INDEX "verified_domains_domain_idx" ON "verified_domains"("domain");
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_domain_check"
  CHECK ("domain" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$');

ALTER TABLE "verified_domains" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "verified_domains"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
