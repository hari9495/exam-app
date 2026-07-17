# Forgot Password — Design Spec

## Context & Scope

The staff login page (`apps/web/app/login/page.tsx`, shared by the recruiter/org-admin/panel consoles) has no password-recovery path today — nothing exists: no reset-token model, no reset endpoint, no reset UI. Staff who forget their password have no self-service way to regain access.

**In scope**: a forgot-password request flow and a reset-password flow for staff accounts (`User` model, `apps/api/prisma/schema.prisma:40-55`).

**Out of scope**: candidates. Candidates authenticate via invite links, not passwords (`apps/web/app/(candidate)/`), so this feature doesn't touch that flow. No changes to the login endpoint itself, no changes to how invitations work.

## Why the Organization Slug Is Required Here Too

Staff email is only unique **per organization** — the schema enforces `@@unique([organizationId, email])`, not a global unique on email. The same email string can legitimately exist at two different organizations. The forgot-password request therefore asks for the same `organizationSlug` + `email` pair the login form already asks for, and looks up exactly one matching account — consistent with how `apps/api/src/auth/auth.service.ts`'s `login()` already scopes its lookup.

## Architecture & Data Flow

Two new backend endpoints, two new frontend pages, one new table:

- `POST /auth/forgot-password` `{ organizationSlug, email }` — looks up the user, generates a reset token, emails a link `${FRONTEND_URL}/reset-password/{token}`, always returns the same generic success message regardless of whether a match was found.
- `POST /auth/reset-password` `{ token, newPassword }` — validates the token (exists, unexpired, unused), updates the password hash, revokes all the user's existing refresh tokens, marks the token used.
- New `PasswordResetToken` model: `id`, `userId` (FK to `User`), `tokenHash` (sha256 of the raw token), `expiresAt` (15 minutes from creation), `usedAt` (nullable — set on successful reset, making the token single-use), `createdAt`.
- `apps/web/app/login/page.tsx` gains a "Forgot password?" link under the password field, pointing to a new `apps/web/app/forgot-password/page.tsx` (org slug + email form). On submit it shows a generic "check your email" success state. The emailed link opens a new `apps/web/app/reset-password/[token]/page.tsx` (new password + confirm form), which on success redirects to `/login`.

## Backend Detail

- **Token generation**: reuses the exact pattern already used for invitations (`apps/api/src/invitations/invitations.service.ts`'s `generateToken()`, `randomBytes(32).toString('hex')`). Unlike invitation tokens, the raw reset token is never persisted — only `sha256(token)` is stored in `PasswordResetToken.tokenHash`. The raw token exists only in the emailed link and briefly in request memory, so a database leak alone cannot be used to reset accounts. This is a deliberate escalation over the invitation-token pattern, justified by the higher blast radius of a leaked reset token (full account takeover vs. one exam's worth of candidate access).
- **Rate limiting**: `STRICT_AUTH_THROTTLE` (already applied to `/auth/login` and `/auth/refresh` via `@Throttle`, 5 requests/60s — `apps/api/src/rate-limit-tiers.ts`) is applied to `/auth/forgot-password` as well. No new throttle tier.
- **Enumeration guard**: the response to `/auth/forgot-password` is identical whether the org/email matched a real account or not — same message, and the code path does not short-circuit before the email-send branch in the not-found case (a deliberate no-op "as if" the send happened), so response timing doesn't leak account existence either. This prevents the form being used to probe for valid org-slug/email combinations.
- **Session revocation on reset**: on a successful `/auth/reset-password`, every non-revoked `RefreshToken` row for that `userId` gets `revokedAt` set to now, reusing the exact revocation update already used in `auth.service.ts:121`. This forces re-login on every other device/session — if the reset happened because the account was compromised, this ends any session an attacker already held.
- **Password policy**: the new password is validated with the same `@MinLength(8)` rule already used for staff account creation (`apps/api/src/users/dto/create-user.dto.ts`). No new password-complexity rules are introduced.
- **Audit trail**: a `password.reset` audit event is recorded via the existing `AuditService`, following the same call shape already used for `login.success` in `auth.service.ts` — this makes resets visible in the org's existing Audit Log screen with no changes needed there.
- **Email delivery**: reuses the existing `apps/api/src/email/email.service.ts`, the same service invitations already send through. No new email provider or template system.

## Frontend Detail

Both new pages reuse the split-screen shell and primitives from the recently-redesigned login page (`apps/web/app/login/page.tsx`): the same branding-aware left panel via `useBranding`, the `Input`/`Button` primitives (with their `icon`/`loading` props), `lucide-react` icons, and `status.*` tone tokens for error states — so the flow reads as a continuation of login, not a bolted-on separate design.

- **`apps/web/app/forgot-password/page.tsx`**: org slug + email fields (`Building2`/`Mail` icons, matching login's field styling exactly). On submit, replaces the form with a generic "If that account exists, we've sent a reset link to that email" message — no state distinguishing a real match from a non-match, per the enumeration guard. A "Back to login" link returns to `/login`.
- **`apps/web/app/reset-password/[token]/page.tsx`**: new-password + confirm-password fields (`Lock` icon, reusing login's show/hide toggle pattern). Submit is disabled until both fields are non-empty and match. On an expired, invalid, or already-used token (surfaced by the backend's validation), the page shows a specific error state ("This reset link is invalid or has expired") with a link back to `/forgot-password` to request a new one — this is fine to be specific rather than generic, since at this point the thing being validated is the token itself, not a guessed email/org pair, so there's no enumeration risk in saying "this token doesn't work."
- **`apps/web/app/login/page.tsx`**: gains a "Forgot password?" link, small text under the password field, pointing to `/forgot-password`.

## Error & Empty States

- Forgot-password form: no per-field validation errors beyond standard required-field browser validation; the always-generic success message is the only outcome shown after submit (network/server errors still show a generic "something went wrong, try again" banner, matching the login page's existing error-banner style).
- Reset-password form: mismatched passwords disable the submit button with inline helper text; an invalid/expired/used token is only discovered on submit (via `POST /auth/reset-password`'s response) — there's no separate token-validation endpoint, so the page doesn't pre-check the token on load. The error state ("This reset link is invalid or has expired") replaces the form only after a submit attempt fails for that reason.

## Testing Approach

- **Backend**: unit tests for `forgot-password` (generic response regardless of match — asserted by checking both a real and a fake org/email produce byte-identical responses; token is stored hashed, not plaintext; throttle tier applies) and `reset-password` (valid reset succeeds and updates the password hash; expired token rejected; already-used token rejected; other active sessions are revoked; `password.reset` audit event is recorded) — following the existing conventions in `apps/api/src/auth/auth.service.spec.ts`.
- **Frontend**: page tests for both new pages (form submission behavior, generic-success state, invalid-token state) plus an update to `apps/web/app/login/page.test.tsx` asserting the "Forgot password?" link exists and points to `/forgot-password`.
- **No new e2e golden-path spec**: this is additive to the existing login flow rather than a change to any of the 7 golden-path specs' fixtures, so none of them need updating.
