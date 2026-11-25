# M04 · Mobile app (employee and manager) · Build design

> **Status:** 🟡 Draft for the founder, 13 Oct 2026. The module decisions (Q1–Q8, D5, F5, G7, G8, S17 and the gap-register flows) were taken on 25–28 Sep 2026 in [M04](M04-mobile-app.md). This doc turns the launch part into an app structure, tables, APIs, security controls, release steps and small pull requests. The founder questions are in §23.
> **Scope:** employee and manager self-service on a phone:
> - attendance punch with location, geofence and selfie options, and offline punch with sync and anti-tamper;
> - leave apply and approve, and the approvals inbox;
> - payslips and tax;
> - expenses with camera receipt capture (our OCR worker);
> - directory and profile;
> - goals, feedback and 1:1s;
> - notifications and help.
> **Order:** eight batches, **MB1 → MB8**. MB1–MB4 give a usable app (sign-in, device trust, attendance, leave and approvals). MB5–MB7 add pay, expenses and people flows. MB8 ships to the stores.
> **Builds on:** P11 (one API for every client), P12 (sessions, passkeys, MFA, step-up), P02 (field classes, masking, residency), P04 (push, quiet hours, no sensitive data outside the app), P03 (approval cards), P21 and G1 (languages, RTL, regions), M02 (punch rules, geofences, offline punch YX-AT-24), M03 (payslips, tax), M05 (claims, OCR worker), M06 (goals, feedback, 1:1s), M08 / M14 (help centre).
> **Clean-room:** written in our own words from our own design docs, public platform documentation and public law. No competitor text, screens or field names are copied. Frappe / ERPNext code is not read or copied.

---

## 1. How to read this doc
- §2 lists what is already decided and is not re-asked.
- §3 is the technology choice and the recommendation.
- §4–§6 describe the app: structure, code sharing and what the API adds.
- §7–§17 cover each flow and each cross-cutting concern: security, privacy, attendance, leave and approvals, pay, expenses, people flows, performance, push, residency and accessibility.
- §18–§22 cover data, permissions, settings, store release, slices, what is out and the new rules.
- §23 holds the decisions for the founder, as short questions with recommended defaults.

Rules keep their M04 IDs (YX-MOB-01 … 19). New rules in this doc are YX-MOB-20 onwards.

## 2. Decisions this design follows

| Topic | Decision | Source |
|---|---|---|
| App type | PWA first, then Android and iOS store apps **from the same code** through a thin Capacitor wrapper; no separate native code base | M04 Q1 |
| Sign-in | Mobile OTP by default, email + password, or company SSO; then passkey / biometric unlock with a 4-digit app PIN fallback | M04 Q2, P12 YX-IAM-03 |
| Device binding | Company option, on by default for restricted-mode staff; changing the device goes through P03 | M04 Q3 |
| Manager toolkit | Team today, approvals inbox, team calendar, exceptions with nudge, team member profile in P02 scope | M04 Q5 |
| Offline | Shell and safe caches offline; drafts on the device; **offline punch in wave 2** (YX-AT-24) | M04 Q7, G8 |
| Session | 30 days on a personal device; re-authenticate for Pay, documents, bank and ID fields, and after 15 min idle there | M04 Q8 |
| External channels | Push, WhatsApp, SMS never carry Confidential or Special values | P04 Q6, YX-NTF-04 |
| MFA floor | MFA for sensitive roles; step-up at AAL2 within 15 min for sensitive actions | P12 YX-IAM-01/02 |
| Languages | English, Hindi, Tamil, Telugu at launch; Arabic (RTL) before the first GCC customer | P04 Q4, P21 YX-GLB-02 |
| Budgets | Android download < 30 MB, cold start < 3 s on a 2 GB phone, crash-free ≥ 99.5 %, Home + Time JS ≤ 200 KB gz | YX-MOB-06, YX-MOB-19 |
| Receipt OCR | Self-hosted PaddleOCR worker; OCR only suggests | M05-BUILD-DESIGN §14.6 |

## 3. Technology choice

### 3.1 What we have to share
- **packages/yx-ui:** React DOM components with our CSS tokens, the affordance guard, Storybook stories and screen tests. The live screens already exist for the desk, for example time, leave, approvals, payslips, tax, expenses, goals, feedback, 1:1s and help.
- **TypeScript end to end:** NestJS API, Next.js web, shared packages, the same DTOs and validation messages.
- **A small team** that already reviews React, CSS tokens and Playwright tests.

### 3.2 The options

| | **PWA + Capacitor** (one React DOM code base, wrapped) | **React Native / Expo** | **Flutter** | **PWA only** |
|---|---|---|---|---|
| Shares yx-ui components | **Yes**: the same components, tokens and tests | No: RN has no DOM or CSS. We would rebuild every component and keep two design systems | No: Dart, a second language | Yes |
| Shares API client, DTO types, i18n catalogue | Yes | Yes | No (Dart codegen) | Yes |
| Native features we need (push on iOS, Keystore / Keychain, biometrics, background location, Play Integrity / App Attest, pinning, FLAG_SECURE) | Yes, through a few native plugins and platform config | Yes, richest library choice | Yes | **No.** No reliable iOS push unless installed, no secure hardware keys, no attestation, no background location |
| Low-end Android feel | Good for forms and lists if we keep the JS budget. Long lists need virtualisation. WebView updates come with Chrome | Best: native views | Very good | Same as Capacitor, minus the native shell |
| Team cost | One UI to build and test | Second UI layer for every screen in every module (YX-MOB-01 makes this permanent) | A second stack and language | Lowest, but misses the security and field-force needs |
| Store review risk | Apple rejects plain "website in a box" apps. We ship native push, biometrics, offline punch and the camera, and bundle the code (not a remote URL) | Low | Low | n/a |

### 3.3 Recommendation
**Keep the decided route (M04 Q1): one React code base, served as a PWA and wrapped with Capacitor for the stores.** Build it as a **separate, bundled single-page app**, `apps/mobile` (Vite + React + yx-ui), not as a wrapper around the hosted Next.js site.

- **Bundled, not remote:** the app opens offline, starts fast, passes store review and is not hurt by a slow server.
- **Same code as the PWA:** the build that goes into the stores is also served at `m.<region>.yukthix.com` as the PWA.
- **Shared with desk:** the mobile components live in yx-ui (`yx-ui/mobile`), so the desk's responsive pages and the app use the same parts.

React Native would give a smoother feel on the cheapest phones, but at the price of a second UI for every module, forever. We revisit only if the MB8 performance gate (§14) fails on the reference phones after the budget work. Flutter shares nothing with our stack. A PWA alone cannot meet device binding, attestation, iOS push or field tracking. → **D1, D2.**

## 4. Where it lives

| Piece | Where | Note |
|---|---|---|
| Mobile app (screens, router, offline store, native bridges) | `apps/mobile` (new) | Vite build; lazy-loaded per tab; React Router; TanStack Query (as web) with a persisted cache for safe data only (§8.4) |
| Mobile components | `packages/yx-ui/src/mobile/` | Tab bar, Today card, request sheet, approval card, check-in sheet, payslip viewer, document list, offline banner (M04 §7); stories + affordance guard |
| Shared screen logic | `packages/yx-ui/src/screens/*/live` | Reused where the mobile layout is a stacked version of the desk screen (leave form, goal check-in, feedback); otherwise a mobile screen calls the same API |
| API client | `packages/yx-client` (new, small) | Typed fetch helpers built from the OpenAPI contract (P11 Q6), shared by web and mobile; token refresh; step-up retry (as `apps/web/lib/api-client.ts` today) |
| Native shell | `apps/mobile/android`, `apps/mobile/ios` (Capacitor projects) | Config, signing, managed config, pinning, entitlements |
| API additions | `apps/api/src/mobile/` (devices, attestation, app config, offline punch sync) | Everything else is the existing API (P11: no mobile-only business endpoints) |

### 4.1 Changes needed in other modules (listed for their owners)

| # | Module | Change | Needed by |
|---|---|---|---|
| 1 | P04 | `push_devices` merges into M04's `user_devices` (one record per install: push token + binding + attestation). The P04 adapters read from it | MB2 |
| 2 | P04 | Native push adapters (FCM HTTP v1, APNs token auth) beside web push (VAPID) | MB4 |
| 3 | M02 | Punches gain offline and device-trust columns (§9.4); the verdict function runs on sync with the capture-time position | MB3 |
| 4 | P12 | Mobile session: refresh token bound to the device key; biometric unlock counts as "user present" for the 15-min re-auth window, but **step-up AAL2 needs a passkey** (or a PIN plus device key) | MB2 |
| 5 | M05 | Receipt upload accepts a client-compressed JPEG (max 2 MB) and returns the OCR suggestion within the request or by polling | MB6 |
| 6 | P11 | Region discovery endpoint on the global edge (company code or email domain → region API URL), with no personal data | MB1 |

## 5. App structure
- **Tabs:** Home · Time · Requests · Pay · Me (M04 §3). The canonical flow list is [APX-D §5](APX-D-screens-navigation.md).
- **Manager mode** is the same app: a Team segment on Home and the approvals inbox in Requests (M04 Q5).
- **Routing:** every screen has a deep link `yukthix://…` plus the matching `https://m.<region>.yukthix.com/…` (Android App Links, iOS Universal Links). Push and notification items open the record with its action (YX-MOB-04).
- **Loading:** Home and Time are in the first bundle; Pay, Requests forms, Me sub-pages, the camera and the map load on demand (§14).
- **Offline banner** and **pending sync** chips on drafts and punches (M04 §7, Q7).

## 6. API: what mobile adds
Mobile calls the same `/api/v1` as the desk. The only new endpoints are:

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /mobile/config` | Minimum app version per platform, feature switches, the company's mobile settings (§18.3), pin-set version | Signed in (or anonymous for the version part) |
| `POST /mobile/devices` | Register an install: platform, app version, push token, device public key, attestation token | Signed in |
| `POST /mobile/devices/:id/attest` | Fresh Play Integrity / App Attest verdict (on bind, on each app version change, then at most daily) | Device key signature |
| `POST /mobile/devices/:id/bind` · `DELETE /mobile/devices/:id` | Bind for check-in (P03 request when changing an existing binding) · revoke (YX-MOB-09) | Self; HR with `mobile.device.manage` |
| `POST /time/me/punches/sync` | A batch of offline punches, each signed on the device (§9.3) | Signed in + device signature |
| `GET /global/region?company=` | Region discovery (on the global edge, no personal data) | Public, rate-limited |

Everything else (leave, approvals, payslips, claims, goals, feedback, 1:1s, notifications, help) uses the endpoints the desk already uses. A missing mobile need is added to the owning module's API, never to `/mobile`.

## 7. Sign-in, sessions and device trust (MB1, MB2)

### 7.1 Sign-in
1. The app asks for the company code or the work email. Region discovery picks the API host.
2. Sign-in uses the company's methods: mobile OTP (SMS or WhatsApp authentication template), email + password, or SSO. SSO runs in the **system browser** with PKCE and returns through an App Link / Universal Link, never inside an embedded web view.
3. The app offers to add a passkey through the native Android Credential Manager or iOS ASAuthorization, using the same WebAuthn server as the web (P12 YX-IAM-03). Otherwise it sets up a 4-digit app PIN.
4. P12 lockout, OTP rate limits and "Too many sign-in attempts" apply unchanged (W-016).

### 7.2 Tokens and storage (rule YX-MOB-20)
- **Access token (15 min):** kept in memory only.
- **Refresh token:** stored in the **Android Keystore / iOS Keychain**, encrypted with a hardware-backed key that needs user presence (biometric or device credential), and used only together with a signature from the device key (§7.4). A stolen refresh token alone is useless.
- **Nothing sensitive goes in WebView storage.** localStorage and IndexedDB hold only the §8.4 safe cache and drafts; Confidential and Special values are never written to disk. The PWA keeps the refresh token in an http-only, same-site cookie scoped to the API (no device key, lower trust, §7.6).
- **Sign-out and remote revoke** (YX-MOB-09) wipe the Keystore entries, the safe cache, drafts already submitted and the push token.

### 7.3 Biometric unlock and re-authentication
- **Opening the app** after the session is idle needs biometric or app PIN. This unlocks the stored refresh key; the server sees the device signature.
- **Pay, documents, bank and ID screens** need a fresh unlock within 15 min (M04 Q8).
- **Step-up AAL2 actions** (P12 YX-IAM-02; for example changing a bank account, approving payroll) need a **passkey**, or TOTP where the user has no passkey. A device unlock alone does not reach AAL2 for those actions. The app shows the same "Confirm it's you" step as the web.
- **PIN:** 5 wrong PINs wipe the local keys and the person signs in again (OTP / SSO). The PIN never leaves the device; it unlocks the Keystore key.

### 7.4 Device key and binding (rules YX-MOB-21, YX-MOB-22)
- **On first registration** the app creates a **non-exportable key pair** in the Keystore (StrongBox where present) or the Secure Enclave. The public key and an **attestation** are sent to the server:
  - Android: a **Play Integrity** verdict with the request hash;
  - iOS: an **App Attest** key attestation.

  The server verifies them with Google / Apple and stores the verdict on `user_devices`.
- **Binding for check-in** (M04 Q3) marks one device per employee; a punch from another device is refused (restricted mode) or flagged.
- **Changing the bound device** is a P03 request to HR / manager (existing `device_bind_requests`). The old binding ends when it is approved.
- **Every punch, offline or online, from the store app is signed with the device key** (§9.3).

### 7.5 Root, jailbreak and tamper signals (rule YX-MOB-23)
- **Signals:**
  - the **attestation verdict** (Play Integrity device and app integrity; App Attest validity);
  - Android mock-location flags on each fix;
  - a debugger or instrumentation check in the native shell;
  - a re-signed or side-loaded app, which shows as an attestation app-integrity failure.
- **The server decides.** Client-side "is this rooted" checks are easy to bypass, so the app only reports what it sees, and the verdicts that matter come signed from Google and Apple.
- **Default policy (D4): record and show.** A device that fails integrity is flagged on HR's device list and on every punch it makes ("device integrity: failed"). The company can choose to **refuse check-in from such devices**. Pay and the rest of the app still open, because cheap phones with custom ROMs are common and blocking them would lock out real employees.
- **YukthiX staff and sensitive-role sessions** (P12 YX-IAM-01) on a failed-integrity device are refused at AAL2.

### 7.6 PWA trust level
The PWA has no hardware key and no attestation, so its punches carry `trust = 'browser'`:
- **Restricted mode with binding:** PWA check-in is allowed only if the company switches it on.
- **Offline PWA punches:** signed with a WebCrypto non-extractable key held in IndexedDB. This is weaker, and it is shown as such to HR.

### 7.7 Certificate pinning (rule YX-MOB-24)
- **Pinning uses the platforms' built-in features, so no library is needed:**
  - Android: Network Security Config `<pin-set>`;
  - iOS: `NSPinnedDomains` in Info.plist.
- **What is pinned:** the **public keys of our CA's intermediates plus one backup key** we hold offline. Pins never name a leaf certificate.
- **Expiry:** each pin set expires 12 months after the app build, so a forgotten app fails open to normal TLS rather than bricking.
- **Rotation:** a new intermediate goes into a release at least 60 days before use. `GET /mobile/config` reports the pin-set version so old builds can be told to update.
- **The PWA cannot pin.** It relies on HSTS (preloaded) and CT.

### 7.8 Screens and the app switcher (rule YX-MOB-25)
- **App switcher:** the snapshot is always blurred, on Android with FLAG_SECURE only while a sensitive screen is open and on iOS with an overlay on resign-active, so payslips never show in the recent-apps view.
- **Screenshots** on Pay, ID and bank screens are allowed by default, and the payslip PDF carries the YX-MOB-07 watermark. A company can block them in the store app on Android (FLAG_SECURE); iOS can only detect and log them. → **D7.**
- **Clipboard:** copying a masked value is not offered. A revealed value is copied with a 60-second clipboard expiry where the OS supports it.

## 8. Privacy and masking (P02)

### 8.1 Same server rules
- **Field classes:** the API already applies them (hidden / masked / read / edit, YX-SEC-07), and mobile shows exactly what the API returns. Masked values show their mask (••••6789). A "Show" action appears only where the role may reveal; it needs the re-auth of §7.3 and is audited (YX-SEC-09).
- **Directory:** shows only Public / Internal fields (P02). A team member's profile is limited to the manager's P02 scope (M04 Q5).

### 8.2 Notifications
Push text follows YX-NTF-04: what happened and who, never an amount, ID or health / POSH word. Payslip ready: "Your September payslip is ready". The lock screen shows the same text. Grouped notifications ("3 requests waiting") never list names on the lock screen when the company sets "private lock screen" (default on for HR / payroll roles).

### 8.3 Consent
These are asked in the app at the moment they are first needed, and the consent text version is stored (P02 §6):
- location for check-in;
- background location (field mode, YX-MOB-13);
- camera for a selfie at check-in;
- camera for receipts.

Withdrawing a consent in Me › Privacy stops the feature at once.

### 8.4 What may be cached on the device (rule YX-MOB-26)

| Data | Cached? |
|---|---|
| App shell, translations, holidays, own leave balances, own shift and roster, directory card of own team, notification titles | Yes, encrypted at rest by the OS; cleared on sign-out / revoke |
| Drafts (leave, regularisation, expense without images) | Yes, until submitted (M04 Q7) |
| Offline punches | Yes, until the server acknowledges (§9.3) |
| Receipt images waiting to upload | Yes, in app-private storage, deleted after upload; never in the photo gallery |
| Payslip figures, tax figures, bank, PAN, Aadhaar, salary, documents, review text, feedback text, 1:1 notes | **Never** |
| Selfies | Only until uploaded; never in the gallery |

## 9. Attendance (MB3)

### 9.1 Check-in sheet (YX-MOB-05, YX-MOB-18)
- **What it shows:** shift and time to start, a map with the pin, the accuracy radius and the geofences, the verdict ("Inside Chennai HQ" / "Outside, 850 m away"), a **retry location** action and the plain reason when the punch is refused.
- **The verdict:** computed by the existing server function (`checkInVerdict`, M02 YX-AT-01) when online. The app shows a preview computed from the same rules (shared code in `packages/shared`) so the sheet answers at once. The server's answer wins.
- **Refused attempts** are logged (M02 YX-AT-23) and offer "ask HR to regularise" in one tap.
- **The map:** a light vector tile layer loaded only on this sheet. Without a map (offline, low memory) the sheet falls back to the distance-and-direction text.

### 9.2 Selfie option (rule YX-MOB-27)
- **Settings:** a company setting `attendance.selfie` with values `off` (default), `optional` or `required`, set by location or employment type.
- **Capture:** the front camera only; no gallery, no filters. The image is resized to 640 px and JPEG q70 (about 60 KB), stamped with time and the verdict, and uploaded with the punch, or queued when offline.
- **What happens to it:** it is stored as **Special** class (it shows the face) under its own retention (default 90 days, D5), and is visible to the manager and HR in scope for the exceptions review.
- **No face matching in this design.** Matching and liveness belong to wave 6 (P10 Q3), with their own consent (YX-SEC-36). Until then the selfie is a deterrent and a record only.
- **Refused selfie:** if the employee refuses the camera where selfies are `required`, the punch is refused with "a photo is needed here" and logged as an attempt.

### 9.3 Offline punch: capture, sign, sync (rule YX-MOB-28)
**At capture** (no network, or the API unreachable for 8 s):
1. Take a GPS fix: up to 20 s, and the best of three fixes.
2. Build the punch record:
   - kind (in / out), device wall-clock time, **monotonic elapsed time since boot**, boot count (Android) / boot session id (iOS);
   - lat, lng, accuracy, the mock-location flag, the shift id from the cached roster;
   - a per-device **sequence number**, and the selfie hash if one was taken.
3. **Sign the record with the device key** (§7.4) and store it in the encrypted offline queue. The sheet shows "Saved — pending sync" and the time.

**At sync** (automatic when online, with retry and backoff; also on app open):
- Send in order through `POST /time/me/punches/sync`. The server checks the following:
  - **signature and key:** they belong to an active, non-revoked device of this user (and the bound device in restricted mode);
  - **sequence:** strictly increasing per device, so a replay or a reordered queue is refused for that record;
  - **time sanity:** the server rebuilds the real capture time from the monotonic clock. The rebuilt time is the server time at sync, minus (elapsed time at sync − elapsed time at capture), and this works only in the same boot session. If the device wall clock differs from the rebuilt time by more than 5 min, the punch is **accepted on the rebuilt time** and flagged "device clock changed". Across a reboot the device time is used and flagged "unverified time";
  - **age:** a punch older than the company limit (default 72 h, D6) is not applied. It becomes a regularisation request with the evidence attached;
  - **location:** the geofence verdict is computed on the captured position. A mock-location fix is flagged (and refused in restricted mode);
  - **period lock:** a punch into a locked attendance period (P08) becomes a regularisation request.
- **Every result** comes back per record (applied / applied with flags / turned into regularisation / refused with reason). The queue clears each acknowledged record and keeps the rest.

**HR view:** the existing exceptions list shows an "offline" badge with the flags (clock changed, unverified time, integrity failed, mock location, browser trust) and capture vs sync times (YX-AT-24).

**Payroll:** an offline punch applied after the payroll feed for its day was taken follows M02's late-change rule (reaches payroll as an adjustment), never a silent change.

### 9.4 Data (M02 change 3)
`attendance_punches` gains:
- `source` gains `'mobile_offline'`;
- `device_id`, `captured_at_device`, `captured_elapsed_ms`, `boot_id`, `seq`, `rebuilt_at`;
- `clock_flag` (none / changed / unverified), `trust` (device / browser / kiosk), `integrity` (pass / fail / unknown), `mock_location`;
- `synced_at`, `selfie_file_id`.

A unique key on `(device_id, seq)` makes sync idempotent.

### 9.5 Calendar, regularise, WFH / on-duty
- The calendar uses the M02 screens' rules (YX-MOB-12: late = warning colour, punches grouped by day) in the stacked mobile layout.
- Regularise, WFH, on-duty and OT use the P03 request sheet.
- Drafts work offline (M04 Q7).

### 9.6 Field mode (wave 5, YX-MOB-13)
Background location sits in the store app only, behind consent and the OS permission, during duty only, with the persistent notification. It is not built in MB3. MB3 leaves the native location bridge ready, with the foreground-only permission.

## 10. Leave, approvals and notifications (MB4)
- **Apply leave:** the stacked form shows the balance after, the team-availability hint and the attachment from the camera for sick leave. No approver picker; P03 resolves it (YX-MOB-12).
- **My requests:** status, including requests raised on my behalf (P03 D5).
- **Approvals inbox:**
  - only items waiting for me, grouped by type, with an approval card per item (YX-MOB-02/03);
  - approve / reject / send back with a comment;
  - bulk approve for low-risk types;
  - items marked `decideOnlyVia` (for example payroll reopen) open their own screen with step-up, as on the web.
- **Notifications:** an in-app centre grouped by subject, and deep links to the record (YX-MOB-04). Preferences, quiet hours and channel consents live under Me › Notifications (P04 §4.7).
- **Push open:** a manager approves a leave from a push in three taps or fewer, without seeing an editable form (M04 §9).

## 11. Pay and tax (MB5)
- **Payslips:** the list (month, status) is cached without figures. Opening a payslip needs the re-auth (§7.3). The view leads with net pay and the "why this number" drawer (M03). The PDF downloads into app-private storage, opens in the system viewer through a content URI and is deleted on sign-out; it carries the watermark (YX-MOB-07).
- **Raise a payslip query:** M03 D13.
- **Tax workspace:** regime choice, declarations, proof upload with the camera (multi-page, cropped, compressed to PDF on the device) and Form 16 download. Step-up applies only where the web asks for it.
- **Loans and advances, EWA (wave 5) and equity (wave 6)** come in their owning modules' waves; MB5 provides the Pay tab frame.

## 12. Expenses with camera receipts (MB6)
- **Capture:**
  - the camera opens straight into receipt mode with edge detection, done on the device by a small native document-scanner plugin. With no plugin, a plain photo plus manual crop;
  - multi-page receipts;
  - the image is converted to JPEG, max 2 MB, long edge 2,000 px, with EXIF location stripped (the claim already has its own location if needed).
- **Upload and read:**
  - the image goes to the existing claim upload, then to the **self-hosted OCR worker** (M05 §14.6);
  - the suggestions fill the form (merchant, date, amount, GST number, currency) with a "suggested" mark, and the employee confirms;
  - an **e-invoice QR** in the photo is read by the worker as on the desk.
  - OCR never decides: a failed read means manual entry, with no error shown (M05 Q4).
- **Offline:** the claim is a draft with its images in app-private storage, sent when online. A duplicate photo is caught by the existing perceptual hash (M05 E5).
- **Mileage, trips, advances and foreign currency** follow M05 in their waves. The MB6 form supports the categories the company enabled.

## 13. Directory, profile, performance and help (MB7)
- **Directory:** search (P17), the person card (Public / Internal fields), call / email / WhatsApp buttons that open the phone's own apps, and the org chart path.
- **My profile:** read view plus change requests (P03; edits to Confidential fields need step-up, as on the web). Documents and letters list with status chips; downloads as for payslips.
- **Goals:** my goals and key results, quick check-in (progress, confidence, note), and the team's goals for managers. Rules as M06 §7 (progress never typed when key results exist).
- **Feedback:** give (with the picker using server search, as on the web), request, and received. A concern is sealed per M06 §8.3, never shown in push text.
- **1:1s:** the agenda, shared notes, private notes (author only, never cached on the device), and action items with done ticks. A reminder push goes out the day before (M06 PM3).
- **Help:** the help centre search (M14 knowledge base), my tickets, raising a ticket with a photo, and chat where enabled (M14). Policy acknowledgements come in their M08 wave.
- **Me › Security:** my devices with "sign out this device" (YX-MOB-09), passkeys, PIN change, my sign-in history (P12).
- **Me › Privacy:** my data (P02 DSAR export request), and consents (§8.3).

## 14. Low-end Android performance (rule YX-MOB-29; budgets YX-MOB-06 / 19)
- **Reference phones:** two **2 GB / 3 GB RAM Android Go-class phones** (the cheapest sold in volume by our pilot customers' staff) plus one mid-range phone, bought by the team. CI uses an emulator with matching CPU throttling for the budget checks; the real phones are used at every batch review. → **D10** (minimum OS).
- **Bundle:**
  - Home and Time ≤ 200 KB gz of JS;
  - each other tab lazy-loaded;
  - no moment-style date library: `Intl` is enough;
  - no large icon packs, only the icons we use (tree-shaken);
  - map tiles and the camera loaded on demand.
- **Lists:** virtualised lists for the directory, notifications, the approvals inbox and attendance history beyond 50 rows.
- **Images:** server-resized avatars (64 / 128 px), lazy-loaded.
- **Animation:** CSS transforms only, no layout animation, and none at all when the OS asks for reduced motion.
- **Network:** one aggregated "Home today" call (a first-party P11 aggregation) instead of five. All calls are gzipped; retries use backoff; reads use stale-while-revalidate; nothing is polled faster than 60 s.
- **Memory:** the camera and map are released when their sheets close. Startup is measured with the Android Studio profiler at every MB review.
- **CI gates:** the build fails above the size budget or the cold-start budget on the throttled emulator. The measured numbers are posted on the PR (YX-MOB-19).

## 15. Push providers (MB4)

| Client | Provider | Notes |
|---|---|---|
| Android store app | **Firebase Cloud Messaging, HTTP v1 API** | Service-account credentials per environment in the secret store. Data-only messages with the notification text built on the device from the payload (type + external-safe variables), so the text is translated into the user's language |
| iOS store app | **APNs directly** (token-based auth, .p8 key) | Not routed through FCM, so one fewer processor sees iOS traffic. `mutable-content` lets the app localise the text |
| PWA | Web push (VAPID) | Android fully. On iOS only when installed to the home screen (P04 §4.2) |
| Huawei phones without Google services | Not at launch | They get in-app + WhatsApp + SMS for key events (P04 fallback). HMS Push only if a customer needs it → **D8** |

- **Payloads** carry no personal data beyond what YX-NTF-04 allows: type, record id, and external-safe variables such as a first name and dates. Google and Apple therefore see no Confidential or Special data.
- **No third-party push service** (OneSignal and the like): it would be one more processor holding device tokens and user ids.
- **Token lifecycle:** a token is updated on every app start. A provider "unregistered" answer marks it dead, and revoke deletes it (YX-MOB-09). Quiet hours and grouping stay server-side (P04).

## 16. Data residency (P02, P21)
- **One app for every region.** Region discovery (§6) answers from the global edge with the API host only. The app then talks **only to the tenant's region** (`api.<region>.yukthix.com`) for everything, including uploads and OCR, which runs in-region.
- **Push:** Google / Apple process only the external-safe payload (§15). This is listed as a sub-processor in the RoPA with that limit. For in-country regions (UAE, KSA) the push text can be reduced to "You have a new update" by a region setting.
- **Crash reports and logs:** our self-hosted error tracker in the tenant's region (P13), with personal data scrubbed on the device (no request bodies, no screen text, user id hashed). **No analytics or advertising SDKs** in the app. → **D12.**
- **Maps:** tiles come from a provider we proxy through our region (no device-to-provider calls with the user's position), or from self-hosted tiles. The punch position goes only to our API. → part of **D11**.
- **The app stores' privacy labels** (Play Data safety, App Store privacy details) are written from this section and reviewed with the DPO before each release that changes data use.

## 17. Accessibility, languages and RTL (rule YX-MOB-30)
- **Standard:** WCAG 2.2 AA. Every interactive element has a role, a name and a 44 px target (M04 §7). Focus order follows the visual order, and screen-reader labels come from the translation catalogue.
- **Testing:**
  - TalkBack and VoiceOver passes on each new screen at batch review;
  - the existing axe checks in Playwright (PWA build);
  - the affordance guard for the mobile components.
- **Text size:** OS font scaling up to 200 % without clipping. Layouts are tested in Tamil, the longest launch language (YX-MOB-10).
- **Direction:** logical CSS only, and the `dir` comes from the locale (YX-GLB-02). Arabic is ready when the first GCC customer arrives.
- **Colour:** status is never shown by colour alone; late is warning plus text (YX-MOB-12).
- **Dark mode:** follows the OS (M04 §7).
- **Translations** come from the G1 catalogue, cached offline, with new strings falling back to English. Numbers, dates and currency use `Intl` in the user's locale.

## 18. Data, permissions, settings

### 18.1 Tables (all tenant tables: forced RLS, `tenant_isolation`, `support_session_excluded` where personal)

| Table | Main columns | Notes |
|---|---|---|
| `user_devices` | user, platform (pwa / android / ios), app version, os version, model class, push provider + token, device public key, key attestation format, last integrity verdict + time, `bound_for_checkin`, bound_at, approved_by, last_seen, revoked_at / by / reason, background-location permission, mock_location_detected_at | M04 §4 plus P04 `push_devices` merged (change 1). DELETE revoked; revoke sets `revoked_at` |
| `device_bind_requests` | user, from device, to device, wf_request_id, status | M04 §4; P03 type `mobile.device.bind` |
| `device_attestations` | device, kind (play_integrity / app_attest / webcrypto), verdict JSON (trimmed), result, checked_at | Append-only (UPDATE and DELETE revoked) |
| `punch_selfies` | punch, file, sha256, captured_at, retention_until | Special class; deleted by the retention sweep |
| `mobile_releases` (platform) | platform, version, build, min_supported (bool), pin-set version, released_at, rollout % | Platform table, no tenant data |

M02 punch columns: §9.4.

### 18.2 Permissions (P02)

| Key | Who | What |
|---|---|---|
| `mobile.device.manage` | HR Admin template | See devices of people in scope, approve binding changes, revoke a device |
| `attendance.selfie.view` | HR Admin, managers through the chain (implicit) | See check-in selfies in scope (Special; each view audited) |

Self actions need no key: own devices, own punches, own consents. MFA: `mobile.device.manage` is added to the MFA-sensitive list (P12 YX-IAM-01).

### 18.3 Settings registry (company, scoped by entity / location where noted)

| Key | Values | Default |
|---|---|---|
| `mobile.session_days` | 7, 14, 30 | 30 |
| `mobile.reauth_minutes` | 5, 15 | 15 |
| `mobile.device_binding` | off, restricted_staff, everyone | restricted_staff (M04 Q3) |
| `mobile.pwa_checkin` | allowed, not_when_bound | not_when_bound |
| `mobile.integrity_failed` | flag, refuse_checkin | flag (D4) |
| `mobile.screenshots_sensitive` | allowed, blocked | allowed (D7) |
| `mobile.lock_screen` | names, private | names (private for HR / payroll roles) |
| `attendance.selfie` (entity, location, employment type) | off, optional, required | off (D5) |
| `attendance.selfie_retention_days` | 30, 90, 180 | 90 |
| `attendance.offline_max_hours` | 24, 72, 168 | 72 (D6) |
| `push.region_minimal_text` (region) | on, off | off (on for in-country regions) |

## 19. Store release and MDM (MB8)
- **Listing:** one YukthiX app per store under YukthiX's developer accounts (→ **D3**). The company is chosen at sign-in, so there are no per-tenant apps.
- **Builds:**
  - CI builds signed AABs and IPAs. The signing keys sit in the CI secret store; the Android upload key is separate from the Play app-signing key, and the iOS distribution certificate rotates yearly;
  - builds are reproducible from the tag, and dependencies are pinned and licence-checked (Apache / MIT / BSD only, as for the OCR worker).
- **Channels:** internal (team) → Play closed testing / TestFlight (pilot customers) → **staged production rollout** at 5 %, then 20 %, 50 % and 100 %. The rollout halts automatically below 99.5 % crash-free users (YX-MOB-19).
- **Cadence:** a store release every two weeks with each wave's flows. **No over-the-air code updates at launch** (→ **D9**). The minimum supported version in `GET /mobile/config` forces an update screen only for security fixes or API breaks.
- **Review notes:** a demo company and an OTP-free reviewer sign-in path, enabled only for the store reviewer accounts and only in the demo tenant.
- **MDM / EMM:**
  - **Android Enterprise managed configuration** and **iOS managed app config (AppConfig)** keys: company code (skips discovery), allowed sign-in methods, and "disallow screenshots on sensitive screens";
  - private distribution: managed Google Play private apps and Apple Business Manager custom apps, for customers who need it;
  - **We do not build our own MDM.** On a managed device a wipe by the customer's MDM removes the app and its keys; our server revoke still applies.
- **Kiosk tablets** (M04 Q4) use Android dedicated-device (lock task) mode configured by the customer's MDM or our setup guide. The kiosk app mode itself is outside this design (§21).

## 20. Slices (batches, each ending with the usual checks)
Every batch ends with the usual checks:
- typecheck;
- unit tests;
- screen tests and stories;
- the affordance guard (mobile components included);
- the batch's API e2e and the RLS suite;
- **Playwright on the PWA build in mobile viewports** (Pixel-class and iPhone-class emulation, throttled CPU and "Fast 3G");
- the **native smoke on an Android emulator and an iOS simulator** (→ **D13**: tool);
- the size and cold-start budgets;
- a fresh-database migration.

### Batch MB1 · Foundations (6 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-1.01 | `apps/mobile` (Vite + React + router), `yx-ui/mobile` (tab bar, Today card, sheets, offline banner) with stories | Screen tests; affordance guard includes `mobile` |
| MB-1.02 | `packages/yx-client` shared with web (fetch, refresh, step-up retry); web moves onto it | Web tests unchanged; client unit tests (refresh race, step-up retry) |
| MB-1.03 | Region discovery, company code / email entry, sign-in (OTP, password, SSO via system browser + PKCE + App Link) | e2e: discovery returns only a host; SSO round-trip in the PWA; lockout message on the 11th OTP |
| MB-1.04 | Translations (G1 catalogue, offline), locale formatting, `dir` from locale | Tamil layout snapshot with no clipping at 200 % font scale; Arabic `dir="rtl"` smoke |
| MB-1.05 | PWA manifest + service worker (shell + safe cache only), `GET /mobile/config`, min-version gate | Playwright: offline open shows shell and cached Home; payslip figures never in cache (cache inspector test) |
| MB-1.06 | Capacitor Android and iOS projects, CI signed builds (internal track), size and cold-start budget gates | Native smoke: install, sign in, Home; CI fails a deliberately oversize build |

### Batch MB2 · Device trust and security (6 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-2.01 | `user_devices` (P04 `push_devices` merged), register / revoke, Me › Security devices list | e2e: revoked device's next call 401 and push stops (YX-MOB-09) |
| MB-2.02 | Device key in Keystore / Secure Enclave, refresh token bound to the key, biometric unlock + app PIN, 5-wrong-PIN wipe | Native: refresh fails without the device signature; PIN wipe forces sign-in |
| MB-2.03 | Attestation (Play Integrity, App Attest) verified server-side; `device_attestations`; integrity policy | e2e with recorded verdicts: failed integrity flagged; `refuse_checkin` refuses the punch |
| MB-2.04 | Re-auth for Pay / documents / bank / ID screens; step-up AAL2 by passkey (native Credential Manager / ASAuthorization) | e2e: bank change asks passkey even after biometric unlock; within 15 min not asked again |
| MB-2.05 | Certificate pinning (platform config, intermediates + backup, 12-month expiry), pin-set version in config | Native: a proxy with a non-pinned CA is refused; the backup pin is accepted |
| MB-2.06 | App-switcher blur, optional screenshot block, clipboard expiry, device binding + P03 change request | Native: recent-apps snapshot blurred on Pay; e2e: punch from an unbound device refused in restricted mode |

### Batch MB3 · Attendance (5 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-3.01 | Check-in sheet: map, accuracy, geofences, verdict preview (shared rules), retry, refused attempt logged, one-tap regularise | e2e: outside → "Outside Chennai HQ, 850 m away" and an attempt row (YX-MOB-18) |
| MB-3.02 | Selfie option (front camera only, resized, Special class, retention sweep) | e2e: `required` without photo refused; selfie gone after retention; view audited |
| MB-3.03 | Offline punch: capture, sign, encrypted queue, pending chip | Native: airplane mode punch shows "pending sync" with time |
| MB-3.04 | `POST /time/me/punches/sync`: signature, sequence, rebuilt time, age, geofence on capture position, period lock → regularisation | e2e: replayed record refused; clock moved +2 h applied on rebuilt time and flagged; 80 h old becomes regularisation; mock location flagged |
| MB-3.05 | Calendar (markers, day-grouped punches), regularise / WFH / on-duty sheets, Team today for managers | Screen tests (late = warning colour); Playwright manager Team today |

### Batch MB4 · Leave, approvals, notifications, push (5 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-4.01 | Leave apply (balance after, camera attachment), my requests incl. raised on my behalf, offline draft | e2e: offline draft submits on reconnect and is re-validated (balance changed → clear message) |
| MB-4.02 | Approvals inbox and approval cards (generic P03), bulk low-risk, `decideOnlyVia` hand-off | Playwright: approve a leave from a push deep link in ≤ 3 taps; no editable form (U91) |
| MB-4.03 | Notification centre (grouped, names not ids), preferences, quiet hours | Screen tests; e2e: text "Priya Sharma applied for leave 3–5 Oct" (U93) |
| MB-4.04 | Native push: FCM HTTP v1, APNs token auth, on-device localisation, token lifecycle | e2e with provider fakes: payload contains no Confidential / Special variable (lint over the payload builder) |
| MB-4.05 | Deep links (App Links / Universal Links) for every notification type | Native smoke: tapping a push opens the record with its action |

### Batch MB5 · Pay and tax (3 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-5.01 | Payslip list (cached without figures), viewer with re-auth and "why this number", watermarked PDF in app-private storage | e2e: figures never cached; PDF deleted on sign-out; watermark present |
| MB-5.02 | Payslip query, YTD | Playwright |
| MB-5.03 | Tax workspace: regime, declarations, camera proofs (multi-page PDF on device), Form 16 | e2e: proof upload; Playwright regime switch |

### Batch MB6 · Expenses (3 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-6.01 | Receipt camera (edge detection, multi-page, compress, EXIF stripped), upload to the existing claim API | Native: EXIF location removed; ≤ 2 MB |
| MB-6.02 | OCR suggestions from the worker filling the form with "suggested" marks; e-invoice QR; manual fallback silent | e2e with the dev-fake adapter: suggested fields; a failed read shows the empty form, no error |
| MB-6.03 | Offline claim drafts with images, duplicate-photo warning (perceptual hash) | e2e: duplicate receipt warned |

### Batch MB7 · People, performance, help (4 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-7.01 | Directory (server search, virtualised), person card in P02 scope, profile view and change requests | e2e: an employee sees no Confidential field of a colleague; a manager sees the team member profile only in scope |
| MB-7.02 | Goals and quick check-ins; team goals | Screen tests; Playwright check-in |
| MB-7.03 | Feedback give / request / received; 1:1 agenda, notes (private notes never cached), actions | Cache inspector: no private note on disk |
| MB-7.04 | Help centre, my tickets, raise with photo; Me › Privacy (my data request, consents) | Playwright |

### Batch MB8 · Store release (4 slices)

| ID | Slice | Tests |
|---|---|---|
| MB-8.01 | Store listings, privacy labels from §16, reviewer demo path, signing and rollout pipeline | Release checklist signed by the DPO; reviewer path refused outside the demo tenant |
| MB-8.02 | Staged rollout with automatic halt below the crash-free budget; minimum-version gate | CI: simulated crash rate halts the rollout (YX-MOB-19) |
| MB-8.03 | Managed configuration (Android Enterprise, AppConfig): company code, sign-in methods, screenshot block | Native: managed config skips discovery |
| MB-8.04 | Accessibility and low-end performance audit on the reference phones (TalkBack / VoiceOver, 200 % text, cold start) | Measured cold start < 3 s on the 2 GB phone; accessibility findings closed |

Total: 36 slices. MB1–MB4 make the wave-2 app (M04 §8). MB5 is wave 3 (Pay). MB6 and MB7 are wave 5. MB8 can run once MB4 is done, so the stores carry the wave-2 app, and is repeated at every later wave.

## 21. Out of this design
These are built in their owning waves on the MB1–MB2 foundations:
- kiosk mode (attendance / visitor);
- field tracking (B2);
- open shifts and bids (B3);
- EWA (B10);
- equity (C4);
- timesheets (B1);
- the candidate and invigilator app modes (§3.2 of M04);
- face matching and liveness (wave 6);
- the WhatsApp assistant (M04 Q6);
- Slack / Teams apps.

## 22. Rules added by this doc

| ID | Rule |
|---|---|
| YX-MOB-20 | Tokens: access token in memory only; refresh token in Keystore / Keychain under a hardware-backed key and usable only with a device-key signature; nothing sensitive in WebView storage. |
| YX-MOB-21 | Each store-app install has a non-exportable device key with a server-verified attestation; binding, punches and refresh use it. |
| YX-MOB-22 | Changing the bound check-in device is a P03 request; every punch records its device and trust level. |
| YX-MOB-23 | Integrity signals are verified on the server; default policy flags a failed device, the company may refuse its check-ins; sensitive roles are refused AAL2 on it. |
| YX-MOB-24 | The store app pins our CA intermediates plus an offline backup key with platform config; pins expire 12 months after the build. |
| YX-MOB-25 | The app-switcher snapshot is always blurred; screenshot blocking on sensitive screens is a company option. |
| YX-MOB-26 | Only the §8.4 safe data is cached on the device; Confidential and Special values never are. |
| YX-MOB-27 | A selfie at check-in is a company option, front camera only, Special class with its own retention, and no face matching before wave 6 consent. |
| YX-MOB-28 | Offline punches are signed at capture with a per-device sequence and monotonic time; the server rebuilds the time, refuses replays, turns old or locked-period punches into regularisations and flags clock, integrity and mock-location problems. |
| YX-MOB-29 | Lists over 50 rows are virtualised, and heavy features (map, camera, Pay) are loaded on demand. The budgets of YX-MOB-19 gate every build. |
| YX-MOB-30 | Mobile screens meet WCAG 2.2 AA, work at 200 % text and in Tamil, use logical CSS, and are checked with TalkBack and VoiceOver at each batch. |

## 23. Decisions for the founder
Short questions, each with the recommended default.

| # | Question | Recommended default |
|---|---|---|
| **D1** | Which technology for the app? | **Keep the decided route:** one React code base as a PWA, wrapped with Capacitor for Android and iOS. It reuses our yx-ui screens and tests. React Native would mean a second UI for every module; Flutter shares nothing. Revisit only if the low-end phone test fails after tuning. |
| **D2** | Wrap the website, or ship a separate bundled app? | **A separate bundled app** (`apps/mobile`) that is also our PWA. It works offline, starts fast and passes store review. |
| **D3** | One YukthiX app, or a branded app per customer? | **One YukthiX app**; the company is picked at sign-in. Branded apps later, as a paid add-on, if customers ask. |
| **D4** | What if a phone is rooted or jailbroken? | **Flag it and show HR**; companies may refuse check-ins from such phones. Don't lock people out of payslips. Sensitive-role step-up is refused on such phones. |
| **D5** | Selfie at check-in? | **Off by default; companies can make it optional or required** by location. Photos kept 90 days, treated as sensitive, and no face matching until wave 6, with consent. |
| **D6** | How old can an offline punch be? | **72 hours.** Older ones become a regularisation request with the evidence attached. |
| **D7** | Block screenshots of payslips? | **Allow by default** (the PDF is watermarked); companies can block them in the Android app. Always blur the app in the recent-apps view. |
| **D8** | Push providers? | **Google FCM for Android, Apple APNs directly for iOS, web push for the PWA.** No third-party push service. Huawei push only if a customer needs it. |
| **D9** | Push code updates without the app stores? | **No, store releases only** (every two weeks) plus a forced-update screen for security fixes. Revisit after launch. |
| **D10** | Oldest phones we support? | **Android 8 and newer, iOS 15 and newer**, reviewed yearly. We buy two cheap 2–3 GB Android phones as the test reference. |
| **D11** | Maps on the check-in sheet? | **Tiles through our own regional proxy (or self-hosted)**, so the phone never sends its position to a map company. Text-only fallback when offline. |
| **D12** | Crash reports and analytics? | **Our own error tracker in the customer's region, with personal data scrubbed. No analytics or ad SDKs in the app.** |
| **D13** | Tool for automatic tests on real app builds? | **Maestro** (open source, Apache-2.0) for a short native smoke on an Android emulator and an iOS simulator; Playwright stays the main flow test on the PWA build. Needs your OK to add it. |
| **D14** | Order of work? | **MB1–MB4 first** (sign-in, device trust, attendance, leave and approvals = the wave-2 app), then MB8 to reach the stores, then MB5 Pay, then MB6–MB7. |

## 24. Change log

| Date | Change |
|---|---|
| 13 Oct 2026 | First draft: technology comparison and recommendation (Capacitor + bundled React app, confirming M04 Q1), app structure and code sharing with yx-ui, API additions, sign-in and token storage, device key and attestation, root / jailbreak policy, certificate pinning, screen protection, caching rules, attendance with selfie and signed offline punches, leave / approvals / push, pay and tax, expenses with camera and OCR, people / performance / help, low-end Android performance, push providers, data residency, accessibility and RTL, tables, permissions and settings, store release and MDM, 36 slices in batches MB1–MB8, founder decisions D1–D14. |
