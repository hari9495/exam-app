# Candidate Unsubscribe / Opt-Out (Zoho #9, slice 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let candidates unsubscribe from a recruiting-org's communication emails (honored on the candidate-communications send path), via a reversible token-based public page. Essential emails (exam/interview/offer/portal) always send.

**Architecture:** Two additive `Candidate` columns; the opt-out check + token mint + unsubscribe footer live only in the candidate-communications path (`candidate-emails.service` + `candidate-email-render`); a public token endpoint (resolved the same way as the portal — token is the authorization) toggles the flag; a public web page.

**Tech Stack:** NestJS, Prisma, SQL Server, Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-07-candidate-unsubscribe-design.md

## Global Constraints

- **Base:** branch `feat/candidate-unsubscribe` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. Run jest FROM `apps/api` or `apps/web` (repo-root `npx jest` mis-resolves into a stale sibling worktree on this machine).
- **Additive columns on `candidates` (already tenant-RLS) → NO `_rls` migration, no seed.** Migration number `20260907190000`.
- **Suppression scoped to the candidate-communications path ONLY** (`candidate-emails.service.sendMessage` + its `resend`). Do NOT add opt-out checks to invitations/interviews/offers/auth/portal services — they are exempt by construction.
- **Manual send to an opted-out candidate → throw a clear error (blocked); triggered (`stage_prompt`/`stage_auto`) → skip + log, never throw** (pipeline-safe).
- **Reversible:** POST can opt out (`emailOptedOutAt = now`) or opt back in (clear it).
- **Dedicated `unsubscribeToken`** (NOT `portalToken`), minted lazily on the first candidate-email send when null.
- **Public token resolution mirrors the portal exactly:** resolve the candidate via `tenantPrisma.forTenant({ organizationId: <placeholder>, isSuperAdmin: true }, tx => tx.candidate.findUnique({ where: { unsubscribeToken }, ... }))` — see `resolvePortalCandidate` in `apps/api/src/public-applications/public-applications.service.ts` (~line 277). The token is the authorization.
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — unsubscribeToken + emailOptedOutAt + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Candidate`)
- Create: `apps/api/prisma/migrations/20260907190000_candidate_unsubscribe/migration.sql`

**Interfaces:**
- Produces: `Candidate.unsubscribeToken: string | null` (@unique), `Candidate.emailOptedOutAt: Date | null`.

- [ ] **Step 1: Add fields to `Candidate`:**
```prisma
unsubscribeToken String?   @unique @map("unsubscribe_token")
emailOptedOutAt  DateTime? @map("email_opted_out_at")
```

- [ ] **Step 2: Migration** `20260907190000_candidate_unsubscribe/migration.sql` — add both columns; create the unique index on `unsubscribe_token`. **Match the exact unique-index style `portal_token` uses** — inspect `apps/api/prisma/migrations/20260826100006_candidate_portal_token/migration.sql` and copy its column type (NVARCHAR size) + unique-index form (filtered `WHERE ... IS NOT NULL` or plain) verbatim so a nullable unique behaves identically. `email_opted_out_at DATETIME2 NULL`.

- [ ] **Step 3: Apply + regenerate + typecheck.** From `apps/api`: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: applied, client has the fields, tsc clean.

- [ ] **Step 4: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260907190000_candidate_unsubscribe
git commit -m "feat(unsubscribe): candidate unsubscribeToken + emailOptedOutAt columns"
```

---

### Task 2: Opt-out enforcement + token mint + unsubscribe footer

**Files:**
- Modify: `apps/api/src/candidate-emails/candidate-emails.service.ts` (`sendMessage`, `resend`)
- Modify: `apps/api/src/candidate-emails/candidate-email-render.ts` (`buildCandidateEmailHtml`)
- Test: `apps/api/src/candidate-emails/candidate-emails.service.spec.ts` (+ candidate-email-render spec if present)

**Interfaces:**
- Consumes: `Candidate.emailOptedOutAt` / `unsubscribeToken` (T1).
- Produces: opt-out-aware send; `buildCandidateEmailHtml` accepts `unsubscribeUrl`.

- [ ] **Step 1: Footer in `buildCandidateEmailHtml`.** Add an optional `unsubscribeUrl?: string | null` to its opts; when present, append a footer: `<p style="color:#666;font-size:12px;">To stop receiving these emails, <a href="{escaped unsubscribeUrl}">unsubscribe</a>.</p>`. When absent, no footer (keeps existing callers/tests valid). Escape the URL.

- [ ] **Step 2: Enforcement + mint in `sendMessage`.** After the candidate/entry is resolved (inside the existing `forTenant` scope), read `candidate.emailOptedOutAt` and `candidate.unsubscribeToken` (add to the existing select):
  - If `emailOptedOutAt` is set:
    - `input.source === 'manual'` → throw `ConflictException('This candidate has unsubscribed from emails')` — no send, no CandidateEmail row.
    - else (`stage_prompt`/`stage_auto`) → log a grep-able line and return WITHOUT sending or creating a row; do not throw.
  - Else: if `unsubscribeToken` is null, mint one (`randomUUID()`) via `tx.candidate.update`; compute `unsubscribeUrl = ${FRONTEND_URL}/unsubscribe/{token}` (use the same base-URL source the codebase uses for candidate email links — check candidate-email-render / offers for `FRONTEND_URL`/appBaseUrl) and pass it into `buildCandidateEmailHtml`. Send as today.
- [ ] **Step 3: `resend` honors opt-out.** The resend path must apply the same rule (blocked if opted-out — resend is recruiter-initiated/manual, so throw the clear error).

- [ ] **Step 4: Tests.** opted-out + manual → throws, no send, no row; opted-out + stage_prompt/stage_auto → skipped (no send/row, no throw, logged); not-opted-out + null token → mints token + sends with footer link containing the token; not-opted-out + existing token → reuses it (no re-mint); footer present only when unsubscribeUrl passed; resend blocked when opted-out. Extend candidate-emails.service.spec.ts.

Run: `npx jest candidate-emails` (from apps/api). Expected: PASS.

- [ ] **Step 5: Full api suite + tsc + commit.** `npx jest` (apps/api) + `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/candidate-emails
git commit -m "feat(unsubscribe): honor opt-out + add unsubscribe footer on candidate emails"
```

---

### Task 3: Public unsubscribe API

**Files:**
- Modify: `apps/api/src/public-applications/public-applications.controller.ts` (add the two routes) + `public-applications.service.ts` (resolve + toggle) — OR a small dedicated public controller mirroring the portal routes.
- Create: `apps/api/src/public-applications/dto/unsubscribe.dto.ts`
- Test: controller + service spec

**Interfaces:**
- Consumes: `Candidate.unsubscribeToken` / `emailOptedOutAt` (T1).
- Produces: `GET /public/unsubscribe/:token` → `{ optedOut, orgName }`; `POST /public/unsubscribe/:token` `{ optedOut }` → new state.

- [ ] **Step 1: Service.** `getUnsubscribe(token)` and `setUnsubscribe(token, optedOut)` — resolve the candidate the SAME way `resolvePortalCandidate` does (`forTenant({ organizationId: <placeholder>, isSuperAdmin: true }, tx => tx.candidate.findUnique({ where: { unsubscribeToken: token }, select: { id, organizationId, emailOptedOutAt } }))`); 404 (NotFoundException) if no match. `getUnsubscribe` also fetches the org name for display. `setUnsubscribe` updates `emailOptedOutAt = optedOut ? new Date() : null` and returns `{ optedOut }`. Return minimal data (no candidate PII beyond org name).

- [ ] **Step 2: DTO.** `UnsubscribeDto { @IsBoolean() optedOut: boolean }`.

- [ ] **Step 3: Controller routes** — `@Get('unsubscribe/:token')` and `@Post('unsubscribe/:token')` (`@Body() UnsubscribeDto`), public (no auth guard — mirror the existing `@Get('portal/:portalToken')` / `applications/:statusToken` routes' decorators exactly, incl. any `@Public()`/skip-auth marker they use).

- [ ] **Step 4: Tests.** GET known token → `{ optedOut, orgName }`; GET unknown → 404; POST optedOut:true → sets emailOptedOutAt; POST optedOut:false → clears it; resolution uses the portal's super-admin/token model (not the caller's tenant). RED then GREEN for the controller spec.

Run: `npx jest public-applications` / `npx jest unsubscribe` (from apps/api). Expected: PASS.

- [ ] **Step 5: Full api suite + tsc + commit.**
```bash
git add apps/api/src/public-applications
git commit -m "feat(unsubscribe): public token-based unsubscribe endpoints"
```

---

### Task 4: Web — public unsubscribe page (+ compose error surfacing)

**Files:**
- Create: `apps/web/app/unsubscribe/[token]/page.tsx` (unauthenticated public page)
- Possibly a small hook/inline fetch for the public endpoints (mirror how `/apply/[applyToken]` or the portal page calls its public API — those pages likely fetch directly, not via the authed api-client)
- Modify (optional, if cheap): the candidate-email compose modal (`SendMessageModal`) to surface the 409 "unsubscribed" error clearly
- Test: `apps/web/app/unsubscribe/[token]/page.test.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /public/unsubscribe/:token` (T3).

- [ ] **Step 1: Public page.** `apps/web/app/unsubscribe/[token]/page.tsx` — unauthenticated (outside the v2 authed shell, like `/apply/[applyToken]`): on load GET the state; render org name + current status; a button to Unsubscribe (POST optedOut:true) / Re-subscribe (POST optedOut:false) with a confirmation message. Handle the 404 (invalid link) state. Use the same public-fetch approach `/apply/[applyToken]` uses (check that page for how it hits the public API base URL — do NOT use the authed api-client that attaches a token). No `@exam-platform/shared` runtime-value import.

- [ ] **Step 2: Failing page test.** Mock the public GET → renders current state; clicking Unsubscribe calls POST with optedOut:true and reflects the new state; invalid-token → error state. Run `npx jest unsubscribe` (from apps/web). Expected: FAIL → implement → GREEN.

- [ ] **Step 3: (Optional, cheap) compose error surfacing.** If the send mutation returns 409 with the "unsubscribed" message, show it in `SendMessageModal` (many modals already surface API errors — only add if it isn't already surfaced generically). If it's already handled by the generic error path, do nothing and note it.

- [ ] **Step 4: Run tests + tsc + commit.** `npx jest unsubscribe` (apps/web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/app/unsubscribe
git commit -m "feat(unsubscribe): public unsubscribe page"
```

---

## Self-Review

**Spec coverage:** columns + migration (T1) ✓; opt-out enforcement (manual-block/triggered-skip) + lazy token mint + footer (T2) ✓; public reversible endpoints resolved via the portal token model (T3) ✓; public web page (T4) ✓. Essential emails exempt by construction (no changes to those services — reinforced in Global Constraints). Reversible (T3 POST clears the flag).

**Placeholder scan:** No TBD. T1 says "match portal_token's migration" (concrete file). T2/T3 say "mirror resolvePortalCandidate / the portal routes' decorators" (concrete references). T4 says "mirror /apply/[applyToken]'s public-fetch approach." The FRONTEND_URL/base-URL source is "check candidate-email-render/offers" — a concrete lookup.

**Type/name consistency:** `unsubscribeToken`/`emailOptedOutAt` spelled identically across T1 schema, T2 read/mint, T3 resolve/toggle. `buildCandidateEmailHtml` gains `unsubscribeUrl?` (T2) — a backward-compatible optional so existing callers/tests stay valid. Endpoints `GET/POST /public/unsubscribe/:token` match T3↔T4. Migration `20260907190000` unique/ordered.

**Load-bearing risks:** (a) suppression must stay scoped to candidate-emails.service — reinforced (don't touch other send services); (b) token resolution must use the portal's super-admin/token model (unauthenticated public read across tenants, token = auth) — T3 references resolvePortalCandidate; (c) manual-block vs triggered-skip distinction — T2 tests both source branches.
