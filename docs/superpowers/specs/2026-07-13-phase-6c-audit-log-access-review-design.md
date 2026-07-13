# Phase 6c: Audit Log Completeness + Access Review — Design Spec

## 1. Context & Scope

Phase 6 ("Compliance & Security Hardening") was decomposed into four sub-phases: 6a (CI + dependency/secret scanning, shipped), 6b (rate limiting hardening, shipped), 6c (audit log completeness + access review — this spec), 6d (GDPR data subject rights).

**Current state, confirmed by direct codebase survey before scoping:**

- `AuditModule`/`AuditService` (`packages/shared/src/audit/`) has existed since Phase 0. It is `@Global()`, manually invoked (`AuditService.record(context, entry)` — no decorator or interceptor), writes to the `audit_logs` table (`AuditLog` model, `apps/api/prisma/schema.prisma`), and is tenant-scoped via the `TenantContext` argument. Captured fields: `actorUserId` (nullable), `action`, `entityType`, `entityId` (optional), `metadata` (optional, JSON-stringified). No `ip_address`/`userAgent` columns exist, despite the original master design spec calling for one.
- Only **4 call sites exist in the entire running system today**, all in `apps/api`: `login.success` (`auth.service.ts`), `user.created` (`users.service.ts`), `attempt.force_submit` and `attempt.message_sent` (`attempts-admin.service.ts`). `apps/exam-runtime` has zero `AuditModule` integration.
- There is **no read/query API for the audit log** — it has been write-only since Phase 0. The originally-specced `GET /api/v1/audit-logs?entityType=&actorId=&from=&to=` was never built.
- RBAC (`apps/api/src/rbac/`) is purely role-based: `User.role` is a plain string column (one role per user, no per-user overrides), checked against a static `Permission`/`RolePermission` catalog seeded once in `apps/api/prisma/seed.ts`. Four roles exist today — `super_admin`, `org_admin`, `recruiter`, `panel` — each with a fixed, non-overlapping (and non-hierarchical — `super_admin` does **not** implicitly have every permission) set of permissions.
- `GET /users` (`apps/api/src/users/`) already exists and already returns each user's `role`. There is **no endpoint that resolves a role to its permission set**, and **no endpoint to change a user's role or deactivate a user** after creation.

## 2. Scope Decisions

Both audit completeness and access review are in scope this phase, but each is deliberately narrowed:

- **Audit completeness**: close a curated list of high-value coverage gaps (Section 3) — not an exhaustive audit of every mutation in the codebase. Wire `apps/exam-runtime` into `AuditModule` for the first time, scoped to settlement/grading (the highest-value compliance gap on that side — score computation and pass/fail determination currently has no audit trail anywhere). Add the previously-unbuilt read/query API.
- **Access review**: read-only this phase. A new endpoint exposing role → permission mappings, combined with the already-existing `GET /users` (which already exposes role per user), answers "who has access to what." No role-change or deactivation endpoints — those are new mutation surface with their own audit/permission-check requirements, explicitly deferred to a later phase.
- **No frontend work.** `apps/web` remains an untouched 4-file skeleton; every prior phase has been backend-only and this one follows the same pattern. Both new endpoints are plain JSON APIs, covered by e2e tests exactly like the rest of the platform's surface.

## 3. Audit Completeness

### 3.1 New audit call sites

All follow the existing `AuditService.record(context, entry)` pattern — no new mechanism, just more invocations:

| # | Location | Action string | What it captures |
|---|---|---|---|
| 1 | `apps/api/src/organizations/organizations.service.ts` `create()` | `organization.created` | New tenant org created (platform-level call, `organizationId: null` context — matches the existing pattern for platform-scoped audit entries) |
| 2 | `apps/api/src/organizations/organizations.service.ts` `updateBrandingColors()` | `organization.branding_updated` | Branding colors changed |
| 3 | `apps/api/src/organizations/organizations.service.ts` `uploadLogo()` | `organization.logo_updated` | Org logo replaced |
| 4 | `apps/api/src/exams/exams.service.ts` `publish()` | `exam.published` | Exam made live for candidates |
| 5 | `apps/api/src/exams/exams.service.ts` `archive()` | `exam.archived` | Exam taken out of rotation |
| 6 | `apps/api/src/invitations/invitations.service.ts` `revoke()` | `invitation.revoked` | Candidate's exam access killed — a meaningful access-control action |
| 7 | `apps/api/src/attempts-admin/attempts-admin.service.ts` `reanalyze()` | `attempt.reanalyze_triggered` | Staff-triggered AI proctoring re-analysis |
| 8 | `apps/api/src/attempts-admin/attempts-admin.service.ts` `regenerateInsight()` | `attempt.insight_regenerated` | Staff-triggered AI insight regeneration |
| 9 | `apps/api/src/auth/auth.service.ts`, refresh-token-reuse detection path (inside `refresh()`) | `auth.token_reuse_detected` | Security-relevant: an entire refresh-token family revoked because a rotated-out token was reused |
| 10 | `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, settlement (`finalize()`/`settleIfExpired()`) | `attempt.settled` | Score computed + pass/fail determined. System-triggered — `actorUserId: null` |

For #10, `apps/exam-runtime/src/app.module.ts` gains an `AuditModule` import (already `@Global()` in `packages/shared`, exported the same way `apps/api` already consumes it — a one-line addition, no new dependency).

### 3.2 Explicitly deferred (real gaps, not this phase)

`ip_address`/`userAgent` capture; auditing `questions`/`tags`/`candidates` CRUD; `jobs.enqueue`; `auth.refresh`/`logout` on the non-reuse-detection path; richer `metadata` payloads on the 4 pre-existing call sites (`login.success`, `user.created`, `attempt.force_submit`, `attempt.message_sent`) — left exactly as they are.

### 3.3 Read API — `GET /audit-logs`

New `AuditController` in `apps/api`, gated by `@RequirePermissions('audit:view')` (new permission — see Section 4).

- **Filters** (all optional query params): `entityType`, `actorUserId`, `action`, `from`, `to`.
- **Pagination**: `limit`/`cursor`, matching `QuestionsService.list()`'s existing cursor-pagination shape.
- **Tenant scoping**: standard `TenantPrismaService.forTenant()` pattern — `org_admin` sees only their own org's entries; `super_admin` sees across all orgs (the same RLS-bypass mechanism already used elsewhere, e.g. `organizations.service.ts`'s `create()`).
- **Response shape**: each entry includes the actor's email alongside `actorUserId` (a bare UUID isn't useful for a human reviewing logs) via a join against `User`, nulled when `actorUserId` is null (system-triggered entries like `attempt.settled`).

### 3.4 Schema migration required

Verified directly against `apps/api/prisma/schema.prisma:89-101`: `AuditLog.actorUserId` is a bare `String?` column today — no `@relation` to `User` (unlike `organizationId`, which already has one), and **no indexes at all** on the table (not on `actorUserId`, `entityType`, `action`, or `createdAt`). This was fine for a write-only table but not for a filtered/paginated query endpoint. One migration adds:

- `actor User? @relation(fields: [actorUserId], references: [id])` on `AuditLog`, plus the corresponding back-relation, enabling a real Prisma `include` for the actor-email join in Section 3.3 instead of a manual second query.
- `@@index([organizationId, createdAt])` — the primary access pattern (tenant-scoped, newest-first).
- `@@index([actorUserId])`, `@@index([entityType])`, `@@index([action])` — supporting the filter params.

No changes to `Permission`/`RolePermission` schema — `audit:view` (Section 4.3) is new *data* via the seed script's existing upsert path, not a schema change.

## 4. Access Review

### 4.1 New endpoint — `GET /rbac/roles`

A new `RbacController` added to the existing `RbacModule` (`apps/api/src/rbac/`, currently exports only `PermissionsGuard` — no controller yet), gated by `@RequirePermissions('audit:view')` — the same permission as the audit read API, since both are admin-facing visibility tooling.

- Reads `RolePermission` joined with `Permission` from the database (the source of truth — today identical to `seed.ts`'s `ROLE_PERMISSIONS` constant, but the endpoint reads live data, not the constant).
- No query params — a small, fixed lookup (4 roles today), returned in full every call.
- Response: `[{ role: string, permissions: string[] }, ...]`.

### 4.2 `GET /users` — unchanged

Already returns `role` per user via `SAFE_USER_SELECT`. No modification needed; combined with `GET /rbac/roles`, a caller can answer "who has access to what" without any new mutation surface.

### 4.3 New permission — `audit:view`

Added to `apps/api/prisma/seed.ts`'s `PERMISSIONS` and `ROLE_PERMISSIONS` constants (applied via the seed script's existing upsert logic — no new migration mechanism beyond the seed data itself, though a migration IS needed for the `AuditLog` table's actor-email join to work efficiently — see Section 6 open items).

Granted to `super_admin` and `org_admin` only — **not** `recruiter`/`panel`, consistent with this being admin/compliance tooling rather than day-to-day staff functionality.

## 5. Testing & Verification Approach

1. **Unit tests**: each of the 10 new `AuditService.record()` call sites gets a test asserting the call happens with the correct `action`/`entityType`/`metadata`, extending the existing per-service spec files (matching how the 4 pre-existing call sites are already tested). `GET /audit-logs` and `GET /rbac/roles` get standard controller/service unit tests.
2. **E2E tests**: new `audit-log.e2e-spec.ts` covering — an audited action fires and is visible via `GET /audit-logs`; each filter (`entityType`, `actorUserId`, `action`, `from`/`to`) narrows results correctly; tenant isolation (`org_admin` from one org cannot see another org's entries, mirroring the existing `tenant-isolation.e2e-spec.ts` pattern); `recruiter`/`panel` receive `403` on both new endpoints (no `audit:view`). `GET /rbac/roles` is covered in the same file or a small dedicated one — asserts the correct 4-role shape.
3. **Full regression**: existing unit + e2e suites for both apps re-run to confirm no regression.
4. No live manual check is planned — this phase touches request-handling logic and read endpoints, not infra/networking/process bootstrapping, so standard e2e coverage is sufficient proof (unlike Phase 6b's rate limiting or the live-monitoring fix, where a live check caught defects e2e coverage alone would have missed).

## 6. Open Items

- `ip_address`/`userAgent` capture, full CRUD audit coverage (questions/tags/candidates), `jobs.enqueue` auditing, and richer `metadata` on existing call sites remain real gaps for a future pass.
- Role-change and user-deactivation endpoints are a natural next step once access review's read side is in place — explicitly deferred, not forgotten.
- The previously-deferred "Auditor/Compliance Viewer" read-only role (from the original master spec) is not created — `audit:view` is added to the existing `super_admin`/`org_admin` roles instead. A dedicated compliance-viewer role remains a reasonable future addition if a non-admin auditor persona is ever needed.
