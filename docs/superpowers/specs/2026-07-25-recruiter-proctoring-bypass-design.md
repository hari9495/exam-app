# Recruiter Mid-Exam Proctoring Bypass — Design

## Goal

Let a recruiter relax proctoring enforcement for **one in-progress attempt** from Live Monitoring, so a candidate whose setup is generating false-positive violations can finish their exam instead of being repeatedly blocked. Violations continue to be recorded; only the punishment stops.

## Current State

- A recruiter can `Block` / `Unblock` an attempt from `apps/web/components/LiveMonitoringPanel.tsx` via `apps/api/src/attempts-admin/attempts-admin.service.ts:39` → `ExamRuntimeInternalClient.unblock()` → the unblock handler in `apps/exam-runtime/src/internal/internal.controller.ts`.
- Unblock calls `resumeFromPause(tx, attempt, { resetViolationCounters: true })` (`apps/exam-runtime/src/grading/attempt-settlement.service.ts`), so counters are zeroed and the candidate gets the full strike allowance again.
- `resolveProctoringConfig(exam)` (`apps/exam-runtime/src/attempts/proctoring-config.ts`) resolves the per-exam config — `{ webcamEnabled, enforcement, strikeLimit, disabledSignals }`. Enforcement is either `'block'` (pause, then block at `strikeLimit`) or `'warn'` (record only, never pause).
- The exam-level config is **locked** once any candidate starts an attempt (`assertExamMutable` in `apps/api/src/exams/exams.service.ts`), and it applies to every candidate on that exam simultaneously.

**The gap:** unblock is an *undo*, not a *prevention*. A candidate with a genuinely glitchy environment gets unblocked, trips the same false signal, and re-blocks. The recruiter has no way to say "stop enforcing for this one person."

## Why per-attempt, not per-exam

Loosening the exam-level config mid-flight is the wrong tool twice over: it is blocked by the publish lock we just shipped, and it would change the rules for every other candidate sitting that exam at the same time — the exact fairness problem the lock exists to prevent. The bypass must therefore live on the `Attempt`.

## Design

### 1. Schema

Three columns on `Attempt`:

```prisma
proctoringBypassedAt     DateTime? @map("proctoring_bypassed_at")
proctoringBypassedBy     String?   @map("proctoring_bypassed_by") @db.UniqueIdentifier
proctoringBypassReason   String?   @map("proctoring_bypass_reason")
```

`proctoringBypassedBy` stores the acting staff user's id. No FK relation is declared — `AuditLog.actor` already demonstrates that adding a second `users` cascade path to a table trips Prisma's multi-cascade-path validator in this schema, and the audit log is the authoritative record of who acted anyway.

A single additive migration with three independent `ALTER TABLE [dbo].[attempts] ADD` statements (SQL Server rejects a statement referencing a column added earlier in the same batch).

### 2. Resolver

`resolveProctoringConfig` gains an optional second argument:

```ts
resolveProctoringConfig(exam: ProctoringExam, attempt?: { proctoringBypassedAt: Date | null }): ExamProctoringConfig
```

When `attempt?.proctoringBypassedAt` is set, the resolved config is returned with `enforcement: 'warn'` regardless of the exam setting. Everything else (webcam on/off, strike limit, disabled signals) is untouched.

This is deliberately *not* "proctoring off": `'warn'` already means every event is still written to `proctoring_events`, still emitted to the live-monitoring gateway, and still scored by the integrity analysis — nothing pauses or blocks. The recruiter loses no audit trail by using it.

Callers that must pass the attempt (all already have it in scope):

- `reportProctoringEvent` and `webcamViolation` — `apps/exam-runtime/src/attempts/attempt.service.ts`
- `registerWebcamViolation` and `registerBrowserActivityViolation` — `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- `integrity-analysis.service.ts` — so its `blocked` derivation stays consistent with what actually happened

The argument is optional so any caller that legitimately wants the exam's own policy (rather than this attempt's effective policy) keeps working unchanged.

### 3. Applying and revoking

New internal endpoint pair in `apps/exam-runtime/src/internal/internal.controller.ts`, mirroring the existing unblock handler:

- `POST /internal/attempts/:id/proctoring-bypass` — body `{ reason: string, actorUserId: string }`
- `POST /internal/attempts/:id/proctoring-bypass/revoke` — body `{ actorUserId: string }`

**Both transitions reset both violation counters** via `resumeFromPause(tx, attempt, { resetViolationCounters: true })`, and resume the attempt if it is currently `paused` or `blocked`.

Resetting on *revoke* as well as on *apply* is not symmetry for its own sake — it prevents a trap. Warn mode still increments the counters (it only suppresses the status transition), so an attempt that spent twenty minutes bypassed can accumulate well past the strike limit. Restoring enforcement without zeroing them would block the candidate instantly on the next event, which is the opposite of what the recruiter intended.

Validation: reject with `409 Conflict` if the attempt is no longer `in_progress`, `paused`, or `blocked` — once it has settled there is nothing left to enforce. Applying a bypass to an already-bypassed attempt updates the reason and is not an error.

### 4. Reason is mandatory

The DTO requires `reason` as a non-empty string (`@IsString() @IsNotEmpty() @MaxLength(500)`). An unexplained enforcement override sitting on a hiring artifact is worse than no override at all — six months later nobody can say whether it was a legitimate technical failure or a favour.

### 5. apps/api passthrough

`AttemptsAdminService` gains `bypassProctoring(context, attemptId, actorUserId, reason)` and `revokeProctoringBypass(context, attemptId, actorUserId)`, following the existing `unblock` shape exactly: `requireOwnedAttempt` for tenant scoping, then the internal client call, then `audit.record` with actions `attempt.proctoring_bypassed` / `attempt.proctoring_bypass_revoked`, recording the reason in the audit metadata.

`ExamRuntimeInternalClient` gains the two matching methods. Note for whoever implements: the client appends `/api/v1/internal/...` itself, so `EXAM_RUNTIME_INTERNAL_URL` must stay suffix-free — see gotcha #12 in the deployment notes.

### 6. Recruiter UI

`LiveMonitoringPanel.tsx` gains a third per-candidate action beside Block/Unblock. It opens a small modal with a required reason textarea; the confirm button stays disabled until the reason is non-empty. Once bypassed, the row shows a persistent badge ("Proctoring relaxed") and the action flips to "Restore proctoring".

The existing `useAttemptModeration` hook (`apps/web/lib/hooks/`) is extended with the two mutations, invalidating the same queries `unblock` already does.

### 7. Integrity report must disclose it

This is the part that matters most for defensibility. `integrity-analysis.service.ts` must state, in the stored narrative and in the structured flags, that proctoring enforcement was relaxed for this attempt — who did it, when, and the reason given. A reviewer reading a clean integrity report on a bypassed attempt must not be able to mistake "no violations enforced" for "no violations occurred".

The attempt query there already uses `include: { invitation: { include: { exam: true } } }`, so the attempt row (and therefore the three new columns) is present without a schema-level query change.

## Out of Scope

- Time-limited or auto-expiring bypasses. A recruiter watching Live Monitoring can revoke manually; an expiry timer is speculative complexity.
- Per-signal bypass ("relax only `multi_monitor_detected` for this candidate"). The per-exam `disabledSignals` list already covers signal-level tuning, and a per-attempt version of it has no demonstrated need yet.
- Candidate-visible notification that proctoring was relaxed. The candidate already sees pauses stop happening; announcing it invites gaming.

## Testing

Unit tests, matching the existing suites' style:

- `proctoring-config.spec.ts` — a bypassed attempt forces `enforcement: 'warn'` while leaving `webcamEnabled` / `strikeLimit` / `disabledSignals` intact; omitting the attempt argument preserves today's behaviour exactly; a bypass on a `'warn'` exam is a no-op.
- `attempt-settlement.service.spec.ts` — with a bypassed attempt, a strike-worthy violation still writes the event and increments the counter but never sets `status` to `paused`/`blocked` and never sets `pausedAt`.
- `internal.controller` / settlement — apply and revoke each zero both counters and resume a `paused`/`blocked` attempt; a settled attempt returns 409.
- `attempts-admin.service.spec.ts` — both methods audit-record with the reason and enforce tenant scoping.
- `integrity-analysis.service.spec.ts` — a bypassed attempt's narrative and flags disclose the relaxation.
- `LiveMonitoringPanel.test.tsx` — confirm is disabled with an empty reason; the badge and "Restore proctoring" action appear for a bypassed attempt.
