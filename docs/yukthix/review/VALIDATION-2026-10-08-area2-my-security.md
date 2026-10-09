# Validation · Area 2 · My security + Login activity (admin) · 8 Oct 2026

Independent, read-only review of what was BUILT against what was PLANNED (P12 §7, YX-IAM-03/06/07/10/11, P08 audit duties, APX-A security emails, APX-D, DESIGN-SYSTEM v1.0) plus a live UI pass with Playwright (Chrome, desktop 1366 px and 390 px, light and dark). No code changed. Screenshots in `C:\Users\HARISI~1\AppData\Local\Temp\claude\C--\800d195d-d61e-4425-b6f7-376b14b42c3d\scratchpad\area2\`.

## Summary (plain English)

1. Everything P12 §7 planned for Me › Security is built and wired to the API: passkey add / rename / remove, authenticator app add + confirm, last-method rule for MFA-required roles, recovery codes (make / copy / download, shown once), mobile number verify / remove, change password (emails the owner, signs out every other device), where you're signed in (sign out one / everywhere else), sign-in history with a Segment filter.
2. Admin › Login activity is built: company-only events (RLS + tenant filter), Person / Result / Method / date-range filters, failed-in-24-hours count with a spike banner, "Signed in now" with per-person Sign out, Unlock with a reason (≥ 10 characters) behind step-up, audit rows and an email to the person.
3. Both screens are clean at 390 px (tables become cards, no horizontal scroll), dates are `d MMM yyyy, h:mm AM` in tabular figures, dark mode works, every text button has a border, single choice uses the joined Segment, and the Change password form does not move while typing.
4. One real logic bug: **Unlock is offered on stale lock rows when the list is filtered** (Result = Failed, or a date range). The "is the lock over" check only looks at rows on the current page, and the Failed filter hides the "Signed in" and "Unlocked by admin" rows that would settle it. I saw Unlock on admin2's own 7 Oct lock row although admin2 has signed in dozens of times since.
5. The row that carries Unlock reads "Failed" like its neighbours; nothing says "this attempt locked the account", so an admin can't see why Unlock sits there.
6. Smaller UI issues: the Method filter lists "Single sign-on" twice (SAML and OIDC share a label), the failed count appears twice on the page (header facts + banner), the banner's "Show failed attempts" filters to `failed` while the count is `unsuccessful` (failed + blocked + wrong second step), the Person filter is capped at the first 100 users, and there is no "Clear filters" while results exist.
7. P12 planned "new-device alerts" under Me › Security; the email is sent and history shows a "New device" badge, but there is no in-app / push notice (APX-A `security.login.new_device.user` is IA P E).
8. US-A-020 (admin MFA reset needs a second admin) is Done on the API (`security/mfa-resets`) but has no screen anywhere in the web app, so its acceptance is not visible to a tester.
9. Manual tests MT-2-01 to MT-2-05, MT-2-10 and MT-2-12 describe old wording ("Two-step verification", "Add a passkey" button, "New recovery codes (N left)", Result = unsuccessful); 6 of 13 are stale, 7 still match.
10. Side effects of this pass: ~20 extra admin2 / plant-hr sessions (they expire; "Sign out everywhere else" clears them), one failed attempt on the non-account `dmin2@demo-org.test` (a dropped first keystroke during page hydration, see UI-10), one refused Change password with a wrong current password on admin2 (no change made). No factor, session or lock was touched.

**Counts:** checklist 31 items: ✅ 25 · ⚠️ 5 · ❌ 1 · 🔄 0. UI findings 12: High 1 · Medium 5 · Low 6. Stale manual tests 6 of 13. Story gaps 6.

## Checklist: planned → built → verified

Legend: ✅ built and verified · ⚠️ built with a gap · ❌ not built · 🔄 could not verify.

### Me › Security (`apps/web/app/yx/(app)/me/security/page.tsx`, `packages/yx-ui/src/screens/auth/me-security.tsx`)

| # | Planned (source) | Built | Verified how | State |
|---|---|---|---|---|
| 1 | Passkey add, discoverable + user-verifying (P12 YX-IAM-03) | `TwoStepCard` method cards → `addPasskey` → `POST auth/mfa/passkeys/registration-options` + `POST auth/mfa/passkeys`; `mfa.service.ts:514 registerPasskey` (residentKey required, userVerification required) | Code; live: "Passkey · Recommended" card shown for admin2 and plant-hr. Not clicked (no enrolment allowed) | ✅ |
| 2 | Passkey rename | `Rename` button per passkey → `PATCH auth/mfa/authenticators/:id` (`@RequireStepUp`); `mfa.service.ts:612 renamePasskey`, audit `mfa.renamed` | Code + unit test `auth.test.tsx` "says which entry is a passkey" | ✅ |
| 3 | Passkey / authenticator remove, emailed (YX-IAM-10, APX-A `security.credentials.changed.user`) | `Remove` + `ConfirmDialog` → `DELETE auth/mfa/authenticators/:id` (step-up); `mfa.service.ts:621 removeFactor`, audit `mfa.removed`, `notifySecurityChange` email | Code + unit test "removes a factor after confirming" | ✅ |
| 4 | Last factor cannot go where MFA is required (YX-IAM-01/11) | UI: `me-security.tsx:117 lastOne` disables Remove + text "You can't remove your only sign-in method…"; API: `mfa.service.ts:626` refuses | Code + unit test "won't remove the only factor". UI rule is `factors.length === 1`, API rule is `usableFactors` (staff / allowed factors): can differ when a factor type is disallowed by policy, API still protects | ✅ |
| 5 | Authenticator app add + confirm (TOTP) | card → `POST auth/mfa/totp/setup`, `TotpConfirm` ("Turn on") → `POST auth/mfa/totp/confirm`; `mfa.service.ts:465` | Code + unit test "sets up an authenticator app from the QR code" | ✅ |
| 6 | Recovery codes shown once, single-use, make new (YX-IAM-11) | "Recovery codes · N of 10 left · Make new codes" → `POST auth/mfa/recovery-codes` (step-up); `RecoveryCodes` (`kit.tsx:242`): Copy codes, Download (`kit.tsx:249`, Blob in the browser), checkbox gate | Code + unit tests "shows new recovery codes once", "downloads the recovery codes". Section only renders when a factor exists (correct: API refuses otherwise) | ✅ |
| 7 | Mobile number verify / remove (OTP fallback, YX-IAM-03) | `MobileCard` (`me-security.tsx:264`): "Text me a code" → `POST auth/otp/mobile`, "Verify number" → `/verify`, Remove → `DELETE`; `mfa.service.ts:697 removeMobile`, audit + email | Code + unit test "verifies a mobile number by text". Live: card shown, button disabled until a number is typed | ✅ |
| 8 | Change password: email + other sessions revoked, this one kept | `PasswordCard` (`me-security.tsx:206`) → `POST users/me/change-password`; `users.service.ts:415 changePassword`: argon2 check, policy + breach check, revokes other refresh families and `revokeStaffSessions(... 'password_changed')`, audit `password.changed`, `securityChangeEmail` | Live: wrong current password → "Your current password is wrong. Try again." (screenshot `me-security-change-password-wrong.png`); no layout jump while typing (form height 286 px before / during / after). Not a step-up action (plan does not ask for one; current password is the proof) | ✅ |
| 9 | Where you're signed in + sign out one / others (YX-IAM-06) | `SessionsCard` (`me-security.tsx:326`): device, IP in words, geo, last active, "This browser", Sign out (confirm) → `DELETE auth/sessions/:id` (`sessions.service.ts:302`, audit `session.revoked`); "Sign out everywhere else" → `POST auth/sessions/revoke-others` (`:316`, audit `session.revoked_others`) | Live: 20+ sessions listed, current one has no Sign out. Unit test "signs out another session, never the current one". No limit / paging on the list (Low, UI-11) | ✅ |
| 10 | Sign-in history, own events only, with filter (YX-IAM-10) | `LoginEventsTable` without person column; Segment "Show: All / Successful / Failed" → `GET auth/login-history?result=success|unsuccessful` (`sessions.service.ts:330 myLoginHistory` forces `userId`) | Live: All → 8 rows incl. Failed; Failed → only Failed rows; Successful → only Signed in. Segment is `role=radiogroup` (`.yx-segment`) | ✅ |
| 11 | New-device alerts (P12 §7 bullet; APX-A `security.login.new_device.user` IA P E) | Email `newSignInEmail` (`sessions.service.ts:448`); "New device" badge in history; no in-app / push notice | Mailpit: "New sign-in to your YukthiX account" after each fresh-context sign-in | ⚠️ email only |
| 12 | Every MFA change / recovery-code use / session revoke logged (YX-IAM-10, P08 "Access & security") | audit actions `mfa.enrolled`, `mfa.removed`, `mfa.renamed`, `mfa.recovery_codes_generated`, `mfa.recovery_code_used`, `session.revoked`, `session.revoked_others`, `password.changed`, `user.mobile_*` | Code | ✅ |
| 13 | Not available while impersonating | `MfaController.me()` and `SessionsController.self()` throw 403 | Code | ✅ |
| 14 | MFA-required role without a factor: warning + due date (YX-IAM-01, 14-day grace) | InlineAlert "Set this up by 21 Oct 2026" (warning) / "Sensitive actions are paused" (danger when overdue) | Live for admin2 and plant-hr | ✅ |
| 15 | Phone width: tables become cards, no side scroll (US-A-036) | DataTable `cardSummary`; `.yx-auth__filters` single column ≤ 600 px | Live 390 px: `scrollWidth == clientWidth`, no element past the viewport (`me-security-390-light.png`, `me-history-card-390.png`) | ✅ |

### Admin › Login activity (`apps/web/app/yx/(app)/admin/login-activity/page.tsx`, `packages/yx-ui/src/screens/auth/login-activity.tsx`, `tables.tsx`)

| # | Planned (source) | Built | Verified how | State |
|---|---|---|---|---|
| 16 | Company-only events (YX-IAM-10) | `GET security/login-events` (`audit:view`) → `sessions.service.ts:426 listLoginEvents` with `tenantWhere` + RLS | Live: only demo-org identifiers listed (incl. the partner user consultant@sharma-advisory.test who belongs to the tenant) | ✅ |
| 17 | Filters: person, result, method, dates | Person `Select` (searchable, "Everyone"), Result (Signed in / Failed / Blocked / Wrong second step / Code sent / Unlocked by admin), Method, `DateRangePicker` (typing `dd MMM yyyy` + calendar, max today) | Live: Result = Failed → only Failed rows; To date = 07 Oct 2026 → newest row 7 Oct 10:56 PM; calendar opens with month / year selects (`login-activity-calendar-open.png`). Person list from `/users?pageSize=100` (UI-6). Method lists "Single sign-on" twice (UI-3) | ⚠️ |
| 18 | Failed-login spikes (P12 §7) | header fact "N failed attempts in the last 24 hours" (`login-activity.tsx:71`, query `result=unsuccessful&from=now-24h`); warning banner at ≥ 20 (`FAILED_SPIKE_AT`) with "Show failed attempts" | Live: 41 → fact + banner both shown (duplicate, UI-4); button sets `result=failed` not `unsuccessful` (UI-5) | ⚠️ |
| 19 | New devices marked | "New device" info badge on success rows | Live | ✅ |
| 20 | Signed in now: who, device, how (One step / Two-step / Passkey), last active, IP (YX-IAM-06) | `SessionsTable` → `GET security/sessions` (`org:manage_users`), tab count = total | Live: 19–24 rows, "Password · One step" badges, IP column hidden by default ("Columns (1 hidden)") | ✅ |
| 21 | Admin signs a person out, audited | row "Sign out" + confirm ("…recorded in the audit log") → `DELETE security/sessions/:id` → `sessions.service.ts:364 adminRevoke` audit `session.revoked` with actor | Code + unit test "signs a person out after confirming". Not clicked live (other people's sessions) | ✅ |
| 22 | Unlock: reason + step-up, logged, person emailed (YX-IAM-07/10, US-A-012) | `UnlockDialog` (`tables.tsx`): reason ≥ 10 chars, "Unlock account" → `POST security/users/:id/unlock` (`org:manage_users`, `@RequireStepUp`) → `sessions.service.ts:382 unlockAccount`: clears account + identifier locks (W-016), audit `account.unlocked`, login event `unlocked/admin`, email "Your YukthiX account was unlocked" | Code + unit tests "unlocks a locked person only with a reason…". Not clicked live | ✅ |
| 23 | Unlock column only on lock rows, only while the lock may still stand | `tables.tsx:35 showsLock`, `:41 unlockableIds` (newest lock per person unless a newer success / unlock row is on the page) | Live: unfiltered page 1 → no Unlock column (correct); Result = Failed → Unlock on recruiter's and **admin2's old 7 Oct row** although admin2 signed in many times since (`login-activity-table-dark.png`, `login-activity-cards-390.png`) | ❌ UI-1 |
| 24 | Unlock only with the permission | handler passed only when `GET security/sessions` succeeded (`org:manage_users`) | Code + unit test "offers no Unlock without the permission" | ✅ |
| 25 | Normal staff: no Security menu, page refused (MT-2-13) | `layout.tsx:49 linksFor` → `[ME]` for non-admin; page shows `NoAccessState` on a plain 403 | Live as plant-hr: menu has only "Me › My security"; `/yx/admin/login-activity` → "You don't have access to login activity · Ask a System Admin to give you access." (`login-activity-refused-planthr.png`) | ✅ |
| 26 | Audit of login, failed login, lockout, unlock, session revoke (P08 §… Access & security) | `login_events` append-only rows for success / failed / locked / mfa_failed / code_sent / unlocked; audit rows for revoke / unlock | Code | ✅ |
| 27 | Emails: locked, new device, new country, unlocked, security change (APX-A SEC class) | `account-emails.ts`: `accountLockedEmail`, `newSignInEmail(newCountry)`, `securityChangeEmail`; `notifyLocked`, `notifyNewDevice`, `notifyNewCountry`, `notifySecurityChange` | Mailpit shows new sign-in emails; others by code | ✅ |
| 28 | Sessions filterable by person (P12 §7 "filterable … sessions") | API `GET security/sessions?userId=` exists; UI has no person filter on the Signed in now tab | Code | ⚠️ |
| 29 | Date / time format `dd MMM yyyy`, tabular figures (DESIGN-SYSTEM §20/§35) | `kit.tsx when()` "8 Oct 2026, 10:35 PM"; `base.css` `font-variant-numeric: tabular-nums` on body | Live computed style on `td` = `tabular-nums` | ✅ |
| 30 | Clickable looks clickable (memory rule; §15) | All text buttons `.yx-button` have a border; MethodCards have border + chevron + hover | Live audit: only borderless clickables are the avatar menu button, tabs, column-sort headers and the unselected Segment options (inside the bordered Segment track) — all by design | ✅ |
| 31 | Dark mode | `[data-theme="dark"]` tokens | Live with `data-theme=dark`: cards, badges, warning alert and table readable (`me-security-desktop-dark.png`, `login-activity-table-dark.png`). No in-app theme switch exists (out of area) | ✅ |

## UI findings

| ID | Sev | Screen | Issue | Evidence |
|---|---|---|---|---|
| UI-1 | High | Login activity › Sign-in attempts | **Unlock offered on a lock that is long over.** `unlockableIds` settles a person only from rows on the current page; with Result = Failed (which also hides `success` and `unlocked` rows) or a date range, an old `lockout_started` row shows Unlock. Seen on admin2's 7 Oct 7:44 PM row and recruiter's 8 Oct 12:14 PM row. Harmless on the API (`wasLocked:false`) but it tells the admin someone is locked who is not, and the banner text sends them to "Unlock someone from their row". Fix idea: let the API say which users are locked now (or return `lockActive` per row) instead of inferring from the page. | `login-activity-table-dark.png`, `login-activity-cards-390.png` |
| UI-2 | Med | Login activity › Sign-in attempts | The row that carries Unlock reads "Failed", same as the rows around it; nothing says "this attempt locked the account". MT-2-12 tells the tester to "find the locked attempt", which they can't. Suggest a "Locked the account" badge (or Result "Blocked") on `lockout_started` rows. | `login-activity-filter-failed.png` |
| UI-3 | Med | Login activity › Method filter | "Single sign-on" appears twice (saml and oidc share `methodLabel`). Two identical options in one dropdown. Merge into one option that sends both, or label "Single sign-on (SAML)" / "(OIDC)". | `la.methodOptions` in findings.json |
| UI-4 | Med | Login activity header | The failed count is shown twice in a row: header fact "41 failed attempts in the last 24 hours" and the banner "41 failed sign-in attempts in the last 24 hours". Drop the fact when the banner shows (or vice-versa). | `login-activity-desktop-light.png` |
| UI-5 | Med | Login activity banner | "Show failed attempts" filters `result=failed`, but the count is `unsuccessful` (failed + blocked + wrong second step), so the list can show fewer rows than the number promised. Use the same result set for both. | `login-activity.tsx:77` vs `page.tsx:40` |
| UI-6 | Med | Login activity › Person filter | Loads `/users?pageSize=100` once: a company with more than 100 users can't filter by the rest, silently. Use the server-side search of the people picker. | `page.tsx:42` |
| UI-7 | Low | Login activity › Sign-in attempts | No "Clear filters" while results exist (it only appears in the empty state); three selects and two dates must be cleared one by one. DESIGN-SYSTEM §21 wants filter chips / clear. | `la.clearFiltersPresent = 0` |
| UI-8 | Low | Login activity › Signed in now | "Device" column (170 px) wraps "Chrome on Windows" onto two lines, so row heights alternate. At 390 px the card summary ends with a dangling "·" when the IP column is hidden ("Password One step ·"). | `login-activity-sessions-desktop.png`, `login-activity-sessions-cards-390.png` |
| UI-9 | Low | My security › Sign-in history | Every sign-in from a fresh browser profile is "New device", so for a tester the column is all badges; expected behaviour (device cookie), but the badge carries no tooltip saying what "new device" means. | `me-history-card-light.png` |
| UI-10 | Low | Sign-in page (seen on the way in) | A keystroke typed before hydration finishes is dropped (the first letter of the email vanished once, producing a failed attempt for `dmin2@demo-org.test`). Also Playwright `fill()` does not update these controlled inputs reliably (first-char loss / clear not applied); the repo e2e fixture `e2e/fixtures/sign-in.ts` uses `fill()` and may be flaky for the same reason. Not a user-facing bug beyond the first keystroke. | `debug-after-signin.png` |
| UI-11 | Low | My security › Where you're signed in | No cap or paging on the session list (24 rows after this pass); fine for people, noisy for shared test accounts. Consider "and N more" or sort by last active with a limit. | `me-sessions-card-light.png` |
| UI-12 | Low | My security › Sign-in methods | The MFA-required warning says "Your role needs a passkey or an authenticator app" even for plant-hr (HR role, sensitive by policy), which the task brief called "normal staff"; wording is right, but the Login activity page for such a user shows the "Secure your account" banner *above* the "You don't have access" state, two warnings stacked for a page they can't use. | `login-activity-refused-planthr.png` |

Checked and fine: plain English throughout (no jargon, sentence case, verbs on buttons); Segment used for the single-choice history filter (not chips); confirm dialogs name the object ("Sign out Chrome on Windows?", "Unlock recruiter@…?"); destructive Remove is red; step-up copy "Confirm it's you"; recovery codes gated behind "I have saved my recovery codes"; no horizontal scroll at 390 px on either screen in light or dark; focus ring visible on the date input.

## Manual tests MT-2-01…13: still true?

| Test | State | What changed |
|---|---|---|
| MT-2-01 | Stale | Expected lists "Two-step verification (your second steps)"; the card is now **"Sign-in methods"** and there is also a **Password** card. |
| MT-2-02 | Stale | "Click Add a passkey" → now a method card **"Passkey · Recommended"** under "Add a sign-in method"; the list is "Your sign-in methods" and the entry reads "Passkey · <name>" with **Rename**. |
| MT-2-03 | Stale | "Set up authenticator app" → card **"Authenticator app"**; "Turn on" still right. |
| MT-2-04 | Stale | Message is now "You can't remove your only **sign-in method**, because your role needs one. Add another first." and the Remove button is disabled (tooltip "Your role needs at least one"). |
| MT-2-05 | Stale | "New recovery codes (N left)" → **"Make new codes"** under "Recovery codes · N of 10 left"; the codes come with **Copy codes** and **Download** buttons; step-up dialog is "Confirm it's you". |
| MT-2-06 | OK | "Text me a code", "Code from the text", "Verify number", "Verified. Used for sign-in codes…" all match. |
| MT-2-07 | OK | Add: a confirm dialog "Sign out Chrome on Windows?" appears first. |
| MT-2-08 | OK | Add: confirm "Sign out of N other sessions?". |
| MT-2-09 | OK | Segment "Show: All / Successful / Failed". |
| MT-2-10 | Stale | "Result = unsuccessful" is not an option; Result offers Signed in / Failed / Blocked / Wrong second step / Code sent / Unlocked by admin. "Show failed attempts" exists **only** when ≥ 20 failures in 24 h; otherwise the count is a header line. Person filter placeholder is "Everyone". |
| MT-2-11 | OK | Add: a passkey sign-in shows one "Passkey" badge instead of "Two-step". |
| MT-2-12 | Stale | Unlock sits on the newest **Failed** row that started the lock (no "locked attempt" to find, UI-2); reason must be ≥ 10 characters; button reads "Unlock account"; expected should mention the email to the person and the "Unlocked by admin" row that appears. |
| MT-2-13 | OK | Exact text: "You don't have access to login activity · Ask a System Admin to give you access." |

## Stories (tracker/stories/A.json)

Done stories whose acceptance is not visible in the product:

| Story | Gap |
|---|---|
| US-A-020 Admin MFA reset needs a second admin (Done) | API `GET/POST security/mfa-resets`, `/:id/approve` exist (`mfa.controller.ts`), but **no screen** in the web app calls them; a tester cannot request or approve a reset. Needs a Login activity (or People) action, or the story should say "API only". |
| US-A-011 Login history (Done) | Acceptance "admin filters by … 'unsuccessful'" is not literally offered (UI exposes the individual results; `unsuccessful` is used only by the 24-h count and the Me › Security "Failed" filter). Wording only. |
| US-A-012 Account lockout (Done) | Acceptance "admin clicks Unlock on Login activity" is built, but UI-1 (stale Unlock) and UI-2 (no lock marker) make the path hard to test from the screen. |

Built things with no story (or state out of date):

| Built | Story situation |
|---|---|
| Passkey-only sign-in ("Sign in with a passkey" on /yx/sign-in, login events with method `passkey`, "Passkey" badge on sessions) | **US-A-039 is "New"** but the feature is live. Mark Done with evidence or split what is missing. |
| Change password card in Me › Security (email + other devices signed out) | No story; US-A-014 covers password rules only. |
| Passkey rename; recovery codes Copy / Download | No story (US-A-017 covers add + codes shown once). |
| Mobile number verify / remove in Me › Security | US-A-021 covers signing in with a code, not the verify UI. |
| Login activity date-range filter, 24-h failed count + spike banner, "Signed in now" tab count | US-A-036 mentions "failed-login spikes and sessions are listed"; the filters and threshold (20) have no acceptance line. |
| Unlock with reason + step-up + email to the person (W-016 identifier lock cleared too) | US-A-012 has "logged" only; the reason, step-up and email are undocumented in stories. |

## Method notes

- Script: `scratchpad/area2/run.mjs` (full pass), `run2b.mjs` (card screenshots, date filter, calendar, unlock rows), `debug*.mjs` (sign-in diagnosis). Run from `apps/web` with `E2E_BROWSER_CHANNEL=chrome`.
- Accounts used: admin2@demo-org.test (System Admin, "Remind me later") and plant-hr@demo-org.test. No passkey / TOTP enrolled, no password changed, no session of another person signed out, nobody unlocked, no repo e2e suites run, no server restarted.
- Actions with side effects: a refused Change password (wrong current password, once) for admin2; ~20 extra sessions for admin2 and ~5 for plant-hr; one failed login event for the non-account `dmin2@demo-org.test`.
