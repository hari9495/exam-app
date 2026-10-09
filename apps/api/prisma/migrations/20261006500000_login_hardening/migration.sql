-- Login-system hardening after the security review of P12 (YX-IAM-04/05/08/10).

-- Which identity provider opened a session, so disabling / deleting that provider ends it
-- (YX-IAM-05). Set to NULL only after the sessions have been revoked by the service.
ALTER TABLE "sessions" ADD COLUMN "identity_provider_id" UUID;
CREATE INDEX "sessions_identity_provider_id_idx" ON "sessions"("identity_provider_id") WHERE "identity_provider_id" IS NOT NULL;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_provider_id_fkey"
  FOREIGN KEY ("identity_provider_id") REFERENCES "identity_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An SSO exchange code is bound to the browser that started the sign-in (login CSRF) and remembers
-- the provider that vouched for it.
ALTER TABLE "sso_login_codes"
  ADD COLUMN "identity_provider_id" UUID,
  ADD COLUMN "device_id_hash" VARCHAR(64);

-- IdP-asserted MFA (amr / acr / AuthnContextClassRef) counts only for a provider an administrator
-- has explicitly trusted for it. Off for every existing provider.
ALTER TABLE "identity_providers" ADD COLUMN "mfa_trusted" BOOLEAN NOT NULL DEFAULT false;

-- A provider vouches only for its own email domains. The pre-1e SAML set-up was migrated with no
-- domains ("existing accounts only"); give it the domains of the accounts it could sign in, so it
-- keeps working, and drop the "no domains = every account" rule in the service.
INSERT INTO "identity_provider_domains" ("organization_id", "domain", "identity_provider_id")
SELECT DISTINCT ON (u."organization_id", lower(split_part(u."email", '@', 2)))
       u."organization_id", lower(split_part(u."email", '@', 2)), p."id"
FROM "identity_providers" p
JOIN "users" u ON u."organization_id" = p."organization_id"
WHERE NOT EXISTS (SELECT 1 FROM "identity_provider_domains" d WHERE d."identity_provider_id" = p."id")
  AND lower(split_part(u."email", '@', 2)) ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
ORDER BY u."organization_id", lower(split_part(u."email", '@', 2)), p."created_at"
ON CONFLICT ("organization_id", "domain") DO NOTHING;

-- A password found in a breach corpus on re-check must be changed at the next sign-in (YX-IAM-08).
ALTER TABLE "users" ADD COLUMN "password_change_required" BOOLEAN NOT NULL DEFAULT false;

-- One-time-code sends are login events too (YX-IAM-10: SMS-pumping / targeting signal).
ALTER TABLE "login_events" DROP CONSTRAINT "login_events_result_check";
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_result_check"
  CHECK ("result" IN ('success', 'failed', 'locked', 'mfa_failed', 'code_sent'));
