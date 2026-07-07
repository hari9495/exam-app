# Phase 1c — Candidates & Invitations Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-07
**Depends on:** Phase 0 (Foundation), Phase 1a (Question Bank), Phase 1b (Exam Builder) — all merged to `main`. See `memory.md` for full prior context, `docs/superpowers/specs/2026-07-07-phase-1b-exam-builder-design.md` for the exam schema this sub-phase builds on.

---

## 1. Context and Scope

This is the third sub-phase of Phase 1 ("Core Exam MVP") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Development Roadmap section). Phase 1 is being built as a sequence of sub-phases:

1a. Question Bank — done
1b. Exam Builder — done
1c. **Candidates & Invitations** (this spec)
1d. Exam-Taking Runtime
1e. Grading & Results

**Goal of this sub-phase:** a Recruiter can add candidates to their organization (manually or via CSV), publish an exam once it has real content, invite candidates to a published exam, and manage those invitations (list/resend/revoke) — via a tested API, with the same tenant-isolation guarantees established in Phase 0 and extended through Phase 1a/1b. Real emails are sent (not stubbed/logged-only), but through a dev-friendly provider (Ethereal) rather than a production email account, since none exists yet.

### In scope
- Candidate CRUD: create one, list, CSV bulk upload (upsert semantics)
- Exam publish lifecycle: `draft` → `published`, gated on the exam actually having content
- Invitation CRUD: bulk-create (invite N candidates to one published exam), list, resend, revoke
- Real SMTP email delivery via Nodemailer, using Ethereal in dev (no signup, no Docker — matches the project's history of avoiding infra that doesn't reliably run on this machine)
- A `Notification` record per send attempt, as a send-audit trail
- Backend API only (NestJS), RBAC-guarded, RLS-protected
- Full test coverage (unit + e2e), with e2e using a test-double `EmailService` to avoid network-dependent flakiness

### Explicitly out of scope (deferred to later sub-phases or the product roadmap's later phases)
- **Candidate-facing invite-link login / any candidate auth.** 1c only creates invitation *records* (token + expiry). Validating a token and logging a candidate in requires an exam-taking landing surface, which doesn't exist until 1d. Building login now would have no destination to redirect to.
- **Candidate groups/batches** (`candidate_groups`/`candidate_group_members`) — the spec itself frames these as an organizational nice-to-have, not a functional requirement. Deferred; additive later (a join table, no rework of `Candidate`/`Invitation`).
- **Real production email provider** (SendGrid/SES/Postmark) — no account exists yet. The `EmailService` is built against SMTP generically (Nodemailer), so swapping providers later is an env var change, not a code change.
- **Invitation states that require an attempt** (`started`, `in_progress`, `submitted`) — meaningless until 1d's exam-taking runtime exists to produce an `Attempt`. 1c's invitations only ever move `invited → revoked` or `invited → expired` (time-based, not actively transitioned by any endpoint in this phase — `expiresAt` is just a timestamp checked whenever 1d needs it).
- **Multipart file upload** for CSV — sent as raw text in a JSON body instead (see Section 4). No frontend exists yet to justify real file-upload plumbing.
- Any frontend UI — same precedent as every prior sub-phase.

---

## 2. Data Model

Two new tables and one modified enum-like field, added via a new Prisma migration on top of the existing Phase 0/1a/1b schema:

```prisma
model Candidate {
  id             String       @id @default(uuid()) @db.UniqueIdentifier
  organizationId String       @map("organization_id") @db.UniqueIdentifier
  email          String
  name           String
  phone          String?
  createdAt      DateTime     @default(now()) @map("created_at")
  invitations    Invitation[]

  @@unique([organizationId, email])
  @@map("candidates")
}

model Invitation {
  id            String        @id @default(uuid()) @db.UniqueIdentifier
  examId        String        @map("exam_id") @db.UniqueIdentifier
  candidateId   String        @map("candidate_id") @db.UniqueIdentifier
  token         String        @unique
  status        String        @default("invited") // 'invited' | 'revoked' | 'expired'
  invitedAt     DateTime      @default(now()) @map("invited_at")
  expiresAt     DateTime      @map("expires_at")
  revokedAt     DateTime?     @map("revoked_at")
  exam          Exam          @relation(fields: [examId], references: [id], onDelete: Cascade)
  candidate     Candidate     @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  notifications Notification[]

  @@index([examId, status])
  @@map("invitations")
}

model Notification {
  id           String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId String     @map("invitation_id") @db.UniqueIdentifier
  channel      String     @default("email")
  status       String     // 'sent' | 'failed'
  sentAt       DateTime?  @map("sent_at")
  createdAt    DateTime   @default(now()) @map("created_at")
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([invitationId])
  @@map("notifications")
}
```

`Exam.status` changes meaning (existing column, no schema change needed) from `active`/`archived` to `draft`/`published`/`archived`, with `draft` as the new default. This is a **behavioral** change (see Section 3), not a structural one — no migration needed for the column itself, but the seed/existing-row default assumption changes, so a data migration step sets any pre-existing `active` exam to `published` (there shouldn't be any real ones outside test data, but this keeps `main` consistent).

**Why `Candidate` gets its own RLS policy but `Invitation`/`Notification` don't** (same reasoning framework as 1b's `exam_sections`/`exam_section_questions`, restated here since this is where it's decided each time): `Candidate` is queried directly — `GET /candidates`, `POST /candidates` — with no parent to route through. `Invitation` is always reached via a parent (`GET /exams/:examId/invitations`, or by its own `:id` for resend/revoke, where ownership is checked by loading the invitation and verifying its `exam.organizationId` matches the caller's org — same pattern as 1b's section-question ownership check). `Notification` is always reached via its parent `Invitation`, never queried standalone. So: one new RLS policy (`candidates`), zero new predicate functions (reuses `fn_tenant_access_predicate`), two tables protected transitively.

**Uniqueness:** `(organizationId, email)` is a real unique constraint on `Candidate` (not just an index, unlike the spec's original looser index) — this is what makes CSV upsert well-defined. `Invitation.token` is unique for token-lookup (needed by 1d, built now since the column exists). No uniqueness constraint enforces "one invitation per (exam, candidate)" at the DB level — a candidate could theoretically get two invitations to the same exam if the first was revoked; the *application* layer prevents duplicate **active** invitations (Section 3), which is the actual rule, and is more nuanced than a DB constraint can express cleanly.

---

## 3. Validation & Business Rules

**Candidate:**
| Rule | Detail |
|---|---|
| `email` | required, valid email format |
| `name` | required, non-empty |
| `phone` | optional |
| Manual create duplicate | `email` already exists in org → `409 Conflict` |
| CSV row duplicate | `email` already exists in org → **update** `name`/`phone`, counted as `updated` not `created` |
| CSV row invalid | missing/invalid `email` or missing `name` → skipped, counted in `errors` with the row number and reason; does not abort the rest of the batch |

**Exam publish (`POST /exams/:id/publish`):**
| Rule | Detail |
|---|---|
| Already published/archived | `400 Bad Request` — publish is a one-way `draft → published` transition |
| No sections | `400 Bad Request` |
| Any section with zero questions | `400 Bad Request` — every section must have at least one question attached (fixed-list, per 1b's current scope) |

**Invitation create (`POST /exams/:examId/invitations`, body `{ candidateIds: [...] }`):**
| Rule | Detail |
|---|---|
| Exam not published | `400 Bad Request` — invitations only go out for a `published` exam |
| Cross-tenant candidate/exam reference | resolved via the same `forTenant` session-context pattern as 1b — a reference to another org's candidate or exam simply isn't found, surfaces as `404`/silently excluded per-item (see below) |
| Candidate already has a live invitation for this exam | skipped, not an error — `status: 'invited'` and `expiresAt` in the future counts as "live"; an `expired` or `revoked` prior invitation doesn't block a new one |
| Response shape | `{ created: Invitation[], skipped: { candidateId, reason }[] }` — bulk operation, partial success is the normal case, not an exception |

**Invitation resend (`POST /invitations/:id/resend`):** only valid while `status: 'invited'` (not `revoked`); generates a new `token`, resets `expiresAt` to now+7 days, triggers a new email send (new `Notification` row). The old token stops working immediately (it's simply no longer the value stored on the row — token lookups are always by exact match against the current `token` column, so a replaced token loses all validity as a side effect of the same write).

**Invitation revoke (`POST /invitations/:id/revoke`):** sets `status: 'revoked'`, `revokedAt: now()`. Idempotent — revoking an already-revoked invitation is a no-op `200`, not an error (matches the general soft-delete precedent from `archive()` in 1a/1b, which is also idempotent).

---

## 4. API Design

```
POST   /api/v1/candidates                      create one candidate (email, name, phone?)
GET    /api/v1/candidates                       list, org-scoped, cursor-paginated
POST   /api/v1/candidates/bulk                  CSV bulk upsert: { csvContent: string } -> { created, updated, errors }

POST   /api/v1/exams/:id/publish                draft -> published (see Section 3 for gating rules)

POST   /api/v1/exams/:examId/invitations        bulk-invite: { candidateIds: string[] } -> { created, skipped }
GET    /api/v1/exams/:examId/invitations         list invitations for this exam
POST   /api/v1/invitations/:id/resend            new token + expiry, re-send email
POST   /api/v1/invitations/:id/revoke            status -> revoked
```

CSV format: header row `email,name,phone` (phone column optional per-row, header itself always present). Parsed with a new dependency, `csv-parse` (sync API, no streaming needed at expected volumes for this phase — bulk CSVs of 5,000+ rows per the spec's "campus drive" scenario are a later performance concern once there's a real frontend driving real-sized uploads; 1c proves the mechanism, not the scale).

**New RBAC permission:** `candidate:manage` — granted to the `recruiter` role in seed data, covering candidates *and* invitations (one permission per sub-phase, same convention as `question_bank:manage` and `exam:manage`). `POST /exams/:id/publish` uses the *existing* `exam:manage` permission — it's an exam lifecycle action, not a candidate one, and lives in the existing `ExamsController`/`ExamsService`, not a new module.

**Module structure:** two new NestJS modules, `CandidatesModule` (candidates + CSV) and `InvitationsModule` (invitations, depends on `CandidatesModule` and `ExamsModule` for cross-entity lookups), plus a new `NotificationsModule` housing `EmailService` (used by `InvitationsModule`) and the `Notification` write path.

---

## 5. Email Delivery

`EmailService.send({ to, subject, html }): Promise<{ success: boolean }>` wraps a Nodemailer transporter.

- **Dev/local config:** on first use, if no `SMTP_HOST` env var is set, `EmailService` calls `nodemailer.createTestAccount()` once (Ethereal — a real, free instant-SMTP test service, no signup) and caches the generated credentials for the process lifetime. Every send is a real SMTP send; the service logs `nodemailer.getTestMessageUrl(info)` so a developer can open the actual rendered email in a browser.
- **Prod config (future):** if `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` are set, those are used instead — no code change, just env vars, whenever a real provider account exists.
- **Invitation email content:** subject "You've been invited to an exam", body includes the exam title and the invitation link (`{FRONTEND_URL}/invite/{token}` — the route itself is 1d's concern, only the URL shape is decided now since the token exists today).
- Every send attempt (success or failure) writes a `Notification` row. A failed send does **not** fail the invitation-creation request — the `Invitation` row is already committed; email is best-effort, retryable later via `resend`. This mirrors the general principle that the durable record (the invitation existing, with its token) is the source of truth, and delivery is a side effect that can be retried without affecting correctness.

**Testing tradeoff, stated explicitly:** Ethereal sends are real network calls. Unit tests for `EmailService` mock the Nodemailer transporter (no network). e2e tests for `InvitationsModule` override `EmailService` via Nest's testing module DI (a recording test double — asserts `send` was called with the right `to`/content, doesn't hit the network) so the full HTTP+DB invitation flow is proven without making the standard test run network-dependent or flaky. A one-off manual check (not part of the automated suite) confirms real Ethereal delivery works end-to-end before this phase is considered done.

---

## 6. Security: Tenant Isolation & RBAC

Follows the exact Phase 0/1a/1b pattern:

- A new migration adds a SQL Server Row-Level Security Security Policy on `candidates`: FILTER + BLOCK predicates using the existing `fn_tenant_access_predicate` function — no new predicate function, no new policy for `invitations`/`notifications` (transitively protected through `candidates`/`exams`, same reasoning as 1b's child tables).
- Every service method touching `candidates`, `invitations`, or `notifications` goes through `TenantPrismaService.forTenant()`. Any check-then-mutate unit of work (does this invitation's exam belong to my org? does this candidate?) happens inside a single `forTenant` call — restating the Phase 0 lesson for a fourth feature area.
- Invitation resend/revoke by bare `:id` (no exam/candidate in the URL) is the one new ownership-check shape in this phase: load the invitation, join to its exam, confirm `exam.organizationId` matches the caller's org-pinned session — all inside one `forTenant` call, same as how 1b resolved a section-question's ownership through its parent exam.

---

## 7. Testing Approach

- **Unit tests** (mocked `TenantPrismaService`): `CandidatesService` (create/list/CSV-upsert-with-errors), `ExamsService.publish` (all three gating rules from Section 3), `InvitationsService` (bulk-create with skip logic, resend token rotation, revoke idempotency), `EmailService` (mocked transporter, success and failure paths), CSV parsing helper (malformed rows, missing columns).
- **RLS isolation test** (e2e, real database): a query against `candidates` with no tenant context returns zero rows; one org never sees another org's candidates. `invitations`/`notifications` isolation proven transitively (no direct query path bypasses `exams`/`candidates`), consistent with 1b's `exam_sections` precedent.
- **End-to-end HTTP flow** (real server + real database, `EmailService` overridden with a recording test double): create 2 candidates manually + 3 via CSV (including one duplicate-email row to prove upsert, one malformed row to prove partial-success) → attempt to publish an exam with no sections → expect 400 → add a section with a question, publish → expect 200 → invite all 5 candidates → expect 5 created → invite the same 5 again → expect 5 skipped (already invited) → resend one invitation, confirm its token changed → revoke one invitation → confirm its status → RBAC denial (a role without `candidate:manage` gets 403 on candidate/invitation endpoints).

---

## 8. Open Items / Deferred to Future Sub-Phases

- Candidate-facing invite-link login and any candidate auth — 1d's concern, needs an exam-taking landing surface to redirect to.
- Candidate groups/batches — additive later, no functional blocker identified.
- Real production email provider account — env var swap whenever one exists.
- Invitation `expired` status is never actively set by any endpoint in this phase (no cron/sweep job) — `expiresAt` is just a timestamp; whoever validates a token in 1d checks it against `now()` directly. An active expiry sweep (for list/reporting views to show `expired` instead of a stale `invited`) is a small later addition once there's a UI that would show the difference.
- Multipart CSV file upload — raw-text-in-JSON-body is sufficient until a frontend exists.
- Frontend UI — same precedent as every prior sub-phase.
