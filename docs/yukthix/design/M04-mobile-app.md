# M04 · Mobile App (Employee & Manager)

> **Status:** ✅ Decided (8/8), 25 Sep 2026. **Extended 26 Sep 2026 (gap register, user decision):** mobile flows for field force (B2), open shifts & bids (B3), earned wage access (B10), visitor approvals (C1), career / IDP (B16), equity (C4) and M12 timesheets (B1), §3.1; §11 B2 / B3 / B10 / C1 / B1 / B16-C4-B18. Validation pass 3 Shoulds added 28 Sep 2026 (§8b).
> **Covers:** spec §2.1.18 (mobile app / PWA), §1.3.11 (employee & manager self-service); Frappe reference [10](../reference/frappe-hrms-functional-spec/10-mobile-pwa.md) (questions 1–5) and UI reference 10 (U91–U95); UI brief target tabs **Home · Time · Requests · Pay · Me**.
> **Build wave:** basic mobile in wave 2 (Time, leave, approvals), and each later module adds its mobile screens in its own wave. **No module ships without its employee-facing mobile flow (fixes U95).**
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

### Already decided elsewhere (not re-asked)

| Topic | Decision | Source |
|---|---|---|
| Languages | English, Hindi, Tamil and Telugu at launch | P04 Q4, UI brief |
| Notification channels | In-app + push; WhatsApp for key events (the company's own number); email for desk users; quiet hours | P04 Q1/Q2/Q7 |
| No sensitive data outside the app | Push and WhatsApp messages carry no payslip or ID data | P04 Q6 |
| Approvals from outside the app | One-time links for low-risk items only | P03 Q4 |
| Check-in | GPS geofence (restricted or field mode), IP restriction, biometric devices | M02 Q6 |
| Selfie and face check-in | Wave 6 | P10 Q3, M02 Q6 |
| Offline check-in | **Wave 2** (moved from wave 6, market analysis G8, 26 Sep 2026) | M02 Q6 amendment, YX-AT-24 |
| Documents | Alumni access for 7 years; certificates instantly; HR verifies uploads | P05 |
| Manager scope | View the whole subtree; approve direct reports only | P02 Q2 |
| AI policy helpdesk | Wave 5 | P10 Q8 |

---

## 1. Purpose & scope
Most employees in Indian SMBs will only ever use YukthiX on a phone. For them, the mobile app *is* the product: check-in, leave, payslip, requests, approvals and documents. It must work on low-end Android phones, weak networks, and in regional languages.

## 2. What exists today (exam app)
- **Next.js web app** with the v2 design system; responsive, but it has no PWA manifest or service worker. **Add** both.
- **Candidate-facing proctoring flows** already run on mobile browsers (camera, face check). The face model is reused in wave 6 (P10).
- **`UserNotification`** and preferences, and Twilio SMS and WhatsApp. **Extend** them with web push (VAPID) and native push (FCM / APNs) if Q1 adds store apps.
- **Auth:** email + password, and SSO. **Add** mobile-number OTP and passkeys (Q2).

## 3. Concepts
- **App shell:** a single codebase (Next.js routes under `/m`) using the UI brief's mobile components. It is installable as a PWA.
- **Tabs:**

  | Tab | Contents |
  |---|---|
  | **Home** | Today card (shift, check-in state, pending actions), announcements (P04), celebrations (Engage, wave 5), quick actions |
  | **Time** | Check-in/out, my attendance calendar (late / early / missing / OT markers; punches grouped by day, YX-MOB-12), regularise, WFH / on-duty, roster, OT |
  | **Requests** | One request sheet covering every request type registered in P03 (leave, attendance, expense, trip request (M05), loan, profile change, letter, resignation (wave 4, M01 Q6), training enrolment / external training request (M07), helpdesk), my requests with status, and, for managers, the **approvals inbox** |
  | **Pay** | Payslips, YTD, tax workspace (regime, declarations, proofs), Form 16, loans, reimbursements |
  | **Me** | Profile and change requests, documents and letters, **My tests** (training / skills tests assigned to me with due date, start link and results, M07 / T03 test-taker), team directory, settings (language, notifications, security), help |

  **Canonical map:** the table above is the summary; [Appendix D §5](APX-D-screens-navigation.md) is the **canonical mobile tab map**, listing every employee and manager flow with its tab and owning doc (incl. policy acknowledgement, exit clearance / interview / asset return, probation form, PIP acknowledgement, comp-off claim, optional holidays, shift-swap consent, delegation, my data / who accessed, timesheets, case filing, referrals, internal jobs, my tests, payslip query, maternity / long-leave status). A new employee-facing flow is added there first (YX-MOB-01).

- **Manager mode:** the same app. Managers get a **Team** segment on Home and an approvals inbox in Requests (Q5).

### 3.1 Gap-register flows (26 Sep 2026)
Mobile flows for the gap-register extensions. Each ships in its owning module's wave (YX-MOB-01) and must be added as a row to the canonical map in [Appendix D §5](APX-D-screens-navigation.md) by its owner.

| Tab | Flow | Owning doc | Wave |
|---|---|---|---|
| Time | **Field duty:** tracking consent sheet (first use), "Tracking on" status on the check-in sheet, today's **beat plan**, **visit check-in / out** with camera photo, notes, outcome and custom form, unplanned visit, my trail and day distance; draft mileage line → Pay › Expenses | M02 §B8, M05 YX-EXP-16 | 5 |
| Home | **Team** segment: field team map (duty time only), planned vs done visits | M02 §B8 | 5 |
| Time | **Open shifts:** eligible open shifts list, claim, claim status | M02 §B9 | 6 |
| Time | **Shift bids:** open bid windows, rank preferences and days off, award result; availability / preferred-off entry | M02 §B9 | 6 |
| Requests | Manager: roster approval card (coverage, gaps with reasons), open-shift claim awards, bid awards | M02 §B9, P03 | 6 |
| Time | **WFH presence:** consent sheet, what was recorded today (first / last active, active hours) | M02 §B10 | 6 |
| Requests | **Visitor approvals (host):** walk-in approval card with photo and purpose, approve / reject / send someone; **pre-register a visitor** | M02 §B11 | 6 |
| Pay | **Get paid early (EWA):** available amount, fee, recovery date, draw, history | M03 §3, YX-PAY-40/41 | 5 |
| Pay | **My equity:** grants, vesting timeline, exercise request with perquisite / TDS preview, sales | M03 §3, YX-PAY-46 | 6 |
| Pay | Expenses in foreign currency: receipt currency, rate, source, INR amount | M05 YX-EXP-14 | 5 |
| Me | **Career:** my path, next roles and gaps, IDP items with course links | M06 YX-PERF-14/15 (owner; shown via M01 §3.9) | 5 |
| Time | **Timesheets (M12):** day list pre-filled from allocations (project / task pickers), hours, billable, notes, submit week; approved / reduced lines with reasons | M12, M02 §B7 | 5 |
| Requests | PM: **timesheet approval card** grouped by project and week (approve / reduce with reason / reject); milestone completion | M12 | 5 |

Visitors themselves never use the employee app: their QR pass is a web link, and a **visitor kiosk mode** (the Q4 kiosk in visitor mode) handles walk-in registration, acknowledgement and check-in / out.

- **Device registration:** a record of a user's app install, holding the push token, platform, app version, check-in binding status (Q3) and last seen time.

### 3.2 Non-employee app users (gap-register tidy-up, 26 Sep 2026)
The same Capacitor code base (Q1) also ships two **role-limited app modes** for people who are not employees. They share the build pipeline, push and offline plumbing, but never show the employee tabs, and they sign in with their P02 §4.7 external login (catalogue, YX-SEC-33), not an employee session.

| App mode | Who | What it does | Limits | Owning doc |
|---|---|---|---|---|
| **Candidate app** | Candidates (and campus registrants) | My tests, booking / reschedule, readiness check, admit card, **in-app proctored attempts in Open / AI-only modes** (camera, OS lockdown where available), results and appeals, privacy centre | Record & review, Live and screen-monitoring tests stay **desktop-only**; phones are **not a secure-client platform** (T08 Q1: phones stay with the candidate app for Open / AI-only) | T03 B7, YX-DLV-17; T08 |
| **Invigilator app** | Invigilators at a test centre | Roll call, admit-card QR scan, photo-ID check, seat confirmation, incident log → T05 evidence; offline with centre-server / cloud sync | Assigned centre session only; AAL2 with a device-bound passkey (P02 YX-SEC-33); photos are not kept on the device after sync | T03 C5, YX-DLV-19 |

Employees taking training / skills tests use the normal app (Me › My tests, YX-DLV-13), not the candidate app mode. Rule YX-MOB-17.

## 4. Data model (additions)

| Table | Purpose |
|---|---|
| `user_devices` | user, platform (pwa / android / ios), push endpoint and keys, app version, `bound_for_checkin`, bound_at, approved_by, last_seen, revoked_at |
| `device_bind_requests` | A request to change the bound device; routed through P03 |
| `kiosk_devices` | Registered shared devices: location, mode (attendance / **visitor**, C1), allowed employees scope, secret, last heartbeat (Q4) |
| `user_devices` columns (B2) | `background_location_permission` (granted / foreground-only / denied), `mock_location_detected_at` |
| `auth_passkeys` | WebAuthn credentials per user |
| `offline_drafts` | Not stored on the server; drafts live in IndexedDB on the device (Q7) |
| `offline_punches` | Not stored on the server until sync: queued check-ins (device time, GPS, accuracy, shift) in IndexedDB, cleared after the server acknowledges (G8, M02 YX-AT-24) |

All tables carry `organization_id` + RLS.

## 5. Rules

| ID | Rule |
|---|---|
| YX-MOB-01 | Every employee-facing flow in a module ships on mobile in the same wave as the desk version (fixes U95). |
| YX-MOB-02 | Approvals on mobile use the **approval card**: a summary, the impact (e.g. team availability or balance after), approve / reject / send back with a comment. The full form is never shown for editing (fixes U91). |
| YX-MOB-03 | The approvals inbox shows only items awaiting the viewer's action, grouped by type, with bulk approve for low-risk types (fixes U92). |
| YX-MOB-04 | Notifications are grouped by subject, show names rather than IDs, and deep-link to the record with its action (fixes U93). |
| YX-MOB-05 | The check-in sheet shows shift, time to start, location verdict (inside / outside geofence, distance) and the reason if check-in is blocked (fixes U94). |
| YX-MOB-06 | The app loads to an interactive state in 3 s or less on a mid-range Android phone over 3G for Home and Time. The JavaScript for these tabs is kept to 200 KB gzipped or less. |
| YX-MOB-07 | Sensitive screens (Pay, documents, bank and ID fields) follow the re-authentication rule in Q8. Screenshots are not blocked (a PWA can't), but the payslip PDF carries a watermark with the employee's name and download time. |
| YX-MOB-08 | Check-in is accepted only from the employee's bound device when the company enables binding (Q3). Otherwise the device is recorded on every punch. |
| YX-MOB-09 | A lost device can be signed out remotely by the employee (Me → Security) or by HR. This revokes its sessions and push tokens immediately. |
| YX-MOB-10 | All UI text comes from the translation catalogue. Numbers, dates and currency use the user's locale. Layouts are tested with the longest language (Tamil). |
| YX-MOB-11 | The kiosk, after employee code + PIN, lets the employee apply for leave and view the status of their requests, including those raised on their behalf (P03 proxy). Employees without the app are notified of proxy requests and their outcomes on the kiosk and by SMS / WhatsApp; the kiosk session auto-logs out as in Q4. |
| YX-MOB-12 | The Time tab calendar marks late / early / missing / OT with the UI brief §6.3 colours (late = warning, never success); punch history is grouped by day under its day card; no request sheet asks the employee to pick an approver — P03 resolves it (YX-WF-03) (fixes U23). |
| YX-MOB-13 | **Field tracking on the phone (B2):** background location runs only in the store app, only after the in-app consent (M02 YX-AT-16) and the OS permission, and only between duty check-in and check-out; while it runs the app shows a persistent OS notification and a "Tracking on" chip on Home and Time; check-out, shift end + grace or consent withdrawal stops it at once; the PWA records points only while open and says so; visit photos are camera-only (no gallery) and stamped with time and location. |
| YX-MOB-14 | **EWA on the phone (B10):** Pay › Get paid early requires re-authentication (Q8), shows the available amount, the fee in rupees, who pays it and the recovery payroll month **before** the confirm button, and shows each draw's status until recovered; nothing about EWA is sent in push / WhatsApp text beyond "your request was processed" (P04 Q6). |
| YX-MOB-15 | **Open shifts and bids (B3):** the app lists only open shifts the employee is eligible for (server-side checks of skill, pool, conflicts, rest and hour caps, M02 YX-AT-20); a claim or bid shows its status and the final award; a claim never assigns the shift until the company's award rule and approval complete. |
| YX-MOB-16 | **Visitor approval (C1):** a walk-in visitor creates a push to the host with an approval card (visitor photo, name, company, purpose, location); the host decides in one tap; with no decision within the company timeout the request returns to reception; visitor photos are not kept on the host's device after the decision. |
| YX-MOB-17 | **Candidate and invigilator app modes (gap-register tidy-up).** The candidate and invigilator modes are separate role-limited modes of the same app: sign-in only through their P02 external login (YX-SEC-33), never an employee session or employee tabs. The candidate mode runs attempts only in **Open** or **AI-only** mode (YX-DLV-17); a test needing the secure client (T08) or Record & review / Live / screen monitoring cannot start on a phone and tells the candidate to use a desktop. The invigilator mode acts only inside the assigned centre session (YX-DLV-19) and clears check-in photos from the device after sync. |
| YX-MOB-18 | **Check-in sheet transparency (G7, extends YX-MOB-05):** before the employee taps check-in the sheet shows a map with their GPS pin, the accuracy radius and the allowed geofence(s), the distance to the nearest one, a **retry location** action and, when outside or the fix is too coarse, a plain reason; a refused or abandoned attempt is sent to the server as a logged attempt (M02 YX-AT-23) and the sheet offers "ask HR to regularise" in one tap. Works offline via the Q7 / YX-AT-24 queue (the geofence verdict is then computed on sync). |

## 6. Flows
- **First run:**
  1. Invite by SMS, WhatsApp or email.
  2. Sign in with a mobile OTP (Q2).
  3. Choose a language.
  4. Allow notifications.
  5. Bind the device for check-in, if the company requires it.
  6. Install the app (PWA prompt, or store link per Q1).
- **Daily:** Home Today card → check in → Time.
- **Approvals:** push notification → inbox → card → decision.
- **Requests:** one sheet → pick a type → the type's form with a live summary (leave balance after, attendance effect, expense limit) → submit.
- **Payslip:**
  1. Push notification: "September payslip is ready".
  2. Open Pay.
  3. Re-authenticate (Q8).
  4. View the payslip with the "why this number" drawer.
  5. Optionally download the PDF.

- **Kiosk (Q4):** employee code + PIN or ID-card QR → check in / out, or mark **attendance at a training session** (employee code + PIN; used by M07 Q7) → leave balance and payslip summary → auto-logout.
  - **Apply leave (D5):** after employee code + PIN, the employee picks a leave type and dates on the leave form (balance after shown) and submits; it enters the normal P03 chain as the employee's own request (channel "kiosk").
  - **View request status:** the employee's open and recent requests (leave, regularisation, claims), including those HR or the manager **raised on their behalf** (P03 proxy requester), with status and the latest step.
  - **Employees without the app** are told about requests raised on their behalf and their outcomes on the kiosk (a banner after PIN), and by SMS or WhatsApp to their registered mobile (P04; no sensitive data, P04 Q6).

**Events:** mobile uses the same API as the desk app (NestJS). There are no mobile-only endpoints except device registration and kiosk.

## 7. UI
The UI brief's mobile components are:
- the bottom tab bar;
- the Today card;
- the request sheet;
- the approval card;
- the check-in sheet;
- the payslip viewer;
- a document list with status chips;
- an empty state and an offline banner.

Other UI requirements:
- Thumb reach: primary actions sit at the bottom.
- Dark mode.
- Minimum 16 px text; touch targets 44 px or larger.

## 8. Migration & rollout
- **Wave 2:**
  - PWA shell;
  - Home, Time and leave in Requests;
  - approvals;
  - Me (profile, directory);
  - push notifications and device binding;
  - offline check-in queue (moved from wave 6, G8, M02 YX-AT-24).
- **Wave 3:** Pay tab. **Wave 4:** lifecycle (resignation, documents, letters). **Wave 5:** expenses, performance, training, helpdesk, Engage; field duty (B2), EWA (B10), career / IDP (B16), M12 timesheets and PM approvals (B1), foreign-currency expenses (B18). **Wave 6:** selfie and face check-in (offline check-in moved to wave 2, G8); open shifts and bids (B3), WFH presence and visitor approvals / visitor kiosk (C1), My equity (C4).
- Store apps follow Q1.

## 8b. Validation pass 3 additions (founder decisions 28 Sep 2026)

Validation pass 3 Should S17 (group "Growth and operations", before pilot).

| ID | What it does | Rule | When |
|---|---|---|---|
| S17 | Mobile performance budgets: app size, cold start on a 2 GB phone, minimum OS versions, crash-free rate, store rating prompts | YX-MOB-19 | Before pilot |

**Rules**

| Rule | Statement |
|---|---|
| YX-MOB-19 | **Performance budgets.** Each release is checked in CI against budgets held as config: download size (Android target under 30 MB), cold start to a usable home screen on a 2 GB RAM reference Android phone (target under 3 s), minimum OS versions (published, reviewed yearly), crash-free users (target at least 99.5 % over 7 days; a staged rollout halts below it). Store rating prompts use the OS in-app review API only after a successful task, at most once per 90 days, never after an error. Numbers are starting targets, confirmed before pilot. |

**Acceptance tests**

- A build over the size or cold-start budget fails CI with the measured value.
- A staged rollout whose crash-free rate falls below the budget stops automatically.
- The rating prompt appears after a successful leave request, not after an error, and not again within 90 days.


## 9. Acceptance tests (samples)
- A manager approves a leave from the push notification in 3 taps or fewer, and never sees an editable form (U91).
- The inbox shows only pending items; drafts never appear (U92).
- Notification text reads "Priya Sharma applied for leave 3–5 Oct", not an ID (U93).
- Check-in outside the geofence in restricted mode is blocked, and the sheet shows "Outside Chennai HQ, 850 m away" (U94).
- Before submit the sheet shows the pin, a 120 m accuracy circle and the geofence; "retry location" gets a better fix; the refused attempt appears in HR's exceptions and the day is regularised without a late mark (YX-MOB-18, M02 YX-AT-23).
- A check-in made in a basement with no signal shows "pending sync", syncs when online, and appears to HR with the offline flag and device time (M02 YX-AT-24).
- A Home load on a throttled "Fast 3G" profile in Chrome on a mid-range phone is interactive in 3 s or less (YX-MOB-06).
- A revoked device's next API call returns 401, and push delivery to it stops (YX-MOB-09).
- Switching to Tamil changes all labels, with no truncation on the Home and Pay tabs (YX-MOB-10).
- Ramesh (no phone) enters his code + PIN at the kiosk, applies for 2 days' casual leave, and sees the leave his supervisor raised for him last week as "Approved"; he also gets an SMS when the new request is decided (YX-MOB-11).
- On Vikram's store app, background location starts only after he accepts the consent sheet and the OS permission, the notification "YukthiX · Tracking on (duty)" is visible until check-out, and after check-out no location request is made (YX-MOB-13; B2).
- Rohan opens Get paid early: after fingerprint re-auth he sees "₹6,000 available · fee ₹49 (you pay) · recovered from October payroll" before confirming; the push afterwards contains no amount (YX-MOB-14; B10).
- A nurse without a valid ICU certification does not see the ICU open shift; her ward colleague claims it and sees "Claimed · awaiting manager" until awarded (YX-MOB-15; B3).
- A walk-in for Ravi pops an approval card; Ravi approves in one tap and the visitor photo is gone from his phone afterwards (YX-MOB-16; C1).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | PWA only, or native store apps too? | **PWA first (wave 2)**, then **store apps for Android and iOS in wave 3** built from the same code with a thin native wrapper (Capacitor). The wrapper gives reliable push on iOS, biometric unlock, store presence and background location for field staff. No separate native codebase. |
| Q2 | How do employees sign in on mobile? | **Mobile-number OTP (default)** or email + password; SSO where the company uses it. After the first login, **passkey / fingerprint / face unlock** (WebAuthn, or native biometrics in the store app); a **4-digit app PIN** fallback. |
| Q3 | Bind check-in to one phone (stops "buddy punching")? | **Company option, on by default for restricted-mode staff:** one bound device per employee; changing it needs HR / manager approval (P03); field staff can be exempt. |
| Q4 | Workers without smartphones | **Shared kiosk mode at launch:** a registered tablet at the site; the employee checks in with **employee code + PIN** or a **QR on their ID card**; face recognition added in wave 6; kiosk also shows leave balance and payslip summary after PIN. |
| Q5 | Manager features on mobile at launch | **Team today** (who's in, late, on leave, WFH), **approvals inbox**, **team calendar**, **team attendance exceptions** with a nudge button, and a team member's profile (within P02 scope). No team salary unless enabled (P02 Q3). |
| Q6 | Actions over WhatsApp chat (not just notifications)? | **Wave 5 with the AI helpdesk:** a WhatsApp assistant on the company's number that answers "my leave balance", "holiday list", "policy" questions and can **start** a leave request (confirmed in-app by OTP link); sensitive answers such as payslip or salary reply with an in-app link only (P04 Q6). Launch: notifications + one-time approval links only. |
| Q7 | What works offline? | **Launch:** the app opens offline with cached Home, holidays, leave balances, the last payslip list (no figures), and **drafts saved on the phone** for leave / expense / regularisation that submit automatically when online (with a "pending sync" chip). **Offline check-in in wave 6** (P10 Q3; amended 26 Sep 2026: moved to wave 2, G8). |
| Q8 | Session length and re-authentication | Stay signed in **30 days** on a personal device (company can shorten); **re-authenticate with biometric / PIN** when opening Pay, documents, bank / ID fields, or after 15 min idle in those screens; remote sign-out (YX-MOB-09). |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **PWA first (wave 2); Android + iOS store apps in wave 3** from the same code via a thin Capacitor wrapper (native push FCM/APNs, biometric unlock, store listing, background location for field staff). One codebase; no separate native apps. | 25 Sep 2026 |
| Q2 | **Mobile-number OTP by default** (SMS, or WhatsApp authentication template on the company's number where connected, to save SMS cost), email + password, or company SSO; then **passkey / fingerprint / face unlock**, with a **4-digit app PIN** fallback. OTP rate-limited; OTPs count toward the P04 SMS quota. | 25 Sep 2026 |
| Q3 | **Device binding is a company option, on by default for restricted-mode staff:** one bound device per employee; change via P03 request (HR / manager approval); field staff exemptible; can be switched off; every punch records its device regardless. | 25 Sep 2026 |
| Q4 | **Shared kiosk mode at launch:** registered tablet per site (HR registers, heartbeat monitored); check-in by **employee code + PIN** or **ID-card QR** (+ PIN if company requires); after PIN shows leave balance and payslip summary, auto-logout after 30 s; kiosk punches carry kiosk id + location; face recognition in wave 6; biometric devices (P10 Q4) remain an alternative. | 25 Sep 2026 |
| Q5 | **Manager toolkit at launch:** Team today (in / late / on leave / WFH / not checked in), approvals inbox, team calendar, team attendance exceptions with nudge, team member profile within P02 scope; no team salary unless enabled (P02 Q3). Mobile team analytics deferred (P09 dashboards on desk). | 25 Sep 2026 |
| Q6 | **Launch:** WhatsApp for notifications + one-time low-risk approval links only. **Wave 5 (with AI helpdesk, P10 Q8):** WhatsApp assistant on the company's number: answers balances, holidays, policies; can **start** a leave request confirmed in-app via OTP link; salary / payslip / ID questions answered with an in-app link only (P04 Q6); sender's number must match a verified employee mobile. | 25 Sep 2026 |
| Q7 | **Launch offline:** app shell + cached Home, holidays, leave balances, payslip list without figures (no sensitive data cached); **drafts** for leave / expense / regularisation saved on-device (IndexedDB) and auto-submitted when online with a "pending sync" chip; server re-validates on submit (balance / limits may have changed). Cache cleared on sign-out / remote revoke. **Offline check-in in wave 6** (P10 Q3). **Amendment 26 Sep 2026 (market analysis G8):** offline check-in moved to **wave 2** — queued on-device with device time + GPS, synced later, flagged offline (M02 YX-AT-24). | 25 Sep 2026 |
| Q8 | **30-day session** on a personal device (company can shorten; kiosk sessions per Q4); **re-authenticate with biometric / PIN** on opening Pay, documents, bank / ID fields and after 15 min idle there; remote sign-out by employee or HR (YX-MOB-09). | 25 Sep 2026 |
| D5 | **Kiosk apply-leave and request status** (GAP-REGISTER D5): after employee code + PIN the kiosk offers **apply leave** and **view request status**, including requests HR / managers raised on the employee's behalf (P03 proxy requester); employees without the app are informed via kiosk, SMS or WhatsApp. YX-MOB-11. | 26 Sep 2026 |
| D2 | Consistency fix (GAP-REGISTER D2): **Me → My tests** lists training / skills tests assigned to the employee (M07, T03 `test_takers`), with start link and results. | 26 Sep 2026 |
| F5 | Consistency fix (GAP-REGISTER F5): [Appendix D §5](APX-D-screens-navigation.md) is the **canonical mobile tab map** (Home · Time · Requests · Pay · Me) with every employee / manager flow and its owning doc, incl. the flows the earlier tab list omitted; §3 points to it. Mobile follow-up F-4 (late markers, day-grouped punches) is listed in Appendix D §8. | 26 Sep 2026 |
| F-4 | **F-follow-ups (consistency fix), APX-D §8, U23:** Time tab calendar shows late / early / missing / OT markers (late = warning colour), punches grouped by day; the app never asks employees to pick an approver (P03 resolves it). §3, YX-MOB-12. | 26 Sep 2026 |
| B2 | **Gap-register extension (user decision 26 Sep 2026): field-force mobile flows, wave 5.** Consent sheet, duty-only background location in the store app with a persistent "Tracking on" notification, beat plan, visit check-in / out with camera-only stamped photo, notes and outcome, my trail and distance → draft mileage line; manager field-team map (duty time only). §3.1, YX-MOB-13; M02 §B8. | 26 Sep 2026 |
| B3 | **Gap-register extension (user decision 26 Sep 2026): open shifts and shift bids on mobile, designed now, built wave 6.** Eligible open shifts and claims, bid windows with ranked preferences, availability entry, award status; manager roster / claim / bid approval cards. §3.1, YX-MOB-15; M02 §B9. | 26 Sep 2026 |
| B10 | **Gap-register extension (user decision 26 Sep 2026): EWA request on mobile, wave 5.** Pay › Get paid early behind re-auth, fee and recovery month disclosed before confirming, draw history; no amounts in push / WhatsApp. §3.1, YX-MOB-14; M03 YX-PAY-40/41. | 26 Sep 2026 |
| C1 | **Gap-register extension (user decision 26 Sep 2026): visitor approvals and WFH presence on mobile, wave 6.** Host approval card for walk-ins and pre-registration; visitor kiosk mode on the Q4 kiosk; WFH presence consent and "what was recorded today". §3.1, YX-MOB-16; M02 §B10–§B11. | 26 Sep 2026 |
| B1 | **Gap-register extension (user decision 26 Sep 2026): M12 timesheets on mobile, wave 5.** Time tab timesheet day list pre-filled from project allocations, submit week, approved / reduced lines with reasons; PM timesheet approval cards and milestone completion in Requests. §3.1; M12. | 26 Sep 2026 |
| B16 / C4 / B18 | **Gap-register extension (user decision 26 Sep 2026): other mobile flows.** Me › Career (path, gaps, IDP, M01 §3.9, wave 5); Pay › My equity (grants, vesting, exercise, M03, wave 6); foreign-currency expense lines (M05 YX-EXP-14, wave 5). Rows to be added to APX-D §5 by its owner. §3.1. | 26 Sep 2026 |
| Gap-register tidy-up | **Non-employee app modes noted (§3.2).** The same app ships a **candidate mode** (T03 B7: Open / AI-only in-app proctoring; phones are not a secure-client platform per T08; other proctoring modes desktop-only) and an **invigilator mode** (T03 C5: roll call, QR, photo-ID, incident log; offline sync); both sign in via P02 external logins (YX-SEC-33). Me › Career now references M06 (YX-PERF-14/15) as owner. Rule YX-MOB-17. | 26 Sep 2026 |
| G7 / G8 | **Market analysis additions (G7–G8), founder decision.** G7: the check-in sheet shows the GPS pin, accuracy radius and geofence on a map before submit, "retry location" and a plain reason when outside; failed attempts are logged for HR regularisation (YX-MOB-18, M02 YX-AT-23). G8: **offline check-in moved from wave 6 to wave 2** — punches queue on the phone with device time + GPS, sync later, flagged offline (`offline_punches`, M02 YX-AT-24); selfie / face stays wave 6. Amends Q7 (note added, history kept); §8. | 26 Sep 2026 |
| S17 | **Validation pass 3 Should (S17), founder decision 28 Sep 2026: mobile performance budgets.** Rule YX-MOB-19. | 28 Sep 2026 |
