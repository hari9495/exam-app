# Phase 5d: AI Credit Usage Metering — Design Spec

## 1. Context & Scope

Phase 5d is the fourth and final Phase 5 sub-phase (Epic #5972 "Phase 5 - AI Features"), following Phase 5a (async job infrastructure), Phase 5b (AI question generation), and Phase 5c (AI evaluation insight summaries) — all now shipped to `main`.

Per the master spec (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`):
- Phase 5's roadmap bullet lists "credit/usage metering per plan" (line 881) directly alongside the two AI features this phase's predecessors shipped.
- Phase 7's roadmap bullet explicitly separately lists "Billing/plan enforcement (candidate limits, AI credits, proctoring minutes)" (line ~886) — metering and enforcement are two different phases in this project's own decomposition, not one feature.
- The `Plan` model (`apps/api/prisma/schema.prisma`) has carried `candidateLimit`, `aiCreditLimit`, and `proctoringMinutesLimit` fields since Phase 0, but none of the three has ever been read by production code — confirmed via a full-codebase grep turning up matches only in test fixtures and the seed script.

**This phase's scope, established during brainstorming:**
- **Metering only, never blocking.** Every AI-generation request succeeds regardless of how much of `aiCreditLimit` has already been consumed. Hard/soft enforcement is explicitly Phase 7's responsibility.
- **AI credits only** — `candidateLimit` and `proctoringMinutesLimit` metering are out of scope. Phase 5's roadmap bullet groups credit metering with the two AI features it just shipped; the other two limits track unrelated concerns (headcount, proctoring session time) with no natural home in this Epic, and have no metering logic of their own to build on top of yet.
- **Both AI-generation features consume credits**, at different rates: question generation (Phase 5b) charges per question actually delivered; insight generation (Phase 5c) charges a flat rate per successfully generated insight.

## 2. Architecture

A new `AiCreditUsage` table records one row per completed AI-generation event (append-only, RLS-registered like every other operational table in this codebase). Two write sites, both in code that already exists from Phases 5b/5c and already has the data needed — no new job types, no new triggers, no new async plumbing:

- **`AiQuestionGenerationProcessor.process()`** (`apps/api/src/jobs/processors/ai-question-generation.processor.ts`, Phase 5b): after computing the final `questionIds` array (the questions that actually passed validation and were inserted), if `questionIds.length > 0`, insert one `AiCreditUsage` row — `credits: questionIds.length, source: 'question_generation', sourceId: null` — inside the same `tenantPrisma.forTenant` block that already inserts the `Question` rows. A job that delivers zero valid questions charges nothing. (`sourceId` is left null here deliberately: `JobProcessor.process(input, context)`'s current signature doesn't give the processor its own `AiJob` id — that lives only in the worker's scope — and widening the interface a second time purely to populate an optional traceability field isn't worth the churn. See §3.)
- **`AttemptInsightService.analyze()`** (`apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`, Phase 5c): in the success branch only (after `ClaudeInsightClient.generate()` returns a summary, before or alongside the `AttemptInsight` upsert), insert one `AiCreditUsage` row — `credits: 1, source: 'insight_generation', sourceId: <the attemptId>` — inside the same `tenantPrisma.forTenant` block. The failure branch (`status: 'failed'`) writes nothing.

A new `GET /api/v1/organizations/usage` on the existing `OrganizationsController` (`apps/api/src/organizations/organizations.controller.ts`) — joining `getBranding`/`updateBrandingColors`/`uploadLogo`, all already gated by `org:manage_settings` — returns the org's `Plan.aiCreditLimit` alongside a summed total and a per-source breakdown from `AiCreditUsage`.

**Architectural note on `OrganizationsService`:** its existing methods read `Organization`/`Plan` via the *plain* `PrismaService`, because neither table is RLS-registered — they're platform-level configuration, not tenant-owned operational data (an org's own row identifies which tenant it is; it isn't itself scoped *by* a tenant). `AiCreditUsage`, being genuine tenant-owned operational data, *will* be RLS-registered like `Question`, `Exam`, `AiJob`, etc. This phase's one new method (`getUsage`) is therefore the first place in this codebase where `OrganizationsService` needs `TenantPrismaService.forTenant()` alongside its existing plain-`PrismaService` methods — a deliberate mixing of both patterns within one class, not an inconsistency to resolve. (A plain `PrismaService` query against an RLS-registered table without a session context set would silently return zero rows, not an error — this distinction matters and is why `TenantPrismaService` is required here specifically.)

**No blocking anywhere.** `JobsService.enqueue()` (question generation's entry point) and `AttemptInsightService.analyze()`'s control flow (insight generation's entry point) are otherwise completely unmodified — this phase only adds a write *after* success, never a read-and-reject *before* attempting. An org already over its `aiCreditLimit` keeps generating; that gate is explicitly Phase 7's job.

## 3. Data Model

```prisma
model AiCreditUsage {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  source         String
  credits        Int
  sourceId       String?  @map("source_id") @db.UniqueIdentifier
  occurredAt     DateTime @default(now()) @map("occurred_at")

  @@index([organizationId])
  @@map("ai_credit_usage")
}
```

- `source` is `'question_generation' | 'insight_generation'` — a free-text string, not a Prisma enum, matching this codebase's established convention (`AiJob.status`, `Question.type`, etc. are all documented strings, never Prisma enums).
- `sourceId` is a plain, unconstrained, nullable string (not a Prisma `@relation`/foreign key) — a genuine polymorphic reference that would point to an `AiJob.id` when `source = 'question_generation'` and an `Attempt.id` when `source = 'insight_generation'`, a shape Prisma's relation system cannot express as one typed FK. In practice it is only ever populated for `insight_generation` rows (`AttemptInsightService.analyze()` already has `attemptId` as its own parameter, so populating it is free); `question_generation` rows always leave it null, since `AiQuestionGenerationProcessor` has no `AiJob` id in scope under the current `JobProcessor` interface and this field is a traceability nicety, not something worth another interface change to populate. It exists purely for optional traceability/audit purposes, not for referential integrity enforcement.
- Two migrations, matching every other operational table's established pattern: a schema migration (`CREATE TABLE`, following the same column/constraint-naming conventions as the most recent precedent) and an RLS migration extending the existing `TenantAccessPolicy` with the standard 1 filter + 2 block predicates via the unchanged `fn_tenant_access_predicate` function.
- No changes to the existing `Plan` model — `aiCreditLimit` is read as-is. This phase does not introduce a billing-period/reset concept (e.g. "usage resets monthly"); "cumulative usage since the organization existed" is a sufficient answer for metering-not-billing, and Phase 7 is the natural place to introduce periods if/when real billing needs them.

## 4. API Surface

```
GET /api/v1/organizations/usage
  Guard: JwtAuthGuard, PermissionsGuard — org:manage_settings (reused, no new permission, no seed.ts change)
  → OrganizationsService.getUsage(context: TenantContext): Promise<AiCreditUsageResponse>

  interface AiCreditUsageResponse {
    aiCreditLimit: number;
    totalUsed: number;
    breakdown: { questionGeneration: number; insightGeneration: number };
  }
```

Implementation shape:
1. Resolve `context.organizationId` (same `requireOrganizationId` helper `getBranding` already uses), fetch the org's `Plan.aiCreditLimit` via plain `PrismaService` (join through `Organization.plan`).
2. `tenantPrisma.forTenant(context, tx => tx.aiCreditUsage.groupBy({ by: ['source'], where: { organizationId }, _sum: { credits: true } }))` to get per-source totals in one query.
3. Shape the grouped result into the response — an org with zero `AiCreditUsage` rows yet (the common case immediately after this phase ships, or for any brand-new org) returns `{ aiCreditLimit: N, totalUsed: 0, breakdown: { questionGeneration: 0, insightGeneration: 0 } }`, not an error or a missing-field response.

## 5. Testing Approach

**Unit:**
- `AiQuestionGenerationProcessor`: one new test asserting the `AiCreditUsage.create()` call's `credits` value matches the final `questionIds.length` in a mixed valid/invalid batch; one new test asserting *no* usage row is created when every generated question is dropped (the existing "zero created" test case, extended with this assertion).
- `AttemptInsightService`: one new test per branch — success (`AiCreditUsage.create()` called with `credits: 1, source: 'insight_generation'`) and failure (no `AiCreditUsage.create()` call at all).
- `OrganizationsService.getUsage()`: new unit coverage for the aggregation/shaping logic (mocked `TenantPrismaService`/`PrismaService`), including the all-zero baseline case for an org with no usage rows yet.

**E2E:** extend the existing `apps/api/test/ai-question-generation.e2e-spec.ts` and `apps/api/test/ai-evaluation-insight.e2e-spec.ts` with one additional assertion each — after polling the job/insight to completion, call the new usage endpoint and confirm the relevant `breakdown` field increased by the expected amount — rather than building a wholly new e2e file, since these two specs already drive the real generation flows this phase hooks into. One new, small addition (either its own minimal e2e spec or a case folded into an existing organization-branding-adjacent one) covers the endpoint's own permission gating (403 for a role without `org:manage_settings`) and the zero-usage baseline for a fresh org that has never triggered either AI feature.

**Not covered by automated tests:** exact per-question/per-attempt Anthropic API cost reconciliation (this is metering — an internal usage count — not a financial ledger; Phase 7's real billing integration is where cost-accuracy verification would matter).

## 6. Open Items

- `candidateLimit` and `proctoringMinutesLimit` remain completely unmetered after this phase — explicitly out of scope, likely picked up as part of Phase 7 prep since neither is an "AI feature."
- No billing-period/reset concept exists yet — usage is cumulative-since-org-creation. If Phase 7 needs monthly (or other periodic) resets, that's new work on top of this phase's ledger table, not a redesign of it (the append-only `occurredAt`-timestamped rows already support any future period-bounded query).
- This phase adds no way for a recruiter to see usage trending toward the limit *before* it happens (e.g. no warning at 80% consumed) — the metering-only decision means the usage endpoint is purely informational; Phase 7 owns any proactive-warning UX.
