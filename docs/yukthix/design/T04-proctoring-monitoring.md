# T04 · Proctoring Controls, AI-Assistance Detection & Monitoring

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026** with GAP-REGISTER **B5** (object detection, gaze, numeric integrity score) and **C5** (keystroke-dynamics signal, AI-allowed test mode) — see §3 "Gap-register extensions" and §11. The session report PDF is in T05; the secure desktop client is T08 (not designed here). **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** identity chain across hiring and deepfake partner check (YX-PROC-19 / 20; §11 T10).
> **Covers:**
> - spec §1.1 proctoring modes, §1.1.6 Proctoring Controls, §1.1.7 AI-Assistance Detection, §1.1.9 Monitoring & Review (live proctoring, recording, proctor operations);
> - §1.1.5 room scan and second device.
> - Retention, chain of custody and incidents are in T05.
> - [Reuse inventory](../reference/exam-app-reuse-inventory.md) for the same sections.
>
> **Builds on:** T03 (slots, breaks, re-auth, device policy), P10 (AI tiers; face check in-region), P02 (proctor roles, external logins), P11, M10 R1 (only transcripts go to external AI).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
Detect and deter cheating in proportion to what is at stake. Keep candidates' privacy and fairness intact. Give reviewers evidence they can trust.

Signals are **flags for human review, never an automatic fail**. The exam app already follows this principle.

## 2. What exists today (exam app) — keep / change / add

| Capability | Today | T04 |
|---|---|---|
| Mode per test | Assembled from flags (`enableAntiCheating`, webcam, AI analysis, record-only, screen capture…) | **Add** an explicit mode with presets (Q1) |
| Secure browser | Third-party Safe Exam Browser (config + ConfigKey check), fullscreen / devtools detection | **Decide** (Q2) |
| Identity | Liveness-checked selfie enrolment, periodic server-side face re-verification with mismatch voter and actions | **Keep**. **Add** ID document check (Q3) |
| Face / multi-person / head turn / tab / focus / multi-monitor | Done | **Keep** |
| Copy / paste / right-click | Detected as strikes; print unclear | **Add** print blocking |
| Screen-share / remote-tool / background app | AI screen-analysis flags | **Keep**. Process-level detection depends on Q2 |
| Room scan / second device | Missing | **Add** (Q4) |
| Recording | Periodic webcam stills + screen captures | **Add** video / audio per Q5 |
| Audio monitoring | Missing | **Add** (Q6) |
| Typing / paste analysis, weighted flags | Done (`integrity-rules.ts`, clear / review / high concern) | **Keep**. **Add** Q7 signals |
| Live dashboard, chat, force-submit / unblock | Done (WebSocket gateway) | **Add** pause, proctor roles, assignment, shifts (Q8) |
| Action per detection | Enforcement, strike limit, per-signal disable list | **Add** a full action matrix (Q1) |

## 3. Concepts
- **Proctoring mode** (per test version, T02):

  | Mode | What it does | Default use |
  |---|---|---|
  | **Open** | No proctoring | Training / practice |
  | **AI-only** | Automated detection and flags, no human in real time; review after | Volume screening |
  | **Record & review** | Session recorded (Q5); a human reviews flagged segments | Standard hiring |
  | **Live** | A proctor watches in real time at 1 : N (Q8) | High stakes, certification |

- **Preset + matrix:** each mode sets default detections and actions. A test may tune them in an **action matrix**: detection × (off / flag / warn / pause / terminate), plus a strike count. Changes are validated so a mode's minimum can't be removed. For example, Live must keep identity checks.
- **Detection signal:** a typed event with severity, confidence, timestamp and evidence reference (clip / still / log). Signals roll up into an **integrity level** (clear / review / high concern) that reviewers use (T05).
- **Identity chain:** ID document (Q3) → selfie liveness → face match to the ID photo → periodic re-verification → re-auth after breaks or disconnects (T03).
- **Proctor:** a user with the proctor role (P02), either internal staff or an external proctor (Q8). Proctors are assigned to slots / sessions within their capacity.
- **Proctor pool:** **tenant staff** or the **YukthiX pool** (the Q8 add-on). The company opts in once when it buys the add-on. A YukthiX proctor acts only through the P02 **proctor-service grant**: per slot, only for the slot's time window, only for the assigned sessions, and only live view + evidence for those candidates. MFA and signed confidentiality terms are mandatory. Every view is audited and visible to the company.

### Gap-register extensions (26 Sep 2026; Proctoring track, phase 2)
- **Object detection (B5):** an in-region, in-house vision model on webcam frames (and the companion-phone stream when used) detects **phone**, **notes / books / paper**, **earbuds / headphones** and **a second screen / monitor** in view. Each is a detection signal in the action matrix (default **flag**) with a confidence threshold per test, and a still (or a flag clip in recorded modes) as evidence. Runs on-device where the device can, otherwise server-side in-region.
- **Gaze / eye-direction (B5):** head-pose + eye-direction estimate from the webcam → **off-screen gaze** signal (duration and frequency above a threshold, e.g. > 5 s or > N times per minute). An optional 5-second calibration at start improves accuracy. Automatically off for accommodations that make it unfair (screen-reader users, visual impairments, T03 adjusted profile).
- **Numeric integrity score (B5):** alongside the level (clear / review / high concern), each attempt gets an **integrity score 0–100** (100 = no concerns): signals are weighted, decayed for low confidence, and summed into deductions. **Weights are company-configurable** (labelled starter weights, D17) and are **shown with the score** as a contribution breakdown ("phone detected ×2: −18"). The company also maps score ranges to levels (starter: ≥ 80 clear, 50–79 review, < 50 high concern). The score orders the review queue and appears in the T05 session report; it never decides anything by itself.
- **Keystroke dynamics (C5):** an **opt-in** impersonation signal. With separate consent, a typing rhythm profile is built from a short typing sample at start (or a `typing` item, T01) and compared during the test; a sustained mismatch raises a **flag** ("typing pattern changed"). The profile is biometric data: in-region, Special, retained and erased like face data (T05). Never used for under-18 test-takers (YX-EVAL-13, no profiling).
- **AI-allowed test mode (C5):** a test setting (any proctoring mode) where the candidate **may use an approved AI assistant inside the test runner**:
  - the assistant is YukthiX-hosted through P10 tiers, with a model the company picks from the allowed list, and the company may limit it (e.g. no code execution, token cap per question);
  - every prompt and output is **logged** with timestamps, per question, as part of the attempt, and shown to evaluators (T05 scoring of prompting / verification skills);
  - **AI-assistance signals (Q7: LLM-likeness, response-time anomaly, probes) are switched off** for that test; other detections (identity, other tabs / apps, second person, objects) stay per mode — using an *outside* AI tool is still a normal tab / app flag;
  - the candidate is told before starting that AI help is allowed, which assistant, and that it is logged;
  - assistant usage consumes **AI credits** (add-on, D18).

### Market analysis additions (26 Sep 2026; [MARKET-COMPETITOR-ANALYSIS](MARKET-COMPETITOR-ANALYSIS.md) §4)
- **Live-proctor SLA (G14):** 10 minutes from slot start, then automatic fall-back to Record & review with time credit and a flag — never a termination (YX-PROC-17).
- **No-face-detection mode (G15):** per-test company option; identity by ID check and proctor, no continuous face analysis (YX-PROC-18).
- **Overlay assistants and second-device voice tools (G16):** named AI-assistance signals — an always-on-top / transparent overlay that a screen share does not show (detected by the secure client, T08 YX-SCL-09) and a phone or second device running a voice LLM assistant (inferred from the Q6 audio signals and the optional LAN hint). Flags only (YX-PROC-03).

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `proctoring_profiles` | Test version × mode, action matrix JSON, strike rules, required checks |
| `id_verifications` | Attempt, document type, masked number, OCR fields, face-match score, liveness result, decision (auto / manual), reviewer |
| `room_scans` | Attempt, clip ref, time, reviewer note |
| `companion_devices` | Attempt × paired phone (QR pairing token), status, stream / capture refs (Q4) |
| `recordings` | Attempt × stream (camera / screen / audio / companion), segments, resolution, storage ref, hash (T05 chain of custody) |
| `detection_events` | Existing events, extended with the new types, confidence, evidence refs, action taken |
| `proctors` | User, internal / external, `pool` (tenant / yukthix), languages, max concurrent, certifications, MFA enrolled, confidentiality terms accepted (version, date) |
| `proctor_service_optins` | Organisation, add-on purchase ref, opted in by, date, status (active / withdrawn); required before any YukthiX-pool assignment |
| `proctor_shifts` + `proctor_assignments` | Shift windows, slot / session assignments, live ratio |
| `proctor_actions` | Chat, warning, pause, resume, terminate, with reason (audited) |
| `detection_events` (new types, B5 / C5) | `object.phone`, `object.notes`, `object.earbuds`, `object.second_screen`, `gaze.off_screen`, `keystroke.mismatch`, `app.left` (candidate app, T03); each with confidence, model version and evidence ref |
| `integrity_weight_profiles` | Tenant (or test override) × signal type → weight, confidence floor, score-to-level ranges, version; starter profile labelled (B5) |
| `integrity_scores` | Attempt × score 0–100, level, weight-profile version, contribution breakdown JSON, computed_at; recomputed (new row) after a verdict clears a signal (B5) |
| `keystroke_profiles` | Attempt / test-taker × template (encrypted), sample source, consent ref, created_at, deleted_at (C5; Special) |
| `ai_assistant_configs` | Test version × allowed model, limits (tokens / question, tools off), instructions shown to candidate (C5) |
| `ai_assistant_logs` | Attempt × question × turn: prompt, output, model, tokens, timestamps (C5; Confidential, retained with answers) |
| `identity_templates` | the person record (P01 `persons`) × face template (encrypted), ID check ref (masked), captured_at, capture point (application / test / pre-boarding), consent ref, jurisdiction, deleted_at (T10; Special, in-region) |
| `identity_chain_checks` | Person × check point (test start / AI interview / live interview / day-1), method (face match / ID + attestation), score, result (match / mismatch / re-verified), attesting proctor or interviewer, incident ref (T10) |
| `deepfake_checks` | Interview × partner request (clip / frame refs sent, region), result per signal (`media.synthetic_suspected`, `voice.clone_suspected`, confidence), incident ref, billed units (T10) |

All tables carry `organization_id` + RLS. ID images, recordings and face data are **Special**: in-region only, never sent to external AI (P10), and retained per T05.

## 5. Rules (YX-PROC)

| ID | Rule |
|---|---|
| YX-PROC-01 | Every published test has exactly one proctoring mode. Its preset is applied, and matrix overrides can't go below the mode's minimum (Q1). |
| YX-PROC-02 | Detection signals are **flags**. Only configured actions (warn / pause / terminate) act automatically. A **terminate** always preserves the attempt and evidence for review and appeal (T05). Nothing auto-fails a candidate. |
| YX-PROC-03 | AI-assistance signals (Q7; including the **overlay-assistant** and **second-device voice-tool** signals from T08 YX-SCL-09, G16) are review flags only. They never trigger warn / pause / terminate on their own. |
| YX-PROC-04 | Identity: in modes that require it, the attempt can't start until the ID check and face match pass or a proctor approves manually (Q3). Periodic re-verification continues during the test. |
| YX-PROC-05 | ID documents: only the document type, **masked** number and the verification result are kept. The image is kept per T05 retention. Aadhaar numbers are never stored unmasked. |
| YX-PROC-06 | Recording follows the mode (Q5). The candidate is told exactly what is recorded (camera / screen / audio / companion) before consenting (T05 privacy). |
| YX-PROC-07 | Face, voice and video processing runs in-region, in-house. Only derived text (e.g. an answer transcript) may reach external AI (P10, M10 R1). **One exception (T10):** the deepfake / voice-clone check sends minimal interview clips or frames to the contracted specialist partner under YX-PROC-20; it is not an AI provider for P10 tiers and never receives test recordings. |
| YX-PROC-08 | Live mode: a proctor may watch at most N candidates at once (Q8). A session without an assigned proctor present can't start (a waiting room is shown). |
| YX-PROC-09 | Every proctor action (warn, pause, resume, terminate, manual ID approval) needs a reason and is audited with the proctor identity. |
| YX-PROC-10 | Companion-device (second camera) streams are bound to the attempt by a single-use pairing code and are treated as evidence like the main stream (Q4). |
| YX-PROC-11 | The secure client / browser (Q2) is checked at start (config key / signature). A mismatch blocks the start in modes that require it. |
| YX-PROC-12 | YukthiX-pool proctors can be assigned only when the company has an active opt-in (`proctor_service_optins`). Each assignment issues a P02 proctor-service grant for that slot only: valid for the slot window, limited to the assigned sessions, live view + evidence for those candidates only, nothing else in the tenant. MFA and accepted confidentiality terms are checked at every sign-in. Every view and action is audited and shown to the company. |
| YX-PROC-13 | **Object detection and gaze (B5).** Object and gaze signals are **flags** by default; like any detection they act only through the configured action matrix, and never fail a candidate (YX-PROC-02). Frames are processed in-region, in-house (YX-PROC-07). Gaze and earbud / headphone signals are switched off automatically when an approved accommodation makes them unfair (T03 YX-DLV-10; e.g. hearing aids, screen-reader users). |
| YX-PROC-14 | **Integrity score (B5).** Every attempt in AI-only, Record & review and Live modes gets a 0–100 score next to its level. The score is always shown with the **weights and the contributions** that produced it and the weight-profile version. Weights are set by the company (starter template, D17); changes apply to new attempts only unless an admin re-scores with a reason (audited). The score and level are review aids only: verdicts are human (T05 YX-EVAL-01) and ATS rules use the integrity status, not the score (YX-EVAL-12). |
| YX-PROC-15 | **Keystroke dynamics (C5).** Off by default; enabled per test by the company and used only after the candidate's separate, purpose-specific consent (T05 YX-EVAL-09). A declining candidate continues without it and is not flagged for declining. Mismatch is a **flag only**. Never enabled for under-18 test-takers (YX-EVAL-13). The profile is biometric data (Special, in-region, retention and erasure per T05). |
| YX-PROC-16 | **AI-allowed mode (C5).** In a test marked AI-allowed, the Q7 AI-assistance signals are disabled and the in-runner assistant is available; all assistant prompts and outputs are logged per question and kept with the attempt. The candidate is told before starting. Other detections continue per the proctoring mode. Only the approved assistant is "allowed"; other AI tools are treated like any outside resource. For under-18 test-takers AI-allowed mode is available, but scoring stays deterministic / human (YX-EVAL-13). |
| YX-PROC-17 | **Live-proctor SLA (G14).** A Live session must start within **10 minutes** of the booked slot start. If no assigned proctor (own staff or YukthiX pool, YX-PROC-12) is present by then, the attempt **automatically continues in Record & review** mode: the waiting time is credited to the attempt (T03 continuity), a "proctor not present" flag is written to the attempt for the reviewer, and the company and proctor planner are notified. The waiting room of YX-PROC-08 therefore **never ends in a termination** or a lost attempt. YukthiX-pool misses count against the add-on's service level (Q8, D12). |
| YX-PROC-18 | **No-face-detection mode (G15).** A company may set a test (any mode) to **no face detection**: identity is established by the ID check (YX-PROC-04) and / or a proctor's manual verification (T05 YX-EVAL-14), and **no continuous face analysis** runs — face-match re-verification, gaze and face-region object signals are off; other detections stay per mode. Intended for approved accommodations (T03 YX-DLV-10) and for jurisdictions that restrict biometrics (T05 Q8). The candidate is told what is and isn't analysed before consenting (YX-PROC-06); the test report states the mode (T05 YX-EVAL-16). |
| YX-PROC-19 | **Identity chain across hiring (T10).** With the candidate's consent (T05 YX-EVAL-09, per jurisdiction: DPDP, GDPR Art. 9, BIPA written release), a **face template and ID check are captured once**, at the first of: application verification (M10 YX-ATS-32), the test ID check (YX-PROC-04, T03 YX-DLV-21) or pre-boarding (M01), and attached to the person record (P01 `persons`). The same person is then **matched again** at test start (existing YX-PROC-04), AI interview and live interview (M10 YX-ATS-32; T07 interview room) and day-1 onboarding (M01). A **mismatch is a flag for human review, never an auto-reject** (YX-PROC-02): it opens a T05 incident (YX-EVAL-30) and the candidate can explain or **re-verify** (fresh ID + selfie, or a proctor / interviewer video check) before any decision. Where face detection is off (YX-PROC-18) or consent is refused, the chain uses the **ID check plus proctor / interviewer attestation** (named person, reason, time) at each step, and the candidate is not flagged for declining. The template is Special, in-region, in-house (YX-PROC-07), never shared across tenants, kept per T05 retention (YX-EVAL-08, 30-day default counted from the last check in the chain, unless under legal hold) and erased on consent withdrawal or erasure. |
| YX-PROC-20 | **Deepfake / synthetic-video and voice-clone detection (T10).** Runs **only on interview video / audio** (M10 AI interview, T07 live interview), never on test recordings, through the specialist partner connector (P10 §B3, YX-INT-11). Only the **minimal clip or frames** needed are sent; a partner processing in-region or with **India data residency** is preferred; the partner keeps nothing after returning the result. Results are **signals only** (`media.synthetic_suspected`, `voice.clone_suspected`): they never reject, warn or end an interview on their own and go to human review via T05 incidents (YX-EVAL-30). Off unless the company enables it and the candidate has consented (disclosed in the interview consent and G-08); cost is a **pass-through add-on beyond fair use** (D18). |

## 6. Flows
1. **Start (proctored):**
   1. Readiness (T03).
   2. Consent listing what is recorded.
   3. ID capture.
   4. Liveness selfie and face match.
   5. Room scan (if required).
   6. Pair the phone (if required).
   7. Secure-client check.
   8. Waiting room (Live) or start.
2. **During:**
   - signals stream to the runtime;
   - actions apply per the matrix;
   - periodic face re-verification;
   - Live: proctor tiles showing flags, chat, pause / resume / terminate.
3. **After:** recordings and events sealed with a hash (T05). The integrity level **and 0–100 score** (with weights, YX-PROC-14) are computed. Flagged segments go to the review queue (T05), ordered by score. The T05 session report PDF is generated after review (YX-EVAL-16).
4. **Proctor operations:** shifts planned from slot bookings (T03) and the ratio → assignments → live console → handover between shifts.

## 7. UI
- **Test settings → Proctoring:** a mode picker with a plain-language summary ("records camera + screen, reviewer checks flags"), and an action matrix under "advanced".
- **Candidate:** a clear "what we record" panel, ID and room-scan wizard, phone pairing QR, and a status bar showing what is active.
- **Live console:** a grid of candidate tiles showing camera, screen thumbnail and the latest flag, sorted by concern. Keyboard shortcuts. A 1:N capacity indicator.
- **Proctor planner:** a shift calendar against booked slots, showing tenant-staff and YukthiX-pool capacity (YukthiX pool only when opted in).
- **Company audit view:** every YukthiX-proctor view and action, per slot (YX-PROC-12).
- **Integrity weights (B5):** *Assessments › Integrity scoring* — starter weight profile (labelled), per-signal weight and confidence floor, score-to-level ranges, preview on past attempts; the score card on each attempt shows the contribution breakdown.
- **AI-allowed mode (C5):** test setting toggle with model / limits; in the runner an assistant side panel labelled "Allowed AI assistant — every message is logged".
- **No face detection (G15):** a per-test toggle under Test settings → Proctoring with the plain summary "identity by ID check and proctor; no continuous face analysis"; the candidate's "what we record" panel reflects it. **Live SLA (G14):** the waiting room shows the 10-minute countdown and the fall-back message; the live console and planner show missed-start alerts.
- **Identity chain (T10):** on the candidate / person, an *Identity* panel lists each check point with method, result and any attestation (no template or ID image shown); a mismatch shows "review, not a rejection" with **Request re-verification**. *Settings › Integrations › Deepfake detection* holds the partner connection and the per-company on / off.

## 8. Migration & rollout
Existing per-exam flags map to the nearest mode, and custom settings become matrix overrides.

Build order:
1. Modes and matrix.
2. ID check.
3. Recording (Q5) and audio.
4. Room scan and companion phone.
5. Proctor roles and shifts.
6. Q7 AI-assistance signals.
7. Secure client (Q2; designed in T08).
8. **Proctoring track, phase 2:** integrity score + weights → object detection → gaze (B5); AI-allowed mode → keystroke dynamics (C5).

## 9. Acceptance tests (samples)
- A Live test can't be saved without identity checks (YX-PROC-01).
- A candidate with a "high concern" integrity level is not auto-failed; the attempt goes to review (YX-PROC-02).
- A very fast, correct answer raises a response-time flag but no warning or pause (YX-PROC-03).
- A stored Aadhaar ID shows only the last 4 digits; no full number exists in the database (YX-PROC-05).
- Recording streams never leave the region; a network trace shows only transcripts sent to the external LLM (YX-PROC-07).
- A 13th candidate joining a 1:12 Live session waits until a proctor slot frees (YX-PROC-08).
- A proctor terminating a session without a reason is blocked (YX-PROC-09).
- A YukthiX-pool proctor can open only their assigned candidates during the slot window; 1 minute after the slot ends, or for any other candidate, access is denied, and the company sees every view in its audit log (YX-PROC-12).
- A phone held up to the webcam raises `object.phone` as a flag with a still; with the default matrix there is no warning or pause, and the candidate is not failed (YX-PROC-13).
- A candidate with an approved screen-reader accommodation raises no gaze flags (YX-PROC-13).
- An attempt shows "integrity 64 / 100 — review" with the breakdown "phone ×1 −18, off-screen gaze ×3 −12, tab switch ×2 −6"; changing a weight doesn't change it unless an admin re-scores with a reason (YX-PROC-14).
- A candidate declining keystroke-dynamics consent takes the test without it and has no flag for declining; for a 17-year-old the option isn't offered (YX-PROC-15).
- In an AI-allowed test, pasting an assistant answer raises no LLM-likeness flag, the evaluator sees the full assistant log for that question, and switching to an outside AI website still raises a tab flag (YX-PROC-16).
- A candidate verified at application whose AI-interview face does not match gets an `identity.mismatch` flag and a T05 incident; the application is not rejected, and after a successful re-verification the flag closes as "re-verified" (YX-PROC-19).
- With no face detection set, the live interview identity step records the interviewer's attestation and the ID check; no face match runs and no flag is raised for the missing template (YX-PROC-19).
- A deepfake signal on an AI-interview clip creates a review flag only; the candidate stays in "AI round – review"; a network trace shows only the selected clip sent to the partner, and test recordings are never sent (YX-PROC-20).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Proctoring modes & actions | **Explicit 4 modes with presets** (Open / AI-only / Record & review / Live) + an **advanced action matrix** per detection (off / flag / warn / pause / terminate, strike counts) that can't go below the mode's minimum. |
| Q2 | Secure browser | **Keep Safe Exam Browser** (free, open source, run as a separate app) at launch; build our own **YukthiX Secure Client** (Windows + macOS desktop app) later for process blocking, VM / virtual-camera detection and screen-capture blocking. |
| Q3 | ID verification | **ID photo + OCR + face match, in-region** (PAN, passport, driving licence, voter ID; Aadhaar masked only), **required in Live and certification, optional elsewhere**; low-confidence matches go to a proctor for manual approval; **DigiLocker verification** as a partner add-on later. |
| Q4 | Room scan & second camera | **360° room scan** at start (and on proctor request in Live); **second-device phone camera** paired by QR, for high-stakes tests; both configurable per test, required by default only in Live / certification. |
| Q5 | Recording level | **Record & review and Live:** continuous **low-bandwidth video** (camera 360p, screen at low frame rate) + audio, in-region; **AI-only:** stills + **short clips around each flag** (±10 s buffer); **Open:** nothing. Retention per T05. |
| Q6 | Audio monitoring | **On-device voice-activity and multiple-speaker detection** → flags with short audio clips; no continuous speech-to-text of the room; clips stored as evidence only. |
| Q7 | AI-assistance detection | Add **response-time anomaly** (vs expected time from T01 / T02), **LLM-likeness scoring** of descriptive answers (text only, P10 tiers), and **optional follow-up probe questions** generated for suspiciously strong answers; second-device LAN detection only with the future secure client; all flags only (YX-PROC-03). |
| Q8 | Proctors | **Proctor role** for the company's own staff (Live ratio default **1 : 12**, range 8–16); shift planning from slot bookings; **YukthiX-provided professional proctors** as a paid usage add-on (per proctored hour, D15) for companies without staff. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Four explicit modes with presets** (Open / AI-only / Record & review / Live) + an **advanced action matrix** per detection (off / flag / warn / pause / terminate, strike counts) that can't go below the mode's minimum (YX-PROC-01); existing per-exam flags migrate to the nearest mode + overrides. | 25 Sep 2026 |
| Q2 | **Safe Exam Browser at launch** (open source, MPL-2.0, run as a separate app; ConfigKey check, YX-PROC-11); **own YukthiX Secure Client later** (Windows + macOS: process blocking, VM / virtual-camera / remote-tool detection, screen-capture blocking, LAN second-device hints); both supported side by side once the client ships. | 25 Sep 2026 |
| Q3 | **ID photo + OCR + face match to the selfie, in-region** (PAN, passport, driving licence, voter ID; Aadhaar only masked, YX-PROC-05); **required in Live and certification tests, optional elsewhere**; low-confidence results go to a proctor for manual approval with reason; **DigiLocker verification as a later partner add-on** (D15). | 25 Sep 2026 |
| Q4 | **360° room scan** at start (and on proctor request in Live) + **companion phone camera** paired by single-use QR code (YX-PROC-10); both configurable per test, **required by default only in Live and certification** tests. | 25 Sep 2026 |
| Q5 | **Recording by mode:** Record & review and Live — continuous **low-bandwidth video** (camera 360p, screen at low frame rate) + audio, in-region; AI-only — stills + **short clips around each flag** (±10 s ring buffer); Open — nothing; companion-phone stream recorded when used; retention per T05. | 25 Sep 2026 |
| Q6 | **On-device voice-activity and multiple-speaker detection** → flags with short audio clips as evidence; **no continuous speech-to-text** of the room; in Record & review / Live the continuous audio track (Q5) is reviewed only around flags. | 25 Sep 2026 |
| Q7 | **New AI-assistance signals:** response-time anomaly vs expected time (T01 / T02); LLM-likeness score for descriptive answers (text only, P10 tiers); **optional follow-up probe questions** auto-generated for suspiciously strong answers (per test setting, candidate told probes may appear); second-device LAN detection only with the future secure client (Q2); **all review flags only** (YX-PROC-03). | 25 Sep 2026 |
| Q8 | **Proctor role for the company's own staff** (Live ratio default **1 : 12**, range 8–16; shifts planned from slot bookings, T03) **+ YukthiX-provided professional proctors as a paid usage add-on** (per proctored hour, spec D15). Team action: decide whether to hire proctors or use a staffing partner for this service. | 25 Sep 2026 |
| D12 | **YukthiX-provided proctors:** the company opts in once when buying the add-on; each YukthiX proctor gets a **per-slot P02 proctor-service grant** limited to the assigned sessions and the slot time window, live view + evidence for those candidates only; every view audited and visible to the company; MFA + confidentiality terms mandatory; `proctors.pool` = tenant / YukthiX; the planner shows YukthiX pool capacity (YX-PROC-12). | 26 Sep 2026 |
| B5 | **Gap-register extension (user decision 26 Sep 2026): detection parity (T04 part).** **Object detection** on the webcam (and companion) stream — phone, notes / books, earbuds / headphones, second screen — and a **gaze / eye-direction** off-screen signal, in-region and in-house, default **flag** in the action matrix, switched off where accommodations make them unfair (YX-PROC-13); **numeric integrity score 0–100** next to the level, with company-configurable weights (labelled starter profile, D17) always shown with the contribution breakdown; score orders the review queue and never decides (YX-PROC-14). All flags only, never auto-fail. Session report PDF in T05 (YX-EVAL-16). Included in the Proctoring price (per attempt, D18). Proctoring track, phase 2. | 26 Sep 2026 |
| C5 | **Gap-register extension (user decision 26 Sep 2026): keystroke dynamics and AI-allowed mode (T04 part).** **Keystroke-dynamics impersonation signal**: opt-in per test, separate consent, flag only, biometric data (Special, in-region, T05 retention / erasure), never for under-18s (YX-PROC-15). **AI-allowed test mode**: an approved YukthiX-hosted assistant inside the runner (company picks model and limits), every prompt / output logged per question, **Q7 AI-assistance flags disabled** for that test, other detections unchanged, candidate told in advance (YX-PROC-16); scoring of prompting / verification skills in T05 (YX-EVAL-23); assistant usage consumes AI credits (add-on, D18). Test-centre mode and invigilator app are in T03 (YX-DLV-18 / 19). Proctoring track, phase 2. | 26 Sep 2026 |
| Market analysis additions (G14–G16) | **Adopted** ([MARKET-COMPETITOR-ANALYSIS](MARKET-COMPETITOR-ANALYSIS.md) §4): **live-proctor SLA** — a Live session starts within 10 minutes of the slot or the attempt automatically continues in Record & review with time credit and a flag, never a termination; applies to own proctors and YukthiX proctors (YX-PROC-17). **"No face detection" mode** as a company option per test — identity via ID check and proctor, no continuous face analysis — for accommodations and biometric-restricted jurisdictions (YX-PROC-18). **Overlay assistants and second-device voice LLM tools** named in the AI-assistance signals (YX-PROC-03 wording; detection in T08 YX-SCL-09). | 26 Sep 2026 |
| T10 | **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** **own identity chain + deepfake partner.** Face template and ID captured once with consent (first of application verification, test ID check, pre-boarding) and attached to the person record (P01 `persons`); re-matched at test start, AI interview, live interview (M10 / T07) and day-1 onboarding (M01); mismatch = human-review flag, never auto-reject, candidate can explain or re-verify; ID check + proctor / interviewer attestation where face detection is off or consent refused (YX-PROC-19). Deepfake / synthetic-video and voice-clone detection via a specialist partner on interview video / audio only, minimal clips, in-region or India-resident partner preferred, signals only, pass-through add-on beyond fair use (D18) (YX-PROC-20; YX-PROC-07 exception). Consent per jurisdiction and 30-day retention per T05; incidents and appeals T05 YX-EVAL-30; connector and EU classification P10. | 28 Sep 2026 |
