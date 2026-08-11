# Face identification for exams

## Why

Proctoring today answers "is *a* face present, and is it behaving?" — `no_face`, `multiple_faces`,
`head_turned`. It cannot answer "is this the *same* person who started?". A candidate can hand
their laptop to someone else after the first question and nothing notices.

This adds identity to the signals already collected: a reference photo captured before the exam,
then continuous verification that the person on camera is still that person.

## Goal, and the limit of it

**In scope: continuity.** The person who finishes is the person who started. This catches
mid-exam seat swaps and someone stepping in to help.

**Deliberately not in scope: true identity.** A start-of-exam selfie proves nothing about *who*
the person is. An impostor present from the very beginning becomes the reference and passes every
later check. Establishing real identity needs a trusted reference — a government ID document
captured and matched, or a photo supplied with the invitation — which is a much heavier
compliance burden.

The user chose the staged path: build continuity now, keep the reference **source** swappable so
identity verification can be added later without redesign. `FaceEnrolment.embedding` does not care
where the reference frame came from.

**Non-goals:** ID-document capture, cross-attempt identity linking, watchlists, or any use of face
data for anything other than verifying one attempt.

## Architecture

Three checks, two places, one verdict.

```
CANDIDATE BROWSER                          EXAM-RUNTIME (server)
─────────────────                          ─────────────────────
MediaPipe FaceLandmarker  (exists, 500ms)
  ├─ no_face / multiple_faces / head_turned  (exists)
  ├─ blink + micro-movement       ← liveness
  └─ face embedding  ~4s ──────────────────►  snapshot upload (exists, ~30s)
        │                                       │
        │ ADVISORY ONLY                         ├─ embedding compare vs reference  ← AUTHORITATIVE
        ▼                                       ├─ anti-spoof model
   instant candidate feedback                   └─ ONE verdict ─► ProctoringEvent ─► per-exam action
```

### Why both tiers, and why that is not duplicated work

They have different jobs, and only one produces a verdict.

**The browser tier is advisory.** It computes an embedding locally, compares it to the reference,
and uses the result solely to tell the candidate something actionable now — "we can't see your face
clearly". It also sends its score to the server as a hint that a check is worth running. A
candidate who patches the client suppresses their own warnings and nothing else.

**The server tier is authoritative.** It re-computes the comparison from the snapshot it already
receives, runs the spoof model, and emits the single event that drives enforcement. It is the only
tier a technical candidate cannot tamper with.

Two tiers each emitting verdicts would produce contradictions no one could adjudicate. One tier
advises; the other decides.

### Runtime

| | Model | How |
|---|---|---|
| Browser | Small face-embedding model (EdgeFace / MobileFace class) | ONNX Runtime Web (WASM), self-hosted under `public/models`, exactly as Monaco and MediaPipe already are |
| Server | Same embedding model + an anti-spoof model | `onnxruntime-node` inside exam-runtime |

**No Python, no fourth deployable.** `uniface` was evaluated and rejected on runtime grounds: it is
Python-only and server-side, which would mean a new service on a VM whose P6 disk burst credits
already collapse during an ordinary deploy. Its value here was pointing at the right model families
and at anti-spoofing as a first-class concern.

**Both tiers use the same embedding model** so scores are directly comparable — a browser hint and a
server verdict can be reasoned about together.

**Cost: none recurring.** ONNX Runtime is MIT; weights must be permissively licensed (see Open
decisions). This avoids Azure Face API, which bills per transaction and requires Microsoft Limited
Access approval. Azure OpenAI is deliberately **not** used — LLM vision is unreliable for face
matching.

## Enrolment

Sits on the welcome page beside the existing webcam and screen-share gates, before Start unlocks.

**Consent first.** Before the camera is used for enrolment the candidate is told plainly: a photo of
their face will be taken, used to verify identity during this exam, retained for a stated period,
and deleted with their data. This is biometric special-category processing under GDPR — consent must
be informed and recorded (`FaceEnrolment.consentAt`), not implied. The screen must also state what
declining means: when the exam requires enrolment, declining means not sitting it.

**The capture is a liveness challenge, not a snapshot.** The candidate looks at the camera and
blinks; the blink is verified live through MediaPipe blendshapes already being computed. A held-up
photograph cannot blink, so the reference itself is guaranteed to come from a live person. This
matters more than any later check, because everything downstream is compared against it.

**Quality gate before acceptance:** exactly one face, large enough in frame, adequately lit, eyes
open, in focus. A poor reference poisons every subsequent comparison — better to reject and re-ask
than to enrol a dark blurry frame and generate an hour of mismatches.

**Retries, then the recruiter's policy:**

```
attempts 1..3   quality gate fails  →  tell the candidate what to fix ("move into the light")
after 3         branch on the exam's enrolment-failure setting:
                  allow unenrolled   → start; attempt marked NOT VERIFIED
                  retry then allow   → start; attempt marked NOT VERIFIED + flagged   (default)
                  require enrolment  → cannot start; candidate contacts the recruiter
```

`NOT VERIFIED` is visible on the Live tab and the report. A candidate who disables their camera to
dodge face checks gets a flag with their name on it, not silence.

**Stored: both the embedding and the reference image.** The embedding drives comparison. The image
exists because when the system accuses someone of not being themselves, a human must be able to
compare the two pictures and judge. Without it, `block` is an unreviewable verdict.

**Retakes** are free during enrolment and impossible after Start — otherwise the reference becomes a
moving target and an impostor could simply re-enrol themselves mid-exam.

## Verification loop

```
browser   ~4s      embedding + compare vs local reference    (advisory)
          500ms    blink / micro-movement                    (feeds the liveness window)
server    ~30s     on the snapshot already uploaded          (authoritative)
          on demand whenever the browser reports suspicion
```

Embeddings cost far more than landmarks, so the browser check does not ride the existing 500ms loop.
Liveness does, because it reads blendshapes already computed.

### Three bands, not two

```
similarity ≥ high threshold   →  MATCH       silent
between the thresholds        →  UNCERTAIN   recorded, never acted on
similarity < low threshold    →  MISMATCH    eligible to escalate
```

Most false accusations come from forcing a binary decision on a marginal frame. The uncertain band
absorbs bad lighting, a turned head, a candidate mid-sip — producing a recorded score with no
consequence.

### "Can't tell" is never "not you"

If the face is absent, too small, or the frame unusable, that is the existing `no_face` violation,
which has its own handling. It must never be reported as a mismatch.

### Escalation requires agreement across time

A confirmed mismatch needs the server to disagree across **N consecutive checks**, using the voter
pattern already in `useWebcamMonitor` (`windowSize: 8, threshold: 5`). Never one frame.

### Spoofing is a separate verdict

A held-up photo of the *right* person matches perfectly — that is the attack. So it is judged
separately:

| Signal | Where | Event |
|---|---|---|
| Sustained low similarity | server | `face_mismatch` |
| No blink / micro-movement over the window | browser → server as a hint | feeds the spoof judgement |
| Anti-spoof model above confidence | server | `face_spoof_suspected` |

The anti-spoof model runs **server-side only**, where its threshold is ours to tune and its
confidence is recorded for review. It carries the highest false-positive risk of anything here, in
exactly the conditions candidates sit in — laptop webcams, poor light, evening drives.

Both events carry the snapshot, the reference image and the numeric score that produced them.

### Pauses

Verification stops while an attempt is paused or blocked, and the first check after resume starts a
fresh window. Otherwise every proctoring pause produces a mismatch burst on resume, while the
candidate is walking back to the desk.

### CPU

The server cadence is a setting, not a constant. Inference runs on 2 vCPUs shared with everything
else; a full drive was ~45 concurrent attempts. If measurement shows it is too heavy, the cadence
drops to on-suspicion-only — the browser tier keeps watching and the server adjudicates only when
something looks wrong. A config change, not a redesign. **This must be measured under realistic
concurrency before enforcement beyond `flag` is enabled.**

## Enforcement, per exam

Both settings are recruiter-controlled, alongside the existing proctoring config.

```
Enrolment failure:  allow unenrolled  |  retry then allow (default)  |  require enrolment
Mismatch action:    flag (default)  |  warn  |  pause  |  block
```

| Action | Behaviour |
|---|---|
| `flag` | Record the event with evidence. No candidate-facing effect. |
| `warn` | Tell the candidate ("we can't verify it's you — please face the camera"), then flag if it persists. |
| `pause` | Pause the attempt until verification recovers, like existing webcam violations. |
| `block` | Block on repeated confirmed mismatch. |

**Defaults are the safe end.** Every exam starts at `flag` + `retry then allow`. Blocking is
deliberately switched on for a high-stakes paper, never inherited by accident.

**Constraints on `block`, which are what make it defensible:**

1. Requires repeated **server-confirmed** mismatches — never a single frame, never a browser hint.
2. Always stores the evidence images that justified it.
3. Recoverable by a human in seconds through the existing recruiter Unblock and proctoring-bypass
   paths.
4. The report's side-by-side comparison must exist. Without it the verdict is unreviewable and
   `block` should not be offered.

### Accuracy and fairness — stated plainly

Face recognition has a non-zero false-rejection rate that is **measurably worse for darker skin
tones and for women**. This is a documented property of the technology, not a tuning bug. Whatever
is built will sometimes be wrong about a candidate who did nothing.

The design's answer is not a promise to be careful. It is: three bands so marginal frames cannot
accuse; agreement across time before escalation; safe defaults; human-reviewable evidence;
recoverable blocks; and a measured fairness check (below) whose result is written down.

## Data model

One new table, scoped to the attempt:

```
FaceEnrolment
  attemptId           unique — one reference per attempt
  status              enrolled | not_verified
  embedding           reference vector, ENCRYPTED at rest
  referenceImagePath  blob path, private container, SAS-signed on read
  capturedAt
  qualityJson         the gate's measurements, for debugging a bad reference
  consentAt           when the candidate agreed
```

**Per attempt, not per candidate** — deliberately. A re-invited candidate enrols again. It costs one
blink and means the reference cannot outlive the attempt that justified collecting it, appearance
drift does not degrade matching, and consent is tied to a specific exam rather than banked.

**The embedding is encrypted at rest** using the `CryptoService` in `packages/shared` — the same one
holding org AI keys. An embedding is not reversible to a photograph, but it is biometric
special-category data and storing it in plaintext beside a name and email is not defensible.

Everything else reuses existing structures:

| | Where |
|---|---|
| `face_mismatch`, `face_spoof_suspected` | `ProctoringEvent`, score + both image paths in `metadataJson` |
| `faceMismatchCount` | on `Attempt`, beside `webcamViolationCount` / `browserActivityViolationCount`, so the Live tab and integrity analysis pick it up for free |
| Exam settings | new columns beside the existing proctoring config |

No new service, no new storage account, no new RLS surface — `proctoring_events` is not RLS-scoped
today and this follows the same tenant-by-query pattern.

## GDPR

**Erase must reach this.** The `candidate.erased.evidence_deleted` path already deletes evidence
blobs; it must be extended to the reference image and the `FaceEnrolment` row. A test asserting that
**no face data survives an erase** is required — it is the difference between a defensible position
and an indefensible one.

**Retention.** Erase-on-request is necessary but not sufficient; the storage limitation principle
expects biometric data to disappear when its purpose ends. Proposal: **delete the reference image
and embedding automatically once the attempt is finalised plus a review window, default 90 days**,
retaining only events and their evidence snapshots after that. `system-events-retention.service.ts`
already implements scheduled cleanup and is the pattern to copy.

**Decided 2026-08-10: 90 days**, confirmed by the product owner. Recorded here as a product
decision rather than a legal opinion — if Prudent's data protection lead later sets a different
number, it is a single constant in the retention job, not a redesign.

## Recruiter surfaces

| Surface | What appears |
|---|---|
| Exam settings | Enable toggle + the two dropdowns |
| Live tab | Face column: `Verified` / `Not verified` / mismatch count, same shape as existing violation columns |
| Candidate report | Face verification section |

**The report section is load-bearing.** Reference photo and flagged snapshots **side by side**, with
score and timestamp under each. This is what turns an automated accusation into a human decision and
is the precondition for offering `block` at all.

## Failure handling

> Every infrastructure failure degrades to **no verdict**, never to an accusation.

| Failure | Result |
|---|---|
| Browser model won't load | Advisory tier off, candidate unaffected, reported to System Logs |
| Server model won't load | No verdict emitted, system event raised, nothing escalates |
| Snapshot upload fails | Existing behaviour; no face verdict for that interval |
| Camera lost mid-exam | Existing `no_face` violation — never a mismatch |

A candidate must never be flagged, paused or blocked because *our* model failed. This asymmetry is
enforced in code, not merely intended.

**Inherited dependency:** snapshots upload to exam-runtime on **:3002**, the port behind the
"error 0" incident. A candidate whose network blocks it gets no server-side verification and would be
silently unverified. The exam-runtime subdomain migration
(`docs/superpowers/plans/2026-08-06-exam-runtime-subdomain.md`) matters more once this ships, because
verification would otherwise stop working for exactly the candidates already worst served.

## Testing

Unit coverage: three-band thresholding, the voter, the quality gate, liveness detection,
enrolment-policy branching, the fail-safe direction on every infrastructure failure, and the
erase-deletes-everything assertion.

Integration: enrolment → verification → event → per-exam action, for each of the four actions.

Browser tests use a stubbed model, following the existing `__DISABLE_WEBCAM_MONITOR__` and
stubbed-stream patterns.

**Accuracy cannot be unit-tested.** Two things close that gap:

**A labelled fixture set** — real captures from real laptop webcams: same person in good and poor
light, different people, and a photo held to the camera. Thresholds are calibrated against this.
Without it we would ship guessed numbers that either flag constantly or never fire.

**A fairness check across skin tones and genders** using that fixture set, with the results written
down. This is the concrete mitigation for the bias named above — a measured result, not an
intention. If false rejections cluster in one group, thresholds change or enforcement stays at
`flag`. A candidate wrongly blocked is a defect of the same severity as a wrong score.

## Delivery staging

This is a large feature. It is one coherent design, but it should land in three stages, each
independently useful and independently shippable. Enforcement beyond `flag` is not enabled for any
exam until stage 3 completes.

**Stage 1 — enrolment and evidence.** Consent screen, liveness-challenge capture, quality gate,
retry policy, `FaceEnrolment` storage with encryption, erase and retention, `NOT VERIFIED` on the
Live tab and report. No verification, no enforcement. On its own this already tells a recruiter who
did and did not enrol.

**Stage 2 — verification.** Both tiers, three-band thresholding, the voter, `face_mismatch` events,
the side-by-side report comparison, and the per-exam action setting. Ships with every exam defaulted
to `flag`.

**Stage 3 — anti-spoofing and calibration.** Passive liveness during the exam, the server-side
spoof model, the labelled fixture set, threshold calibration, the fairness check, and the
concurrency measurement. Only once this is done does enabling `warn` / `pause` / `block` become
defensible.

Each stage gets its own implementation plan.

## Open decisions

These need owners before implementation, not during.

| # | Decision | Why it blocks | Owner |
|---|---|---|---|
| 1 | **Model weights licence.** Must be Apache-2.0 / MIT / BSD. `uniface`'s weights include GPL-3.0. | Could invalidate a model choice late and force rework | Whoever owns licensing at Prudent |
| 2 | ~~**Retention window** for reference image + embedding~~ **DECIDED 2026-08-10: 90 days** | — | Product owner (confirmed) |
| 3 | **Similarity thresholds** (high / low bands) **and `N`**, the number of consecutive server-confirmed mismatches required to escalate | Cannot be guessed; both need the fixture set. `N` trades detection speed against false accusations | Implementation, gated on fixtures (stage 3) |
| 4 | **Server cadence under load** — measured on 2 vCPUs at realistic concurrency | Determines whether per-snapshot checking is viable | Implementation, before enabling beyond `flag` |

## Risks

| Risk | Mitigation |
|---|---|
| False rejection harms a real candidate, unevenly across groups | Three bands; agreement across time; safe defaults; measured fairness check; recoverable blocks |
| Spoofing with a photo defeats the whole feature | Liveness challenge at enrolment; passive liveness during; server-side spoof model |
| Anti-spoof model false-positives in poor light | Server-side only, tunable threshold, confidence recorded, participates in the same escalation ladder rather than acting alone |
| Model weights bloat the constrained VM disk | Choose small models; P6 → P10 resize |
| Inference saturates 2 vCPUs during a drive | Configurable cadence, on-suspicion-only fallback; measured before enforcement |
| Biometric data mishandled | Encrypted at rest, per-attempt scope, erase test, retention job, explicit consent |
| `:3002` blocked → silent non-verification | Surfaced as `NOT VERIFIED`; subdomain migration raised in priority |
