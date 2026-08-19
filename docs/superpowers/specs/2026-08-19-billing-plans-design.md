# Billing & Plans (Phase 1: Metering + Quota Enforcement) — Design

**Status:** Approved (brainstorming) — ready for implementation planning
**Date:** 2026-08-19
**Feature:** #1 of a 4-feature commercialization set (billing, integrations, team collaboration, candidate portal), built one at a time via SDD. The 4 ATS-depth features (candidate comms, offer letters, interview scheduling, AI fit scoring) are live in prod (main `7884ebba`).

## Goal

Turn the multi-tenant recruiting/exam SaaS into something with a real commercial gate: define subscription **plans** with per-org **usage limits**, **meter** actual usage per org, and **enforce quotas** — hard-blocking the dimensions that cost real money and soft-warning the rest. This is **Phase 1** of billing: it makes plans and limits real and enforced. **Payment collection (Stripe self-serve checkout, subscriptions, invoices) is Phase 2** — this design leaves a clean seam for it but does not build it.

## Scope decisions (from brainstorming)

1. **Commercial model:** phased — build metering + quota enforcement + **admin-assigned** plans now (usable immediately, no payment-processor dependency), with a clean Stripe seam for Phase 2. Super-admin assigns each org a plan; org-admins view their plan + usage but cannot self-change it yet.
2. **Metered dimensions (all four):** seats (active staff users), candidates (roster), AI credits (per period), proctoring minutes (per period).
3. **Enforcement:** **hard-block** the cost drivers — AI credits + proctoring minutes (external API/compute cost) — with a 402 + "upgrade" message; **soft-warn** seats + candidates (banner + admin email at ~80%/100%), never blocking.
4. **Invoicing:** **deferred to Phase 2 (Stripe)** — without collected payments an invoice is premature.

## Non-goals (this phase)

- No Stripe/payment integration, no checkout, no card handling, no subscription lifecycle, no PDF invoices/receipts.
- No self-serve plan change by org-admins (they view + "contact us"; super-admin assigns).
- No usage-based overage billing (nothing to collect yet).
- No new write path on the hot exam-runtime attempt path for proctoring minutes (computed from existing data).
- No per-second real-time enforcement — quota checks are at action boundaries (invite, add candidate, AI trigger, exam start).

## Architecture

A new **`BillingModule`** in `apps/api` with two focused services and a pure limits/period core. It reuses the existing `Plan` model + `Organization.planId` + `AiCreditUsage` metering + RBAC + `EmailService`. Enforcement is injected at a minimal set of existing action boundaries.

### Data model changes

**Extend the existing `Plan`** (`apps/api/prisma/schema.prisma`) — it already has `candidateLimit`, `aiCreditLimit`, `proctoringMinutesLimit`:

```prisma
// added to model Plan
seatLimit       Int     @default(5)  @map("seat_limit")
priceLabel      String? @map("price_label")   // display only, e.g. "$99/mo" — no charging in Phase 1
billingInterval String  @default("month") @map("billing_interval")
isPublic        Boolean @default(true)  @map("is_public")   // shown in the catalog vs internal/custom
// Phase-2 Stripe seam (null in Phase 1):
stripeProductId String? @map("stripe_product_id")
stripePriceId   String? @map("stripe_price_id")
```

**Extend `Organization`** with Phase-2 seam columns (null/default in Phase 1) so Stripe slots in without a later migration churn on the hot table:

```prisma
// added to model Organization
billingStatus        String  @default("active") @map("billing_status")  // active | past_due | canceled (Phase 2 drives this)
stripeCustomerId     String? @map("stripe_customer_id")
stripeSubscriptionId String? @map("stripe_subscription_id")
```

**New `BillingNotice`** — dedup table so soft-warn emails fire once per threshold per period:

```prisma
model BillingNotice {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  dimension      String   // 'seats' | 'candidates'
  threshold      Int      // 80 | 100
  periodStart    DateTime @map("period_start")  // first of the UTC month this notice covers
  createdAt      DateTime @default(now()) @map("created_at")

  @@unique([organizationId, dimension, threshold, periodStart])
  @@index([organizationId])
  @@map("billing_notices")
}
```

**SQL Server migration conventions** (from prior features): `created_at`/`period_start` defaults `GETUTCDATE()` where defaulted; new columns on `Plan`/`Organization` are additive nullable/defaulted `ALTER TABLE ADD` (no same-batch reference → no EXEC-wrap). `BillingNotice` is a per-org table under RLS: **no FK to Organization** (plain `organizationId` column + RLS, avoids P1012); RLS predicates in a **separate migration** from `CREATE TABLE` (3 predicates: filter + block-insert + block-update). The `@@unique([...])` is non-nullable so a plain unique constraint is fine (no filtered index).

**Permission:** add `org:manage_billing` to `PERMISSIONS` + grant to `org_admin` in `apps/api/prisma/seed.ts`, AND seed it idempotently in the migration (`IF NOT EXISTS` INSERT into `permissions` + `role_permissions`) because `seed.ts` does not run on deploy. Plan-catalog CRUD stays under the existing `platform:manage_organizations`.

### Period & limit semantics

- **Billing period** = calendar month in UTC. `periodStart = first day of the current month, 00:00:00 UTC`. (Phase 2 can re-anchor to the Stripe subscription.)
- **Seats** — point-in-time: `user.count({ where: { organizationId, status: 'active' } })` ≤ `seatLimit`.
- **Candidates** — point-in-time roster: `candidate.count({ where: { organizationId, erasedAt: null } })` ≤ `candidateLimit`.
- **AI credits** — this period: `aiCreditUsage.aggregate({ _sum: { credits }, where: { organizationId, occurredAt: { gte: periodStart } } })` ≤ `aiCreditLimit`.
- **Proctoring minutes** — this period: sum of proctored attempt durations completed since `periodStart`. Computed by joining `Attempt` → `Exam` (`organizationId` + proctoring enabled) and summing `datediff(minute, startedAt, submittedAt)` for attempts with `submittedAt >= periodStart`. No new consumption table.

### Pure core (`billing.core.ts`)

Pure functions, unit-tested, no I/O:
- `currentPeriodStart(now: Date): Date` — first of the month, UTC.
- `usageRatio(used: number, limit: number): number` — `used / limit`, with `limit === 0` returning `Infinity` when `used > 0` else `0`.
- **Limit semantics (unambiguous):** every limit is a non-negative integer. `0` = "not allowed at all" (blocks/warns immediately). There is **no "unlimited" sentinel** in Phase 1 — a very high number represents effectively-unlimited. This keeps the enforcement math trivial: `over = used >= limit`.
- `warnThreshold(ratio: number): 80 | 100 | null` — returns the highest crossed soft-warn threshold, else null.
- `HARD_DIMENSIONS = ['ai_credits', 'proctoring_minutes']`, `SOFT_DIMENSIONS = ['seats', 'candidates']`.

### Services

**`UsageService`** — single source of truth for current usage.
```ts
interface DimensionUsage { used: number; limit: number }
interface OrgUsage {
  planName: string;
  periodStart: Date;
  seats: DimensionUsage;
  candidates: DimensionUsage;
  aiCredits: DimensionUsage;
  proctoringMinutes: DimensionUsage;
}
getUsage(context: TenantContext): Promise<OrgUsage>   // all four, live counts, via forTenant (RLS)
```

**`QuotaService`** — enforcement, read-only, called at action boundaries.
```ts
// Hard dimensions: throws QuotaExceededException (→ HTTP 402) when used >= limit.
assertWithinLimit(context: TenantContext, dimension: 'ai_credits' | 'proctoring_minutes', amount?: number): Promise<void>
// Soft dimensions: never throws; returns whether the caller should warn.
checkSoftLimit(context: TenantContext, dimension: 'seats' | 'candidates'): Promise<{ warn: boolean; threshold: 80 | 100 | null; used: number; limit: number }>
```
- `QuotaExceededException extends HttpException(402)` with body `{ error: 'quota_exceeded', dimension, used, limit, message }`. Generic, safe, no internal leakage.
- **Super-admin / `actingSuperAdmin` bypasses all quotas** (checked first, returns immediately).
- All reads via `TenantPrismaService.forTenant` (RLS); checks are read-only and run OUTSIDE any write transaction (so a 402 can never leave a partial write).

### Enforcement call sites (minimal, at the trust boundary)

| Dimension | Where | Behavior |
|---|---|---|
| AI credits (hard) | Before the provider call in each AI trigger: the `candidate_fit` / `resume_parse` / `question_generation` processors (apps/api) and the exam-runtime AI paths (`integrity`, `insight`, `screen_analysis`, `code_review`). One `QuotaService.assertWithinLimit(ctx, 'ai_credits')` before spend/enqueue. | Over-limit → 402, no AI call, "AI limit reached — upgrade" surfaced. Distinct from `AiNotConfiguredError` (no key) and provider failure. |
| Proctoring minutes (hard) | At **exam start** for a proctored exam (the start-attempt guard), never mid-exam. | Over-limit → 402 at start; a candidate already testing is never interrupted. |
| Seats (soft) | At staff user invite/create (`OrganizationsService`/users create path). | `checkSoftLimit`; past 100% still creates the user, returns a warning + fires the dedup'd admin email. |
| Candidates (soft) | At candidate add / bulk import / public application. | Same soft-warn; never blocks adding a candidate. |

**Note (exam-runtime):** the AI-credit hard check must also apply in `apps/exam-runtime` (proctoring analysis, insights). exam-runtime already uses `TenantPrismaService`; `QuotaService` (or a thin equivalent reading the same tables) is invoked there before those AI spends. If wiring `BillingModule` into exam-runtime is heavy, exam-runtime performs the same read-only period-sum check inline against `AiCreditUsage` + `Plan` (shared period/limit core lives in `packages/shared` if needed). **Decision:** put `currentPeriodStart` + threshold math + `HARD/SOFT_DIMENSIONS` in a shared location so both apps use identical semantics; each app has its own thin quota read. (Implementation plan will choose the least-duplication wiring; the semantics are shared.)

### Warnings (soft dimensions)

On each soft-dimension `checkSoftLimit` that crosses 80% or 100%, if no `BillingNotice` row exists for `(org, dimension, threshold, periodStart)`, insert one and send the org-admin an email (`EmailService.send` + `buildCandidateEmailHtml`, org-branded) — so each threshold emails once per org per month. The banner in the UI is driven live off `getUsage` (no dedup needed for the banner).

## UI

### Org-admin → Settings → Billing (new)
- `apps/web/app/(org-admin)/settings/billing/page.tsx` + a nav entry (org_admin nav in `apps/web/lib/super-admin-nav.ts`), gated by `org:manage_billing`.
- `apps/web/lib/hooks/useBilling.ts` (React Query, mirrors `useIntegrations.ts`): `useOrgUsage()` → `GET /organizations/billing/usage`.
- Renders: current **plan name** + the four limits; four **usage bars** (`used / limit`, colour-scaled green/amber/red, ⚠ marker when over); the **period reset date** (first of next month); a "Need a different plan? Contact us" note (self-serve upgrade is Phase 2).
- A dismissible **over-limit banner** shown app-wide (org-admin + recruiter shells) when any hard limit is at/over 100% — reads the same usage endpoint.

### Super-admin → plan catalog + assignment
- Plan catalog CRUD page (list/create/edit tiers: name, the four limits, `priceLabel`, `isPublic`) under `platform:manage_organizations`. `GET/POST/PATCH /platform/plans`.
- Assign a plan to an org: a plan selector on the existing org detail/admin view → `PATCH /platform/organizations/:id/plan { planId }`. Audited (`AuditService`, `org.plan_assigned`).

### API endpoints
| Route | Perm | Purpose |
|---|---|---|
| `GET /organizations/billing/usage` | `org:manage_billing` | org's plan + four-dimension usage (drives page + banner) |
| `GET /platform/plans` | `platform:manage_organizations` | plan catalog |
| `POST /platform/plans` / `PATCH /platform/plans/:id` | `platform:manage_organizations` | create/edit a plan |
| `PATCH /platform/organizations/:id/plan` | `platform:manage_organizations` | assign a plan to an org |

## Safety, audit, edge cases

- **Multi-tenancy:** all usage counts + quota reads via `forTenant` (RLS); no cross-org leak. `BillingNotice` under RLS.
- **402 is read-only:** quota checks run before any write and outside write transactions — a blocked action leaves no partial state.
- **Super-admin bypass:** platform super-admin / `actingSuperAdmin` is never quota-limited.
- **Audit:** plan create/edit, plan assignment, and each limit change recorded via `AuditService`.
- **Grandfathering:** every existing org already has `planId` (the seeded trial plan). Adding `seatLimit` with a default keeps existing plans valid; a data step in the migration sets a sane `seatLimit` on the seeded trial plan.
- **Clock/period:** `currentPeriodStart` derives from server UTC now; consumption aggregates filter on `occurredAt`/`submittedAt >= periodStart`. No cron needed — the period "resets" implicitly because the aggregate window moves.
- **Unlimited:** represented by a large integer limit, not a sentinel (keeps math trivial).

## Error handling summary

| Condition | Result |
|---|---|
| AI credits exhausted this period | 402 `quota_exceeded` before the AI call; no spend; "AI limit reached — upgrade" |
| Proctoring minutes exhausted | 402 at proctored-exam **start**; in-progress attempts never interrupted |
| Seats at/over limit | user still created; warning returned; admin email once per threshold/period |
| Candidates at/over limit | candidate still added; same soft-warn |
| Super-admin acting | all quotas bypassed |
| Org has no plan (shouldn't happen — FK) | treated as no-cap read; logged; not a hard failure |

## Testing

- **Pure core:** `currentPeriodStart` (month boundary, UTC, year rollover); `usageRatio` (limit 0, normal, over); `warnThreshold` (below 80, 80–99, ≥100).
- **UsageService:** each dimension counted correctly (mocked prisma) — active-only seats, non-erased candidates, period-filtered AI credits, proctored-attempt minutes join; period boundary excludes prior-month usage.
- **QuotaService:** hard dimension throws 402 at/over limit, passes under; soft dimension never throws, returns correct warn/threshold; super-admin bypass.
- **Enforcement call sites:** AI trigger blocks over-limit (no provider call) and proceeds under; proctored exam start blocks over-limit; seat/candidate add warns-not-blocks; warning email dedup (second cross in same period does not re-email).
- **Controller:** billing usage route requires `org:manage_billing`; plan CRUD + assignment require `platform:manage_organizations` (401/403 without).
- **Web:** usage bars render used/limit/over states; over-limit banner shows only at ≥100% hard; super-admin plan CRUD + assignment.

## Reuse map

| Need | Reuse |
|---|---|
| Plan/tier + limits | existing `Plan` model + `Organization.planId` (extended) |
| AI-credit metering | existing `AiCreditUsage` (add period filter to the existing `groupBy`) |
| Per-org secret seam (Phase 2) | `Organization.*Encrypted` pattern via `OrgSecretsCryptoService` |
| Tenant isolation | `TenantPrismaService.forTenant`, RLS |
| Permissions | `@RequirePermissions`, seed `org:manage_billing`; catalog under `platform:manage_organizations` |
| Email warnings | `EmailService.send` + `buildCandidateEmailHtml` |
| Audit | `AuditService.record` |
| Web console | `(org-admin)/settings/*` pattern, `useIntegrations.ts` hook pattern, nav in `super-admin-nav.ts` |
| Async (Phase 2 Stripe webhooks) | existing BullMQ queue/worker + outbound-webhook HMAC pattern |

## Deferred to Phase 2 (Stripe)

- Stripe customer/subscription creation, self-serve Checkout, plan up/downgrade with proration.
- Raw-body public Stripe webhook controller + HMAC-verifying guard (note: `apps/api/src/main.ts` globally applies `express.json` — the Stripe path needs `express.raw` mounted before it, or `rawBody: true`).
- `billingStatus` driven by Stripe events (`past_due`/`canceled` → suspend/downgrade).
- PDF invoices/receipts (reuse the offers `buildOfferPdf` pdfkit pattern).
- The seam columns (`stripeCustomerId`, `stripeSubscriptionId`, `Plan.stripePriceId`) added now stay null until then.
