# Phase 3b — Exam Runtime Service Isolation Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-09
**Depends on:** Phase 0 (Foundation), Phase 1 (Core Exam MVP), Phase 2a-2c (Anti-Cheat, Live Monitoring, AI Proctoring), Phase 3a (White-Label Branding) — all merged to `main`.

---

## 1. Context and Scope

This is the second sub-phase of Phase 3 ("White-Label & Scale") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Section 15):

3a. White-Label Branding (done)
3b. **Exam Runtime Service Isolation** (this spec)
3c. Multi-Region Deployment & Scale

**Why now, and why local-only:** Phase 3c's multi-region/10K-concurrent load-testing work needs the candidate-facing exam-taking path to be independently scalable from the admin/CMS API — today they're one NestJS process (`apps/api`), so there's nothing to scale independently yet. This sub-phase does the architectural split (a second, independently-runnable service) without touching cloud deployment: no Terraform, no CI/CD, no containers. The project has an Azure SQL resource available, but it is not wired to this project — the current local SQL Server (`localhost:1433`) remains the dev/test database for both services, unchanged. Cloud deployment of either service is deferred to whenever a real Azure deployment target is actually being set up, the same "don't design against infrastructure that doesn't exist" posture Phase 3a used to defer custom domains/SSL.

**Goal of this sub-phase:** `apps/exam-runtime` becomes a second, independently startable NestJS app that owns the entire synchronous chain that fires on a candidate's actions — login → start/resume attempt → autosave → submit → auto-grade → proctoring analysis — with zero admin-side runtime dependency in that chain. `apps/api` keeps every recruiter/admin-facing concern, including reviewing a candidate's attempt, and reads exam-runtime's writes straight from the shared database.

### In scope

- New `apps/exam-runtime` workspace app: own `main.ts`, own port (`EXAM_RUNTIME_PORT` env var), own `package.json`, started independently via `npm run start:dev --workspace=apps/exam-runtime` — same pattern as `apps/api`/`apps/web` today. No Docker, no compose.
- Move to `apps/exam-runtime`: `CandidateAuthModule`, the candidate-facing half of `attempts/` (`attempt.controller.ts`, `attempt.service.ts` + specs, `last-seen.interceptor.ts`, `proctoring-severity.ts` + specs), `MonitoringModule` (gateway + service), `ProctoringAnalysisModule`, `GradingModule` — each moved as a whole folder, imports updated.
- New module in `apps/api`: `attempts-admin/` (renamed from today's `attempts.controller.ts` + `attempts-admin.service.ts`), for recruiter-facing attempt review. Stays in `apps/api`; reads the shared DB directly.
- New workspace `packages/shared` (`@exam-platform/shared`): `PrismaModule`/`PrismaService`, `TenantPrismaService`/`TenantContext`, `AuditModule`, and DTOs/enums both services need. Root `package.json`'s `workspaces` extended from `["apps/*"]` to `["apps/*", "packages/*"]`.
- Both services depend on `@exam-platform/shared` instead of duplicating Prisma/audit code.
- Env var convention (`NEXT_PUBLIC_EXAM_RUNTIME_BASE`) established for whenever a candidate-facing or live-monitoring frontend is built — none exists today (confirmed: `apps/web/app` only has `dashboard/`, `login/`, `settings/branding/`), so this sub-phase makes **no frontend changes**.

### Explicitly out of scope (deferred)

- **Cloud deployment, Terraform, CI/CD, containers.** No real deployment target is decided yet; Azure SQL exists but isn't connected to this project. Revisited once an actual Azure deployment is being set up — that work should be designed against the real target, not a throwaway local Docker setup.
- **Load testing at scale.** Phase 3c's job, once there's real infrastructure to test against.
- **Any new frontend** (candidate exam-taking UI, live-monitoring dashboard UI). Neither exists yet in `apps/web`; only the env-var convention for a future consumer is established here.
- **Cross-service HTTP calls on the candidate's hot path.** Not needed there — both services read/write the same shared database directly for everything a candidate triggers. **Narrow exception, discovered during planning:** `AttemptsAdminService` (staying in `apps/api`) has three recruiter-triggered actions — `forceSubmit`, `sendMessage`, `reanalyze` — that call directly into logic moving to `apps/exam-runtime` (`AttemptSettlementService.finalize`, `MonitoringGateway.emitMessageSent`, `AttemptAnalysisService.analyze`), not just reads. These are low-frequency admin actions (a recruiter clicking a button at most a few times per exam), categorically different traffic from the high-volume candidate hot path this sub-phase protects, so a small internal-only HTTP surface on `apps/exam-runtime` is in scope for exactly these three calls. See Section 4.
- **Splitting `InvitationsModule`, `ExamsModule`, `QuestionsModule`.** These stay entirely in `apps/api`. `apps/exam-runtime` only *reads* the `Exam`/`Question`/`Invitation` rows it needs (the same way it reads today, just from a different process) — it never writes them.
- **A new integration test proving both services can safely run concurrently against the shared DB.** `TenantPrismaService`'s RLS session-context pattern is already per-connection/per-transaction (see Section 3); running two processes each with their own connection pool carries the same guarantee as today's single process, just twice. This is an explicit assumption, not independently verified by a new test in this sub-phase.

---

## 2. Architecture & Module Split

Two independent NestJS processes, one shared database:

```
apps/api (admin/CMS)                    apps/exam-runtime (candidate hot path)
├─ AuthModule (staff)                    ├─ CandidateAuthModule
├─ OrganizationsModule                   ├─ AttemptModule (candidate side only:
├─ UsersModule                           │    attempt.controller/service —
├─ QuestionsModule                       │    start/resume/save/submit)
├─ ExamsModule                           ├─ MonitoringModule (gateway + service)
├─ CandidatesModule                      ├─ ProctoringAnalysisModule
├─ InvitationsModule                     ├─ GradingModule
├─ AttemptsAdminModule (new,             └─ InternalModule (new — force-submit,
│    calls InternalModule below               reanalyze, message-sent-notify;
│    for 3 actions, see Section 4)            shared-secret authenticated)
└─ RbacModule
        │                                          │
        └──────────────────┬───────────────────────┘
                            ▼
                  packages/shared (Prisma, TenantPrisma,
                  TenantContext, AuditModule, shared DTOs)
                            │
                            ▼
                     SQL Server (one DB, shared schema)
```

**Module moves, concretely:**
- `apps/api/src/attempts/attempt.controller.ts`, `attempt.service.ts` (+ specs), `last-seen.interceptor.ts` (+ spec), `proctoring-severity.ts` (+ spec) → `apps/exam-runtime/src/attempts/`
- `apps/api/src/attempts/attempts.controller.ts`, `attempts-admin.service.ts` (+ spec) → `apps/api/src/attempts-admin/` (new module, same controller/service logic, new home)
- `apps/api/src/candidate-auth/`, `apps/api/src/monitoring/`, `apps/api/src/proctoring-analysis/`, `apps/api/src/grading/` (entire folders, unchanged internally) → `apps/exam-runtime/src/`
- `apps/api/src/prisma/`, `apps/api/src/audit/` → `packages/shared/src/`, re-exported as `@exam-platform/shared`; both apps import from there instead of relative `../prisma/...`/`../audit/...` paths

**No data model changes.** No new tables, no new columns, no RLS policy changes — this is a process/module reorganization against an unchanged schema.

---

## 3. Shared Package (`packages/shared`)

A new npm workspace, `@exam-platform/shared`, containing:

- **`PrismaModule`/`PrismaService`** — the raw, unscoped Prisma client. Needed by `apps/exam-runtime` because `CandidateAuthService` looks up invitations by token via `this.prisma.invitation.findUnique(...)` directly, deliberately bypassing RLS/tenant context — the invitation token itself is the authorization, not org membership. This bypass pattern moves unchanged.
- **`TenantPrismaService`/`TenantContext`** — the RLS session-context helper (`sp_set_session_context`), used by `apps/api`'s staff-authenticated routes. `apps/exam-runtime` does not currently need this for its own hot path (candidate auth bypasses RLS as above), but it's exported from the shared package for consistency and in case a future exam-runtime endpoint needs org-scoped reads.
- **`AuditModule`** — both services write audit log entries (e.g. exam-runtime logs an attempt-submitted event; `apps/api` logs an org-settings-changed event) against the same `audit_logs` table.
- **Shared DTOs/enums** — types both sides need identically (e.g. attempt status enum), to avoid two independently-drifting copies.

Both `apps/api` and `apps/exam-runtime` add `@exam-platform/shared` as a workspace dependency in their respective `package.json` files.

---

## 4. Cross-Cutting Concerns

**Monitoring gateway placement:** `MonitoringModule`'s WebSocket gateway moves wholesale into `apps/exam-runtime`, since candidate events (attempt progress, anti-cheat signals) originate there. There is no live-monitoring dashboard frontend built yet, so there is no existing UI to repoint in this sub-phase — the gateway keeps working for its current (backend/test-covered) consumers. When a live-monitoring dashboard is eventually built, it connects to `apps/exam-runtime`'s origin directly via `NEXT_PUBLIC_EXAM_RUNTIME_BASE`.

**Candidate JWT / session context:** fully self-contained within `apps/exam-runtime` — `CandidateJwtStrategy` and its guard move together with `CandidateAuthModule`, with no dependency back on `apps/api`.

**Grading → results visibility:** `GradingModule` (now in `apps/exam-runtime`) writes scores to the DB when a candidate submits. `apps/api`'s `attempts-admin` module reads those same columns for recruiter-facing results/attempt-review — no cross-service call, the same "shared DB is the integration point for reads" pattern already used for exam-runtime reading `Exam`/`Question` definitions that `apps/api` writes.

**Recruiter actions that must reach exam-runtime logic (internal HTTP surface):** `AttemptsAdminService.forceSubmit`, `.sendMessage`, and `.reanalyze` each call into logic moving to `apps/exam-runtime` — this was discovered during implementation planning, not anticipated when the module split was first drawn. Each is resolved as follows:

- **`forceSubmit`:** `apps/api` validates the attempt belongs to the caller's org (as it does today), then calls `POST {EXAM_RUNTIME_INTERNAL_URL}/internal/attempts/:id/force-submit`. `apps/exam-runtime`'s new `InternalModule` looks up the attempt/exam itself (plain `PrismaService` read — the org check already happened in `apps/api`) and calls `AttemptSettlementService.finalize(tx, exam, attempt, 'force_submitted')`, returning `{ status }`.
- **`sendMessage`:** the `CandidateMessage` row write **stays in `apps/api`** — it's a plain write to a shared, unowned-by-either-service table, no exam-runtime logic needed for the write itself. Only the live-socket notification crosses services: after creating the row, `apps/api` calls `POST /internal/monitoring/message-sent` with `{ examId, attemptId, candidateId, sentAt }`, and `InternalModule` forwards that straight to `MonitoringGateway.emitMessageSent`.
- **`reanalyze`:** `apps/api` validates attempt ownership (as today), then calls `POST /internal/attempts/:id/reanalyze`, which runs `AttemptAnalysisService.analyze(attemptId)` and responds `204`. `apps/api` then reads the resulting `ProctoringAnalysis` row itself from the shared DB, exactly as it does today — the internal call's only job is to trigger the analysis, not to return it.

**Authentication for the internal surface:** a shared-secret header (`INTERNAL_SERVICE_SECRET`, a new env var present in both services' `.env`), checked by a small `InternalAuthGuard` in `apps/exam-runtime` — not staff JWT, not candidate JWT, no RBAC. This deliberately avoids pulling `apps/api`'s `AuthModule`/`RbacModule` into `apps/exam-runtime`: the caller (`apps/api`) has already done the real authorization (staff JWT + `exam:manage` permission check) before making the internal call, so the internal endpoint only needs to confirm the caller is `apps/api` itself, not re-derive who the recruiter is. This surface is never reachable from a browser — there is no CORS configuration for it and it is not part of either service's public API contract.

**Connection pooling under two processes:** each service gets its own Prisma connection pool from the same `packages/shared` `PrismaService` class (two separate instances, one per process). `TenantPrismaService.forTenant()`'s existing session-context reset (`finally` block clearing `app_current_org`/`app_is_super_admin` after every transaction) is unaffected by running in two processes instead of one — the reset is already scoped per-transaction/per-connection, not per-process.

---

## 5. Running Locally

- `npm run dev:api` → `apps/api` on `API_PORT` (unchanged, default 3001)
- `npm run dev:exam-runtime` (new script) → `apps/exam-runtime` on `EXAM_RUNTIME_PORT` (new env var)
- `apps/api` gets a new `EXAM_RUNTIME_INTERNAL_URL` env var (e.g. `http://localhost:3002`) so `AttemptsAdminService` knows where to send the 3 internal calls described in Section 4
- Both read the same `DATABASE_URL` (local SQL Server, unchanged)
- Both read the same `INTERNAL_SERVICE_SECRET` (new env var) — `apps/api` sends it as a header on the 3 internal calls described in Section 4; `apps/exam-runtime` checks it
- `apps/web` continues to talk only to `apps/api` for now (`NEXT_PUBLIC_API_BASE`) — no frontend consumes `apps/exam-runtime` yet, so `NEXT_PUBLIC_EXAM_RUNTIME_BASE` is defined as a convention/env var but has no consumer in this sub-phase

---

## 6. Testing Approach

- Unit tests move with their modules (`attempt.service.spec.ts`, `candidate-auth.service.spec.ts`, `monitoring.gateway.spec.ts`, etc. → `apps/exam-runtime`), same Jest config pattern `apps/api` already uses.
- `apps/exam-runtime` gets its own `test/jest-e2e.json` + e2e suite, mirroring `apps/api/test/`. The existing `apps/api/test/exam-taking-runtime.e2e-spec.ts` moves there, since it exercises the full candidate flow end-to-end against what is now `apps/exam-runtime`.
- `apps/api` keeps an e2e suite covering what remains there: admin auth, org/branding, questions, exams, candidates, invitations, and the new `attempts-admin` read endpoints.
- `packages/shared` gets its own unit test suite, starting with `TenantPrismaService`'s session-context reset behavior (already spec'd in `apps/api` today — the spec moves with the code, no behavior change).
- `apps/exam-runtime`'s new `InternalModule` gets unit tests covering: the `InternalAuthGuard` rejects a missing/wrong secret and accepts the correct one; each of the 3 endpoints delegates to the right existing service method with the right arguments. `apps/api`'s `AttemptsAdminService` tests are updated to mock an HTTP client call in place of the old direct service injection.

---

## 7. Open Items / Deferred to Future Sub-Phases

- Cloud deployment of either service (Terraform, containers, CI/CD) — deferred until a real Azure deployment target is actually being set up.
- Wiring the existing Azure SQL resource into this project (currently unconnected; local SQL Server remains the dev/test DB for both services).
- Load testing at scale — Phase 3c.
- Candidate exam-taking frontend and live-monitoring dashboard frontend — neither exists yet; only an env-var convention (`NEXT_PUBLIC_EXAM_RUNTIME_BASE`) is established for whichever sub-phase builds them.
- Any org-scoped (RLS) use of `TenantPrismaService` from within `apps/exam-runtime` — not needed by anything moved in this sub-phase, since candidate auth bypasses RLS by design.
