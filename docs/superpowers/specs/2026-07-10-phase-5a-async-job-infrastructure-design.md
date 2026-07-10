# Phase 5a — Async Job Infrastructure Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** None functionally (greenfield infrastructure), but exists to unblock Phase 5b (AI question generation), which the master spec requires to be async ("generation takes seconds; must be async so it doesn't block the UI or count against API request timeouts").

---

## 1. Context and Scope

The first sub-phase of Phase 5 ("AI Features"). Phase 5 as a whole was flagged during scoping as a multi-subsystem phase — a job-queue infrastructure layer, AI question generation, AI evaluation insight summaries, and credit/usage metering — and decomposed the same way Phase 4 was, into independently-scoped sub-phases (5a-5d, though only 5a is scoped in this document; 5b-5d get their own brainstorming cycles later).

A pre-scoping survey of the current codebase confirmed:
- No job queue, no Redis client, no worker process, and no job-tracking table exist anywhere in this repo today — this is entirely greenfield.
- The only existing "async" pattern is a fire-and-forget in-process call (Phase 2's AI proctoring analysis: `void this.attemptAnalysis.analyze(...).catch(...)`), which runs within the same request's call stack, has no durable job record, no pollable status, and no automatic retry — only a manual internal re-trigger endpoint.
- `Plan.aiCreditLimit` (and its siblings `candidateLimit`, `proctoringMinutesLimit`) exist on the schema today but are never read or decremented anywhere in application code — confirmed via a full repo grep. They are static, unenforced ceilings, set once at plan creation.
- The master spec's own API surface names a generic job resource: `POST /api/v1/questions/ai-generate` (async job) and `GET /api/v1/ai-jobs/{id}` (poll job status) — implying one unified job-polling endpoint shared across future AI job types, not a type-specific one.
- No `docker-compose.yml` exists anywhere in this repo, despite the README referencing one as an option for local SQL Server — the actual working dev setup uses a native SQL Server install. There is no existing precedent to follow for how new infrastructure dependencies (like Redis) get provisioned locally.

**Goal of this sub-phase:** stand up the queue/worker mechanism and a generic, durable, tenant-isolated job-tracking model — proven end-to-end with one trivial example job type — so that Phase 5b can add real AI question generation on top of it without inventing infrastructure mid-feature.

### In scope
- BullMQ + Redis (`ioredis`), connection configured via a `REDIS_URL` env var.
- Local Redis for development, provisioned via a new `docker-compose.yml` (the repo's first). Azure Cache for Redis in production — same env-var-driven connection pattern already used for `DATABASE_URL` (which itself already points at Azure SQL in this project's actual deployment), so no code difference between environments beyond the connection string.
- A generic, org-scoped, RLS-registered `AiJob` Prisma model.
- One BullMQ queue; job processors registered by a `type` string, so future job types (5b's real question-generation job) plug in without changing the queue/model plumbing.
- The BullMQ `Worker` runs in-process inside `apps/api` — not a separately deployed app. This diverges from the master spec's architecture diagram (which draws "Background Workers" as its own service boundary), matching this project's own established incremental pattern instead: Phase 3b only split `apps/exam-runtime` into its own deployable app once there was a concrete load-isolation need, not preemptively. A separate worker deployment is a future scaling concern, not a Phase 5a requirement.
- `GET /api/v1/ai-jobs/:id` — the only public route this phase adds, matching the master spec's own naming exactly.
- One trivial example job type (`echo`) — proves the full queue → worker → status-transition → DB-write → HTTP-read pipeline end-to-end via a real e2e test, before 5b builds a real AI integration on top of the same mechanism. Removed once 5b lands its own job type — not kept as permanent scaffolding.
- A new `ai_jobs:view` permission, granted to `recruiter` — matching the precedent Phase 4e set with `results:view` (a purpose-scoped permission) rather than overloading the generic `org:view`.

### Explicitly out of scope (deferred to later Phase 5 sub-phases or beyond)
- **Any real AI job type** — question generation (5b) and evaluation insights (5c) are separate sub-phases with their own scoping.
- **A generic multi-purpose job system for grading/exports/email** — the master spec's architecture diagram bundles these into one "Workers" concept, but none of them have an actual async need today: exports were explicitly kept synchronous in Phase 4d, and grading/email already work correctly inline. Generalizing the queue for hypothetical future use is speculative; `AiJob`/the queue exist to serve AI job types specifically.
- **Credit/usage metering** (5d) — tracking consumption against `aiCreditLimit` is a separate concern from having a job queue at all.
- **A separate deployable worker process** — deferred until a concrete load-isolation need exists.
- **Automatic BullMQ retries** — the master spec's own risk table states failed AI jobs should be "marked `failed` with reason surfaced to the recruiter... recruiter can retry" — i.e. retry is a deliberate, feature-level re-submission, not silent background re-processing.
- **A public "create an arbitrary job" endpoint** — there is nothing meaningful for a generic create-route to do until a real feature (5b) defines what job types exist and what input they need.

---

## 2. Schema

```prisma
model AiJob {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  type           String
  status         String   @default("pending")
  inputJson      String   @db.NVarChar(Max) @map("input_json")
  outputJson     String?  @db.NVarChar(Max) @map("output_json")
  error          String?  @db.NVarChar(Max)
  createdBy      String   @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([organizationId, status])
  @@map("ai_jobs")
}
```

`AiJob` has an `organizationId` column, so — matching `users`/`questions`/`exams`/`candidates`/`tags` — it is RLS-registered on `TenantAccessPolicy`, requiring both a schema migration and an RLS migration, following this project's now-familiar two-migration pattern for any new org-scoped table.

`status` values: `pending` | `processing` | `completed` | `failed` (plain string, matching this codebase's existing convention of status-as-string rather than a DB enum, e.g. `Exam.status`, `Attempt.status`, `Invitation.status`).

---

## 3. Module Structure

New `apps/api/src/jobs/`:
- `jobs.module.ts` — registers the service, controller, queue, and worker; imported into `AppModule`.
- `jobs.service.ts` — `enqueue(context, type, inputJson, userId)` (creates the `AiJob` row, pushes to the queue) and `getById(context, id)` (tenant-scoped lookup for the polling endpoint).
- `jobs.controller.ts` — `GET /ai-jobs/:id`.
- `redis-connection.ts` — one shared `ioredis` connection, built from `REDIS_URL`, used by both the `Queue` and the `Worker`.
- `ai-jobs.queue.ts` — the BullMQ `Queue` instance.
- `ai-jobs.worker.ts` — the BullMQ `Worker`. Reconstructs a `TenantContext` from `job.data.organizationId` (see Section 4) for every DB write it makes; registers an `OnModuleDestroy` hook to gracefully close its Redis connection on app shutdown.
- `processors/job-processor.interface.ts` — `{ type: string; process(input: unknown): Promise<unknown> }`, the contract every job type (including 5b's future real one) implements.
- `processors/echo.processor.ts` — the trivial example job type for this phase's own end-to-end proof.

---

## 4. The Decoupled-Worker Tenant-Context Problem

This phase introduces this codebase's first genuinely decoupled execution context. Every prior "background-ish" write (settlement, proctoring analysis) still executes within the call stack of the HTTP request that triggered it — there's always a live `TenantContext` in scope. The BullMQ `Worker` is different: by the time it picks a job off the queue, the original HTTP request that enqueued it has long since returned a response and torn down.

**Resolution:** `AiJob.organizationId` is captured exactly once, from the real authenticated request's `@CurrentTenant()` context at `enqueue()` time, and persisted both in the `AiJob` row and in the BullMQ job's payload (`job.data.organizationId`). When the `Worker` later processes that job, it reconstructs a `TenantContext` as `{ organizationId: job.data.organizationId, isSuperAdmin: false }` and uses it for every `TenantPrismaService.forTenant` call the job's processing makes. This is safe specifically because the organization ID was never invented or looked up by the Worker itself — it only ever passes through a value that was already validated by a real request's auth/tenant-resolution pipeline before the job existed.

---

## 5. API Surface & Job Lifecycle

**`GET /api/v1/ai-jobs/:id`** — returns `{ id, type, status, outputJson, error, createdAt, updatedAt }`. Deliberately never returns `inputJson` — a future job type's input could carry sensitive data, so the read shape is narrower than the stored row by default. Gated by the new `ai_jobs:view` permission (granted to `recruiter`). A job belonging to a different organization 404s, matching every other org-scoped lookup in this codebase.

**Lifecycle:** `pending` (row created, job pushed to the queue) → `processing` (Worker picked it up) → `completed` (processor returned successfully, `outputJson` populated) or `failed` (processor threw, `error` populated, `outputJson` stays `null`). Terminal states are final — no automatic retry (`attempts: 1` on the BullMQ job options); a retry is a fresh `enqueue()` call made by future feature code, not silent background re-processing.

---

## 6. Testing Approach

- **Unit:**
  - `jobs.service.spec.ts` — `enqueue()` creates the `AiJob` row and pushes to the queue (queue mocked); `getById()`'s tenant-scoping (wrong-org lookup returns nothing / 404s).
  - `echo.processor.spec.ts` — the trivial processor's own logic in isolation.
- **e2e** (`apps/api/test/ai-jobs.e2e-spec.ts`, new file): enqueues a real `echo` job directly via `JobsService` (there is no public create-route in this phase — see Section 1's explicit scope note), then polls `GET /api/v1/ai-jobs/:id` over real HTTP against a real Redis instance, a real in-process Worker, and a real DB, asserting the status transitions through to `completed` with the expected `outputJson`. Plus a wrong-org-404 check and an `ai_jobs:view`-permission check, matching this project's standing per-route e2e coverage convention.
- **Migration:** two real SQL Server migrations (schema + RLS registration), verified directly against `INFORMATION_SCHEMA`/`sys.security_predicates`, matching every prior schema-touching phase's standard.

**Operational note:** because `JobsModule` wires into `AppModule` like every other module, booting `apps/api` for *any* e2e test — not just this phase's own — now also starts the in-process Worker, making Redis a hard dependency for the entire `apps/api` e2e suite, not only the new job-specific test file. The Worker's `OnModuleDestroy` hook (Section 3) closing its Redis connection on `app.close()` (already called in every e2e file's `afterAll`) is what prevents this from surfacing as Jest "did not exit cleanly" warnings across the growing e2e suite. The README's local-setup instructions gain a new step: start Redis (via the new `docker-compose.yml`) before running `apps/api` or its e2e suite, alongside the existing SQL Server step.

---

## 7. Open Items / Deferred to Future Sub-Phases

- Phase 5b (AI question generation) will be the first real consumer of this infrastructure — implementing a real `JobProcessor`, a real `POST /questions/ai-generate` route that calls `JobsService.enqueue()`, and removing the `echo` example job type.
- Phase 5c (AI evaluation insights) still needs its own scoping decision on whether it uses this job infrastructure at all, or follows Phase 2's lighter fire-and-forget pattern instead (it's not an interactive wait-for-a-job UX the way question generation is) — not decided here.
- Phase 5d (credit/usage metering) is unrelated to this phase's scope beyond both existing under the Phase 5 umbrella.
- A separate deployable worker process, if/when a real load-isolation need emerges — not a concern at this phase's actual scale.
