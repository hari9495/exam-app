# Project Memory — Online MCQ Examination Platform

**Purpose of this file:** if you are a new Claude session (or a different account/machine) picking this project up, read this file first. It tells you what this project is, exactly what has been built so far, every decision and deviation made along the way, where the detailed docs live, and what to do next. After reading this, you should be able to continue the work without re-deriving anything from scratch.

**Last updated:** 2026-07-07, after Phase 0 was completed, merged to `main`, and closed out in Azure DevOps.

---

## 1. What This Project Is

A white-label, multi-tenant SaaS platform for running AI-proctored MCQ exams for company hiring — designed to eventually support 10,000+ concurrent candidates per exam. Full product vision, requirements, roles, features, database design, API design, architecture, and security design are documented in:

**`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`** — read this for full product/architecture context. It covers 16 sections: requirements, product vision, user roles, feature list, user stories, screen list, UI/UX design system, information architecture, user flow, database design, API design, system architecture, security design, edge cases, development roadmap, and future enhancements.

Key facts from that spec worth knowing immediately:
- **Multi-tenancy:** shared database, row-level isolation via `organization_id` + SQL Server Row-Level Security, region-sharded for data residency (not database-per-tenant).
- **Roles:** Super Admin (platform operator), Org Admin, Recruiter, Panel, Candidate.
- **Tech stack:** Next.js frontend, NestJS backend, **SQL Server** (swapped from the original PostgreSQL recommendation per user preference), Prisma ORM, JWT auth, Redis (planned, not yet built), AI proctoring via third-party integration (planned, not yet built).
- **Roadmap:** Phase 0 (Foundation) → Phase 1 (Core Exam MVP) → Phase 2 (Anti-Cheat & Live Monitoring) → Phase 3 (White-Label & Scale) → Phase 4 (Randomization/Reporting) → Phase 5 (AI Features) → Phase 6 (Compliance/Security Hardening) → Phase 7 (Launch Readiness). Full detail in the spec's Development Roadmap section.

---

## 2. Current Status: Phase 0 Complete and Merged

**Phase 0 ("Foundation / App Skeleton")** is done, reviewed, merged to `main` (commit `dcc4248`), and fully closed out in Azure DevOps. This is the ONLY phase built so far — no exam/question/candidate features exist yet.

**What Phase 0 actually delivers:** a working multi-tenant backend + minimal frontend where:
1. A Super Admin can create a client organization.
2. An Org Admin can invite a staff user into that organization.
3. That user can log in securely (JWT + refresh rotation).
4. Every sensitive action is restricted by role-based permissions (RBAC) and recorded in an audit trail.
5. All of this is provably tenant-isolated — one company's data can never leak into another's view — enforced at the database level, not just in application code.

**Full implementation plan with every task, every deviation, and every piece of code:**

**`docs/superpowers/plans/2026-07-07-phase-0-foundation.md`** — read this for full technical detail on exactly how each piece was built, including every deviation from the original plan (search for "Deviation" in that file) and why.

**Verification:** 13 unit tests + 6 e2e tests passing on `main`. The full login → dashboard flow was verified in a real browser (not just automated tests) against the real backend and real SQL Server database.

---

## 3. Local Development Environment Facts

These are specific to how this project's dev environment actually ended up configured (not the original plan — read this before assuming anything):

- **Repo location:** `D:\exam app` (Windows machine). Git repo, `main` branch, **no remote configured** — fully local, never pushed anywhere.
- **Database:** SQL Server 2019 Express, installed **natively on Windows** (instance name `SQLEXPRESS`), NOT Docker. Docker Desktop's daemon would not start reliably on this machine, so Docker was abandoned in favor of the native install. Configured for:
  - TCP/IP protocol enabled, static port **1433** (was dynamic by default)
  - Mixed Mode authentication enabled (was Windows-only by default)
  - Database: `examapp`
  - Dedicated least-privilege login: `examapp_dev` / `DevPassw0rd!2026` (NOT `sa` — deliberately least-privilege, no `CREATE DATABASE` permission)
  - `.env` / `.env.example` `DATABASE_URL`: `sqlserver://localhost:1433;database=examapp;user=examapp_dev;password=DevPassw0rd!2026;trustServerCertificate=true`
- **Why this matters for migrations:** because `examapp_dev` lacks `CREATE DATABASE` permission, Prisma's `migrate dev` command (which needs a shadow database) **does not work** in this project. **Always use `npx prisma migrate deploy`** to apply migrations, never `migrate dev` (only `migrate dev --create-only` is safe, since that step doesn't touch the shadow DB). After `migrate deploy`, run `npx prisma generate` explicitly — unlike `migrate dev`, `migrate deploy` does not auto-generate the Prisma Client.
- **Seeded demo accounts** (from `apps/api/prisma/seed.ts`, run via `npx prisma db seed`):
  - Super Admin: `super@platform.test` / `DevSuper123!` (no organization slug needed to log in)
  - Demo Org Admin: `admin@demo-org.test` / `DevAdmin123!` (organization slug: `demo-org`)
- **A note on Azure SQL:** early in this project, an existing Azure SQL Server (`ptc-sf-interview.database.windows.net`) was tried and rejected — the user doesn't have permission to whitelist their IP on its firewall, and no one at their org has fixed that yet. This is a legitimate future option (e.g., for a shared/deployed environment) but is NOT currently used for local dev. If someone later gets firewall access sorted out, swapping `DATABASE_URL` to point there is a drop-in change — nothing else in the codebase needs to change.
- **Running the app locally:** see `README.md` at repo root for the up-to-date step-by-step (it was fixed during the final review to reflect the native SQL Server setup and the `migrate deploy` requirement, not the originally-planned Docker approach).

---

## 4. Architecture & Key Decisions Made

- **Monorepo:** npm workspaces, `apps/api` (NestJS backend) + `apps/web` (Next.js frontend), root `package.json`/`tsconfig.base.json`.
- **Multi-tenant isolation:** every tenant-scoped table (`users`, `audit_logs`) has a native SQL Server **Row-Level Security Security Policy** — a predicate function that returns rows only if the session is flagged super-admin OR the row's `organization_id` matches the session's current org. With no session context set, both branches are false → **zero rows returned by default (fails closed)**. This is the single most important security mechanism in the codebase.
- **`TenantPrismaService.forTenant()`** (`apps/api/src/prisma/tenant-prisma.service.ts`) is the ONLY correct way to query `users`/`audit_logs`. It wraps a `SESSION_CONTEXT`-setting call and the caller's query in one `$transaction`, guaranteeing they share the same physical DB connection, and resets the session context in a `finally` block before the connection returns to Prisma's pool.
  - **⚠️ THE #1 RECURRING BUG IN THIS CODEBASE:** `sp_set_session_context` is scoped to the physical DB connection, not to any Prisma transaction — and Prisma pools/reuses connections across separate top-level calls not wrapped in a single `$transaction`. This exact bug was found and fixed **three separate times** during Phase 0: in `TenantPrismaService.forTenant` itself, in the seed script, and in e2e test cleanup logic (twice). A final whole-codebase sweep confirmed no 4th instance exists — but **if you ever write new code that touches `users` or `audit_logs`, it MUST go through `forTenant`, and if you ever need to bypass tenant scoping (e.g., a bootstrap/admin script), the session-context-setting call and every query that depends on it must be inside the SAME `forTenant`/`$transaction` call.** This is the single most important lesson from Phase 0.
- **UUID columns:** all id/foreign-key columns use `@db.UniqueIdentifier` in Prisma (maps to SQL Server `UNIQUEIDENTIFIER`) — NOT plain `String` (which Prisma defaults to `NVARCHAR(1000)` for SQL Server, a real bug that was caught and fixed after Task 4's review).
- **Password security:** Argon2id hashing throughout. `passwordHash` is excluded from ALL API responses via a Prisma `select` clause (`SAFE_USER_SELECT` in `apps/api/src/users/users.service.ts`) — never fetched into memory, not just filtered after the fact.
- **JWT auth:** access tokens 15 min TTL, refresh tokens 30 days with rotation + reuse detection (using a used-up refresh token revokes the entire token family). Frontend keeps the access token only in React state (never `localStorage`), refresh token in an httpOnly cookie.
- **RBAC:** a `@RequirePermissions(...)` decorator + `PermissionsGuard` checks the caller's role against a data-driven `role_permissions` table (seeded in `seed.ts`) — not hardcoded logic.
- **Audit logging:** insert-only (`AuditService`, no update/delete method exists), records `login.success` and `user.created` events.

---

## 5. Task-by-Task Summary (all 12 Phase 0 tasks)

Each task below has full commit history, review findings, and fixes documented as comments on its Azure DevOps work item (see Section 6 for the ID map) and in the plan doc. Summary:

1. **Monorepo scaffolding** — npm workspaces, NestJS skeleton, health-check test. Approved, minor Node-version-pin gap fixed later.
2. **Local SQL Server** — originally planned as Docker Compose; deviated to native SQL Server Express (see Section 3) since Docker Desktop wouldn't start. Controller-performed (required Administrator-elevated Windows changes a sandboxed subagent can't do).
3. **Prisma schema + initial migration** — 7 tables (Plan, Organization, User, Permission, RolePermission, RefreshToken, AuditLog). Hit and fixed: wrong migration-apply method (`db push` → `migrate deploy`) and a `migration_lock.toml` provider mismatch.
4. **Row-Level Security + TenantPrismaService** — the core security mechanism (see Section 4). Found and fixed the connection-pooling leak (1st occurrence). Also required a follow-up fix: UUID columns were wrong type (NVARCHAR, not UNIQUEIDENTIFIER) — fixed via 5 new migrations, verified byte-identical RLS/FK behavior afterward.
5. **Seed script** — trial plan, permissions, bootstrap Super Admin + demo Org Admin. Found and fixed the connection-pooling leak again (2nd occurrence), in the RLS-bypass logic.
6. **Organizations module** — Super Admin creates an org, slug-uniqueness enforced. Approved cleanly.
7. **RBAC guard** — data-driven permission decorator/guard. Approved cleanly.
8. **Auth module** — login, JWT issuance, refresh rotation with reuse detection, logout. Approved on high-scrutiny review (auth is security-critical) — connection-safety independently re-verified correct.
9. **Users module** — Org Admin creates a user in their own org, all 5 modules wired into `AppModule` for the first time. Approved, but review caught a real issue fixed as an immediate follow-up: `passwordHash` was leaking in API responses — fixed via `SAFE_USER_SELECT`.
10. **Audit logging** — insert-only audit trail on login/user-creation. Approved cleanly.
11. **Frontend shell** — Next.js login page + protected dashboard. Verified working in a real browser against the real backend.
12. **E2E smoke test + README** — proves the whole Phase 0 flow end-to-end. Found and fixed the connection-pooling leak a 3rd time (in test cleanup logic, in two separate test files) — this time root-caused properly with before/after row-count verification across two consecutive test runs.

**Final whole-branch review** (after all 12 tasks): independently swept the entire codebase for a 4th instance of the connection-pooling bug (none found), fixed 2 real issues before merge — a broken setup instruction in the README (`migrate dev` instead of `migrate deploy`) and missing database indexes on the auth hot path (`refresh_tokens.user_id`, `role_permissions.permission_id`) — plus 3 small cleanup items (dead code, Node version pin).

---

## 6. Azure DevOps Reference

**Organization:** `https://dev.azure.com/PIDC-Salesforce` · **Project:** `Interview App`

All work items are Closed. Structure:

| ID | Type | Title |
|---|---|---|
| 5745 | Epic | Phase 0 - Foundation (App Skeleton) |
| 5746 | User Story | Super Admin can create a new organization |
| 5747 | Task | Monorepo scaffolding and tooling |
| 5748 | Task | Local SQL Server via Docker Compose (→ native SQL Server, see Section 3) |
| 5749 | Task | Prisma schema (Phase 0 models) and initial migration |
| 5750 | Task | Row-Level Security enforcement plus TenantPrismaService |
| 5751 | Task | Seed script: plan, permissions, bootstrap accounts |
| 5752 | Task | Organizations module: Super Admin creates an organization |
| 5753 | User Story | Org Admin can invite a team member |
| 5754 | Task | Users module: Org Admin creates a user in their own org |
| 5755 | User Story | Staff user can log in securely |
| 5756 | Task | Auth module: login, JWT issuance, refresh rotation, logout |
| 5757 | User Story | RBAC enforced and sensitive actions audit-logged |
| 5758 | Task | RBAC guard: permissions decorator and guard |
| 5759 | Task | Audit logging on login and user/org creation |
| 5760 | User Story | Developer can see the login flow working end-to-end in a browser |
| 5761 | Task | Frontend shell: login page and protected dashboard |
| 5762 | Task | End-to-end smoke test and README |

Every item's **Description** field has full what/why/acceptance-criteria (User Stories) or what/why/definition-of-done (Tasks). Every item's **Discussion/Comments** has the real engineering narrative: what was built, what review found, what was fixed, and why — not just "Closed" with no trace. Read the comments for the full story on any specific piece.

---

## 7. Known, Deliberately Deferred Items (not bugs — documented tradeoffs)

- **`npm audit`: 26-28 vulnerabilities** (3 low, 14-15 moderate, 9-10 high) in NestJS's own transitive dependency tree. Fixable only via `npm audit fix --force` (breaking major-version bumps to `@nestjs/core`, `@nestjs/platform-express`, etc.). Deliberately not touched mid-plan — too risky to do alongside everything else. **Should be its own dedicated task before any production deployment.**
- **Auditor/Compliance read-only role** — mentioned in the original design spec, explicitly deferred to keep Phase 0 scope tight.
- **Candidate-facing result release toggle, certificates, SSO, 2FA, OTP login** — all future-phase features per the design spec, not built yet.
- A handful of Minor code-quality notes (non-atomic refresh-token rotation, no standalone index on `users.email`, TOCTOU race in org slug-uniqueness check, etc.) — all reviewed, judged low-risk, and recorded in `.superpowers/sdd/progress.md`-style detail inside the plan doc and ADO comments. None block Phase 1.

---

## 8. How to Resume Work

1. **Read this file first** (you just did).
2. For product/feature questions → read `docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`.
3. For "how was X actually built" → read `docs/superpowers/plans/2026-07-07-phase-0-foundation.md` (search for the relevant Task number).
4. To run the app locally → follow `README.md` at repo root.
5. **Before starting Phase 1** (or any new work): this project follows a structured process — brainstorm/design first (superpowers:brainstorming), write an implementation plan (superpowers:writing-plans), then execute task-by-task with a fresh subagent per task + independent review + fix loops (superpowers:subagent-driven-development), working in an isolated git worktree, never directly on `main`. Azure DevOps work items should be created for the new phase (Epic → User Stories → Tasks) mirroring the Phase 0 structure, and kept updated with real engineering narrative as work progresses — not just state changes with no comment.
6. **Remember the #1 lesson from Phase 0** (Section 4): any new code touching `users` or `audit_logs` (or any future RLS-protected table) MUST go through `TenantPrismaService.forTenant()`, and any code that needs a session-context bypass must keep the context-setting call and the dependent query inside the same `forTenant`/`$transaction` call.
