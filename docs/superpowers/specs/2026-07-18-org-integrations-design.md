# Per-Organization Email & AI API Key Configuration — Design

## Problem

Two external-service credentials are currently platform-wide, shared across every customer organization, with no way for an organization to use its own:

- **Email**: `EmailService` (`apps/api/src/email/email.service.ts`) reads a single flat `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` from the platform's own `.env`. Every organization's invite, welcome, and password-reset emails go out from this one shared account, with a hardcoded `from` address (`'no-reply@exam-platform.test'`).
- **AI API key**: `ANTHROPIC_API_KEY` is read directly from `process.env` in four separate places — each instantiates its own `Anthropic` client with no organization context: `apps/api/src/jobs/processors/claude-question-generation.client.ts`, and three sites in the separate `apps/exam-runtime` service (`proctoring-analysis/claude-proctoring.client.ts`, `attempt-insight/claude-insight.client.ts`, `code-review/claude-code-review.client.ts`). Every organization's AI usage bills against the same platform-wide key, even though `AiJob` and `AiCreditUsage` already track usage per-organization.

Customers who want their platform emails to come from their own domain, or their AI usage to bill against their own Anthropic account, have no way to do that today.

## Scope

Let an org_admin self-serve both settings from a new "Integrations" section on the existing Settings page — the same self-service pattern already used for branding/colors. Two specific, typed settings (SMTP configuration, one AI API key) — not a generic secrets framework. Both are opt-in: an organization that hasn't configured either continues to work exactly as today, transparently falling back to the platform's shared credentials. Applies to all four AI call sites across both `apps/api` and `apps/exam-runtime` (they already share one database via one Prisma schema, so this is a bounded extension, not a new service integration), not just the one inside `apps/api`.

## Schema

Add nullable columns directly to `Organization` (`apps/api/prisma/schema.prisma`), matching the existing precedent of branding fields (`primaryColor`, `accentColor`, `logoPath`) living directly on this model rather than a side table:

- `smtpHost String?`, `smtpPort Int?`, `smtpUser String?`, `smtpPasswordEncrypted String?`, `emailFromAddress String?`
- `aiApiKeyEncrypted String?`

All nullable. An organization with none of these set is functionally unchanged from today.

## Encryption at rest

A new `OrgSecretsCryptoService` in `packages/shared` (so both `apps/api` and `apps/exam-runtime` can use it), implementing AES-256-GCM via Node's built-in `crypto` module — no new npm dependency, consistent with how `randomBytes`/`createHash` are already used throughout this codebase for tokens. The master key comes from a new env var, `ORG_SECRETS_ENCRYPTION_KEY` (a 32-byte key, hex-encoded), duplicated into both `apps/api/.env` and `apps/exam-runtime/.env` — matching the codebase's existing pattern of duplicating shared secrets across both apps' env files (`INTERNAL_SERVICE_SECRET`, `JWT_ACCESS_SECRET`, and others are already duplicated this way).

- `encrypt(plaintext: string): string` — returns one opaque string (IV + auth tag + ciphertext encoded together, e.g. `base64(iv).base64(authTag).base64(ciphertext)`), so each secret needs exactly one nullable column, no separate IV/tag columns.
- `decrypt(blob: string): string` — inverse. Throws if the blob is malformed or the auth tag doesn't verify (tamper detection is a side effect of GCM, not additional code).

`smtpPasswordEncrypted` and `aiApiKeyEncrypted` store the output of `encrypt()`. Plaintext values are decrypted only at the moment of use (building a transporter, building an `Anthropic` client) and never logged, never returned by any API response, never included in audit metadata.

## Email

`EmailService.send()`'s input gains an optional `organizationId: string`. Behavior:

1. If `organizationId` is present and that organization has `smtpHost` set: build (and cache, keyed by organization id, alongside the existing single platform-wide transporter cache) a nodemailer transporter from that organization's decrypted `smtpUser`/`smtpPasswordEncrypted`/`smtpHost`/`smtpPort`, and use `emailFromAddress` (falling back to the platform's hardcoded `from` if the organization set SMTP but left `emailFromAddress` blank).
2. Otherwise: exactly today's behavior — the single platform-wide transporter (with its Ethereal-fallback-when-`SMTP_HOST`-unset behavior, unchanged), and the hardcoded `from` address.

Callers pass their own already-known `organizationId` through:
- `AuthService.forgotPassword()` — already resolves `org` before sending; passes `org.id`.
- `OrganizationsService.create()`'s welcome email — **always uses the platform default**, unconditionally, regardless of any org SMTP setting. A brand-new organization cannot have configured its own SMTP yet (nothing exists for its org_admin to have logged into and set it from) — the welcome email that lets that first org_admin ever reach the app must not depend on settings that can't exist yet.
- `UsersService.inviteSuperAdmin()` / `promoteSuperAdmin()` — always use the platform default. These are platform-level actions creating/promoting a `super_admin` (`organizationId: null`); no customer organization's SMTP applies.

## AI API key

A shared `resolveAiApiKey(organizationId: string): Promise<string>` helper (in `packages/shared`, alongside `OrgSecretsCryptoService`): looks up the organization's `aiApiKeyEncrypted`, decrypts and returns it if set, otherwise returns `process.env.ANTHROPIC_API_KEY`.

Each of the four Claude client classes (`ClaudeQuestionGenerationClient`, `ClaudeProctoringClient`, `ClaudeInsightClient`, `ClaudeCodeReviewClient`) changes from building one `Anthropic` client once at construction time (from the global env var) to building an `Anthropic` client per call, using the key `resolveAiApiKey()` returns for that call's organization. Constructing an SDK client is cheap (no network call), so this has no meaningful performance cost.

Every call site already has `organizationId` in scope immediately before it calls its Claude client today (confirmed for all three `exam-runtime` sites: `AttemptAnalysisService`, `AttemptInsightService`, and `CodeReviewService` each already resolve `organizationId` via `Attempt → Invitation → Exam` before calling their respective client) — it only needs to be threaded through as a parameter to the client method, no new database lookups required anywhere.

## Frontend

Settings already exists as a route group with sibling pages, e.g. `apps/web/app/(org-admin)/settings/branding/page.tsx`. A new sibling page, `apps/web/app/(org-admin)/settings/integrations/page.tsx`, reachable from the same Settings navigation branding already uses, built with the same `Input`/`Button`/`Card`/`useToast` primitives:

- **SMTP form**: host, port, user, password, from address. On submit, calls the save endpoint; a validation failure (see below) surfaces inline exactly like every other form's error handling in this codebase.
- **AI API key form**: a single field.
- Once saved, the secret value is **never redisplayed**. The UI shows a "Configured ✓" state (with the non-secret fields like host/port/from-address still visible for reference) and a "Replace" action that opens a fresh, empty form — the same principle as a password field never echoing its stored value back.

## Backend API

New endpoints, gated by the existing `org:manage_settings` permission (same as the current branding endpoints), likely on `OrganizationsController` alongside the existing branding routes:

- **`GET /organizations/integrations`** → `{smtpConfigured: boolean, aiKeyConfigured: boolean, smtpHost, smtpPort, emailFromAddress}` (the non-secret SMTP fields are safe to return for display; the password and AI key never are).
- **`PATCH /organizations/integrations/smtp`** — body `{host, port, user, password, fromAddress}`. Before saving: opens a real SMTP connection and authenticates via nodemailer's `transporter.verify()` (no email sent) using the submitted credentials. On failure, returns a 400 with a clear message and saves nothing. On success, encrypts the password and persists all fields.
- **`PATCH /organizations/integrations/ai-key`** — body `{apiKey}`. Before saving: the installed `@anthropic-ai/sdk` (v0.32.1) exposes no free metadata/list endpoint — only `messages.create()` actually calls the API — so validation is one `messages.create()` call with `max_tokens: 1` and a single trivial user message (e.g. `"Hi"`), using the submitted key. This is the smallest real request the API supports; a 401 means the key is invalid (reject with 400 and a clear message, save nothing), any other successful response confirms the key works. On success, encrypts and persists the key.
- Both successful saves record an audit event (`organization.smtp_configured` / `organization.ai_key_configured`, `entityType: 'organization'`) with no secret material in the metadata — only that a change occurred and by whom.
- No `DELETE`/reset-to-platform-default endpoint in this iteration — "Replace" always requires entering new working credentials; there's no path to explicitly clear back to platform defaults (out of scope, see below).

## Out of scope

- Any way to explicitly clear a configured integration back to platform defaults (only "replace with new working credentials" exists; not "unset").
- Any generic "integrations" or "secrets" framework — this is exactly two typed settings, not an extensible system.
- Per-org billing/quota display specifically for the AI key (usage accounting via `AiCreditUsage` already exists and is unaffected by this feature; surfacing it in the UI is separate work).
- Any platform-level (`super_admin`) email or AI configuration — those always use the platform's own credentials, unconditionally, by design (see Email and AI API key sections above).
- Multiple SMTP/AI-key configurations per organization (e.g., different senders for different purposes) — one of each, per organization.
