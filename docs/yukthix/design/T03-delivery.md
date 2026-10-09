# T03 · Test Delivery: Scheduling, Drives, Continuity & Accessibility

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026** with GAP-REGISTER **B7** (campus drive kit, native candidate app) and **C5** (test-centre / offline hybrid mode, invigilator app, post-test candidate survey) — see §3 "Gap-register extensions" and §11. These amend Q3 (offline centre mode now in scope) and Q6 (native candidate app now in scope). **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** identity chain across hiring and deepfake partner check (YX-DLV-21; §11 T10).
> **Covers:** spec §1.1.4 Scheduling & Invitations, §1.1.5 Pre-Test Experience (readiness, practice, instructions, consent; the room scan and second device are in T04), §1.1.8 Session Continuity, §1.1.14 Accessibility & Accommodations; [reuse inventory](../reference/exam-app-reuse-inventory.md) for the same sections.
> **Builds on:** T02 (timing, retakes), T04 (proctoring modes), P04 (message channels; candidates use email / SMS / WhatsApp on the company's number), P11 (API).
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
Every invited candidate should be able to take the test on time, on a suitable device, even on a weak connection, with fair treatment when something goes wrong. This includes drives with thousands of candidates at once, and candidates who need accommodations.

## 2. What exists today (exam app) — keep / change / add

| Capability | Today | T03 |
|---|---|---|
| Individual / bulk invites, access windows, expiry | Done | **Keep** |
| Timezone | UTC storage; staff time zones | **Add** candidate-local display; authoring timezone recorded on the test |
| Reminders | Staff reminder sweep only | **Add** candidate reminders and missed-test alerts (Q1) |
| Self-scheduling / reschedule / no-show | Missing (self-booking exists for interviews) | **Add** (Q1), reusing the interview booking engine |
| Drives | `WalkInGroup`, `DriveSession`, live drive view, k6 spike test | **Extend**: capacity planning and a scale target (Q2) |
| Low-connectivity | Missing | **Add** (Q3) |
| Device policy | Safe Exam Browser flag, IP range | **Add** a device policy per test (Q6) |
| Readiness check | Camera preview only | **Extend** (Q7) |
| Practice test, instructions acknowledgement, consent | Done | **Keep** |
| Auto-save, resume after power / network loss | Done | **Keep** |
| Time credit | Missing (only proctoring pauses freeze the timer) | **Add** (Q4) |
| Admin resume | `unblock` without re-auth | **Add** re-authentication (Q4) |
| Breaks | Missing | **Add** (Q5) |
| Extra-time accommodation | `extraTimePercent` set by recruiter | **Extend**: request / approval process and more accommodation types (Q8) |
| Screen reader, font / contrast, keyboard | Partial / unverified | **Add** WCAG 2.1 AA target (Q8) |

## 3. Concepts
- **Invitation:** test-taker × test version (T02), with access window, deadline, time zone, accommodations and attempt count.
- **Test-taker:** the subject of an invitation, either a **candidate** or an **employee**. Employee test-takers are invited from M07 enrolments, M06 skills tests or certifications. They sign in with their normal employee session (web or M04 app, SSO / OTP) instead of the candidate magic link. Consent (T05) is still captured per attempt. Employee accommodations are approved by HR / L&D (P02 scope). Results go back to the source record (M07 enrolment or M06 competency evidence) and show in the employee's Me tab. Retention follows the employee record (T05 Q7), not candidate retention.
- **Slot:** a bookable time with capacity. Capacity comes from live-proctor staffing (T04) or from drive centre seats. Candidates self-book when the test is in slot mode (Q1).
- **Drive:** a large event made of many sessions / slots, possibly across centres. It has a capacity plan (Q2).
- **Session continuity:** the server is the source of truth for time and answers. The client caches and syncs. Disconnections are measured on the server (Q3, Q4).
- **Break:** scheduled (between sections) or unscheduled (candidate-initiated), each with its own rules (Q5).
- **Accommodation:** an approved adjustment:
  - extra time %;
  - extra or longer breaks;
  - screen-reader mode;
  - larger fonts or high contrast;
  - a separate session;
  - an adjusted proctoring profile (e.g. no gaze flags for a screen-reader user).

### Gap-register extensions (26 Sep 2026; Proctoring track, phase 2)
- **Campus drive kit (B7):**
  - **Drive registration portal:** a public page per drive (company branding, P05 / white-label) with a **company-configured form** (starter template, D17: name, email, mobile, college, roll number, degree / branch, graduation year, photo, consent). Email / mobile verified by OTP. Eligibility filters (e.g. branch, year, minimum % — company-set) and a registration cap. Registrants are **de-duplicated with M10** (email / mobile, and roll number + college) and become M10 candidates on the drive's job(s), then invitations.
  - **Institution master:** colleges / universities (name, code, city, state, coordinator contacts), tenant-owned; import or add. Registrations link to an institution. **College-wise reports:** registered, eligible, attended, passed, shortlisted per college and per drive.
  - **College coordinator login:** a limited external login (P02 external role) per institution: sees their own college's registrants for the drives they're invited to, registration / attendance status, and aggregate results **only if the company enables it**; can share the registration link and download admit-card status. Never sees answers, scores per candidate (unless enabled), evidence or integrity details.
  - **Admit card / hall ticket:** generated from the APX-F #86 template when a registration is approved or a slot is booked; carries a **signed QR** checked at the venue (invigilator app) and usable as the YX-EVAL-14 alternate identity path. Reissuing invalidates the previous QR.
- **Native candidate mobile app (B7):** Android and iOS store apps built with the **M04 Capacitor approach** (same candidate portal + runner code, thin native wrapper). Allowed for **Open and AI-only** modes (amends Q6, which allowed only the mobile browser). In-app proctoring: front camera stills / flag clips and face checks per T04, and **OS lockdown where available** — Android lock-task / screen pinning, iOS Automatic Assessment Configuration — with a flag if the candidate leaves the app. Screen monitoring, Record & review and Live stay desktop-only. Secure desktop client is T08, not here.
- **Test-centre / offline hybrid mode (C5):** for venues with poor internet. A **centre server** (software on a customer / venue-provided machine or VM on the LAN) downloads the **encrypted test package** in advance; the decryption key is released only at the session start time (online) or by a one-time code from the drive owner (offline). Candidate machines connect to the centre server over the LAN. Answers and proctoring evidence are stored **encrypted and hash-sealed** on the centre server and **synced to the cloud** continuously when a link exists, and in full after the session. The centre server clock is synchronised before the session and its drift is logged; lost-time rules (Q4) use centre-server heartbeats. **Centre check-in** (admit-card QR + photo-ID check) and a **seat plan** (seat → candidate, spacing rules, randomised allocation) are part of the session setup. Supersedes the Q3 "not in launch scope" note.
- **Invigilator mobile app (C5):** a role-limited app (M04 Capacitor approach) for invigilators at a centre session: **roll call** (present / absent / late), **admit-card QR scan**, **photo-ID check** against the registration photo (face match in-region, T04 YX-PROC-07; mismatch = flag for review), seat confirmation, and an **incident log** (type, time, seat, note, photo) whose entries become T05 incident evidence. Works offline and syncs through the centre server or the cloud.
- **Post-test candidate survey (C5):** an optional short survey after submission, built on the **M09 survey engine** (starter template, D17: overall experience 1–5, ease of use, fairness, technical problems, free text). Answers never affect the score and are reported to the company **aggregated** (by test / drive / college), not attached to the candidate's evaluation.
- **Result reuse across jobs (J12).** A completed, released attempt can count for another job that uses the **same test version** (or a version the owner marks equivalent) within the test's **validity window** (company setting, starter template 6 months, D17), and only with the **candidate's consent** for that job. The candidate may instead retake, under the T02 retake policy (Q5).
- **Internal applicant as test-taker (J13).** When an employee applies to an internal job in M10, the test invitation is linked to that **M10 application**; the result goes to that application's hiring team and HR and is **hidden from the employee's current manager chain**.

## 4. Data model (main additions)

| Table | Purpose |
|---|---|
| `invitations` (changed) | Adds `subject_type` (candidate / employee) + `subject_id`, and for employees `source_type` / `source_id` (M07 enrolment, M06 skills test / competency, certification) for result routing |
| `test_slots` | Test / drive, start, end, capacity, booked, centre / online, proctor pool (T04) |
| `slot_bookings` | Invitation × slot, status (booked / rescheduled / cancelled / no-show / attended), reschedule count |
| `drive_capacity_plans` | Drive, expected concurrency, waves / staggered starts, reserved runtime capacity, go-live checklist status |
| `attempt_connectivity` | Attempt × disconnect intervals (server-measured), total lost time, credited time, approvals |
| `attempt_breaks` | Scheduled / unscheduled, start, end, counted against time? |
| `accommodation_requests` | Candidate, test / invitation, type(s), evidence doc (P05 vault, Special), status, reviewer, decision, validity |
| `readiness_checks` | Candidate × device check results (camera, mic, bandwidth, CPU, browser, screens), timestamp |
| `candidate_messages` | Existing reminders and alerts, now scheduled per invitation (email / SMS / WhatsApp) |
| `drive_registration_forms` | Drive, public slug, form schema JSON (starter template, D17), eligibility rules, cap, open / close dates, OTP channels (B7) |
| `drive_registrations` | Form × registrant: answers, institution, roll number, photo ref, OTP-verified flags, eligibility result, dedupe result (new / matched M10 candidate), status (registered / eligible / rejected / invited) (B7) |
| `institutions` + `institution_coordinators` | College master (name, code, city, state); coordinator users (P02 external role) per institution, drives shared with them, results visibility (none / aggregate / per candidate) (B7) |
| `admit_cards` | Invitation / registration, template version (APX-F #86), QR token hash, issued_at, revoked_at (B7) |
| `candidate_app_sessions` | Attempt × app (Android / iOS), app version, lockdown mode and status, leave-app events (B7) |
| `test_centres` + `centre_servers` | Venue, address, capacity, seats; centre server id, public key, package version, last sync, clock drift log (C5) |
| `centre_seat_plans` | Session × seat → invitation, allocation method (C5) |
| `centre_checkins` | Invitation × QR result, photo-ID check result, invigilator, time (C5) |
| `invigilator_assignments` + `invigilator_logs` | Invigilator × centre session; roll call, incident entries (type, time, seat, note, photo ref) → T05 evidence (C5) |
| `candidate_survey_links` | Test / drive × M09 survey, trigger (after submit), response count; responses live in M09, aggregated only (C5) |
| `result_reuses` (J12) | Source attempt, target job / application, consent ref, consented at, valid until, status (active / withdrawn / expired) |
| `invitations` (added fields, J13) | `application_id` (M10), `internal_applicant` flag, `hidden_from_manager_chain` (true for internal applicants) |

All tables carry `organization_id` + RLS. Accommodation evidence is **Special**: visible only to accommodation reviewers, never to evaluators.

## 5. Rules (YX-DLV)

| ID | Rule |
|---|---|
| YX-DLV-01 | Times are stored in UTC and shown in the candidate's local time zone. The test records its authoring time zone. Every reminder shows both the time and the zone. |
| YX-DLV-02 | Reminders go out before the window / slot (Q1 defaults). A missed test raises an alert to the recruiter and a "missed" message to the candidate with next steps. |
| YX-DLV-03 | Slot booking respects capacity. Reschedules are limited per the Q1 policy. A no-show is recorded automatically at slot end + grace. |
| YX-DLV-04 | The server is the only clock. Answers are saved on every change and acknowledged. When offline, the client queues answers locally (encrypted) and syncs them on reconnect, with server-side conflict resolution (Q3). |
| YX-DLV-05 | Lost time is measured on the server from missed heartbeats. Credit follows Q4: automatic up to the cap, beyond that only with admin approval. Every credit is audited. |
| YX-DLV-06 | Resuming after a block or a long disconnection needs re-authentication (face re-check per T04 mode, or OTP for Open mode) when the Q4 threshold is exceeded. |
| YX-DLV-07 | Breaks follow the test's rules (Q5). Proctoring pauses during a break, and re-verification is required on return in proctored modes. |
| YX-DLV-08 | The device policy is enforced at start (Q6). Candidates on a disallowed device are shown how to switch, and are not counted as attempted. |
| YX-DLV-09 | Readiness results (Q7) are stored. Blocking checks prevent the start; warnings are shown and noted for reviewers (T05). |
| YX-DLV-10 | Accommodations are requested and approved before the attempt (Q8). Approved ones apply automatically: time, breaks, UI mode and proctoring profile. Evaluators never see the reason or the evidence. |
| YX-DLV-11 | The candidate test UI meets **WCAG 2.1 AA**: keyboard-only navigation, screen-reader labels, zoom to 200 % without loss, contrast mode. |
| YX-DLV-12 | Drive capacity: before a drive above the configured size, a capacity check and staggered start plan are required (Q2). Runtime autoscaling is pre-warmed for the drive window. |
| YX-DLV-13 | Employee test-takers: an invitation with `subject_type` = employee is opened only through the employee's own session (web or M04 app, SSO / OTP), never a candidate magic link. Consent (T05) is captured per attempt. Accommodations are approved by HR / L&D (P02 scope). The result is written back to the source M07 enrolment or M06 competency evidence and shown in the Me tab. Retention follows the employee record (T05 Q7). |
| YX-DLV-14 | **Drive registration (B7).** A registration counts only after OTP verification of email or mobile and recorded consent. Eligibility filters and the cap are applied at submit; ineligible registrants are told why. Every registration is de-duplicated against M10 candidates (email / mobile; roll number + college) and linked to the existing candidate on a match — never a second profile. |
| YX-DLV-15 | **College coordinators (B7).** A coordinator sees only registrants from their own institution, only for drives shared with them, and only the results level the company set (none / aggregate / per candidate). Answers, evidence, integrity details and accommodations are never visible to them. Every coordinator view is audited. |
| YX-DLV-16 | **Admit cards (B7).** An admit card is issued only for an eligible registration or a booked slot. Its QR is a signed, single-attempt token; reissue revokes the previous one, and a revoked or foreign QR fails at check-in. |
| YX-DLV-17 | **Native candidate app (B7).** The app may run a test only in **Open** or **AI-only** mode (amends Q6). Where the OS offers lockdown (Android lock-task, iOS assessment mode) and the test requires it, the attempt can't start without it; leaving the app is a T04 flag, never an auto-fail. Device-policy checks (YX-DLV-08) apply as in the browser. |
| YX-DLV-18 | **Test-centre hybrid mode (C5).** Test packages are encrypted at rest on the centre server and unusable before the session start key is released. Answers and evidence captured at the centre are encrypted, hash-sealed at capture (T05 chain of custody) and synced to the cloud; results are not released until the full sync is verified against the hashes. A missing or mismatched item opens a T05 incident instead of being silently dropped. |
| YX-DLV-19 | **Invigilator app (C5).** An invigilator acts only within their assigned centre session. Check-in needs a valid admit-card QR and a photo-ID check; a face mismatch is a flag for review, not a refusal by the app alone (the invigilator decides and records a reason). Incident-log entries are timestamped, attributed and become T05 evidence. |
| YX-DLV-20 | **Post-test survey (C5).** The survey is shown only after submission, is skippable, never affects the score, and is reported only in aggregate (minimum group size 5); evaluators and reviewers never see individual responses. |
| YX-DLV-21 | **Identity chain hook (T10).** The test-start ID check (T04 YX-PROC-04) and the centre photo-ID check (YX-DLV-19) look up the person record (P01 `persons`): if no identity template exists yet and the candidate consents, this check **captures** it for the chain; if one exists, it is the **match** against it. A mismatch is a flag for review (T04 YX-PROC-19), never a refusal to start by itself; where face detection is off or consent refused, the invigilator's or proctor's attestation plus the ID check is recorded instead. |
| YX-DLV-22 | **Result reuse (J12).** A reused result is a **link** to the original attempt, never a copy, allowed only when: the target uses the same or an owner-marked-equivalent test version; the attempt is completed and not invalidated or under an open incident (T05); the target stage is inside the validity window counted from the attempt's submission; and the candidate consented for this job (recorded; withdrawable until the stage is decided). Reuse doesn't consume an attempt. A retake does, and its **cooldown runs from the original attempt**, so reuse can't be used to skip the cooldown; if the candidate retakes, the test's score rule (YX-TB-07) decides which result counts, for that job only. |
| YX-DLV-23 | **Internal applicants (J13).** An invitation created from an M10 internal application carries the application id. Its result, report and integrity flags are visible only to that application's hiring team, HR and the employee (per release settings), and **never to the employee's current manager chain** through any M06, M07, analytics or report view. The attempt doesn't become M06 skills evidence unless the employee opts in after the application closes. |

## 6. Flows
1. **Invite:**
   1. Bulk upload or ATS stage trigger.
   2. The invitation goes out with its window or booking link.
   3. The candidate books a slot (slot mode).
   4. Reminders.
   5. Readiness check (any time before).
   6. Practice test.
   7. Start: instructions, consent, device check, then the T04 identity steps.
2. **During:**
   - auto-save;
   - on disconnect, a local queue and a "reconnecting" banner;
   - the server measures lost time;
   - on reconnect, sync, credit per Q4, and re-auth if over the threshold.
3. **Drive day:**
   1. Capacity plan approved.
   2. Staggered waves.
   3. Live drive dashboard (existing).
   4. Incident handling (T05).
   5. Cohort report (T02).
4. **Accommodation:**
   1. The candidate requests it from the portal (or HR requests it for an employee in M07 training).
   2. The reviewer decides.
   3. It applies to the invitation.
   4. The candidate is told what was approved.
5. **Employee test (YX-DLV-13):**
   1. An M07 enrolment, M06 skills test or certification creates an employee invitation.
   2. The employee sees it in the Me tab (web or M04 app) and signs in with their normal session.
   3. Consent, then the test as usual (proctoring per the test's T04 mode).
   4. The result and any certificate go back to the enrolment / competency evidence.
6. **Campus drive (B7):** create the drive → configure the registration form and eligibility → share the link (directly or through college coordinators) → registrants verify OTP → dedupe with M10 → eligible registrants get invitations / slots → admit cards issued → test (online, app or centre) → college-wise reports.
7. **Centre session (C5):** package pre-loaded to the centre server → invigilators assigned → check-in (QR + photo ID) and seat plan → start key released → test on the LAN with continuous sync → end → full sync verified → normal T05 review.

## 7. UI
- **Candidate portal (mobile-friendly):** my tests, booking and rescheduling, readiness check, practice, accommodation request, status.
- **Test runner:** a connection status indicator, a "saved ✓" indicator per answer, a break button (if allowed), and accessibility settings (font, contrast, screen-reader mode).
- **Admin views:**
  - slot calendar with capacity;
  - drive capacity planner (expected load vs capacity, waves);
  - connectivity panel per attempt (lost time, credits, approve extra credit);
  - accommodation review queue.
- **Drive kit (B7):** registration-form builder, registrant list with dedupe results, institution master, college-wise report, admit-card issue / reissue.
- **College coordinator portal (B7):** their registrants and status, share link, aggregates (per company setting).
- **Centre console (C5):** centre servers and sync status, seat plan, check-in board; **invigilator app** screens: roll call, QR scan, ID check, incident log.

## 8. Migration & rollout
Existing invitations continue as window-based. Slot mode is opt-in per test.

Build order:
1. Reminders and missed alerts.
2. Readiness check.
3. Continuity: offline queue, credit, re-auth.
4. Device policy.
5. Slots and booking.
6. Breaks.
7. Accommodations and WCAG audit.
8. Drive capacity planner and scale tests.
9. **Proctoring track, phase 2:** drive registration + institution master + admit cards → college coordinator login → post-test survey → native candidate app → test-centre server + invigilator app.

## 9. Acceptance tests (samples)
- A candidate in Dubai sees a slot at 10:00 GST for a test authored in IST. The reminder shows both zones (YX-DLV-01).
- Network lost for 90 s mid-test: answers typed offline sync on reconnect, 90 s is credited automatically, and the audit shows the credit (YX-DLV-04/05).
- A disconnection over the threshold requires a face re-check before resuming (YX-DLV-06).
- A mobile phone on a desktop-only test shows "switch to a laptop" and doesn't consume the attempt (YX-DLV-08).
- An approved 25 % extra-time accommodation applies automatically. The evaluator's view doesn't show it (YX-DLV-10).
- A keyboard-only candidate can complete an MCQ + coding test without a mouse (YX-DLV-11).
- A load test at the drive's planned concurrency meets p95 answer-save latency of 500 ms or less (YX-DLV-12).
- An employee enrolled in an M07 course with a quiz opens it from the Me tab with SSO (no magic link), gives consent, passes, and the enrolment shows the score and certificate; the attempt is retained with the employee record (YX-DLV-13).
- A student registers twice for a drive with the same email and a different roll number; the second registration links to the same M10 candidate and no duplicate profile exists (YX-DLV-14).
- The coordinator of College A can't see College B's registrants, and with "aggregate" visibility sees only counts and pass rates (YX-DLV-15).
- After an admit card is reissued, the old QR fails at the venue check-in (YX-DLV-16).
- An AI-only test opened in the Android app requires screen pinning when the test requires lockdown; switching to another app raises a flag, not a fail. A Record & review test can't be opened in the app (YX-DLV-17).
- A centre loses internet for 2 hours: candidates continue on the LAN, answers sync afterwards, and results stay held until every answer and evidence hash matches (YX-DLV-18).
- An invigilator scans a valid QR, the photo-ID check reports a mismatch, and the invigilator admits the candidate with a reason; a review flag is created (YX-DLV-19).
- A post-test survey for a drive with 3 responses from a college shows no college breakdown until there are 5 (YX-DLV-20).
- J12: a candidate who took *Java L2* 4 months ago applies to a second job using the same test; with consent the result is linked and no attempt is used; at 7 months (window 6) reuse is refused and a retake is offered only once the cooldown from the original attempt has passed (YX-DLV-22).
- J13: an employee's internal-application test result is visible to the new job's hiring manager and HR, while her current manager sees nothing in team reports, M06 or analytics (YX-DLV-23).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Scheduling, reminders & no-shows | **Two modes per test:** window (default) or **slot booking** with capacity; reschedule allowed up to **2 times**, until **24 h** before the slot; reminders **24 h and 1 h** before (email + SMS / WhatsApp); no-show auto-recorded after 15 min grace; recruiter may re-invite once with a reason. |
| Q2 | Drive scale target | Design and load-test for **5,000 concurrent candidates per drive** and **20,000 platform-wide** at launch; drives above **1,000** need a capacity plan with staggered start waves; runtime autoscaling pre-warmed for the drive window. |
| Q3 | Low connectivity | **Answers queued locally (encrypted) and synced**; the candidate may keep answering offline up to **5 min**, then the test pauses until reconnection; server-authoritative timer; a full offline test-centre (local server) mode is not at launch. |
| Q4 | Lost time & resume | **Automatic time credit** for server-measured disconnections, capped at **10 min** per attempt; more only with admin approval (reason, audited); disconnection **> 10 min** or an admin unblock needs **re-authentication** (face re-check in proctored modes, OTP in Open mode). |
| Q5 | Breaks | **Scheduled breaks between sections** (timer paused, configurable length) + **unscheduled breaks** per test setting (count and max length; timer keeps running by default); proctoring pauses in breaks; re-verification on return. |
| Q6 | Device policy | **Per test:** desktop-only (required when secure browser, screen monitoring or Live mode) or any device; **mobile browser allowed only for Open and AI-only modes** without screen monitoring; tablets treated as mobile; no separate candidate app at launch. |
| Q7 | Readiness check | **Full check** (camera, microphone, bandwidth, CPU, browser version, number of screens, secure-browser presence) available from the invite link **any time before**; each check set per test as **block** or **warn**; results kept for reviewers. |
| Q8 | Accessibility & accommodations | **WCAG 2.1 AA** candidate UI (independent audit before public launch); **accommodation request process** in the candidate portal with evidence upload; reviewer approves types (extra time %, breaks, screen-reader mode, font / contrast, separate session, adjusted proctoring profile); evaluators never see reasons. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Window mode (default) or slot booking per test**; reschedule up to **2 times**, until **24 h** before the slot; reminders **24 h and 1 h** before (email + SMS / WhatsApp); no-show auto-recorded after **15 min** grace; recruiter may re-invite once with a reason (all values configurable per test). | 25 Sep 2026 |
| Q2 | **Scale target at launch: 5,000 concurrent per drive, 20,000 platform-wide**, proven by load tests before launch (p95 answer-save ≤ 500 ms); drives above **1,000** need a capacity plan with staggered waves; runtime autoscaling pre-warmed for the drive window. | 25 Sep 2026 |
| Q3 | **Offline tolerance:** answers queued locally (encrypted) and synced on reconnect; candidate may keep answering offline up to **5 min** (configurable per test), then the test pauses until reconnection; server-authoritative timer; proctoring evidence captured offline is uploaded on reconnect and marked with the gap; offline test-centre (local server) mode not in launch scope. | 25 Sep 2026 |
| Q4 | **Automatic time credit** for server-measured disconnections, capped at **10 min** per attempt (configurable); more only with admin approval (reason, audited); disconnection **> 10 min** or an admin unblock requires **re-authentication** (face re-check in proctored modes, OTP in Open mode). | 25 Sep 2026 |
| Q5 | **Scheduled breaks between sections** (timer paused, length per test) **+ optional unscheduled breaks** (count and max length per test; timer keeps running by default); proctoring pauses during breaks; re-verification on return in proctored modes (YX-DLV-07); accommodations may add breaks (Q8). | 25 Sep 2026 |
| Q6 | **Device policy per test:** desktop-only (mandatory with secure browser, screen monitoring or Live mode) or any device; **phones / tablets only for Open and AI-only modes without screen monitoring**; mobile browser, no candidate app at launch; wrong-device starts don't consume the attempt (YX-DLV-08). | 25 Sep 2026 |
| Q7 | **Full readiness check** (camera, microphone, bandwidth, CPU, browser version, number of screens, secure-browser presence) from the invite link **any time before** the test and again at start; each check **block or warn** per test; results stored for reviewers (YX-DLV-09) with fix-it guidance shown to candidates. | 25 Sep 2026 |
| Q8 | **WCAG 2.1 AA** candidate UI with an **independent accessibility audit before public launch**; **accommodation request process** in the candidate portal with evidence upload (Special); reviewer approves types (extra time %, breaks, screen-reader mode, font / contrast, separate session, adjusted proctoring profile); applied automatically; evaluators never see reasons or evidence (YX-DLV-10). Team action: book the accessibility audit. | 25 Sep 2026 |
| D2 | **Consistency fix — employees as test-takers:** invitation subject is a candidate or an employee (`subject_type` + `subject_id`); employees sign in with their normal session (web / M04 app, SSO / OTP), consent per attempt, HR / L&D approve accommodations (P02), results route to the M07 enrolment / M06 competency evidence and the Me tab, retention follows the employee record (T05 Q7) (YX-DLV-13). | 26 Sep 2026 |
| B7 | **Gap-register extension (user decision 26 Sep 2026): campus drive kit + native candidate app.** Public **registration portal** per drive (company-configured form, starter template D17; OTP verification; eligibility and cap; **dedupe with M10**; YX-DLV-14); **institution master** with college-wise reports and a **limited college-coordinator login** (own college only, results level set by the company; YX-DLV-15); **admit card / hall ticket** from the APX-F #86 template with a signed QR verified at the venue and usable for YX-EVAL-14 (YX-DLV-16); **native Android / iOS candidate app** via the M04 Capacitor approach, with in-app proctoring for **Open / AI-only** modes (camera, OS lockdown where available; YX-DLV-17) — **amends Q6** (candidate app now in scope; Record & review, Live and screen monitoring stay desktop-only). All included in the Proctoring price (billed per attempt, D18); SMS / WhatsApp OTP message costs are pass-through add-ons. Proctoring track, phase 2. | 26 Sep 2026 |
| C5 | **Gap-register extension (user decision 26 Sep 2026): test-centre hybrid mode, invigilator app, candidate survey (T03 part).** **Test-centre / offline hybrid mode** with a local centre server (encrypted package, start-time key release, encrypted and hash-sealed answers and evidence, continuous and post-session sync, results held until sync verified), centre check-in and seat plan (YX-DLV-18) — **amends Q3** (offline test-centre mode now in scope); **invigilator mobile app** (roll call, admit-card QR, photo-ID check, incident log → T05 evidence; YX-DLV-19); **post-test candidate satisfaction survey** on the M09 survey engine, starter template, aggregate-only reporting (YX-DLV-20). Keystroke dynamics and AI-allowed mode are in T04 / T05. Included in the price; centre hardware is provided by the customer or venue (D18). Proctoring track, phase 2. | 26 Sep 2026 |
| T10 | **Validation pass 3 Must (T10), founder decision 28 Sep 2026:** test-start and centre ID checks are a capture or match point in the hiring identity chain on the person record (P01 `persons`); mismatch = review flag, not a refusal; attestation fallback. Rule YX-DLV-21; main rule T04 YX-PROC-19. | 28 Sep 2026 |
| J12 | **Validation pass 3 Should (J12), founder decision 28 Sep 2026:** **reuse a test result across jobs**: link (not copy) to the original attempt, same or equivalent test version, validity window (starter 6 months, D17), candidate consent per job, retake cooldown counted from the original attempt, score rule decides if the candidate retakes (YX-DLV-22). Proctoring track. | 28 Sep 2026 |
| J13 | **Validation pass 3 Should (J13), founder decision 28 Sep 2026:** **internal applicant as test-taker**: invitation linked to the M10 application, result routed to that hiring team and HR only, hidden from the current manager chain in every view, skills evidence only if the employee opts in (YX-DLV-23). Proctoring track + wave 7. | 28 Sep 2026 |
