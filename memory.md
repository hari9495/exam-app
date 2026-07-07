# Project Memory — Online MCQ Examination Platform

**Purpose of this file:** if you are a new Claude session (or a different account/machine) picking this project up, read this file first. It tells you what this project is, exactly what has been built so far, every decision and deviation made along the way, where the detailed docs live, and what to do next. After reading this, you should be able to continue the work without re-deriving anything from scratch.

**Last updated:** 2026-07-07, after Phase 1a (Question Bank) was completed, committed to `main`, and closed out in Azure DevOps.

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

## 2. Current Status: Phase 0 + Phase 1a Complete

**Phase 0 ("Foundation / App Skeleton")** is done, reviewed, merged to `main` (commit `dcc4248`), and fully closed out in Azure DevOps.

**Phase 1a ("Question Bank")** — the first sub-phase of the decomposed Phase 1 (Core Exam MVP) — is also done, reviewed, committed to `main` (commits `15b6fb0`..`14ba842`, see Section 5a), and fully closed out in Azure DevOps. No exam-taking/candidate-facing features exist yet — Phase 1a is backend-only CRUD for the question bank that Phase 1b (exam assembly) will build on.

**What Phase 0 actually delivers:** a working multi-tenant backend + minimal frontend where:
1. A Super Admin can create a client organization.
2. An Org Admin can invite a staff user into that organization.
3. That user can log in securely (JWT + refresh rotation).
4. Every sensitive action is restricted by role-based permissions (RBAC) and recorded in an audit trail.
5. All of this is provably tenant-isolated — one company's data can never leak into another's view — enforced at the database level, not just in application code.

**What Phase 1a additionally delivers:** a Recruiter can create, list, view, update, and archive MCQ questions (single-correct, multiple-correct, true/false) in their organization's question bank via a tested HTTP API, with:
1. A new `Question`/`QuestionOption` schema, tenant-isolated by the same SQL Server Row-Level Security mechanism Phase 0 established (extended to a new table, not a new mechanism).
2. Type-specific validation (option counts, correct-answer counts, marks/negativeMarks bounds) enforced before any database write.
3. Access gated by a new `question_bank:manage` permission, granted only to the `recruiter` role.
4. Soft-delete only (archive) — no hard `DELETE` on questions.
5. Full automated coverage: unit tests per layer + one e2e suite proving the full HTTP flow, tenant isolation, and RBAC denial together against a real server and real database.

**Full implementation plans with every task, every deviation, and every piece of code:**

- **`docs/superpowers/plans/2026-07-07-phase-0-foundation.md`** — Phase 0, full technical detail (search for "Deviation" for what changed from the original plan and why).
- **`docs/superpowers/plans/2026-07-07-phase-1a-question-bank.md`** — Phase 1a, same level of detail. Design spec: `docs/superpowers/specs/2026-07-07-phase-1a-question-bank-design.md`.

**Verification:** Phase 0: 13 unit tests + 6 e2e tests. Phase 1a: 32 unit tests + 11 e2e tests (cumulative totals on `main` as of Phase 1a's close — includes Phase 0's suites, no regressions). The full Phase 0 login → dashboard flow was verified in a real browser; Phase 1a is backend-only, verified via its e2e suite against the real backend and real SQL Server database (no frontend UI built for it in this sub-phase).

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
- **`created_at` defaults must use `GETUTCDATE()`, never `CURRENT_TIMESTAMP`/`GETDATE()`.** `CURRENT_TIMESTAMP` in SQL Server is OS-local time, not UTC — using it silently breaks cross-table timestamp comparisons on any host whose OS clock isn't UTC. This exact bug was introduced twice: once in Phase 1a's own new migration, and once (discovered while fixing the first) as a pre-existing regression in Phase 0's `20260707110003_uuid_columns` migration, affecting `audit_logs`, `organizations`, `plans`, `refresh_tokens`, and `users`. Both are fixed on `main` now (see Section 5a), but the underlying lesson is: **any future migration that drops and re-adds a `created_at` default constraint (e.g. as a side effect of an `ALTER COLUMN`) must re-add it with `GETUTCDATE()`, and always via a NEW migration file — never by editing an already-applied migration's SQL text in place** (a second lesson from the same incident: editing applied migrations breaks checksum integrity for any environment that already ran them; always add a corrective migration instead, even to fix a migration written earlier in the same session).
- **`Question.organizationId` is non-nullable, unlike `User.organizationId` (nullable).** `TenantContext.organizationId` is typed `string | null` codebase-wide (to support super-admin cross-tenant calls with no single org). `QuestionsService` therefore casts it `as string` at every Prisma call site — verified safe because RLS enforcement happens independently via `forTenant`'s session context, not via this cast, and `question_bank:manage` is only ever granted to org-scoped roles (`recruiter`), never `super_admin`. If a future permission grant gives `super_admin` (or any org-less role) access to `QuestionsService`, this cast would silently pass `null` into a `NOT NULL` column path — worth a guard at that point, not before.

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

## 5a. Task-by-Task Summary (all 6 Phase 1a tasks)

Built with `superpowers:subagent-driven-development`, directly on `main` (no feature branch — matches Phase 0's precedent; user explicitly confirmed this at the start of the session). Every task got a fresh implementer subagent + an independent task-scoped reviewer subagent; full commit history and review findings are in the ADO Task comments (Section 6) and in `docs/superpowers/plans/2026-07-07-phase-1a-question-bank.md`.

1. **Prisma schema + migration for `Question`/`QuestionOption`** (commit `15b6fb0`) — Approved on 2nd review pass. 1st pass caught an Important issue: the hand-written migration used `CURRENT_TIMESTAMP` instead of the codebase convention `GETUTCDATE()` for `created_at`. Fixed via a follow-up migration (`5dac260`) — see the `GETUTCDATE()` lesson in Section 4.
2. **Row-Level Security on `questions`** (commit `bdd9102`) — Approved, no fix round. Extended the existing `TenantAccessPolicy`, no new policy/function. 2 isolation tests + full e2e regression check, all green.
3. **Question payload validation logic** (commit `99f732a`) — Approved, no fix round. Pure function, 13/13 unit tests, no DB dependency.
4. **`QuestionsService`** (commit `e6a51a3`) — Approved, no fix round. One reviewed-and-verified-sound deviation from the plan's literal code: 4 additional `context.organizationId as string` casts, required because `Question.organizationId` is non-nullable unlike `User.organizationId` (see Section 4).
5. **`QuestionsController`, RBAC wiring, seed permission** (commit `e3edc2f`) — Approved, no fix round. New `question_bank:manage` permission granted to `recruiter`; full suite + `nest build` clean; `prisma db seed` re-run idempotently against the already-seeded DB.
6. **End-to-end test: full CRUD, tenant isolation, RBAC denial** (commit `b8759fb`) — Approved, no fix round. Two sound toolchain-fix deviations from the brief's literal code (supertest default import; added a missing `refreshToken.deleteMany` cleanup step before deleting users in `afterAll`, mirroring the exact fix Phase 0 already applied in `auth-flow.e2e-spec.ts` at commit `be27e6d`), both verified against that precedent file.

**Out-of-plan bug fixes done alongside** (found while fixing Task 1's review, not part of the 6 tasks): the same `CURRENT_TIMESTAMP`-vs-`GETUTCDATE()` bug was found pre-existing on 5 already-live Phase 0 tables (`audit_logs`, `organizations`, `plans`, `refresh_tokens`, `users`), reintroduced by Phase 0's own `20260707110003_uuid_columns` migration and never caught in Phase 0's review. Fixed via a new corrective migration (`93ea82e`), independently reviewed and approved. Logged as a comment on the Phase 0 Epic (#5745) for traceability.

**Final whole-branch review** (after all 6 tasks, dispatched on the most capable model): verdict "Ready to merge, with fixes." No correctness bugs in the feature itself — tenant isolation, RBAC, and the check-then-mutate `forTenant` pattern all hold consistently across all 6 tasks combined, re-verified with fresh eyes on the whole diff. One Important, cross-task-only-visible finding: the two `GETUTCDATE()` bug-fix commits above (`5dac260`, `93ea82e`) had each edited an *already-applied* migration file's SQL text in place, in addition to adding a proper corrective migration — a checksum-drift risk for any future environment that already ran the pre-edit version. Fixed per user's choice: commit `0046319` reverted both in-place edits back to their originally-applied text, keeping the corrective migrations (`130001`/`130002`) as the sole fix mechanism. Verified clean (`migrate status`, live DB column defaults, full suite) after the revert. Minor, non-blocking notes recorded in the plan doc: `list()` returns a bare array despite advertising cursor pagination (fine for MVP); `POST /:id/archive` returns `201` (internally consistent, just a semantic nit); one corrective migration lacks the transaction wrapper its sibling has.

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

**Phase 1a (Question Bank)** — same organization/project. All items Closed (one duplicate, #5767, created by an accidental double-invocation while setting this up — marked Removed, not deleted, since the API's delete lacked permission; #5766 is the real Epic):

| ID | Type | Title | Parent |
|---|---|---|---|
| 5766 | Epic | Phase 1a - Question Bank | — |
| 5768 | User Story | Recruiter's question bank data is stored with tenant-isolated schema | 5766 |
| 5772 | Task | Prisma schema and migration for Question/QuestionOption | 5768 |
| 5773 | Task | Row-Level Security on the questions table | 5768 |
| 5769 | User Story | Recruiter's question submissions are validated by question type | 5766 |
| 5774 | Task | Question payload validation logic | 5769 |
| 5775 | Task | QuestionsService: tenant-scoped CRUD | 5769 |
| 5770 | User Story | Recruiter can manage the question bank through a secure API | 5766 |
| 5776 | Task | QuestionsController, RBAC wiring, and seed permission | 5770 |
| 5771 | User Story | Question bank CRUD flow is proven end-to-end before Phase 1b builds on it | 5766 |
| 5777 | Task | End-to-end test: full CRUD flow, tenant isolation, RBAC denial | 5771 |

Same Description/Discussion completeness standard as Phase 0. Note: unlike Phase 0, the 4 User Stories here were initially closed with a bare state change and no narrative comment — caught and fixed after the fact (each got its closing-summary comment added referencing its child Task(s) and outcome). **If you create ADO items for a future phase, add the closing narrative comment to User Stories at the same time you close them, not as a follow-up cleanup pass.**

---

## 7. Known, Deliberately Deferred Items (not bugs — documented tradeoffs)

- **`npm audit`: 26-28 vulnerabilities** (3 low, 14-15 moderate, 9-10 high) in NestJS's own transitive dependency tree. Fixable only via `npm audit fix --force` (breaking major-version bumps to `@nestjs/core`, `@nestjs/platform-express`, etc.). Deliberately not touched mid-plan — too risky to do alongside everything else. **Should be its own dedicated task before any production deployment.**
- **Auditor/Compliance read-only role** — mentioned in the original design spec, explicitly deferred to keep Phase 0 scope tight.
- **Candidate-facing result release toggle, certificates, SSO, 2FA, OTP login** — all future-phase features per the design spec, not built yet.
- A handful of Minor code-quality notes (non-atomic refresh-token rotation, no standalone index on `users.email`, TOCTOU race in org slug-uniqueness check, etc.) — all reviewed, judged low-risk, and recorded in `.superpowers/sdd/progress.md`-style detail inside the plan doc and ADO comments. None block Phase 1.
- **Phase 1a scope, deliberately deferred per its design spec:** rich text/images/math equations in question content, bulk import/export, AI-assisted question generation, a reusable tag system. No frontend UI was built for the question bank (backend-only sub-phase, same as most of Phase 0). `list()` returns a bare array rather than a `{ data, nextCursor }` envelope despite supporting cursor pagination server-side — acceptable for MVP, a client can still paginate via the last row's `id`, but worth revisiting if a real frontend consumes this API.

---

## 8. How to Resume Work

1. **Read this file first** (you just did).
2. For product/feature questions → read `docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`.
3. For "how was X actually built" → read `docs/superpowers/plans/2026-07-07-phase-0-foundation.md` (Phase 0) or `docs/superpowers/plans/2026-07-07-phase-1a-question-bank.md` (Phase 1a), searching for the relevant Task number.
4. To run the app locally → follow `README.md` at repo root.
5. **Before starting Phase 1b** (exam assembly — next up per the roadmap) or any new work: this project follows a structured process — brainstorm/design first (`superpowers:brainstorming`), write an implementation plan (`superpowers:writing-plans`), then execute task-by-task with a fresh subagent per task + independent review + fix loops (`superpowers:subagent-driven-development`). **Note the actual precedent set by both phases so far: work happens directly on `main`, not an isolated worktree/feature branch** — this deviates from the skill's own stated default, but matches how this specific project has always been run; confirm with the user if picking this up in a context where that might have changed. Azure DevOps work items should be created for the new phase (Epic → User Stories → Tasks) mirroring the Phase 0/1a structure, and kept updated with real engineering narrative **on every item, including User Stories** as work progresses — Phase 1a initially missed narrative comments on its User Stories and had to backfill them (Section 6).
6. **Remember the #1 lesson from Phase 0** (Section 4): any new code touching `users` or `audit_logs` (or any future RLS-protected table, e.g. `questions` as of Phase 1a) MUST go through `TenantPrismaService.forTenant()`, and any code that needs a session-context bypass must keep the context-setting call and the dependent query inside the same `forTenant`/`$transaction` call.
7. **Remember the Phase 1a lesson** (Section 4): any `created_at`-style default must use `GETUTCDATE()`, and any migration fix must be a NEW migration — never edit an already-applied migration file's SQL text in place, even within the same session that wrote it.
