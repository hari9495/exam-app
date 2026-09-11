# Zoho Wave 2 — parked-branch merge sequencing runbook

**Integration branch:** `integration/zoho-wave2`
**Base:** `origin/main` @ `9359b5e2` (fix(today): kicker date correct in every timezone)
**Assembled:** 2026-09-11, in worktree `.claude/worktrees/integration`
**Status:** all 9 branches merged, green gate passed (two known non-merge failures, see below). **NOT pushed** — awaiting user consent.

## What this bundles

Nine parked Zoho feature branches, each built via SDD in its own worktree and each already carrying a whole-branch opus review (Ready-to-merge YES, INERT-until-configured for provider features). Merged here in **migration-number order** — the one linear migration chain must apply in ascending order.

| # | Merge commit | Branch | Migrations | Notes |
|---|--------------|--------|-----------|-------|
| 1 | `f510d114` | feat/api-usage-metering (Zoho #25) | 210000, 210001_rls | per-key daily usage aggregate |
| 2 | `09fb215e` | feat/careers-site (Zoho #14) | 220000 | public /careers/:orgSlug, two off-by-default flags |
| 3 | `211f7900` | feat/permission-profiles (Zoho #6) | 230000, 230001_rls | named permission-key sets; permissionProfileId in JWT |
| 4 | `ed200901` | feat/job-boards (Zoho #23) | 240000, 240001_rls | org JobBoards + public XML feed; **DEPLOY needs API_ORIGIN** |
| 5 | `6d3b8472` | feat/agency-portal (Zoho #20) | 250000, 250001_rls | passwordless magic-link vendor portal (Next page → FRONTEND_URL) |
| 6 | `681d86ab` | feat/interview-self-booking (Zoho #22 slice) | 260000 | candidate self-books; 4 additive Interview cols (no _rls) |
| 7 | `2c5d4b11` | feat/candidate-sms (Zoho #16) | 270000, 270001_rls | Twilio SMS mirroring email channel; separate opt-out |
| 8 | `8eede072` | feat/sms-providers (extends #16) | 280000 | per-org provider selector + encrypted config blob + registry |
| 9 | `542b6ec1` | feat/whatsapp (Zoho #24) | 290000, 290001_rls | provider-pluggable WhatsApp channel; reusable common/ssrf.ts |

Post-merge fix commit: `b041cb1e` — mock ApiUsageService in the org-controller describe blocks (latent cross-branch collision, see below).

## Conflict resolutions applied (whatsapp was the only conflicting merge)

feat/whatsapp collided with the candidate-sms + sms-providers surfaces (both add a channel beside email). All resolved as additive "keep both SMS and WhatsApp":

- **schema.prisma** — unioned Org additive cols + Candidate/Job backrels + the 4 SMS/WhatsApp models (git had collapsed the near-identical models on shared field lines; reconstructed each in full).
- **pipeline.service.ts** — three-channel `patchEntry` stage-move hook: email + SMS + WhatsApp each in its own fail-open `try` under `if (commsStageId)`; accumulator co-returns any subset of `pendingMessage` / `pendingSmsMessage` / `pendingWhatsappMessage`.
- **app.module.ts, pipeline.module.ts, organizations.controller.ts/.service.ts** — unioned imports/providers/routes/config methods.
- **navs (recruiter/staff/super-admin), types.ts, integrations page.tsx, CandidateDrawer.tsx, PipelineBoard.tsx** — additive unions (both nav entries, both interfaces, both sections/modals).
- **Interleaved spec blocks** (candidates.controller/service, organizations.controller, pipeline.service specs) — git collapsed each branch's appended `describe`/`it` onto shared structural lines; reconstructed each full block from `git show <branch>:<file>` and spliced.

## Green gate (run in this worktree)

Order matters — build shared dist, generate the client, then typecheck, then test.

```bash
cd packages/shared && npx tsc            # rebuild shared dist (no shared source changed this wave, but keep it fresh)
cd apps/api && npx prisma generate       # regenerate client for the unioned schema
cd apps/api && npx tsc --noEmit          # api typecheck — PASS
cd apps/web && npx tsc --noEmit          # web typecheck — PASS
cd apps/api && npx jest                  # 2415 pass
cd apps/web && npx jest                  # 1031 pass
```

**Two known failures, neither from the merge — do not block on them:**
1. `apps/api/.../pipeline/record-visibility.integration.spec.ts` — needs a live SQL Server at localhost:1433; environment-only, passes with a DB.
2. `apps/web/components/ImpersonationBanner.test.tsx` — pre-existing on `origin/main` (1 test).

**Latent collision the gate caught:** careers / sms-config / sms-providers / whatsapp-config `describe` blocks in `organizations.controller.spec.ts` were each authored on branches cut before api-usage added `ApiUsageService` as a required `OrganizationsController` ctor dep. Merged together their TestingModules could not resolve it. Fixed in `b041cb1e` by providing a stub `ApiUsageService` in each. (Was already broken on the branch before the whatsapp merge — the deferred gate simply had never run.)

## Deploy notes (deploy still deferred until ALL dev done)

- One linear migration chain: `prisma migrate deploy` applies 210000 → 290001 in order.
- RLS: every new tenant table ships a paired `_rls` migration; the self-booking cols (260000) are additive on the already-RLS Interview table → no `_rls`.
- Env additions: **API_ORIGIN** (job-boards public feed URL uses API_ORIGIN + /api/v1, not FRONTEND_URL). Provider features (SMS/WhatsApp) are INERT until an org configures a provider — secrets encrypted via OrgSecretsCryptoService.
- No exam-day deploys.

## Push

Merging to shared `main` requires explicit user consent. The assistant does **not** push. When the user is ready:

```bash
git push origin integration/zoho-wave2
```

Then open a PR into `main` (or fast-forward per the team's chosen flow).
