# Security: live pages and their designs (check)

This file checks, story by story, that every Security design sub-page can be reached in the live app. People, Pay,
Time, Performance and Expenses were checked the same way (see `people-design-map.md`, `pay-design-map.md`,
`time-design-map.md`, `performance-design-map.md`, `expenses-design-map.md`). Founder rule: never build a second,
simpler version of a designed screen; make the designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-sec-notif`, from `test/yukthix-main`): every Security design group was already
rendered by a live page with real data; there were no stand-in copies to delete. Reading the code found four gaps,
fixed on this branch:

1. **The step-up dialog was live but the guard could not see it.** `StepUpDialog` is mounted once in the root layout
   by `apps/web/components/auth/StepUpProvider.tsx`; the design-live guard only read `apps/web/app/yx` and `lib`. The
   guard now also reads `apps/web/components/auth`, and `auth: StepUpDialog` leaves the `notLive` list.
2. **Greyed-out buttons and green "Saved" alerts** (founder rules 2 and 3) were still in every Security screen (34
   disabled buttons, 1 success alert). They are gone: pressed too early, the box says what is missing and takes the
   focus; while a request runs, the other buttons do nothing and the form ignores Enter, so no code or request is sent
   twice; Save with nothing changed sends nothing and "No changes yet" shows beside it; "Security settings saved" is a
   toast. The ui-rules guard now covers `screens/auth` so this cannot come back.
3. **Break-glass admins were picked from the first 100 users only.** `GET /users` takes `?role=` (checked against
   `^[a-z_]{1,40}$`, inside the company by RLS and `organizationId`) and the security page asks for `org_admin`.
4. Recovery codes: "Continue" was greyed out until the box was ticked; now pressing it early says "Save the codes,
   then tick this box." and focuses the box.

No sign-in protection changed: rate limits, lock-outs (`retryAfterSeconds`), anti-enumeration answers ("If … can sign
in by code, we sent it …"), step-up for sensitive actions and the audit trail are all on the API and untouched. The
screens only stopped greying buttons out; the API still refuses an empty or bad value.

Verdicts (the same words as the other maps): **live** (the live page renders the designed screen and can reach this
state; the note says how) · **live (gap)** (the design is live, but this state can't be fully reached yet; the note
says why) · **wire design** (a live page exists for this job but renders something else) · **design only, feature
not built** (no API) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Signing in (SEC-01, Confirm it's you, SEC-02) | 3 | 56 | 0 | 0 | 0 | 0 | 56 |
| B. Security settings and my security (Admin, Single sign-on providers, My security) | 3 | 39 | 0 | 0 | 0 | 0 | 39 |
| **All Security groups (A–B)** | **6** | **95** | **0** | **0** | **0** | **0** | **95** |

Counted by the script in the appendix, 3 Nov 2026, on `feat/yukthix-sec-notif`: every `export const` story in the six
`Screens/Security/...` story files against the rows in section 4. The lead's "about 95" is exact. Phone stories are
counted as live: they are the same designed screens, which lay themselves out for a 390 px phone (no separate phone
component, so nothing for a mobile app to wait on).

## How it is wired

- Unlike Expenses and Performance, the Security screens were built prop-driven from the start: each designed screen
  (`SignInScreen`, `MfaChallengeScreen`, `MfaEnrolScreen`, `StepUpDialog`, `MeSecurityScreen`, `LoginActivityScreen`,
  `SecuritySettingsScreen`, `IdentityProvidersScreen`, `LegalNoticeScreen`, `ForgotPasswordScreen`,
  `ResetPasswordScreen`) takes `state`, data and the actions; the live page passes real data and the stories pass
  samples. There is no `live` prop and no `live/` copy to remove.
- Loading, error and no-access come from the page: a plain 403 is the kit's no-access state; `MFA_REQUIRED` is the
  MFA floor, which the layout explains (never "check your connection").
- Step-up: when the API answers `STEP_UP_REQUIRED`, `apiFetch` asks `StepUpProvider` (root layout), which opens the
  designed `StepUpDialog`; requests waiting for it share one prompt and are sent again after the proof.
- Codes, passwords and TOTP seeds never go into a URL, log, story or test snapshot: the social sign-in code comes back
  in the URL fragment and is wiped on first read; the TOTP seed is shown once in the dialog and copied by the person;
  recovery codes are downloaded as a file made in the browser.

## 1. Live pages

| page | screen it renders | design | API (permission) | verdict |
|---|---|---|---|---|
| /yx/sign-in, /yx/sign-in/callback | `SignInScreen`, then `MfaChallengeScreen` when the account has a second step | SEC-01 | `GET auth/sign-in-options`, `GET/DELETE auth/remembered-company`, `POST auth/identify`, `auth/login`, `auth/otp/*`, `auth/passkey/*`, social and SSO redirects (public, rate-limited, anti-enumeration) | live |
| /yx/forgot-password, /yx/reset-password/[token] | `ForgotPasswordScreen`, `ResetPasswordScreen` | SEC-01 | `POST auth/forgot-password`, `POST auth/reset-password` (public, rate-limited) | live |
| /yx/setup-mfa | `MfaEnrolScreen` (then `RecoveryCodes`) | SEC-01, Confirm it's you | `GET auth/mfa`, passkey and TOTP enrolment (signed in) | live |
| every page (root layout) | `StepUpDialog` when the API asks for it | Confirm it's you | `GET auth/mfa`, `POST auth/mfa/step-up`, `POST auth/mfa/step-up/passkey-options` (signed in) | live |
| /yx/legal/[doc] | `LegalNoticeScreen` (privacy, terms, accessibility, grievance, open-source) | SEC-02 | none (static; contact from `NEXT_PUBLIC_YX_PRIVACY_EMAIL`) | live |
| /yx/me/security | `MeSecurityScreen` | My security | `GET auth/mfa`, `auth/sessions`, `auth/login-history`; factor remove/rename, recovery codes, mobile number (step-up), sessions, `POST users/me/change-password` (own account) | live |
| /yx/admin/login-activity | `LoginActivityScreen` | Admin · Login activity | `GET security/login-events` (`audit:view`), `GET security/sessions`, `DELETE security/sessions/:id`, `POST security/users/:id/unlock` (`org:manage_users`, step-up, reason) | live |
| /yx/settings/security | `SecuritySettingsScreen` | Admin · 2.3 Security | `GET/PATCH security/policy` (`org:manage_settings`; PATCH step-up; the API re-checks every value against the floor), `GET security/identity-providers` and domains (`org:manage_settings`), verify a domain (`org:manage_settings` + `org:manage_users`, step-up), `GET users?role=org_admin` (`org:view`, as before) | live |
| /yx/settings/identity-providers | `IdentityProvidersScreen` | Single sign-on providers | `GET security/identity-providers` (`org:manage_settings`); `POST/PATCH/DELETE` (`org:manage_settings` + `org:manage_users`, step-up; secrets write-only) | live |

## 2. Live Security pages with no design (stand-in copies still)

None. The design-live guard lists no Security (`auth`) screen under `liveCopies` or `notLive`.

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| SEC-01 "language picked (हिन्दी)" (1 story) | Hindi wording for the sign-in pages, and the person's language kept (P04 Q4). Until then the live page shows no picker: a picker that changes nothing would mislead. | M (wording + `AuthLanguageContext` provider on the sign-in pages + storing the choice) |

## 4. Design groups, story by story

### A. Signing in (SEC-01, Confirm it's you, SEC-02)

#### SEC-01 · Sign in

Live pages: /yx/sign-in (and /callback), /yx/forgot-password, /yx/reset-password/[token], /yx/setup-mfa. `useYxSignIn`
drives the steps from the API's answers; `GET auth/sign-in-options` decides which ways in show.

| story (sub-page) | verdict | note |
|---|---|---|
| Identify · Sign in · work email, or another way | live | every way on: passkey first (where the browser can), then mobile, Microsoft, Google, then the work email |
| IdentifyEmailOnly · Sign in · work email only (no other way set up) | live | options all off (or not loaded: the quiet "Try again" line) |
| IdentifySomeWays · Sign in · company allows mobile only | live | the company's `security/policy` turns the others off; options come per company |
| Mobile · Sign in · mobile number | live | "Mobile"; this branch: "Text me a code" pressed with no number says "Enter your mobile number." and focuses the box |
| MobileWhatsApp · Sign in · mobile number, WhatsApp only | live | SMS off, WhatsApp on in the company policy |
| MobileCode · Sign in · mobile code sent | live | the answer never says whether the number has an account |
| RedirectingProvider · Sign in · going to the provider | live | Google / Microsoft redirect |
| SignInFailed · Sign in · provider sign-in refused | live | back on /callback with "it did not work" in the fragment (`SOCIAL_FAILED`) |
| PhoneWays · Sign in · phone, all ways | live | the same screen at 390 px |
| PhoneMobile · Sign in · phone, mobile number | live | as above |
| Remembered · Sign in · remembered company | live | `GET auth/remembered-company` (HttpOnly cookie); "Not your company?" forgets it |
| Password · Sign in · password | live | the company allows passwords; pressed with no password: "Enter your password." |
| PasswordNoEmailCode · Sign in · password, email codes off | live | `emailCode: false` in the company options hides "Email me a code instead" |
| CodeSent · Sign in · code sent | live | same anti-enumeration wording as mobile |
| Redirecting · Sign in · SSO required (going to the company sign-in page) | live | verified email domain or SSO-only company |
| ChooseCompany · Sign in · choose your company | live | an email with accounts in several companies |
| Loading · Sign in · signing in | live | `busy`: the pressed button shows loading; the others do nothing until it ends |
| Error · Sign in · wrong password | live | "Invalid email or password." (no hint which) |
| Phone · Sign in · phone | live | as Remembered, 390 px |
| PhoneChoose · Sign in · choose your company, phone | live | as ChooseCompany, 390 px |
| ForgotPassword · Forgot password · work email only | live | /yx/forgot-password; pressed with no email: "Enter your work email." |
| ForgotPasswordSent · Forgot password · link sent | live | the same answer whether or not the account exists |
| ResetPassword · Reset password · new password | live | /yx/reset-password/[token]; the token stays in the path, never logged by the page |
| ResetPasswordExpired · Reset password · link expired | live | API refusal, with "Get a new link" |
| ResetPasswordDone · Reset password · done | live | all sessions signed out by the API |
| Challenge · Confirm it's you · several ways (cards) | live | `MfaChallengeScreen` after a first step for an enrolled account |
| ChallengeAppOnly · Confirm it's you · authenticator app only | live | one factor: straight into it; Confirm with no code now says "Enter the 6-digit code." |
| ChallengeError · Confirm it's you · wrong code | live | API refusal, rate-limited |
| ChallengePhone · Confirm it's you · phone | live | 390 px |
| Enrol · First sign-in · secure your account | live | /yx/setup-mfa with the role's deadline (`enrolmentDueAt`) |
| EnrolOverdue · First sign-in · secure your account (deadline passed) | live | past the deadline sensitive actions are paused by the API |
| EnrolError · First sign-in · passkey failed | live | browser prompt cancelled |
| EnrolPhone · First sign-in · phone | live | 390 px |
| EnrolAppOnly · First sign-in · company allows authenticator apps only | live | `allowedFactors` from the company policy (staff: passkey only) |
| IdentifyNoPasskey · Sign in · company does not allow passkeys | live | `passkey: false` in the options |
| PasskeyWaiting · Sign in · passkey prompt open | live | `busy` while the browser prompt is open |
| PasskeyFailed · Sign in · passkey refused | live | `PASSKEY_FAILED` |
| MobileWrongCode · Sign in · mobile code, wrong code | live | API refusal |
| MobileLocked · Sign in · mobile code, locked after too many tries | live | the API's `retryAfterSeconds` in words ("Try again in 14 min 32 sec.") |
| PasswordLocked · Sign in · password, locked after too many tries | live | as above, from the login lock-out |
| PausedForBlockLeave · Sign in · access paused for block leave | live | TIM-39: `paused-access.ts` answers only after the password or code is right |
| Hindi · Sign in · language picked (हिन्दी) | live | founder answer 1: the sign-in pages are written in English and Hindi (`words.ts`, Hindi needs native review before go-live); the picker offers both, English is the default, the choice is kept on this device (`yx.signInLanguage`) |

#### Confirm it’s you

Live: the step-up dialog on every page (root layout, `StepUpProvider`); recovery codes after enrolment (/yx/setup-mfa)
and from My security ("Make new codes", a step-up action).

| story (sub-page) | verdict | note |
|---|---|---|
| StepUp · Step-up · passkey and app | live | any action the API marks `@RequireStepUp` (unlock, save security settings, SMS accounts, identity providers, remove a factor, new recovery codes, mobile number) |
| StepUpLoading · Step-up · loading | live | while `GET auth/mfa` loads |
| StepUpNoFactor · Step-up · nothing set up | live | the link goes to /yx/me/security |
| StepUpError · Step-up · wrong code | live | API refusal; Confirm with no code says what is missing |
| StepUpPhone · Step-up · phone | live | 390 px |
| Codes · Recovery codes · shown once | live | after the first factor; Continue pressed before ticking the box says "Save the codes, then tick this box." |
| CodesPhone · Recovery codes · phone | live | 390 px |

#### SEC-02 · Legal notices

Live page: /yx/legal/[doc] (privacy, terms, accessibility, grievance, open-source), linked from every sign-in page.

| story (sub-page) | verdict | note |
|---|---|---|
| Privacy · Privacy notice | live | with the contact email when `NEXT_PUBLIC_YX_PRIVACY_EMAIL` is set |
| PrivacyNoContact · Privacy notice · contact not published yet | live | today's state: the variable is not set (question 2) |
| Terms · Terms of use | live | /yx/legal/terms |
| Accessibility · Accessibility statement | live | /yx/legal/accessibility |
| Grievance · Grievance officer | live | /yx/legal/grievance |
| OpenSource · Open-source notices | live | from `lib/open-source-notices.json` |
| Phone · Grievance officer · phone | live | 390 px |

### B. Security settings and my security

#### Admin

Live pages: /yx/admin/login-activity and /yx/settings/security (menu Settings › People & Access › Security).

| story (sub-page) | verdict | note |
|---|---|---|
| LoginActivity · Login activity · attempts | live | filters (result, method, person searched on the API, dates), 25 a page |
| LoginActivityUnlock · Login activity · unlock a locked account | live | Unlock shows only with `org:manage_users` (the sessions tab loaded); reason asked; step-up |
| LoginActivityUnlockRefused · Login activity · unlock refused | live | API refusal stays in the dialog |
| LoginActivitySpike · Login activity · many failed attempts | live | failed attempts in the last 24 h (`FAILED_SPIKE_AT`) |
| LoginActivitySessions · Login activity · signed in now | live | `GET security/sessions`; sign a session out |
| LoginActivityLoading · Login activity · loading | live | first load |
| LoginActivityError · Login activity · could not load | live | Retry refetches |
| LoginActivityEmpty · Login activity · nothing yet | live | a new company |
| LoginActivityPhone · Login activity · phone | live | table becomes cards |
| LoginActivitySessionsPhone · Login activity · signed in now · phone | live | as above |
| SecuritySettings · 2.3 Security | live | the policy and YukthiX's floor; Save is step-up; this branch: "Security settings saved" toast, Save with no change says "No changes yet" |
| SecuritySettingsSsoOnly · 2.3 Security · single sign-on only | live | needs an active provider; emergency admins now picked from every `org_admin` (`GET users?role=org_admin`), not the first 100 users |
| SecuritySettingsStrictLockout · 2.3 Security · strict lockout | live | lock-out values within the floor |
| SecuritySettingsSaveFails · 2.3 Security · save refused | live | the API's refusal (e.g. a bad IP range) stays on the page |
| SecuritySettingsDomains · 2.3 Security · email domains to verify | live | `security/identity-providers/domains`, Check record; lapsed domains |
| SecuritySettingsNoProviders · 2.3 Security · no identity providers | live | link to /yx/settings/identity-providers |
| SecuritySettingsLoading · 2.3 Security · loading | live | |
| SecuritySettingsError · 2.3 Security · could not load | live | Retry |
| SecuritySettingsNoAccess · 2.3 Security · no access | live | 403 without `MFA_REQUIRED` |
| SecuritySettingsPhone · 2.3 Security · phone | live | 390 px |

#### Single sign-on providers

Live page: /yx/settings/identity-providers. The page says "saved", "added", "on/off" and "removed" with toasts.

| story (sub-page) | verdict | note |
|---|---|---|
| Providers · Providers · one on, one off | live | metadata URL from the company slug, redirect URI |
| ProvidersEmpty · Providers · none yet | live | |
| ProvidersLoading · Providers · loading | live | |
| ProvidersError · Providers · could not load | live | |
| ProvidersNoAccess · Providers · no access | live | 403 |
| TurnOnFailed · Turn on · refused | live | API refusal (e.g. no certificate); while one toggles, the others do nothing (no greyed-out buttons) |
| Remove · Remove · confirm | live | confirm dialog, step-up |
| Add · Add a provider · open | live | |
| AddMissing · Add a provider · Add pressed with nothing filled | live | field errors and the summary |
| Edit · Edit a provider · Google, secret saved | live | secrets write-only ("saved", never shown) |
| EditFailed · Edit a provider · the server refuses | live | stays in the drawer |

#### My security

Live page: /yx/me/security (Me menu).

| story (sub-page) | verdict | note |
|---|---|---|
| Default · My security | live | sign-in methods, recovery codes, mobile number, password, sessions, history; Remove on the only method a role needs now says why out loud instead of greying out |
| NotSetUp · My security · second step not set up | live | role needs one, none yet: the deadline line |
| Loading · My security · loading | live | |
| Error · My security · could not load | live | |
| HistoryError · My security · history could not load | live | `GET auth/login-history` fails alone |
| Empty · My security · nothing yet | live | |
| Phone · My security · phone | live | 390 px |
| Tablet · My security · tablet | live | 768 px |

## 5. Rules built (and where they come from)

| rule | source | where |
|---|---|---|
| No disabled Button in a Security screen; pressed too early, the field error shows and the field takes focus | founder rule 3 (BUILD-STANDARD §0) | `screens/auth/*` with `useTooEarly`; ui-rules guard (b) now covers `auth` |
| While a request runs, other buttons and Enter do nothing (no second code or request) | product default (security: no double OTP sends) | `sign-in.tsx` `idle()`, `busy` checks in every form |
| Success is a toast (5 s); refusals stay inline | founder rule 2 | `security-settings.tsx`; the identity-providers page already toasted |
| Emergency (break-glass) admins come from all active `org_admin` users | product (P12 Q8) | `GET users?role=` + `settings/security/page.tsx` |
| Every value checked again on the API against YukthiX's floor; step-up to save; audit | P12 §7, ASVS L2 | unchanged (`security-policy.service.ts`) |

Company policy choices (all already settings with a default): sign-in ways, passkeys, second-step scope and factors,
lock-out tries and minutes, session limits, password length, IP lists, SSO only, emergency admins.

## 6. Questions for the founder (safe default built)

1. **Sign-in language picker.** The design shows a language picker on the sign-in page; there is no Hindi wording
   yet. Built: no picker until wording exists. Suggested answer: add Hindi (and the other P04 languages) for the
   sign-in pages as one small wording task, then switch the picker on.
2. **Privacy contact.** The privacy and grievance pages say the contact is not published until
   `NEXT_PUBLIC_YX_PRIVACY_EMAIL` is set (APX-G G-23). Suggested answer: set it to the grievance officer's mailbox
   before go-live.

## 7. Left (sizes)

| item | why | size |
|---|---|---|
| SEC-01 Hindi sign-in | wording (question 1) | M |
| PLT-16 Audit log (7 stories, `platform-a: AuditLogScreen`, Platform group) | in the Platform group, not Security; `GET audit-logs` exists, the screen has no `live` path or page yet, and its "chain check" state needs a hash chain the audit table does not have | M (page + live prop), L with the chain |
| PLT-01 Access states (`platform-a: AccessStateScreen`, `AccessStatePhone`) | Platform group; the live pages use the kit's `NoAccessState`. Making the PLT-01 design the no-access state everywhere touches every area | M |

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every
Security story file has exactly one row per story, in file order, with one of the five verdicts.

```js
// node check.js [map] [title prefix]. Defaults: Security. Same script as the Expenses map, for Screens/<area>/... files.
const fs = require('fs');
const path = require('path');
const MAP = process.argv[2] || 'docs/yukthix/security-design-map.md';
const AREA = process.argv[3] || 'Security';
const ROOT = 'packages/yx-ui/src/screens';
const walk = (d) => fs.readdirSync(d).flatMap((n) => (fs.statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
const want = {};
for (const f of walk(ROOT).filter((f) => f.endsWith('.stories.tsx'))) {
  const s = fs.readFileSync(f, 'utf8');
  const t = s.match(new RegExp(`title:\\s*'Screens/${AREA}/([^']+)'`));
  if (t) want[t[1]] = [...s.matchAll(/^export const (\w+)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync(MAP, 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split('## 5.')[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0], c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story file: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = l.split('|')[2].trim(); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story file with no rows: ' + h);
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
```

## Founder answers, 3 Nov 2026 ("go ahead")
(1) Add Hindi wording for the sign-in pages (one wording task, reviewed by a native Hindi reader before go-live), then
switch the language picker on. (2) Before go-live, set `NEXT_PUBLIC_YX_PRIVACY_EMAIL` to the grievance officer's mailbox
(go-live checklist); until then the privacy page says the contact isn't published yet. (3) Retire the PLT-13 Notification
settings design stories; the live Email and SMS designs do the same jobs. An email delivery log, if wanted, is drawn into
the Email design first.

## Hindi sign-in (branch `feat/yukthix-sec-hindi`, 3 Nov 2026)

Founder answers 1 and 2 are built. Recount (script in the appendix): **A. Signing in 56 live of 56; all Security groups
95 live of 95**; nothing left in section 3.

- **Words.** `packages/yx-ui/src/screens/auth/words.ts` holds every sentence a person sees on sign-in (email, mobile,
  password, codes, company choice, SSO and social redirects), "Confirm it's you" (method cards, codes, passkey),
  forgot / reset password, first sign-in set-up (method cards, authenticator QR and key, recovery codes) and the frame
  (staff note, legal notice names), in English and Hindi. The file is marked **NEEDS NATIVE REVIEW BEFORE GO-LIVE**
  (go-live checklist item 31). There was no translation library in the app; the joiner portal's `LanguageSwitcher` is
  the picker the sign-in already drew, so the words are a small typed table (Hindi must have every English key).
- **Errors.** `authError` shows the known API and app sentences in Hindi (wrong password, lock-out with the real wait
  in Hindi units, wrong code, passkey refused, link expired, paused for block leave); an unknown sentence stays in
  English rather than a guess. A wrong password and an unknown email share one English sentence, so they share one
  Hindi sentence; "If … can sign in by code, we sent …" and "If … has a YukthiX account, we sent …" stay conditional
  in Hindi ("अगर … तो …"), so Hindi says no more than English does.
- **Picker.** The live sign-in pages (/yx/sign-in and its callback, /yx/forgot-password, /yx/reset-password/[token],
  /yx/setup-mfa) wrap the screens in `SignInLanguage` (apps/web/lib/sign-in-language.tsx): English by default, the
  picker offers English and हिन्दी only, the choice is kept in this browser's storage (never the account or a cookie)
  and sets the page's `lang`. Blocked storage: English, and the picker still works for that visit.
- **Stays English:** the step-up dialog, My security and every in-app screen (no picker there), and the YukthiX staff
  sign-in. The legal notice pages keep their English text (their link names in the footer follow the picker).
- **Kit first (rule 18):** `TenantPortal` / `LanguageSwitcher` take the languages a page offers (`languages`), and the
  footer notices take names in the page's language (`labels`); tested in `portals.test.tsx`.
- **Privacy contact (answer 2):** go-live checklist item 30 sets `NEXT_PUBLIC_YX_PRIVACY_EMAIL` to the grievance
  officer's mailbox.
