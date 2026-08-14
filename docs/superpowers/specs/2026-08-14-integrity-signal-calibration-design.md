# Integrity Signal Calibration — Design

**Status:** approved, not yet implemented
**Date:** 2026-08-14
**Origin:** started as roadmap item 3, "AI-answer detection". Investigation found that detection already exists and works; what is broken is its signal-to-noise. The scope was redirected accordingly.

## Problem

**75% of submitted attempts are flagged `high_concern`.** Measured in production on 2026-08-14: of 265 submitted attempts, 200 are `high_concern`, 23 `review`, 42 `clear`.

A flag that fires on three candidates in four is not a signal. A recruiter learns within a week that `high_concern` means nothing, stops opening it, and the genuine cases become invisible along with the noise.

### What already exists, and works

The platform already detects AI-written answers and code plagiarism. `apps/exam-runtime/src/integrity/integrity-rules.ts` derives:

| Flag | Meaning | Attempts (of 265) |
|---|---|---|
| `large_paste` | ≥200 chars in one paste | 37 (14%) |
| `paste_dominant` | pasted chars > typed chars | 32 (12%) |
| `no_iteration` | full marks, never ran the code | 14 (5%) |
| `similarity_match` | code matches another candidate's | 6 (2%) |
| `implausible_speed` | >8 chars/sec | **0 — never fires** |

Those first four are the behavioural fingerprint of pasting an LLM answer, and `similarity_match` is cross-candidate plagiarism detection. They run automatically on every attempt via `attempt-settlement.service.ts` and surface in the candidate report and results list.

**They are also well calibrated**, firing on 9–14% of attempts — a believable cheating rate.

### What is actually broken

Two *environmental* flags drown them:

| Flag | Attempts | Share |
|---|---|---|
| `proctoring_events` | 206 | 78% (199 at **high** severity) |
| `webcam_violations` | 205 | 77% |

The mechanism is exact. In `deriveAttemptFlags`:

- `webcamViolationCount >= 1` raises a flag — a threshold of **one**.
- `highEvents.length > 0` makes `proctoring_events` **high** — again a threshold of one.

And `deriveLevel` returns `high_concern` if *any* flag is high. So a single high-severity event promotes the whole attempt, with no accumulation and no weighting.

The events doing it:

| Event type | Attempts affected | Occurrences |
|---|---|---|
| `webcam_head_turned` | 171 (65%) | 3,175 |
| `webcam_no_face` | 163 (62%) | 4,157 |
| `webcam_multiple_faces` | 48 (18%) | 222 |
| `multi_login` | 42 (16%) | 145 |
| `screen_share_stopped` | 9 | 10 |
| `dev_tools_detected` | 3 | 35 |
| `multi_monitor_detected` | 1 | 1 |

Webcam violation counts say the same thing from the other direction: **152 of 265 attempts have 5 or more**, and only 60 have zero.

A signal present in 65% of the population cannot distinguish anyone in it. Looking away from the screen is currently treated as identically damning as pasting 800 characters.

### One thing that is NOT broken

591 of 941 code answers have no telemetry, which looked like a 63% detection blind spot. It is not: **all 591 are completely empty answers** — code questions nobody attempted. Every code answer containing anything (350, averaging 338 characters) has telemetry. Coverage of answers worth measuring is complete.

## Constraints

1. **Read-only with respect to the candidate exam path.** Nothing changes how events are recorded, or webcam detection sensitivity, during a live exam.
2. **Event severity stays as it is.** `webcam_no_face` may legitimately be high-priority to a live invigilator; that is a different question from whether it is evidence of cheating afterwards.
3. No new dependency, no schema change, no migration.
4. **Asymmetric cost governs.** Wrongly accusing a candidate is far worse than missing one — but so is a detector nobody reads, which is the current state.

## Decisions

### Classify in the rules module, not at the event source

The evidence classification lives in `integrity-rules.ts`. Changing severities where events are created would silently alter behaviour for every other consumer, including live monitoring. Rejected.

Weighted scoring with a numeric threshold was also rejected: harder to explain to a recruiter who must justify a decision, and harder to test, for flexibility nothing yet needs.

### Two levels of classification, and they are not the same thing

This is the detail most easily got wrong. **Flags** and **proctoring events** are different layers: many events roll up into the single `proctoring_events` flag. So the fix needs a rule at each layer.

**Layer 1 — event types.** `CONTEXT_EVENT_TYPES` names the events that must never, on their own, raise `proctoring_events` to high:

| Event type | Class | Attempts |
|---|---|---|
| `webcam_head_turned` | context | 171 (65%) |
| `webcam_no_face` | context | 163 (62%) |
| `multi_login` | context | 42 (16%) |
| `webcam_multiple_faces` | context | 48 (18%) |
| `dev_tools_detected` | hard | 3 |
| `screen_share_stopped` | hard | 9 |
| `multi_monitor_detected` | hard | 1 |

`multi_login` is context deliberately: 145 occurrences across 42 attempts reads more like reconnects on flaky connections than 42 cheats, and this platform already has candidates losing connectivity mid-exam.

**`webcam_multiple_faces` is context too — revised 2026-08-14 after measurement, see "What the dry-run changed" below.** The original draft of this spec classified it hard on the reasoning that another person in frame is unambiguous where looking away is not. Production data says otherwise, and the revision is recorded rather than silently edited because the reasoning is worth keeping: the detector is *accurate* but the inference is *ambiguous*. A confirmed event is trustworthy — the client debounces through a 5-of-8-sample voter at 500ms per sample (`useWebcamMonitor.ts`), so an event means a second face was genuinely visible for ~2.5 seconds, not a single bad frame. What it cannot distinguish is a housemate crossing the room from a second person sitting alongside the candidate. At 48 of 265 attempts (18%) in at-home exams, the innocent reading is at least as likely as the guilty one, and the spec's own asymmetric-cost principle then decides it.

`deriveAttemptFlags` therefore computes `proctoring_events` severity from **non-context high events only**. An attempt whose only high events are head-turned and no-face gets a medium `proctoring_events` flag, not a high one.

**Layer 2 — flag types.** `FLAG_EVIDENCE_CLASS` covers the six surviving flag types (all but the deleted `implausible_speed`):

| Flag | Class | Drives the level? |
|---|---|---|
| `paste_dominant` | answer | Yes |
| `large_paste` | answer | Yes |
| `similarity_match` | answer | Yes |
| `no_iteration` | answer | Yes |
| `proctoring_events` | environmental | Yes — but only reaches high via a hard event, per layer 1, and after the revision above the only hard events left are `dev_tools_detected`, `screen_share_stopped`, `multi_monitor_detected` and any unrecognised type |
| `webcam_violations` | context | **No** |

The two layers do different jobs: layer 1 stops ambiguous events from *manufacturing* a high severity, layer 2 stops the remaining count-based flag from driving the headline at all. Fixing only one of them would leave the bug intact — layer 1 alone still lets `webcam_violations` promote on a threshold of one, and layer 2 alone still lets a single head-turn make `proctoring_events` high.

### `deriveLevel` becomes

- any flag whose class is `answer` or `environmental`, at **high** → `high_concern`
- any such flag at **medium**, or any `context`-class flag present at all → `review`
- no flags → `clear`

"Headline" is shorthand for the first two classes. A `context`-class flag can only ever produce `review`, never `high_concern`, whatever its own severity says — that is the point of layer 2.

Context flags remain on the candidate report with their counts. They stop manufacturing the headline; they do not disappear.

### Delete `implausible_speed`

It has never fired in 265 attempts, and on inspection that is correct rather than broken: pasted content registers as `pastedChars`, which `large_paste` and `paste_dominant` already catch, so the speed path is redundant. A rule that has never fired is untested code carrying false-positive risk for no demonstrated benefit. Remove it rather than tune it.

### Recompute all 265 historical analyses

History and new attempts must use the same rules. Roughly 200 attempts will drop from `high_concern`. Those verdicts were wrong, and leaving two incompatible rule sets in one results list is worse — a recruiter comparing two candidates would be comparing different standards without knowing it.

## Architecture

**`apps/exam-runtime/src/integrity/integrity-rules.ts`** — pure, already dependency-free. Gains:

```
type EvidenceClass = 'answer' | 'environmental' | 'context'
const FLAG_EVIDENCE_CLASS: Record<IntegrityFlag['type'], EvidenceClass>   // layer 2
const CONTEXT_EVENT_TYPES: ReadonlySet<string>                            // layer 1
```

`deriveAttemptFlags` consults `CONTEXT_EVENT_TYPES` when computing `proctoring_events` severity, so a context event alone cannot make it high. `deriveLevel` consults `FLAG_EVIDENCE_CLASS`, so a `context`-class flag cannot promote regardless of its severity.

`FLAG_EVIDENCE_CLASS` is keyed on `IntegrityFlag['type']`, so deleting `implausible_speed` from the union and forgetting to remove its entry — or adding a flag and forgetting to classify it — is a compile error either way.

**`scripts/recompute-integrity.ts`** (or equivalent one-off) — iterates submitted attempts, calls the existing `IntegrityAnalysisService.analyze(attemptId)`, reports the transitions.

No other file changes. `analyze()` already recomputes from source, so the backfill is a loop rather than new logic.

## The backfill

Three required properties:

- **Idempotent.** `analyze()` upserts on `attemptId`. This matters because the VM's SSH drops for minutes at a time under disk load, so the run will likely need resuming.
- **Sequential.** Each `analyze()` opens a `forTenant` transaction against a pool of 15. Firing 265 concurrently would exhaust it and return `server_busy` to live traffic. A serial loop takes minutes and costs nothing.
- **Reports the shift.** Prints before/after for every changed attempt plus a summary. That report is the deliverable — "200 attempts moved from high_concern to review" is how we know the change did what it claimed.

## Error handling

The failure mode is not a crash. It is a **silent classification change**.

| Case | Behaviour | Why |
|---|---|---|
| A new flag type is added without classifying it | **Compile error** — `FLAG_EVIDENCE_CLASS` is keyed on the flag-type union | The bug being fixed is "important evidence got buried". A new signal defaulting to buried would be the same bug again. |
| An unknown proctoring `event_type` appears | Defaults to **context** | Opposite choice, different reason: event types come from data, not the type system, so a new upstream detector would otherwise start promoting attempts before anyone decided it should. |
| One attempt fails during the backfill | Log, continue, report the count | A run that aborted at attempt 40 is worse than one that skipped three. |

## Testing

This change is *supposed* to move ~200 verdicts, so "the suite still passes" proves nothing. Four layers:

1. **Classification map table test** — every flag type asserted against its class, so a future reclassification is a deliberate edit to an assertion rather than an accident.
2. **`deriveLevel` table test** over the combinations that matter: context-only → `review`, never `high_concern`; a single `paste_dominant` → `high_concern`; `webcam_no_face` ×50 → still not `high_concern`.
3. **Delete the tests that pin the old behaviour, do not adapt them.** Existing tests assert that a high-severity event yields `high_concern`; those encode the bug. Remove them with a comment saying so. Quietly editing them until green leaves the next reader unable to tell which assertions are intentional.
4. **Production dry-run before writing anything.** Compute the new level for all 265 attempts and print the transition matrix without persisting. Every rate in this document is arithmetic over flag counts; the dry-run is what turns it into a measurement.

   ~~If it does not land near ~30–35% `high_concern`, the design is wrong.~~ **This gate was wrong and has been struck.** The rate was never the right question, and the band was unreachable by construction: these rules only ever *demote*, so no configuration of them could have raised the rate toward a target above what the demotion produces. The gate a dry-run should apply is about **composition, not volume** — what fraction of the surviving `high_concern` population is promoted by answer evidence rather than by environment. See below.

## What the dry-run changed

The dry-run ran against all 265 production attempts on 2026-08-14, before any code was written. It did what it was there to do: it falsified part of the design.

**Measurement 1 — the rate.** The rules as originally specced produced 61 `high_concern` (23%), down from 200 (75%). Transition matrix: 134 `high_concern → review`, 61 held, 5 → `clear`, and nothing promoted from `clear` or `review`.

**Measurement 2 — the composition, which is what mattered.** Of those 61 survivors:

| Promoted by | Attempts |
|---|---|
| answer evidence only | 5 |
| `proctoring_events` only | 47 |
| both | 9 |

`webcam_multiple_faces` alone accounted for 48 of the 56 proctoring-promoted attempts. So the original design cut the *volume* of environmental flagging without shifting its *composition*: a recruiter opening `high_concern` would still overwhelmingly have been reading a webcam finding, not answer evidence. That is the original failure mode at lower volume, and it is why the design was revised rather than shipped at 23%.

**Measurement 3 — whether a volume threshold could rescue it.** It could not. Episode counts per affected attempt were `{1:17, 2:10, 3-4:9, 5-9:19, 10-19:2, 20+:1}`, median 3, max 21 — a smooth decay with no valley to cut at, so no threshold separates a passer-by from a sustained second presence. And since every threshold only makes promotion *harder*, the projections moved away from the original band, not toward it: 23% → 20% (≥2) → 17% (≥3) → 15% (≥5).

**The decision.** `high_concern` now means *the answer is suspect*. `webcam_multiple_faces` joins the context set. Hard events reduce to `dev_tools_detected`, `screen_share_stopped`, `multi_monitor_detected`, and any unrecognised type.

**Two lessons worth keeping.** First, an estimate built by summing overlapping prevalences is not a target; treating it as a gate produced a threshold that could never be met. Second, "how many attempts are flagged" was the wrong measure throughout — the problem was always *what a flag means*, and only the composition breakdown could see that.

## Out of scope

- Webcam detection sensitivity itself — that is the candidate exam path
- Any new detection signal, including stylometric analysis of free-text answers
- How events are recorded during a live exam
- Cross-organisation calibration or per-org thresholds

## Known gaps, accepted for now

**The thresholds are judgement, not calibration.** There is no labelled ground truth — no set of attempts known to be cheating — so "believable rate" is the only available yardstick. The dry-run measures the *effect* of the change, not its *accuracy*. Real calibration would need confirmed outcomes, which the platform does not record.

**`webcam_violations` keeps its threshold of one.** As context it no longer drives the level, so the threshold matters far less, but the count shown to a reviewer will still read oddly high on most attempts.

**Nothing detects an answer typed manually from another device.** That evades every behavioural signal here, and is what the remote-access and screen-analysis detection exist to cover. Unchanged by this work.
