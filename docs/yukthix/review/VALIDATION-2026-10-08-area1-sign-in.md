# Validation · Area 1 · Sign-in (8 Oct 2026)

Independent, read-only check of what was **planned** (P12, APX-A, APX-D, DESIGN-SYSTEM, GO-LIVE-CHECKLIST, tracker) against what is **built** in `exam-app-org` and what the **live app** does (web :3000, API :3001, Mailpit :8025, mock Google / Microsoft :4010). No code was changed.

## Summary for the founder (10 lines)

1. The sign-in that you asked for on 7 Oct is built and works: work email first, no company code, then password or an emailed code, "Continue with mobile", Google, Microsoft, a passkey button, the company picker, "Signing in to <company> · Not your company?", forgot password, and the "Secure your account" screen with "Remind me later".
2. The security rules behind it (lockout, the W-016 identifier lock, staff never on the company path, no email enumeration, breached passwords, server-side sessions) are in the code and covered by API tests. I could not trigger a lock live (not allowed), so the lock itself is verified from code and tests only.
3. **One serious bug:** in every text box on the sign-in pages (and on the old /login page) the **first letter you type is lost**. Type `admin2@…` and the box shows `dmin2@…`; paste a password and the box empties. React overwrites the field right after the first keystroke. A person who does not notice gets "Wrong email or password" and uses up a lockout try. Fix before anyone tests by hand.
4. **Dark mode:** the sign-in pages ignore the phone or laptop dark setting (`prefers-color-scheme`). The dark palette exists and renders fine when forced, but only the in-app profile menu can switch it, which you cannot reach before signing in.
5. The screens follow the design system: tokens only (no hard-coded colours), bordered secondary buttons, pointer cursor, hover tint, a 2 px Azure focus ring, no layout jump while typing, no sideways scroll at 390 px, plain English without jargon.
6. Small phone-size misses: the email box is 42 px and the small buttons ("Change", "Email me a code instead", "Remind me later") are 32 px, under the 44 px touch rule.
7. Emails are right: the code email carries only the code, purpose and 5-minute expiry; the reset link says 15 minutes; the new-device email names time, device and IP. Lock email exists in code.
8. Of the 25 manual tests, **9 are stale**: they still say "Invalid credentials", "Set up two-step verification", "Show the QR code", "Use a different email or number", "Your YukthiX sign-in code", and three say "may still be in progress" for things that are finished.
9. Tracker: three stories marked **New** are actually built and tested (US-A-034 staff never in picker, US-A-035 domain re-check, US-A-039 passkey-only sign-in); three deferred rows (D-046, D-050, D-075) are now wrong. "Continue with Google / Microsoft" and the W-016 identifier lock have no story at all.
10. Deliberately left for launch and still open (correctly): Turnstile bot check, new-country alerts, real SMS / WhatsApp, company sub-domains, WhatsApp codes, log purge after 1 year.

**Counts (53 checklist rows):** ✅ 37 · ⚠️ 8 · ❌ 2 · 🔄 5 (plus 3 ✅ rows with a 🔄 launch part: 12, 14, 24; row 49 out of scope)

## Method

1. Built a checklist from P12 (YX-IAM-01…11, §6 flow 1, decisions Q1/Q2/Q8/W-016, 7 Oct passkey row), APX-A (sign-in emails), APX-D (sign-in has no screen row of its own; the 7 Oct spec lives in GO-LIVE-CHECKLIST §"Sign-in without a company code" and in code comments), DESIGN-SYSTEM §0/§15/§16/§34/§36/§44, GO-LIVE-CHECKLIST, `tracker/stories/A.json` (step 1), `tracker/manual-tests.json` (MT-1-01…25), `tracker/deferred.json`.
2. Read the code: `apps/api/src/auth/**` (auth.service, sso.controller, social.controller, otp.*, login-protection.service, mfa.service, password-policy.service, sessions.service), `apps/web/app/yx/sign-in`, `setup-mfa`, `lib/hooks/useYxSignIn.ts`, `lib/yx-auth-messages.ts`, `packages/yx-ui/src/screens/auth/{sign-in,mfa,kit}.tsx`, `auth.css`, `components/choice.tsx`, `segment.tsx`, `forms.css`, `actions.css`; the tests next to them and `apps/api/test/*sign-in*|lockout|protection|passkey|social|otp*.e2e-spec.ts`.
3. Live pass with Playwright + installed Chrome (`scratchpad/area1/run.mjs`, `social.mjs`, `social2.mjs`, `typing*.mjs`; screenshots in `C:/Users/HARISI~1/AppData/Local/Temp/claude/C--/800d195d-d61e-4425-b6f7-376b14b42c3d/scratchpad/area1/`). Accounts used: admin2@demo-org.test, admin@ganga-textiles.test, consultant@sharma-advisory.test, recruiter@demo-org.test (forgot-password only, reset not completed), nobody@demo-org.test (one wrong password). No MFA enrolled, no settings changed, no lock triggered, no e2e suite run against :3000/:3001.
4. Desktop 1280 px and 390 px phone, light and `prefers-color-scheme: dark`; computed-style probes for cursor, border, hover, focus ring, inline colours, horizontal scroll, layout shift while typing.

## Checklist · planned → built → verified → verdict

| # | Planned (doc) | Built (file / route) | Verified by | Verdict |
|---|---|---|---|---|
| 1 | Work email first, no company code; "or" then passkey, mobile, Microsoft, Google, each only when on (7 Oct; GO-LIVE §Sign-in) | `sign-in.tsx:89-192`; `GET /auth/sign-in-options` (`social.controller.ts:40`) | Live: screen shows exactly these in that order (`01-identify-desktop-light.png`); `auth.test.tsx:44-91` | ✅ |
| 2 | `POST /auth/identify` answers from company + domain only, never from whether an account exists (YX-IAM-07) | `sso.controller.ts:35-57` | Live: nobody@demo-org.test reaches the password step like a real email (`14-wrong-password.png`); `email-first-sign-in.e2e-spec.ts:180,192` | ✅ |
| 3 | Password step: email shown with "Change", "Email me a code instead" only where the company allows email codes, "Forgot your password?" | `sign-in.tsx:211-231` | Live (`02-password-step.png`); `auth.test.tsx:139-163` | ✅ |
| 4 | Wrong password and unknown email read the same; plain words | `yx-auth-messages.ts:12-15` → "Wrong email or password. Try again." | Live (`14-wrong-password.png`); `yx-auth-messages.test.ts:28` | ✅ |
| 5 | Email code: sent at once, 5-minute expiry, email carries only code, purpose, expiry (YX-NTF-13, APX-A §2.22) | `otp.controller.ts:35,44`; `account-emails.ts:239` | Live: Mailpit "939530 is your YukthiX sign-in code", body = code + "sign in to Kaveri Foods" + "works once and expires in 5 minutes" + safety note; code signed admin2 in (`03-code-step.png`) | ✅ |
| 6 | Code screen says "If <email> can sign in by code, we sent it…" (no enumeration), "Send a new code" | `sign-in.tsx:233-250` | Live (run 1 text) | ✅ |
| 7 | Company picker only after the credential verified, name + logo only, one-use device-bound selection token (US-A-031, YX-IAM-07) | `auth.service.ts:491-542`; `POST /auth/staff/select-company` | Live: consultant → "Choose your company" Kaveri Foods / Ganga Textiles → picked → signed in (`08-choose-company.png`, `09-after-pick-company.png`); `email-first-sign-in.e2e-spec.ts:211-266` | ✅ |
| 8 | Picker also after Google / Microsoft and after a code | `auth.service.ts:1045-1046`, `:553` test | Live via mock Google with consultant → picker (`51-after-google.png`); e2e `:553` | ✅ |
| 9 | Remembered company: HttpOnly signed `yx_company` (180 d), "Signing in to <company>", "Not your company?" forgets it (GO-LIVE §Remembered company) | `GET/DELETE /auth/remembered-company` (`auth.controller.ts:105,115`); `sign-in.tsx:146-152` | Live: cookies `yx_company(httpOnly)`; "Signing in to Ganga Textiles · Not your company?" → general screen (`40-`, `41-*.png`); e2e `:503,519` | ✅ |
| 10 | Company from the web address (`YX_BASE_DOMAIN`), never `X-Forwarded-Host` | `company-scope.ts`; e2e `:478,488` | Code + `company-scope.spec.ts`; not live (no base domain locally, GO-LIVE 11) | 🔄 GO-LIVE 11 |
| 11 | Email domain → SSO only when verified by exactly one company; public domains never; re-check daily, lapse after 3 misses | `sso.service.routeByVerifiedDomain`; e2e `:596-666`; seed has verified + lapsed domains | Code + e2e; Settings UI is Area 4 | ✅ |
| 12 | Continue with Google / Microsoft (YukthiX's own OAuth apps; mock IdP locally; buttons hidden until configured; per-company switch) | `social.controller.ts:69-116`; `social-sign-in.ts` | Live: both redirect to the mock IdP; consultant → picker; "No YukthiX account" and "YukthiX staff" → one neutral message "We couldn't sign you in with that account…" (`52-google-refused-*.png`); `social-sign-in.e2e-spec.ts` | ✅ (real OAuth apps 🔄 GO-LIVE 6) |
| 13 | A company's own Google / Entra provider replaces YukthiX's button | `sign-in.tsx:96-97` | `auth.test.tsx:91` | ✅ |
| 14 | Continue with mobile: number → code by SMS or WhatsApp; India default | `sign-in.tsx:194-209`; `POST /auth/otp/start` with channel | Live (`15-mobile-step.png`); `otp-sign-in.e2e-spec.ts`; texts go to the dev sink | ✅ UI / 🔄 real SMS (GO-LIVE 4), WhatsApp (US-A-026 New, D-080) |
| 15 | YX-IAM-03 passkey as a sign-in method: "Sign in with a passkey" + browser autofill, AAL2, no password | `useYxSignIn.ts:171-262`; `POST /auth/passkey/verify` (`auth.controller.ts:95`) | Button shown live; `passkey-sign-in.e2e-spec.ts` ("passwordless, AAL2"); not exercised live (no passkey on allowed accounts) | ✅ |
| 16 | YX-IAM-01 / §6 flow 1: sensitive role → "Secure your account", passkey recommended, TOTP alternative, 14-day grace, recovery codes once | `mfa.tsx:94-149`; `setup-mfa/page.tsx`; `mfa.service.isSensitive` | Live: admin2 → `/yx/setup-mfa` "Set it up by 21 Oct 2026" (14 d) → Remind me later → directory with the "Secure your account" banner (`04-`, `05-*.png`); `auth.test.tsx:357-385`; `mfa.e2e-spec.ts` | ✅ |
| 17 | YX-IAM-03: OTP never the sole second factor for System / Payroll Admin; staff security key only | `packages/shared/src/auth/mfa.ts:44-52`; `auth.service.ts:626,1114` | Code + `mfa.service.spec.ts`; staff hardware-key-only still open per D-074 | ⚠️ staff key class not enforced (D-074) |
| 18 | "Confirm it's you" second step: method cards passkey first, recovery code last, "Start again" | `mfa.tsx:20-26`, `kit.tsx:155-237` | `auth.test.tsx:309-351`; not live (no MFA account allowed) | ✅ |
| 19 | YX-IAM-07 lockout: 10 failures → 15 min, doubling to 24 h; per-IP 30 / 15 min; progressive delay; person emailed | `login-protection.service.ts:14-35,67-74`; `sessions.service.ts:459` lock email | `account-lockout.e2e-spec.ts:175-271`; `login-protection.service.spec.ts`; not triggered live (forbidden) | ✅ |
| 20 | W-016 identifier lock: one 429 answer on every company path, with or without company; a sign-in clears it; break-glass exempt | `login-protection.service.ts:38-50`; `auth.service.ts:288,335,444,857,965,1150` | `email-first-sign-in.e2e-spec.ts:409-475` | ✅ |
| 21 | Lock message counts down the real wait on screen | `useYxSignIn.ts:74-88,228`; `yx-auth-messages.ts:20-35` ("Too many tries. Try again in 14 min 59 sec.") | `yx-auth-messages.test.ts:16`; not live | ✅ |
| 22 | Sign-in throttle per IP + identifier, higher per-IP ceiling | `credential-throttler.guard.ts:55` | `credential-throttler.guard.spec.ts` | ✅ |
| 23 | Bot challenge (Turnstile) on public login / OTP under attack | `bot-challenge.ts` (API) + `lib/bot-challenge.ts` (web, inert until site key) | Code; `bot-challenge.spec.ts` | 🔄 GO-LIVE 2 |
| 24 | New-device and new-country alerts | `account-emails.ts:292`; geo header `GEO_COUNTRY_HEADER` | Live: Mailpit "New sign-in to your YukthiX account" (time, Chrome on Windows, "This computer") | ✅ device / 🔄 country (GO-LIVE 3, D-060) |
| 25 | YX-IAM-08: ≥ 12 chars, breached-password check, argon2, no rotation; reset link 15 min | `password-policy.service.ts`; `ResetPasswordScreen` subtitle; `account-emails.ts:257` | Live: reset email "works once and expires in 15 minutes" (reset not completed); `password-policy.service.spec.ts` | ✅ |
| 26 | Forgot password by work email only, same answer whether or not an account exists | `POST /auth/forgot-password`; `sign-in.tsx:304-328` | Live (`10-`, `11-forgot-sent.png`): "If recruiter@… has a YukthiX account, we sent it a reset link. With accounts in more than one company, each gets its own link." | ✅ |
| 27 | Staff (super_admin) never reachable through the company sign-in; `POST /auth/platform/login` only; never in the picker | `auth.service.ts:227-250,391-409,433,740,1060,1086` | `email-first-sign-in.e2e-spec.ts:268-380`; live: mock-Google staff refused neutrally | ✅ (story US-A-034 still "New" — see gaps) |
| 28 | YX-IAM-04 SSO-only + ≥ 2 break-glass, alerts all admins; SSO-only turns off passkey sign-in | `security-policy.service.ts`; `sso.service.ts` | `saml-sso.e2e-spec.ts`, `sso.service.spec.ts`; break-glass MFA check at save still open (D-079) | ⚠️ D-079 |
| 29 | YX-IAM-06 server-side sessions, idle / absolute limits; sign-out kills tokens | `sessions.service.ts`; `POST /auth/logout` | Live: sign out → back at sign-in with company remembered (`07-after-sign-out.png`); `login-sessions.e2e-spec.ts` | ✅ |
| 30 | YX-IAM-10 every attempt logged (`login_events`) | `sessions.service.ts`; `auth.service.rejectLogin` | `login-sessions.e2e-spec.ts`; Login activity screen is Area 2 | ✅ |
| 31 | YX-IAM-02 step-up, 15 min window; OTP never counts | `step-up.decorator.ts`; `mfa.controller.ts:135-150`; `StepUpDialog` | `mfa.e2e-spec.ts`; not Area 1 live | ✅ |
| 32 | YX-IAM-05 JIT from allowed domains, never a sensitive role | `sso.service.ts`, `oidc.service.ts` | `sso-oidc.e2e-spec.ts` | ✅ |
| 33 | YX-IAM-11 recovery: second admin, codes single-use; identity re-verification | `mfa-reset.service.ts` | `mfa.e2e-spec.ts`; re-verification not built | ⚠️ US-A-038 New (D-077) |
| 34 | SCIM deprovisioning (Q2) | — | — | 🔄 Q2: wave 3 |
| 35 | YX-SECOPS-07 keep login logs ≥ 1 year, purge job | — | — | 🔄 US-A-040 New, D-063 |
| 36 | YX-IAM-09 IP allow-lists (desk / admin / API) | `staffDeskIpAllowed` (`auth.service.ts:671`) | `permissions.guard.spec.ts`, `api-key-auth.guard.spec.ts` | ✅ (settings UI = Area 4) |
| 37 | After the first deploy everyone signs in again (GO-LIVE 9) | — | — | 🔄 GO-LIVE 9 |
| 38 | DESIGN §15: every text button has a border or fill; one primary per view | `actions.css:26-27`, `tokens.css:249` | Live probe: all secondary buttons `1px rgb(125,140,163)` border, primary Azure fill; only icon-only "Show password" borderless | ✅ |
| 39 | DESIGN §15: hover = tint only, pointer, 2 px Azure focus ring | `actions.css`, `forms.css:106-109` | Live: hover bg `rgb(243,245,247)`, cursor pointer, focus `solid 2px rgb(59,95,227)` on every button and card | ✅ |
| 40 | DESIGN §41/§44: tokens only, no raw colours | `auth.css` (all `var(--yx-*)`) | Live: zero inline hex / rgb styles; grep of `auth.css` | ✅ |
| 41 | DESIGN §44 item 5 / §36: works at 375–390 px, 44 px mobile targets, no sideways scroll | `auth.css:6`, `forms.css:117` | Live 390 px: no horizontal scroll on any step; main buttons 44 px; **email input 42 px, small buttons 32 px** | ⚠️ targets |
| 42 | Dark mode (DESIGN §3), `prefers-color-scheme` | `tokens.css:206 [data-theme="dark"]` only; theme set by `ProfileMenu` after sign-in | Live: with OS dark the sign-in stays white (`30-identify-desktop-dark.png`, `20-identify-390-dark.png`); forced `data-theme=dark` renders `rgb(17,26,43)` correctly (`32-*.png`) | ❌ |
| 43 | Single-choice uses the Segment control (founder rule) | Sign-in methods and "Confirm it's you" use `MethodCards` (pick-one-and-go, documented in `choice.tsx:166-169`); SMS vs WhatsApp on the mobile step = two action buttons | Live (`15-mobile-step.png`, `04-setup-mfa…png`) | ⚠️ acceptable as actions; note the WhatsApp pair |
| 44 | DESIGN §34 plain English, no jargon, errors say what to do | All strings in `sign-in.tsx`, `kit.tsx`, `yx-auth-messages.ts` | Live read of every step | ✅ |
| 45 | No layout jump while typing | — | Live: `main` box identical before / after typing on email and password steps | ✅ |
| 46 | DESIGN §15 "disabled only when unavoidable" | Continue / Sign in / Text me a code disabled until the field is filled | Live | ⚠️ Low |
| 47 | First keystroke must not be lost (basic form behaviour) | React controlled inputs app-wide | Live, headed and headless Chrome: first character of **every** field lost; `fill()` wiped | ❌ |
| 48 | APX-D lists the sign-in screens | APX-D has no sign-in / setup-mfa / picker rows (only PLT-01 shell, MOB-01) | Doc grep | ⚠️ doc gap |
| 49 | Me › Security (P12 §7) | `me-security.tsx` | Area 2, not validated here | — |
| 50 | Staff sign-in page `/staff/sign-in` (YX-IAM-03, GO-LIVE) | `StaffSignInScreen` + `POST /auth/platform/login` | `auth.test.tsx:271`; e2e `:346`; not live | ✅ |
| 51 | Unauthenticated sign-in page must not call `/auth/refresh` | `auth-context.tsx` refreshes on mount; sign-in page logs a 401 every load | Live console: `401 /auth/refresh` on every visit (3× per Google round trip) | ⚠️ Low |
| 52 | OTP sends: per-identifier cap, 429 | `otp.service.ts:99-102` | `otp.service.spec.ts` | ✅ |
| 53 | Options load retried with backoff, "Try again" line | `useYxSignIn.ts:96-106`, `sign-in.tsx:130-137` | Code + unit test | ✅ |

## UI findings

| Sev | Screen | What's wrong | Evidence |
|---|---|---|---|
| **High** | Every sign-in step, forgot password, old /login | **First character typed into any field is lost; a pasted / autofilled value is wiped.** Repro (headed Chrome too): click Work email, type `admin2@demo-org.test` → field shows `dmin2@demo-org.test`; password field after `fill('Secret123!')` → empty. Trace: React `commitUpdate → updateInput` writes `''` to the input between the browser inserting the character and React's `onChange` (`typing5.mjs`). The user then gets "Wrong email or password" and burns a lockout attempt. Not specific to `yx-ui` (old `/login` page too): look at a shared ancestor (`AuthProvider`, root layout, instrumentation) or the Next 16 dev runtime; re-test in a production build. | `typing2.mjs`, `typing4.mjs`, `typing5.mjs` output; `run.mjs` log `identify.firstKeystrokeLost`, `password.firstKeystrokeLost` |
| **Med** | All auth screens | OS dark mode (`prefers-color-scheme: dark`) ignored: page stays white. Dark tokens exist only under `[data-theme="dark"]`, and the switch lives in the post-sign-in profile menu. Need either a `prefers-color-scheme` media block in `tokens.css` or a theme attribute set before sign-in. | `30-identify-desktop-dark.png`, `20-identify-390-dark.png` vs `32-identify-forced-dark-attr.png` |
| **Med** | 390 px: all steps | Touch targets under 44 px: Work email / password / code inputs 42 px; "Change", "Email me a code instead", "Send a new code", "Remind me later" 32 px (`size="sm"`). DESIGN §36: 44 px on mobile. | `m390.*.targets` in `log.json`; `21-password-390-light.png`, `23-setup-mfa-390-light.png` |
| Low | Password / mobile / code steps | Primary button disabled until the field is non-empty (DESIGN §15 prefers enabled + explain). Minor. | `02-password-step.png` |
| Low | Mobile number step | SMS vs WhatsApp offered as two stacked buttons ("Text me a code" primary, "Send a code on WhatsApp" secondary). Works, but once WhatsApp is real a Segment (SMS / WhatsApp) + one "Send me a code" would match the pick-one rule better. | `15-mobile-step.png` |
| Low | Sign-in page load | Console error `401 /auth/refresh` on every visit (AuthProvider refreshes on mount even when signed out); 3 such calls across a Google round trip. Noise in logs and one wasted strict-throttle slot (5/60 s). | console capture in `typing3.mjs`, `social2.mjs` |
| Low | Code step after "Email me a code instead" | Button stays bordered-secondary at 32 px and the step title stays "Sign in"; fine, but a "Check your email" title would say where the person is. | `03-code-step.png` |
| Info | Setup-mfa | "Remind me later" sits below the card as a footer; readable, intentional. Card hover state looked "selected" in screenshot only because the mouse rested there. | `04-setup-mfa-secure-your-account.png` |

Things checked and found right: wording plain and consistent ("Wrong email or password. Try again.", "We couldn't sign you in with that account. Try another way, or ask your admin.", "Your role needs it. Set it up by 21 Oct 2026."), one primary per view, bordered secondaries, hover tint only, pointer cursor, 2 px Azure focus ring on every control including method cards, no inline colours, no horizontal scroll at 390 px, no layout shift while typing, logo + one h1 per screen, "Required" word not an asterisk, Google / Microsoft marks via tokens.

## Stale manual tests (MT-1-*)

| Test | Stale text | Built behaviour |
|---|---|---|
| MT-1-01 | note "New sign-in screen is being built now. May still be in progress." | Built; drop the note. Also expected order on screen is passkey, mobile, Microsoft, Google (passkey missing from the expectation). |
| MT-1-03, MT-1-04, MT-1-06 | expects "Invalid credentials" | Screen says **"Wrong email or password. Try again."** (API still says "Invalid credentials"). |
| MT-1-05 | expects "Too many sign-in attempts. Please wait and try again." | Screen says **"Too many tries. Try again in N min N sec."** counting down (`yx-auth-messages.ts`). Lock email subject is "Sign-in to your YukthiX account was temporarily locked". |
| MT-1-06 | note "Story US-A-034 is still New … May still be in progress." | Built and tested (`email-first-sign-in.e2e-spec.ts:268-380`). |
| MT-1-07 | email "Your YukthiX sign-in code" | Subject is **"<code> is your YukthiX sign-in code"**. |
| MT-1-08, MT-1-15, MT-1-16, MT-1-17, MT-1-18, MT-1-19, MT-1-20 | "New sign-in screen is being built now. May still be in progress." | Built; drop the notes. MT-1-08's "On the older screen the button still shows" no longer applies. |
| MT-1-09 | "Set up two-step verification", "Show the QR code" button, "Two-step verification is on - Last step: keep a way back in." | Title **"Secure your account"**; picking the card goes straight to the QR; recovery-codes title **"Your account is secure"**, subtitle "Last step: keep a way back in." Button is "Turn on", then "Continue". |
| MT-1-10 | 'Choose "Passkey (recommended)" and click "Add a passkey"' | Card "Passkey" with a "Recommended" badge; picking it starts the browser prompt at once (no second button). |
| MT-1-11 | 'On "Set up two-step verification"…', 'yellow banner "Set up two-step verification"' | Title "Secure your account"; banner reads **"Secure your account — Your role needs a passkey or an authenticator app. Set it up by <date>; after that, admin pages pause until you add one. Set it up now"**. |
| MT-1-14 | ' "Start again" takes you back to the first screen' | Correct (footer button); fine. |
| MT-1-21 | "Use a different email or number", "Needs a second company. Mark Blocked if there is none." | Button is **"Sign in another way"**; the seed now has Ganga Textiles + consultant@sharma-advisory.test (and plant-hr@), so the test is runnable: update the account line. |
| MT-1-22 | — | OK (seen live up to the email). |
| MT-1-25 | — | OK (email seen live: "New sign-in to your YukthiX account"). |

## Story gaps (tracker/stories/A.json, step 1)

**Marked Done, acceptance visible:** US-A-010, 011, 012, 013 (bot check and new-country only code-ready, see 🔄), 014, 015, 016, 017, 018, 019, 020, 021, 027, 028, 029, 030, 031, 032, 033, 036, 037 — all have the cited e2e / unit tests present and the behaviour seen live or in code. No Done story whose acceptance is missing.

**Marked New but built (state is stale):**
- **US-A-034** Staff accounts never show in the company picker — built (W-005: `auth.service.ts:391-433,740`, e2e `email-first-sign-in.e2e-spec.ts:268-380`); its third criterion (hardware key required for staff) is still open (D-074). Deferred row D-050 says the opposite of the code and should be closed.
- **US-A-035** Re-check verified email domains regularly — built (`DOMAIN_RECHECK_CRON`, lapse after 3 misses, admins emailed, audit `identity_provider.domain_lapsed`; e2e `:628`; seed has a lapsed domain). D-046 is now wrong.
- **US-A-039** Passkey-only sign-in — built ("Sign in with a passkey" + autofill, `POST /auth/passkey/verify`, `passkey-sign-in.e2e-spec.ts`, login activity reads "Passkey"). D-075 is now wrong.

**Built with no story:**
- "Continue with Google / Microsoft" at YukthiX level (own OAuth apps, mock IdP, per-company switches, neutral refusal, external-identity linking) — `social.controller.ts`, `social-sign-in.ts`, `social-sign-in.e2e-spec.ts`. US-A-027 covers company IdPs only.
- W-016 identifier lock (8 Oct decision) — `login-protection.service.ts:38-50`, e2e `:409-475`; only a P12 decision row, no story / acceptance in the tracker.
- "Continue with mobile" as a first-screen method and the mobile-number step (US-A-021 covers codes, not the entry path).
- Remembered-company cookie "Not your company?" is in US-A-032 ✓; the sign-in-options endpoint with retry/backoff and the "Couldn't load other sign-in methods · Try again" line has none (minor).

**Correctly New / deferred:** US-A-026 WhatsApp codes (D-080), US-A-038 identity re-verification (D-077), US-A-040 log retention purge (D-063).

**Deferred rows to close as superseded:** D-046, D-050, D-075. D-064 ("web app untouched, no Me › Security") is also superseded by US-A-036.

## Deliberately deferred (🔄) — cite

GO-LIVE 2 Turnstile · GO-LIVE 3 new-country alerts (D-060) · GO-LIVE 4/4a SMS provider + DLT (D-080) · GO-LIVE 5 WhatsApp (US-A-026) · GO-LIVE 6 real Google / Microsoft OAuth apps · GO-LIVE 9 sign in again after first deploy · GO-LIVE 11 company sub-domains · P12 Q2 SCIM (wave 3) · US-A-040 / D-063 1-year log purge · D-074 staff hardware-key class · D-079 break-glass MFA check at save.

## Artefacts

Scripts and screenshots: `C:/Users/HARISI~1/AppData/Local/Temp/claude/C--/800d195d-d61e-4425-b6f7-376b14b42c3d/scratchpad/area1/` (`run.mjs`, `social.mjs`, `social2.mjs`, `typing2-5.mjs`, `log.json`, 34 PNGs named as cited above).
