# Phase 1d — Exam-Taking Runtime Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-08
**Depends on:** Phase 0 (Foundation), Phase 1a (Question Bank), Phase 1b (Exam Builder), Phase 1c (Candidates & Invitations) — all merged to `main`. See `memory.md` for full prior context, `docs/superpowers/specs/2026-07-07-phase-1c-candidates-invitations-design.md` for the invitation schema this sub-phase builds on.

---

## 1. Context and Scope

This is the fourth sub-phase of Phase 1 ("Core Exam MVP") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Development Roadmap section). Phase 1 is being built as a sequence of sub-phases:

1a. Question Bank — done
1b. Exam Builder — done
1c. Candidates & Invitations — done
1d. **Exam-Taking Runtime** (this spec)
1e. (reserved, if anything remains before Phase 1 is considered complete)

**Goal of this sub-phase:** a Candidate can redeem the invitation token created in 1c, view exam instructions, start the exam, answer questions, and submit — with a server-authoritative timer, resumable state across reconnects, and auto-grading on submit. A Recruiter can view basic per-candidate results for their exam. This closes out the "smallest version of the product that's actually usable in a real interview" per the roadmap's Phase 1 deliverable.

### In scope

- Candidate auth: redeem an `Invitation.token` (from 1c) into a candidate session (JWT access+refresh, separate secrets and separate refresh-token table from staff auth, same rotation-with-reuse-detection pattern)
- Attempt lifecycle: start (idempotent), resume/preview (`GET /attempt/current`), answer (upsert per question), submit (idempotent)
- Server-authoritative timer: remaining time computed server-side from `attempt.startedAt + exam.durationMinutes` on every request that touches the attempt — no WebSocket
- Lazy auto-submit-on-access: any request touching an attempt past its time limit transitions it to `auto_submitted` before doing anything else — no scheduler/cron
- Auto-grading at submit: flat marks per question, all-or-nothing scoring for multi-correct MCQ, no negative marking
- Basic results view for recruiters: score/percentage/pass-fail per candidate, per exam
- Two new `Exam` fields the runtime depends on but that don't exist yet: `durationMinutes`, `passCriteriaPercent`
- Backend API only (NestJS), RLS/ownership-guarded, full unit + e2e test coverage

### Explicitly out of scope (deferred to later sub-phases or later roadmap phases)

- **Email OTP candidate login** — the product spec lists this as an alternative v1 candidate auth method, but it has no dependency on the exam-taking runtime itself. Building it now would just be a second, unrelated auth entry point bolted onto this sub-phase; it's additive later with no rework required here.
- **WebSocket timer push / live monitoring** (`WS /ws/attempt/{attemptId}`, `WS /ws/exams/{id}/monitoring`) — this is really Phase 2's Realtime/Monitoring service. Building a WebSocket gateway just for a single attempt's timer, ahead of the broader real-time infrastructure it's meant to share, would mean redoing this work when Phase 2 lands. A REST-computed timer gives the same authoritative-time guarantee (client never computes its own expiry) without the infra.
- **Question/option order randomization, random pool selection, section timers/locks, negative marking** — all explicitly Phase 4 features per the roadmap.
- **Browser-level anti-cheat (tab-switch/fullscreen/copy-paste/idle detection), device fingerprinting, single-active-session enforcement, AI proctoring** — all explicitly Phase 2 features ("Anti-Cheating / Proctoring").
- **Rank, full analytics dashboard, CSV/Excel/PDF export, Interview Panel comparison view** — Phase 4 ("Randomization, Question Pools & Reporting Depth").
- **Real scheduled auto-submit sweep job** — a candidate who closes the tab and never returns shows as `in_progress` until the next request touches that attempt (recruiter viewing results, in this phase, is itself such a touch — see Section 3). This project has consistently avoided adding new infrastructure (schedulers, Docker, real email accounts) when a simpler mechanism covers the actual need; a real cron-based sweep is a natural, isolated addition once live monitoring (Phase 2) gives it a UI reason to exist.
- **`POST /attempt/autosave`** (a periodic full-state checkpoint, per the product spec's API list) — `POST /attempt/answer` already persists every answer immediately on change, which is the actual durability guarantee auto-save exists to provide. A second endpoint re-saving the same data on a timer adds a write path with no additional protection against data loss at this phase's scale.
- **Exam versioning on edit-while-attempts-are-active** — `Attempt.questionOrderJson` snapshots the question set at start, which prevents a candidate's in-progress exam from changing under them, without needing full published-exam versioning as a separate mechanism.
- Any frontend UI — same precedent as every prior sub-phase.

---

## 2. Data Model

**`Exam` gains two fields**, additive with defaults so existing rows and the 1a/1b/1c test suites remain valid without a data migration step:

```prisma
model Exam {
  // ...existing fields unchanged...
  durationMinutes     Int @default(60) @map("duration_minutes")
  passCriteriaPercent Int @default(40) @map("pass_criteria_percent")
}
```

**Three new tables**, following the exact precedent 1c established for `Invitation`/`Notification`: no `organization_id` column, no RLS policy of their own, protected transitively by always being reached through an RLS-protected parent (`Invitation` → `Exam`/`Candidate`).

```prisma
model Attempt {
  id                String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId      String     @unique @map("invitation_id") @db.UniqueIdentifier
  candidateId       String     @map("candidate_id") @db.UniqueIdentifier
  examId            String     @map("exam_id") @db.UniqueIdentifier
  status            String     @default("in_progress") // 'in_progress' | 'submitted' | 'auto_submitted'
  questionOrderJson String     @map("question_order_json") @db.NVarChar(Max)
  startedAt         DateTime   @default(now()) @map("started_at")
  submittedAt       DateTime?  @map("submitted_at")
  invitation        Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  answers           Answer[]
  result            Result?

  @@index([examId, status])
  @@map("attempts")
}

model Answer {
  id                    String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId             String   @map("attempt_id") @db.UniqueIdentifier
  questionId            String   @map("question_id") @db.UniqueIdentifier
  selectedOptionIdsJson String   @map("selected_option_ids_json") @db.NVarChar(Max)
  isMarkedForReview     Boolean  @default(false) @map("is_marked_for_review")
  answeredAt            DateTime @default(now()) @map("answered_at")
  isCorrect             Boolean? @map("is_correct")
  marksAwarded          Int?     @map("marks_awarded")
  attempt               Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question              Question @relation(fields: [questionId], references: [id])

  @@unique([attemptId, questionId])
  @@map("answers")
}

model Result {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId  String   @unique @map("attempt_id") @db.UniqueIdentifier
  score      Int
  maxScore   Int      @map("max_score")
  percentage Float
  passFail   String   @map("pass_fail") // 'pass' | 'fail'
  computedAt DateTime @default(now()) @map("computed_at")
  attempt    Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("results")
}
```

Dropped from the product spec's original table shapes (Section 10) as not needed until a later phase actually uses them: `attempts.device_fingerprint`, `attempts.ip_address` (proctoring, Phase 2), `attempts.option_order_json` (randomization, Phase 4), `results.rank` (Phase 4, needs cross-attempt ranking which overlaps with the analytics dashboard). `questionOrderJson` is kept even though 1d does not randomize anything — it is a cheap snapshot of which questions belonged to the exam at attempt-start time, which is what prevents a recruiter's later edit to a published exam from changing what a mid-attempt candidate sees, without building full exam versioning now.

**Candidate sessions:** a new `CandidateRefreshToken` table, structurally identical to the existing `RefreshToken` but FK'd to `Invitation` instead of `User`. The existing `RefreshToken` table is not widened into a polymorphic subject table — it is hard-FK'd to `User` and is working, tested infrastructure for staff auth; changing its shape risks that path for no benefit, since candidate and staff sessions have no need to share a table.

```prisma
model CandidateRefreshToken {
  id           String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId String     @map("invitation_id") @db.UniqueIdentifier
  tokenHash    String     @map("token_hash")
  familyId     String     @map("family_id")
  expiresAt    DateTime   @map("expires_at")
  revokedAt    DateTime?  @map("revoked_at")
  createdAt    DateTime   @default(now()) @map("created_at")
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([invitationId])
  @@map("candidate_refresh_tokens")
}
```

**Why no new RLS policy for `attempts`/`answers`/`results`:** same reasoning framework as 1c's `invitations`/`notifications`, restated here since this is where it's decided each time. All three are always reached through a parent — `attempts` via its `Invitation` (which is itself reached via `Exam`/`Candidate`), `answers` via its `Attempt`, `results` via its `Attempt`. No endpoint in this phase queries any of them standalone by a bare, unverified ID. Ownership is checked in the application layer (Section 6) inside the same unit of work that reads or mutates the row.

---

## 3. Business Rules & Grading

**Candidate auth (`POST /candidate-auth/redeem`):**

| Condition | Result |
|---|---|
| Token not found | `404` — "This invitation link is invalid" |
| `invitation.status === 'revoked'` | `400` — "This invitation was revoked" |
| `invitation.expiresAt < now()` | `400` — "This invitation has expired" |
| `exam.status !== 'published'` | `400` — "This exam is not currently available" |
| All checks pass | Issues candidate access+refresh token pair, JWT payload `{ sub: invitationId, subjectType: 'candidate' }` |

**Attempt start (`POST /attempt/start`):** idempotent — if an `Attempt` already exists for this invitation, returns it unchanged (a page refresh before answering anything is not a new attempt). If none exists, creates one: `questionOrderJson` is populated by walking the exam's sections in `orderIndex` order and each section's questions in `orderIndex` order, snapshotting the full ordered list of question IDs.

**Lazy auto-submit-on-access:** every attempt-runtime endpoint (`GET /attempt/current`, `POST /attempt/answer`, `POST /attempt/submit`) begins by checking `attempt.status === 'in_progress' && now() > attempt.startedAt + exam.durationMinutes`. If true, the attempt is transitioned to `auto_submitted`, graded exactly as a normal submit (Section 3, grading), and then the original request is handled against the now-`auto_submitted` state (i.e., `POST /attempt/answer` after this point returns `400`, `GET /attempt/current` returns the final read-only state). The recruiter's `GET /exams/:id/results` endpoint (Section 4) also performs this check for every in-progress attempt it reads, since a recruiter checking results is itself a legitimate "touch" that should surface an expired-but-abandoned attempt as graded rather than stuck at `in_progress` forever.

**Answer validation (`POST /attempt/answer`):**

| Rule | Detail |
|---|---|
| `questionId` must belong to `attempt.questionOrderJson` | otherwise `400` — cannot answer a question not in this attempt |
| `selectedOptionIds` must all belong to the target question | otherwise `400` |
| `question.type` is `single_mcq` or `true_false` | exactly 1 selected option id required |
| `question.type` is `multi_mcq` | 1 or more selected option ids required |
| Re-answering the same question | overwrites the existing `Answer` row (upsert on `(attemptId, questionId)`) — this is how "change your answer" works, not a new row |
| `attempt.status !== 'in_progress'` | `400` — cannot answer a submitted or auto-submitted attempt |

**Grading (triggered by submit, or by the lazy auto-submit check):**

| Question type | Correctness rule |
|---|---|
| `single_mcq` / `true_false` | Correct if the one selected option is the correct option |
| `multi_mcq` | Correct only if the selected option set exactly equals the correct option set (all-or-nothing — no partial credit for a subset or superset match) |
| Unanswered question | Treated as incorrect, `marksAwarded: 0` |

Each `Answer.marksAwarded = question.marks` if correct, else `0` (no negative marking — `question.negativeMarks` exists in the schema from 1a but is not applied in 1d; it becomes live when Phase 4 implements negative marking). `Result.score` = sum of `marksAwarded` across all answers; `Result.maxScore` = sum of `marks` for every question in `questionOrderJson` (including unanswered ones); `Result.percentage = score / maxScore * 100`; `Result.passFail = percentage >= exam.passCriteriaPercent ? 'pass' : 'fail'`.

**Submit (`POST /attempt/submit`):** idempotent via a status check — if `attempt.status !== 'in_progress'` when submit is called, it's a no-op that returns the existing submission confirmation rather than re-grading or erroring (matches the double-click/retry-safe precedent from 1c's invitation resend/revoke). Grading runs synchronously inside the same request (grading one attempt is cheap — summing already-stored `Answer` rows — so there's no need for the async-job infrastructure the product spec reserves for AI generation/exports). The response to the candidate is a bare submission confirmation; no score or pass/fail is ever included, per the product's "candidates never see results" decision carried through from the original spec.

---

## 4. API Design

```
POST /api/v1/candidate-auth/redeem     { token } -> { accessToken, refreshToken }
POST /api/v1/candidate-auth/refresh    { refreshToken } -> new pair (rotation + reuse detection)
POST /api/v1/candidate-auth/logout     { refreshToken } -> revokes the token family

GET  /api/v1/attempt/current           no Attempt yet -> { exam: { title, instructions, durationMinutes } }
                                        Attempt exists -> { status, remainingSeconds, sections: [{ title, questions: [{ id, text, type, marks, options: [{ id, text }] }] }], answers: [{ questionId, selectedOptionIds, isMarkedForReview }] }
POST /api/v1/attempt/start             -> Attempt (idempotent, see Section 3)
POST /api/v1/attempt/answer            { questionId, selectedOptionIds, markedForReview? } -> upserted Answer
POST /api/v1/attempt/submit            -> { status: 'submitted' } (idempotent, no score)

GET  /api/v1/exams/:id/results         (recruiter, exam:manage) -> [{ candidateId, candidateName, invitationId,
                                        attemptId, status, score, maxScore, percentage, passFail, submittedAt }]
                                        candidates with no Attempt yet appear with attemptId/score/etc as null
                                        and status reflecting the Invitation's own status
```

`GET /attempt/current`'s question/option shape never includes `isCorrect` — a dedicated response mapper strips it before serialization, rather than relying on a Prisma `select` that a later endpoint could forget to apply (same lesson as the invitation-token exposure fix from 1c's post-review hardening, applied proactively here instead of after the fact).

**New modules:** `CandidateAuthModule` (redeem/refresh/logout, new `CandidateJwtStrategy`/`CandidateJwtAuthGuard`, new `@CurrentCandidate()` param decorator resolving `{ invitationId }` from the verified JWT), `AttemptModule` (current/start/answer/submit, depends on `CandidateAuthModule`'s guard and `ExamsModule`/`CandidatesModule` for ownership lookups). `ExamsService`/`ExamsController` gain one new method/route (`getResults`) — no new module, consistent with how `publish()` was added directly to the existing `ExamsService` in 1c rather than spun into its own module.

**New env vars:** `CANDIDATE_JWT_ACCESS_SECRET`, `CANDIDATE_JWT_REFRESH_SECRET`, `CANDIDATE_ACCESS_TOKEN_TTL_SECONDS` (default matches a generous exam-length window, e.g. 4 hours, since a candidate's access token must outlive their entire exam-taking session without needing a mid-exam refresh) — separate from the staff `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` so a bug in either guard implementation can never cross-authenticate the other subject type.

---

## 5. Security: Tenant Isolation & Ownership

- **Candidate requests carry no `organizationId`.** The candidate JWT only contains `invitationId`. Every `AttemptModule` service method's first step is loading `invitation → exam` (a direct Prisma read scoped by the invitation's own primary key, which is safe with no tenant context because it's a lookup by an unguessable UUID the candidate already possesses, exactly as `Invitation.token` lookups worked in 1c) to obtain `exam.organizationId` server-side. Only after that does any RLS-protected table (`Exam`, `ExamSection`, `Question`, `QuestionOption`) get queried, via `TenantPrismaService.forTenant({ organizationId: exam.organizationId, isSuperAdmin: false }, ...)`. The organization id is never accepted from the candidate's request — it is always derived from the invitation the candidate authenticated with.
- **Ownership check for `Attempt`/`Answer`/`Result`:** every service method verifies the attempt being read or mutated belongs to the calling candidate's own `invitationId` (from the JWT) before doing anything else. This is the substitute for RLS on these three tables, following the exact pattern 1c established for invitation resend/revoke ownership checks — skipping it is a real cross-candidate data leak (candidate A reading or answering candidate B's attempt), not a theoretical one.
- **Recruiter's `GET /exams/:id/results`** stays inside the existing tenant-scoped `ExamsService`, reusing the `exam:manage` permission and the existing `forTenant` scoping already proven for every other exam read — no new RBAC permission introduced.
- **Options never expose correctness** to the candidate — `isCorrect` is stripped by a dedicated response mapper in `AttemptModule`, not by relying on callers of a shared query to remember to omit it.

---

## 6. Testing Approach

- **Unit tests:** `CandidateAuthService` (redeem's four validation branches from Section 3, refresh rotation and reuse-detection mirroring the staff `AuthService` tests), `AttemptService` (start idempotency, answer validation for all three question types, the lazy auto-submit transition, grading math including the multi-mcq all-or-nothing case and the unanswered-question-counts-as-incorrect case), `ExamsService.getResults` (candidates with and without an attempt, in-progress attempts triggering the lazy auto-submit check).
- **Ownership isolation test (e2e, real database):** a candidate JWT for invitation A gets `403`/`404` attempting to read, answer, or submit an attempt belonging to invitation B — proving the application-layer ownership check actually blocks cross-candidate access, the same category of test 1c ran for its invitation resend/revoke ownership check.
- **End-to-end HTTP flow:** publish an exam with all three question types (reusing 1c's publish-gate precedent) → invite a candidate → redeem the token → `GET /attempt/current` returns a preview with no questions → `POST /attempt/start` → answer every question (including a multi-mcq with a partial-but-wrong selection, to prove all-or-nothing scoring) → `POST /attempt/submit` → response contains no score → recruiter calls `GET /exams/:id/results` and sees the correct score/percentage/pass-fail → a second submit call is a no-op → a second candidate's attempt is backdated past `durationMinutes` directly in the test database and is confirmed auto-submitted (with correct grading) on their next `GET /attempt/current` call → RBAC denial on `GET /exams/:id/results` for a role without `exam:manage`.

---

## 7. Open Items / Deferred to Future Sub-Phases or Later Roadmap Phases

- Email OTP candidate login — additive later, no rework needed here.
- WebSocket-based timer push and live monitoring — Phase 2's Realtime/Monitoring service.
- Randomization, section timers/locks, negative marking — Phase 4.
- Anti-cheat, device fingerprinting, single-active-session enforcement, AI proctoring — Phase 2.
- Rank, full analytics, exports, Panel comparison view — Phase 4.
- Real scheduled auto-submit sweep job — becomes natural once Phase 2's live monitoring gives it a UI reason to exist; the lazy check-on-access covers correctness (grading is still accurate whenever the attempt is next touched) but not "freshness of an idle roster view," which doesn't exist yet anyway.
- Frontend UI — same precedent as every prior sub-phase.
