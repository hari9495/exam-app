# Integrity & Anti-Cheating — Design

## Problem

The platform records proctoring events (tab switches, copy-paste, dev tools, webcam violations) and generates an AI risk summary per attempt, but a recruiter still cannot answer the question buyers actually purchase on: *"did this candidate write this code themselves?"* Specifically:

- Nothing captures **how code was written** — 800 characters pasted in one gesture looks identical to 800 characters typed over 20 minutes.
- Nothing compares answers **between candidates** — two candidates submitting near-identical solutions goes undetected.
- Signals are scattered (proctoring events, webcam counter, AI risk summary) with **no single roll-up** a recruiter can scan on a results list.
- Monitoring starts **without informed consent**, which is both a legal exposure (webcam surveillance faces active privacy backlash and litigation) and a candidate-experience problem.

Market context (researched 2026-07-18): AI-assisted cheating on remote assessments doubled year-over-year; competing platforms (HackerRank, CodeSignal) sell specifically on cheating-signal visibility. Their weakness — and our deliberate difference — is opaque "AI detection" verdicts. This design produces only **factual, explainable evidence for human judgment**: deterministic flags with concrete details, never an unexplainable accusation, and no automatic rejection.

## Scope

Four pieces, one feature:

1. A **consent screen** gating exam start.
2. **Editor telemetry** capture in the candidate code editor (aggregates only, no keystroke logging).
3. **Code-similarity detection** between candidates' answers to the same question in the same exam.
4. An **`IntegrityAnalysis`** per attempt — level + structured evidence flags + AI-written narrative — computed at settlement and surfaced on the candidate report, results list, exports, and (partially) live monitoring.

## 1. Consent screen

A new candidate-facing step between invite redemption and exam start, in `apps/web/app/(candidate)/`:

- Plain-language list of exactly what is monitored during the exam: webcam snapshots and face-presence checks, browser activity (tab switches, fullscreen exits, copy-paste, right-click, dev tools), and code-editor activity (paste sizes and typing-volume aggregates); who sees it (the hiring organization's staff); and that it is stored with the attempt.
- One checkbox ("I understand and consent to monitoring during this exam") + a start button disabled until checked. Declining path: a "You can close this page — contact your recruiter if you have questions" message; the exam cannot begin.
- Schema: `Attempt.consentAt DateTime? @map("consent_at")`. The start-attempt endpoint in `apps/exam-runtime` records `consentAt` from a new required `consent: true` field in the start request body, and rejects starts without it (400). Attempts that already exist before this feature are unaffected; the gate applies only at start time.

## 2. Editor telemetry

Captured by the candidate exam client (`apps/web` code-question editor), **aggregates only** — no raw keystroke or content logging beyond what the answer already stores:

Per code question: `keystrokeChars` (characters typed), `pastedChars` (characters pasted), `pasteCount`, `largestPasteChars`, `secondsToFirstEdit` (question opened → first edit), `activeSeconds` (seconds with the question focused and editor active), `runCount` (code executions).

- Transport: rides on the existing answer-save call — no new endpoint. Schema: `Answer.telemetryJson String? @db.NVarChar(Max) @map("telemetry_json")`. Client keeps the running aggregate in memory and includes it in every save for that question (last write wins, monotonically growing values).
- **Large-paste live event**: any single paste ≥ 200 characters into the code editor also fires the existing proctoring-event endpoint with a new event type `editor_paste` (severity `medium`, metadata `{chars, questionId}`). Added to `CLIENT_REPORTABLE_EVENT_TYPES` and the severity map in `apps/exam-runtime/src/attempts/proctoring-severity.ts`. Because live monitoring already streams proctoring events, large pastes appear on the live dashboard with no additional work.
- MCQ questions get no telemetry (nothing meaningful to measure this iteration).

## 3. Code-similarity detection

Deterministic, no AI. Runs at settlement inside `apps/exam-runtime` for each answer to a code question:

- **Normalize**: strip comments and string literals, collapse whitespace, lowercase, tokenize on word/symbol boundaries.
- **Fingerprint**: token 5-grams, hashed into a set.
- **Compare**: Jaccard similarity of fingerprint sets against every already-**settled** attempt's answer to the **same question in the same exam** (same org by construction). Answers under 150 normalized characters are skipped (too short to be meaningful — trivially similar).
- **Threshold**: pairs ≥ 0.70 similarity produce a similarity flag on **both** attempts. The current attempt's flag is written into its own analysis; the counterpart's already-stored `IntegrityAnalysis` is **updated in place** (flag appended; level re-derived) — this closes the settlement-ordering gap where the copied-from candidate settled first.
- Flag detail stored per pair: counterpart attempt id + candidate name, question id, similarity percentage.

Complexity note: comparison is bounded per question per exam (N-1 settled counterparts), computed once per settlement — acceptable without indexing infrastructure at this product's scale. Fingerprints are computed on the fly from stored `answerText`; nothing new is persisted besides flags.

## 4. IntegrityAnalysis

New model, 1:1 with `Attempt`, mirroring `ProctoringAnalysis`'s shape and lifecycle:

```prisma
model IntegrityAnalysis {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId  String   @unique @map("attempt_id") @db.UniqueIdentifier
  status     String                                  // completed | failed
  level      String?                                 // clear | review | high_concern
  flagsJson  String?  @map("flags_json") @db.NVarChar(Max)
  narrative  String?  @db.NVarChar(Max)
  analyzedAt DateTime @default(now()) @map("analyzed_at")
  attempt    Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("integrity_analyses")
}
```

Computed at settlement (same hook where `ProctoringAnalysis` and `AttemptInsight` run), after grading:

**Deterministic rule flags** — each flag is `{type, severity: 'medium'|'high', detail, questionId?, occurredAt?}`:

| Flag type | Rule | Severity |
|---|---|---|
| `large_paste` | any `editor_paste` event / `largestPasteChars ≥ 200` | medium (high if ≥ 800 chars) |
| `paste_dominant` | `pastedChars > keystrokeChars` on a question with ≥ 300 total chars | high |
| `implausible_speed` | final code length ÷ `activeSeconds` > 8 chars/sec on a question ≥ 300 chars | high |
| `no_iteration` | `runCount == 0` on a code question that scored full marks | medium |
| `similarity_match` | §3 pair ≥ 0.70 | high (medium if < 0.85) |
| `webcam_violations` | `webcamViolationCount ≥ 1` | medium (high if attempt was blocked) |
| `proctoring_events` | any high-severity proctoring event; or ≥ 5 medium-severity | medium (high if `dev_tools_detected` or `multi_login`) |

**Level derivation is pure rules**: any high-severity flag → `high_concern`; any flag → `review`; none → `clear`. Thresholds are named constants in one file — not org-configurable this iteration.

**Narrative is AI-written, best-effort**: a new `ClaudeIntegrityClient` (same shape as the three existing exam-runtime Claude clients: per-call `Anthropic` construction, `apiKey` resolved via `AiApiKeyResolverService`) receives the flag list + attempt context and returns a 3-5 sentence plain-language summary for the recruiter. If the AI call fails, the analysis still saves with `status: 'completed'`, flags, and level — `narrative` stays null. AI credit usage recorded like the existing call sites. Attempts with zero flags skip the AI call entirely (narrative: fixed "No integrity concerns detected." string) — same cost-saving pattern as `ProctoringAnalysis`'s `skipped_clean`.

## 5. Recruiter surfaces

- **Candidate report detail** (recruiter + panel consoles): integrity badge colored by level, the narrative, and an expandable evidence list showing every flag with its factual detail. Similarity flags name the matched candidate and link to their report.
- **Results dashboard list**: integrity level badge column per candidate, sortable/filterable by level.
- **Exports (CSV/Excel/PDF)**: two new columns — integrity level, flag count — added to the existing exporters.
- **Live monitoring**: `editor_paste` events stream into the existing live event feed automatically (§2). The attempt tile additionally shows a running count of medium+ proctoring events for the attempt. No live level computation — the level exists only after settlement.
- API: the existing candidate-report endpoint in `apps/api` includes the `IntegrityAnalysis` (level, flags parsed from JSON, narrative); the results-list endpoint includes `level` + flag count. Permission-gated exactly as the report data they ride on (`results:view`).

## Error handling

- Telemetry missing (old client, JS failure): rules that need it simply don't fire; analysis still completes on the signals present. Absence of telemetry is never itself a flag.
- AI narrative failure: non-fatal, flags + level always persist (see §4).
- Similarity counterpart update failure: logged, does not fail the current attempt's settlement.
- Consent screen rendering but start request lacking `consent: true`: 400 from the start endpoint — the server is the enforcement point, the screen is UX.

## Testing

- Unit: normalization/fingerprint/Jaccard functions (identical code → 1.0; renamed-identifiers copy → above threshold; genuinely different solutions → below); each rule flag's trigger and non-trigger case; level derivation; counterpart-update logic.
- Service: settlement integration — analysis created with expected flags from seeded events/telemetry; AI-failure path still persists flags; zero-flag path skips the AI call.
- Client: telemetry aggregation on the editor (typing vs paste counting, run count); consent gate blocks start until checked.
- E2E: full flow — consent → answer with a large paste → settle → report shows `review`+ flag; two attempts submitting identical code both end up flagged with `similarity_match`.

## Out of scope

- Re-run/recompute analysis button (add if recruiters ask).
- Cross-exam or org-wide similarity comparison.
- AI text-judgment of code authorship ("does this look AI-written?") — deliberately excluded as unreliable and unexplainable.
- Keystroke-level logging or content capture beyond stored answers.
- MCQ answer-pattern analysis (speed-run detection etc.).
- Candidate-facing integrity feedback.
- Org-configurable thresholds or rule weights.
- Any automatic rejection/blocking based on integrity level (the existing webcam 3-strike pause/block behavior is unchanged and remains the only in-exam enforcement).
