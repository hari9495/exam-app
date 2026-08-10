# Tab & background-app insights in grading

## Why

Proctoring already detects background apps (WhatsApp, ChatGPT, Gemini, etc. via periodic AI
screen-capture analysis), browser tab switches, window-blur, screen-share toggles, and
out-of-editor pastes. All of it lands in `ProctoringEvent` rows, and a per-attempt AI narrative
(`ProctoringAnalysis.summary`) is already generated from the screen/webcam evidence. None of this
is visible anywhere in the recruiter UI — surfacing it currently requires querying the database
directly. This has been done by hand, ad hoc, for individual candidates several times this week.
This spec builds it into the product.

## Goal

For every candidate attempt, in both the **Grading** tab (`GradingQueuePanel`, code questions
pending manual grading) and the **Results** tab (`CandidateReportPanel`, every question,
permanent record):

1. A **summarized insight**: what background apps/tabs were seen during the attempt, grouped and
   counted, plus the existing AI narrative that today is fetched but never rendered.
2. Where the data allows it, a **detailed insight positioned above the specific question** the
   violation most likely occurred during.

## Data reality: exact vs. estimated

`ProctoringEvent` (`background_app_detected`, `remote_access_suspected`, `tab_switch`,
`window_blur`, `screen_share_started`, `screen_share_stopped`, `copy_paste`, `editor_paste`) is
recorded at the **attempt** level — it has an `occurredAt` timestamp but no `questionId`. Only a
handful of `IntegrityAnalysis` flags (`no_iteration`, `large_paste`, etc.) carry a real
`questionId`, and those are out of scope here (already shown in the existing Integrity Analysis
list).

So question-level placement for these events is **inferred, not exact**: each event is attributed
to the question the candidate was working on around that time, using `Answer.answeredAt` as the
only available time signal. Every place this appears in the UI carries a fixed disclaimer that the
timing is estimated. This was discussed and explicitly accepted — the alternative (exact-only,
skipping inference) would drop all background-app/tab-switch/screen-share signal from ever
appearing near a question, which defeats the point of the ask.

**Attribution rule:** sort an attempt's answers ascending by `answeredAt`. For an event at
`occurredAt`, attribute it to the first answer whose `answeredAt >= occurredAt` — the question the
candidate was on when they next saved. If no such answer exists (event happened after the last
save, e.g. right before submit), attribute it to the last answer instead. If the attempt has zero
saved answers, no attribution is possible — the event still counts in the attempt-level summary,
just not placed against a question.

## Backend

One new pure-function module, `apps/api/src/reports/tab-activity.ts`:

```ts
export interface TabActivityEventTypeSummary {
  eventType: string;
  count: number;
  toolCounts?: Record<string, number>; // only for background_app_detected / remote_access_suspected
}

export interface QuestionTabActivityEntry {
  eventType: string;
  occurredAt: string;
  toolName?: string;
  reasoning?: string;
  screenshot?: string; // already-signed URL, same signing as the webcam timeline
}

export function computeTabActivity(
  events: { eventType: string; occurredAt: Date; metadata: Record<string, unknown> }[],
  answers: { questionId: string; answeredAt: Date }[],
): {
  summary: TabActivityEventTypeSummary[];
  byQuestionId: Map<string, QuestionTabActivityEntry[]>;
};
```

Events are pre-filtered to the eight event types above and pre-signed (`signProctoringEvidence`,
already used for the webcam timeline) before being passed in, so this function stays pure and
easily testable — no I/O, no Prisma types.

Reused by two call sites, both already inside a tenant transaction and already loading the
attempt's answers:

- **`ReportsService.getCandidateDetail()`**: adds `tabActivitySummary: TabActivityEventTypeSummary[]`
  to `CandidateDetail`, and `tabActivity: QuestionTabActivityEntry[]` to each
  `CandidateDetailQuestion`. `CandidateDetail.proctoringAnalysis` is already fetched — no backend
  change needed there, only a frontend one (see below).
- **`ExamsService.getPendingGrading()`**: adds `tabActivitySummary` and (new) `proctoringAnalysis:
  { riskLevel: string | null; summary: string | null } | null` to `PendingGradingRow`, and
  `tabActivity` to `PendingGradingCodeQuestion`.

Both call sites add one `tx.proctoringEvent.findMany({ where: { attemptId, eventType: { in: [...] } } })`
next to their existing queries — no new indexes needed (`@@index([attemptId, occurredAt])` already
covers this).

**Important for `getPendingGrading`:** pass `computeTabActivity` *every* answer on the attempt, MCQ
included, even though the Grading tab only ever displays `tabActivity` for the code questions it
already lists. The attribution timeline needs every save in order to place events correctly between
them — pre-filtering to code-only answers before calling the function would silently corrupt the
attribution for any attempt that mixes question types.

## Frontend

New shared file `apps/web/components/TabActivity.tsx`:

- **`TabActivitySummaryCard`**: renders `tabActivitySummary` as grouped counts (e.g. "WhatsApp
  Desktop × 4, Gmail × 2" under a "Background apps" line; "3 tab switches, 1 window blur" under a
  "Browser activity" line), plus the AI narrative (`proctoringAnalysis.summary`) as a one-line
  takeaway underneath when present. Renders nothing if `tabActivitySummary` is empty and there's no
  narrative — no "0 detected" noise.
- **`TabActivityBanner`**: compact badge above a question, one per attributed event type present
  for that question (e.g. "⚠️ WhatsApp Desktop detected around this question — estimated timing").
  Collapsed by default; click expands the AI's `reasoning` text and `screenshot` (reusing the
  existing screenshot-modal pattern already in `CandidateReportPanel`). Renders nothing when
  `tabActivity` is empty for that question.

Integration:

- **`GradingQueuePanel.tsx`**: `TabActivitySummaryCard` in `AttemptGrader`'s header row, next to
  "AI review all"/"Finalize grade". `TabActivityBanner` above each `CodeQuestionGrader`'s question
  text.
- **`CandidateReportPanel.tsx`**: new "Tabs & Background Apps" section using
  `TabActivitySummaryCard`, placed after the existing Webcam Timeline section. `TabActivityBanner`
  above each question in the existing per-section per-question breakdown.

## Types

`apps/web/lib/types.ts` gains `TabActivityEventTypeSummary` and `QuestionTabActivityEntry`
(mirroring the backend interfaces above), and the existing `PendingGradingRow` /
`PendingGradingCodeQuestion` / `CandidateDetail` / `CandidateDetailQuestion` (or their frontend
equivalents) gain the new fields.

## Non-goals

- No new AI calls. The AI one-liner reuses the existing `ProctoringAnalysis.summary`, generated by
  the existing screen-analysis pipeline — this spec adds no new AI job type or cost.
- No change to how/when `ProctoringEvent` rows are created, and no new event types.
- No change to the existing Integrity Analysis flag list or its own `questionId`-exact display —
  this is additive, for the event types that currently have no question-level presentation at all.
- Results-tab visibility does not change grading finality: this is read-only insight, it does not
  affect scoring, `no_iteration` flags, or the finalize-grade flow.

## Testing

- `computeTabActivity`: unit tests for the attribution rule — event before first answer, event
  between two answers, event after the last answer, attempt with zero answers, `toolCounts`
  grouping, empty input.
- `ReportsService.getCandidateDetail` / `ExamsService.getPendingGrading`: extend existing tests
  with attempts that have background-app/tab-switch events, asserting the new fields' shape.
- `TabActivitySummaryCard` / `TabActivityBanner`: render tests for the populated, empty, and
  narrative-absent cases.
- `GradingQueuePanel` / `CandidateReportPanel`: existing test suites extended to assert the banner
  appears above the correct question given a fixture event/answer timeline.
