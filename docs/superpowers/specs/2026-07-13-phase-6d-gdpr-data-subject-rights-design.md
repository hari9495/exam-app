# Phase 6d: GDPR Data Subject Rights — Design Spec

## 1. Context & Scope

Phase 6 ("Compliance & Security Hardening") was decomposed into four sub-phases: 6a (CI + dependency/secret scanning, shipped), 6b (rate limiting hardening, shipped), 6c (audit log completeness + access review, shipped), 6d (GDPR data subject rights — this spec, the final sub-phase).

**Current state, confirmed by direct codebase survey before scoping:**

- **No data-subject-rights mechanism exists anywhere.** Repo-wide search for export/delete/anonymize/GDPR-related code returns zero matches outside the Phase 6 design docs themselves. `CandidatesController` exposes only `POST /candidates`, `GET /candidates`, `POST /candidates/bulk` — there is no way through the API to delete or modify a candidate's PII after creation (bulk CSV re-upload can overwrite `name`/`phone`; `email` is the immutable upsert key).
- **Candidate-linked personal data spans 8 models**: `Candidate` (`email`/`name`/`phone`), `Attempt` (`deviceFingerprint`, plus a denormalized `candidateId` column with no FK), `CandidateMessage` (`body`, free-text staff↔candidate messages), `ProctoringEvent` (`metadataJson`, client-supplied free-form), `ProctoringAnalysis` (`summary`, AI-generated free text), `AttemptInsight` (`summary`, AI-generated free text), `CandidateRefreshToken` (session credentials, keyed by invitation), `Invitation` (the join point, no direct PII). `Answer`/`Result`/`Notification`/`AiCreditUsage` carry no candidate PII beyond FKs.
- **Every FK from `Candidate` cascades ON DELETE** — a raw delete would wipe the full attempt/scoring/proctoring/messaging graph. Verified against the migration SQL, not just the Prisma schema.
- **Candidate auth is invitation-mediated**: JWTs carry `sub: invitationId`, refresh tokens live in `CandidateRefreshToken` keyed by `invitationId`. There is no persistent candidate account or self-service surface.
- **The audit trail (Phase 6c) is cleanly separable from candidate PII**: `AuditLog` has no relation to `Candidate`, no live `entityType: 'candidate'` usage, and every current call site passes no `metadata` — erasing a candidate cannot conflict with it.
- The master design spec (`2026-07-07-online-mcq-exam-platform-design.md`, "Proctoring/biometric data" section) required three things deferred to this phase: consent capture before biometric collection, per-org retention windows with auto-deletion, and a right-to-erasure workflow. **This phase delivers the erasure workflow plus a right-to-access export; consent capture and retention automation are explicitly deferred again** (see Section 6).

## 2. Scope Decisions

- **Candidates only.** Staff users (org_admin/recruiter/panel) are processed under a different legal basis (employment/contract) and are deferred.
- **Erasure = anonymize in place, not hard delete.** PII-bearing fields are scrubbed to fixed redacted values while `Attempt`/`Answer`/`Result`/`Invitation` rows survive under the candidate's now-pseudonymous UUID. Genuinely anonymized data is no longer "personal data" under GDPR, so this satisfies erasure while preserving the org's aggregate exam reporting. (Hard delete was considered — the cascades make it trivially easy — but it destroys org exam records, which most orgs would not accept.)
- **Admin-triggered API endpoints**, not a CLI/script: requests arrive out-of-band (email/support) and staff process them through the platform, inside its RBAC and audit systems. Matches every existing admin action's shape.
- **No frontend work.** `apps/web` remains untouched, consistent with every prior phase.

## 3. Right to Access — `GET /candidates/:id/export`

On the existing `CandidatesController`, gated by a new **`candidate:data_rights`** permission granted to **`org_admin` only** — not `recruiter` (day-to-day candidate management is a different job than processing legal data-subject requests), not `panel`, and not `super_admin` (which holds no `candidate:*` permissions today; that stays true).

**Response**: one JSON document assembling the candidate's complete data footprint:

```
{
  candidate: { id, email, name, phone, createdAt },
  invitations: [ { id, examTitle, status, invitedAt, expiresAt, revokedAt } ],
  attempts: [ {
    id, examTitle, status, startedAt, submittedAt, deviceFingerprint,
    result: { score, maxScore, percentage, passFail } | null,
    answers: [ { questionText, selectedOptions, isCorrect, marksAwarded } ],
    proctoringEvents: [ { eventType, severity, occurredAt, metadata } ],
    proctoringAnalysis: { status, riskLevel, summary } | null,
    insight: { status, summary } | null,
    messages: [ { body, sentAt, readAt } ]
  } ]
}
```

Design choices:

- **Human-readable, not raw rows**: exam titles and question text are joined in; selected option IDs are resolved to option text. A data-subject export full of bare UUIDs is useless to the person requesting it.
- **`Notification` and `CandidateRefreshToken` rows are excluded**: pure technical/delivery records; exporting token hashes would be a security anti-pattern, and neither carries information *about* the person beyond what the rest of the export already represents.
- Tenant-scoped via the standard `TenantPrismaService.forTenant()` pattern; 404 when the candidate isn't in the caller's org.
- The export and erasure paths traverse the same relation set — one source of truth for "what data belongs to this candidate."
- Audited as **`candidate.data_exported`** (entityType `candidate`, its first use in the audit trail; actor = the requesting admin via `@CurrentUserId()`).

## 4. Right to Erasure — `POST /candidates/:id/erase`

Same permission. All steps run inside **one `forTenant()` transaction** — erasure is atomic, never partial.

**Scrub list** (every PII-bearing field the survey identified):

| Field | Becomes |
|---|---|
| `Candidate.name` | `"Redacted"` |
| `Candidate.email` | `erased-{candidateId}@redacted.invalid` — must remain **unique** because of the `(organizationId, email)` unique index; a fixed literal would collide on the second erasure in the same org |
| `Candidate.phone` | `null` |
| `Attempt.deviceFingerprint` | `null` |
| `CandidateMessage.body` | `"[redacted]"` (message rows are one-directional, staff→candidate; thread structure/timestamps/`sentByUserId` stay — the staff author is not the data subject) |
| `ProctoringEvent.metadataJson` | `null` (`eventType`/`severity`/timestamps stay — behavioral flags, not identity) |
| `ProctoringAnalysis.summary` | `"[redacted]"` (`riskLevel`/`status` stay) |
| `AttemptInsight.summary` | `"[redacted]"` |

**Deleted outright**: all `CandidateRefreshToken` rows reachable via the candidate's invitations — an erased candidate must not retain live exam access. Any still-live invitation (`status: 'invited'`) is set to `status: 'revoked'` (+ `revokedAt`), reusing the existing revocation semantics.

**Untouched**: `Attempt`/`Answer`/`Result` rows, scores, and the candidate's UUID — the pseudonymous key that keeps org-level aggregate reporting working.

**Erasure implementation note**: `Attempt.candidateId` is a denormalized column with no FK constraint (confirmed against the migration SQL). Since this design scrubs fields rather than deleting rows, that column keeps its value — which is correct: it's the same pseudonymous UUID as `Candidate.id`, carrying no PII once the candidate row is scrubbed. It is called out here so the implementation doesn't mistake it for a missed reference.

**New schema column**: `Candidate.erasedAt DateTime?` (nullable, no default), set at erasure time. This provides:
- **Idempotency**: erasing an already-erased candidate is a no-op — no re-scrub, no second audit entry (same pattern as invitation revoke's no-op path).
- **A rejection flag for future actions**: this phase adds exactly one rejection — `InvitationsService.bulkInvite()` rejects erased candidates (a `BadRequestException` naming the candidate id) so an erased person cannot be re-invited under their scrubbed record. Other endpoints are left as-is (listing an erased candidate shows the redacted values, which is correct).
- Note: a later `bulkUpload` with the same real email creates a **new** `Candidate` row (the scrubbed row's email no longer matches the upsert key). That is correct behavior — a new processing relationship — not resurrection of the erased record.

**Audit**: **`candidate.erased`**, entityId = the candidate UUID (a pseudonymous reference to a now-scrubbed row; safe to retain in the immutable trail). Actor = the requesting admin.

## 5. Testing & Verification Approach

1. **Unit tests**: `CandidatesService` export (assembly/joins over a mocked tx) and erase (every scrub field asserted; idempotent no-op path — no re-scrub, no re-audit; not-found/cross-org 404 with nothing touched; audit calls with exact args). `InvitationsService.bulkInvite`'s erased-candidate rejection.
2. **E2E tests**: new `candidate-data-rights.e2e-spec.ts` — real HTTP flow: create candidate → invite → start attempt → answer → submit (reusing the existing exam-taking e2e setup pattern), then:
   - `GET /export` as org_admin returns the real name/email/answers/score;
   - `POST /erase` scrubs — follow-up list shows redacted name/email, re-export returns redacted values;
   - `recruiter` gets 403 on both endpoints;
   - cross-org isolation: org B's admin gets 404 on org A's candidate for both endpoints;
   - both `candidate.data_exported`/`candidate.erased` entries visible via Phase 6c's `GET /audit-logs`.
3. **Full regression**: both apps' unit suites + full apps/api e2e suite re-run.
4. **No live manual check** — read/scrub endpoints over standard request handling; the e2e suite exercises the real paths end-to-end (same rationale as Phase 6c, unlike 6b's rate limiting where the live check was load-bearing).

## 6. Explicitly Out of Scope / Open Items

- Staff-user (`User`) export/erasure — different legal basis, deferred.
- Consent capture (frontend checkbox or backend consent record) — requires the platform's first frontend work; deferred to its own phase. The master spec's requirement stands unmet and tracked.
- Per-org retention windows with automatic deletion jobs — distinct scheduled-infrastructure feature, deferred.
- Candidate self-service portal / in-product request intake — requests arrive out-of-band; staff process them.
- Export formats beyond JSON (PDF/CSV packaging for handing to the data subject).
- Guardrails against future `AuditLog.metadata` PII leakage: `AuditEntry.metadata` is free-form and nothing structurally prevents a future call site from writing candidate PII into the immutable audit trail. No current call site does. Recorded as a standing design risk for future audit-surface additions, not built in this phase.
