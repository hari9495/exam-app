# SAML SSO — Design

## Problem

Competitor research identified SSO as a common hard requirement for enterprise buyers: many larger organizations won't even evaluate a platform that doesn't support logging staff in through their own Identity Provider (Okta, Azure AD, OneLogin, PingFederate, etc.). This is priority #5 on the competitor-research-driven roadmap, following Integrity & Anti-Cheating (shipped), Public API + Webhooks (shipped), and the Candidate UX Pack (shipped out of order).

This spec covers **staff-facing SAML 2.0 SSO only** — recruiters, org-admins, and panel members logging into the recruiter/org-admin/panel consoles. Candidate-facing authentication is a completely separate JWT system (`apps/exam-runtime`) and is explicitly out of scope. Platform super-admin login is also out of scope and stays password-only, since it is not org-scoped the way SSO inherently is.

## Scope

- SAML 2.0 only. OIDC/OAuth2-style SSO ("Login with Google/Microsoft") is a natural, separate fast-follow, not part of this pass.
- **Pre-provisioned users only.** SSO replaces *how* an existing staff member proves their identity — it never creates a `User` record. An org-admin must have already invited/created the user (via the existing Staff Users screen) before that person's email can log in via SSO. No just-in-time provisioning, no attribute-based role mapping.
- **SSO coexists with password login.** Enabling SAML for an org does not disable password login for that org's staff. Both work simultaneously. If an org's IdP configuration breaks, staff can still log in with their password — this is the feature's entire break-glass story, and it means no separate recovery flow needs to be built.
- **One IdP per org.** Multiple IdPs per org is out of scope.
- Login entry point is a button on the existing login page (gated by the org slug already typed in), not a separate SSO-only URL.

## Architecture

**Library:** `@node-saml/passport-saml`'s `MultiSamlStrategy`. Standard `passport-saml`-family strategies are constructed once with fixed IdP config; `MultiSamlStrategy` instead takes a `getSamlOptions(req, callback)` function that resolves per-request SAML options (IdP certificate, SSO URL, entity ID) based on the org slug in the request — the correct shape for this platform's one-strategy-serves-every-org model. It registers in `apps/api/src/auth/auth.module.ts` alongside the existing `JwtStrategy`, following the same Passport-strategy pattern already used there.

**Schema — new nullable columns on `Organization`** (`apps/api/prisma/schema.prisma`), following the exact precedent already set by the SMTP/AI-key/webhook columns on the same model:

```prisma
model Organization {
  // ...existing fields...
  samlEnabled        Boolean  @default(false) @map("saml_enabled")
  samlIdpEntityId    String?  @map("saml_idp_entity_id")
  samlIdpSsoUrl      String?  @map("saml_idp_sso_url")
  samlIdpCertificate String?  @map("saml_idp_certificate") @db.NVarChar(Max)
}
```

`samlIdpCertificate` (the IdP's X.509 cert, PEM-encoded) is stored in **plaintext**, not via `OrgSecretsCryptoService`. Unlike a password or API key, a certificate is public key material — it exists to be shared with anyone who needs to verify a signature, so there is nothing to protect by encrypting it at rest.

**New model — `SsoLoginCode`**, mirroring the existing `SetupToken`/`PasswordResetToken` pattern exactly (hash-and-compare, expiry, delete-on-use):

```prisma
model SsoLoginCode {
  id        String   @id @default(uuid()) @db.UniqueIdentifier
  codeHash  String   @map("code_hash")
  userId    String   @map("user_id") @db.UniqueIdentifier
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("sso_login_codes")
}
```

A ~60-second-lived, single-use code that bridges the SAML ACS callback's cross-site POST to a same-site token exchange (see Auth Flow below).

**Replay protection:** `@node-saml/passport-saml`'s `validateInResponseTo` option requires a cache of outstanding AuthnRequest IDs to detect replay. The library defaults to an in-memory cache, which is incorrect once the API runs as more than one instance — a captured response could be replayed against a different instance's empty cache. This project already has Redis wired for the BullMQ job queues; the SAML request-ID cache should use a Redis-backed cache provider instead of the library's in-memory default, reusing existing infrastructure rather than adding a new dependency.

## Why an SSO session is JWT-identical to a password session

The ACS callback's token-exchange endpoint calls the *existing* `issueTokenPair()` (`apps/api/src/auth/auth.service.ts`) — the exact same function password login already calls, producing an identical access-token payload shape (`{ sub, organizationId, role }`) and the same httpOnly refresh-cookie mechanics. From the moment a user has a token, an SSO-authenticated session is indistinguishable from a password-authenticated one to every other part of the app: same `JwtStrategy`, same `JwtAuthGuard`, same `PermissionsGuard`, same RBAC. SSO only ever replaces *how a user proves who they are* — never *what they're authorized to do*, which stays entirely owned by the existing `User.role` + `RolePermission` system.

## Auth Flow

All new routes live in `apps/api/src/auth/saml.controller.ts` (new file, alongside the existing `auth.controller.ts`):

- **`GET /auth/saml/:organizationSlug/status`** — public, unauthenticated. Returns `{ enabled: boolean }` — whether this org has SAML configured and enabled. Used by the login page to decide whether to render the "Log in with SSO" button.
- **`GET /auth/saml/:organizationSlug/login`** — SP-initiated entry point. Redirects the browser to the org's configured IdP SSO URL with a signed AuthnRequest, using `MultiSamlStrategy`'s per-org option resolution. 404s if `samlEnabled` is false for that org.
- **`POST /auth/saml/:organizationSlug/callback`** — the ACS (Assertion Consumer Service) endpoint the IdP's browser-mediated POST lands on after the user authenticates at the IdP. `MultiSamlStrategy` validates the response's signature, audience restriction, and replay protection (via the Redis-backed cache) before this handler ever runs. On a valid response:
  1. Extract the assertion's email (from `NameID`, the SAML baseline every IdP supports — not a configurable attribute mapping, per the pre-provisioned-only scope decision).
  2. Look up a `User` with that email in that org (`tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, ...)`, mirroring the existing password-login lookup).
  3. **Match:** mint a `SsoLoginCode` (`crypto.randomBytes`, SHA-256 hashed for storage, 60s expiry), redirect the browser to `apps/web`'s SSO callback page with the raw code as a query parameter.
  4. **No match:** redirect to the frontend login page with a generic `?ssoError=not_provisioned` flag — no user creation happens here, per the pre-provisioned-only scope.
  On an invalid response (bad signature, replay, expired), redirect with a generic `?ssoError=invalid_response` flag — no detail about which specific validation failed is exposed, since a more specific error could help an attacker iterate toward a forged response.
- **`POST /auth/sso/exchange`** — takes `{ code }`, hashes and looks it up against `SsoLoginCode`, checks expiry, and deletes the row regardless of outcome (single-use, whether it succeeded or not). On success, calls `issueTokenPair()` exactly as password login does and returns `{ accessToken }` with the refresh cookie set on the response, identical to the existing `POST /auth/staff/login` response shape.
- **`GET /auth/saml/:organizationSlug/metadata`** — returns this app's SP metadata XML (our entity ID + this org's specific ACS URL, `@node-saml/passport-saml` generates this), for the org-admin to hand to their IdP admin when setting up the SAML application on the IdP's side. This is the other half of the trust handshake — the org-admin pastes the IdP's info into our config screen (below), and copies this URL to give to their IdP admin.

**Frontend:**
- `apps/web/app/login/page.tsx`: on org-slug blur, calls `GET /auth/saml/:slug/status` and conditionally renders a "Log in with SSO" button next to the existing password form, which links to `GET /auth/saml/:slug/login`.
- New `apps/web/app/sso/callback/page.tsx`: reads `code` from the URL query string, calls `POST /auth/sso/exchange`, then follows the exact same post-login role-based redirect logic already in `login/page.tsx` (decode the returned JWT, route by `role`). On failure (missing/expired/invalid code, or a `ssoError` flag from the ACS redirect), shows a clear error and a link back to the password login form.

## Org-Admin Configuration UI

A new sibling screen to the existing Integrations page, following its exact established pattern:

**Backend** — two new routes on `apps/api/src/organizations/organizations.controller.ts`, gated by the same `@RequirePermissions('org:manage_settings')` used by every other org-settings route (no new permission needed):
- **`GET /organizations/sso`** — returns `{ samlEnabled, samlIdpEntityId, samlIdpSsoUrl, samlIdpCertificate }`. Unlike the API key or webhook secret, the certificate is returned in full on every fetch, not one-time-revealed — it is public key material, not a secret.
- **`PATCH /organizations/sso`** — accepts a partial update of the three IdP fields plus `samlEnabled`. Validates before persisting: `samlIdpSsoUrl` must be a well-formed URL; `samlIdpCertificate` must parse as a valid X.509 PEM certificate (rejected with a clear `400` otherwise — the same "validate externally before persisting" principle the SMTP/AI-key forms already follow, here via a local parse rather than a live external call). `samlEnabled: true` is only accepted if all three IdP fields are present after the update is applied (either newly set in this request or already persisted from a prior one) — `400` otherwise, since an "enabled" org with incomplete IdP config would 500 on the first real login attempt instead of failing fast at config time. Every successful write audits via a new `organization.sso_configured` action, matching the existing convention (`organization.webhook_url_updated`, `organization.api_key_generated`, etc.).

**Frontend** — new `apps/web/app/(org-admin)/settings/sso/page.tsx`, added as a nav sibling to "Integrations" in `apps/web/app/(org-admin)/layout.tsx`'s `NAV_ITEMS`. A form with three text inputs (IdP Entity ID, IdP SSO URL, IdP Certificate as a textarea for the PEM block) and an enable/disable toggle, built from the existing `Card`/`Input`/`Button` primitives already used by every other org-admin settings screen. The page also surfaces the SP metadata URL (`GET /auth/saml/:slug/metadata`) as a copyable value — the piece of information the org-admin needs to complete the trust relationship on their IdP's side.

## Error Handling

- No SSO configured for an org → the login page's SSO button never renders. If the SP-initiated route is hit directly regardless, `404`.
- Invalid, unsigned, or replayed SAML response → ACS redirects to the frontend with a generic `ssoError=invalid_response` flag. No detail about which specific validation failed is exposed.
- Assertion's email isn't a pre-provisioned `User` in that org → redirect with `ssoError=not_provisioned`. This mirrors standard enterprise-SSO UX (IdPs themselves commonly show an equivalent "you don't have access to this application" message); it isn't a meaningful user-enumeration risk since reaching this point already requires successfully authenticating against the org's own IdP.
- Exchange code missing, expired, already used, or unknown → `401` from `POST /auth/sso/exchange`; frontend shows "session expired, please try again."
- Malformed IdP certificate or SSO URL at config-save time → `400` with the specific validation failure. This one is fine to be specific — it is the org-admin configuring their own org, not an external actor probing the system.

## Testing

A real IdP is not available in CI, so the ACS callback is tested by generating a **real, correctly-signed SAML response** inside the test suite itself: a self-signed test keypair (generated once, checked into test fixtures — not a secret, since it signs nothing real) signs a same-shaped XML assertion that `@node-saml/passport-saml` validates exactly as it would validate a genuine IdP response.

- **Unit:** valid signed assertion for a pre-provisioned user → correct token issuance with the right `role`/`organizationId`; valid assertion for a non-provisioned email → rejected with `not_provisioned`; tampered/invalid signature → rejected; expired assertion → rejected; replayed `InResponseTo` → rejected. `SsoLoginCode` exchange: valid code → tokens issued, code deleted; expired code → `401`, code deleted; already-used code → `401`. Org-admin config validation: malformed URL/certificate → `400`; valid config → persisted, audited.
- **E2E:** configure SAML on a test org via the org-admin endpoints, POST a real signed response to the ACS endpoint, exchange the resulting code via `/auth/sso/exchange`, confirm the returned access token has the correct `role`/`organizationId` for the pre-provisioned user it corresponds to. A second e2e case confirms password login still works unaffected for the same org (coexistence, not replacement).

## Out of Scope

- OIDC/OAuth2 SSO ("Login with Google/Microsoft") — SAML 2.0 only for this pass; a natural, separate fast-follow.
- Just-in-time user provisioning or attribute-based role mapping from SAML assertion attributes — pre-provisioned users only.
- IdP metadata XML/URL auto-import — the org-admin pastes the three IdP fields manually rather than uploading/linking metadata.
- SP-side AuthnRequest signing — most IdPs don't require it; only the IdP's response signature is verified by this feature.
- Certificate-expiry warnings or notifications.
- SSO-enforcement mode (mandatory SSO with no password fallback) — SSO always coexists with password login in this pass.
- Multiple IdPs per org.
- Platform super-admin SSO — super-admin login stays password-only, since it is not org-scoped.
