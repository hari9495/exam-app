# Notifications: live pages and their designs (check)

This file checks, story by story, that every Notifications design sub-page can be reached in the live app, the same
way as People, Pay, Time, Performance, Expenses and Security (see the other `*-design-map.md` files). Founder rule:
never build a second, simpler version of a designed screen; make the designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-sec-notif`, from `test/yukthix-main`): both Notifications design groups (Email
and SMS) were already rendered by live pages with real data; there were no stand-in copies. Reading the code found
these gaps, fixed on this branch:

1. **Greyed-out buttons and green "Saved" alerts** (founder rules 2 and 3): 8 disabled buttons and 5 success alerts.
   Now "Branding saved", "Wording saved", "Test sent to …", "SMS settings saved", "<account> saved / added" and "Test
   sent from <account> to …" are toasts; refusals and a test that did not go stay inline. Save or Discard with
   nothing changed does nothing and "No changes yet" shows beside them. "Send test" is never greyed out: pressed
   with no verified number (or on an account that is off) it says why next to that account. The ui-rules guard now
   covers `screens/notifications`.
2. The staff console (/staff/channels, the YukthiX shared SMS account) had no toast host; it now has one, as the
   company app does.
3. Related, in the Platform group: the live Notifications inbox (/yx/notifications, PLT-03) now renders the designed
   phone layout under 768 px; `platform-a: NotificationsInboxPhone` leaves the design-live guard's `notLive` list.

Verdicts: **live** · **live (gap)** + note · **wire design** · **design only, feature not built** + note ·
**phone view, mobile app not built** (meanings as in `expenses-design-map.md`).

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Email and SMS settings (Email, SMS) | 2 | 22 | 0 | 0 | 0 | 0 | 22 |
| **All Notifications groups** | **2** | **22** | **0** | **0** | **0** | **0** | **22** |

Counted by the script in the appendix of `security-design-map.md` (run it as
`node check.js docs/yukthix/notifications-design-map.md Notifications`), 3 Nov 2026, on `feat/yukthix-sec-notif`:
every `export const` story in the two `Screens/Notifications/...` files against the rows in section 4. The lead's
"about 22" is exact.

Related Notifications designs in the **Platform** group (not counted above; their stories are titled
`Screens/Platform/...`):

| design | stories | live page | verdict |
|---|---|---|---|
| PLT-03 · Notifications inbox (desktop) | 6 | /yx/notifications (`NotificationsInboxScreen` live) | live |
| PLT-03 · Notifications · phone | 1 | /yx/notifications under 768 px (this branch) | live |
| PLT-65 · Notification preferences | 5 | /yx/me/notifications (`NotificationPreferencesScreen`) | live |
| PLT-13 · Notification settings (template editor, test sent, channels, delivery log, usage) | 5 | none: the same jobs are done by the newer Email and SMS designs below | design only (question 1) |

## How it is wired

- The two screens are prop-driven (no `live` prop, no `live/` copy): the page passes `state`, the overview from the
  API and the actions; the stories pass samples.
- The API renders every email preview from the draft, so the preview is the real email (sandboxed frame), and checks
  every rule again. SMS account secrets are write-only: the API never returns them; saving an account is step-up.
- A plain 403 shows the kit's no-access state; `MFA_REQUIRED` is the MFA floor that the layout explains.

## 1. Live pages

| page | screen it renders | design | API (permission) | verdict |
|---|---|---|---|---|
| /yx/settings/emails | `EmailSettingsScreen` (list, branding, `EmailEditor` for one email) | Email | `GET notifications/email`, `PUT …/branding`, `PUT/DELETE …/templates/:type`, `POST …/templates/:type/preview`, `POST …/templates/:type/test` (all `notification.template.manage`; the test goes only to the signed-in admin) | live |
| /yx/settings/sms | `SmsSettingsScreen` (policy, own accounts, delivery log) | SMS | `GET notifications/sms`, `PATCH …/policy`, `POST/PATCH/DELETE …/accounts(/:id)` (step-up), `POST …/accounts/:id/test` (to the admin's own verified number only), `GET …/deliveries?before=` (all `org:manage_settings`; account writes also step-up) | live |
| /staff/channels | `SmsSettingsScreen`, scope `platform` (the YukthiX shared account) | SMS | `platform/channels/sms/*` (YukthiX staff, security key) | live |

## 2. Live Notifications pages with no design (stand-in copies still)

None. The design-live guard lists no `notifications` screen.

## 3. Designs with no live page or API

None in the Notifications groups. PLT-13 (Platform group) is the older design of the same jobs (question 1).

## 4. Design groups, story by story

### A. Email and SMS settings

#### Email

Live page: /yx/settings/emails (Settings › Notifications › Emails).

| story (sub-page) | verdict | note |
|---|---|---|
| List · List | live | every email YukthiX sends, "Your wording" / "YukthiX wording", and branding (logo, button colour, sender, reply-to); "Branding saved" is a toast |
| Editor · Editor | live | `?email=<type>` (view in the URL): locked parts, wording, placeholders at the cursor, live preview from the API, Send me a test (toast), reset to YukthiX wording; Save with no change says "No changes yet" |
| Loading · Loading | live | first load |

#### SMS

Live pages: /yx/settings/sms (company) and /staff/channels (YukthiX staff, the shared account).

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · SMS · own accounts, then YukthiX | live | own DLT accounts tried in order, then the shared account |
| SharedOnly · SMS · YukthiX account only (default) | live | the default company policy |
| NothingSends · SMS · shared account off, no accounts | live | warning "No texts will be sent" |
| AtLimit · SMS · monthly limit reached | live | `sms_usage_monthly` against the company's monthly cap |
| NoVerifiedNumber · SMS · send test off (number not verified) | live | the admin has no verified mobile; this branch: Send test is not greyed out, it says why next to the account |
| TestFailed · SMS · test not sent | live | the gateway's refusal, kept inline; a sent test is a toast |
| Platform · SMS · YukthiX shared account (platform staff) | live | /staff/channels |
| Loading · SMS · loading | live | |
| LoadError · SMS · could not load | live | Retry |
| NoAccess · SMS · no access | live | 403 |
| LogLoading · SMS · delivery log loading | live | `GET deliveries` (cursor paging) |
| LogError · SMS · delivery log could not load | live | Retry for the log alone |
| Phone · SMS · phone | live | 390 px: tables become cards |
| PhoneSharedOnly · SMS · YukthiX only · phone | live | as above |
| AddAccount · SMS · add account | live | drawer; "<name> added" toast; step-up |
| EditAccount · SMS · edit account (secrets write-only) | live | secrets never shown, only "saved" |
| EditPendingTemplate · SMS · edit account · template pending | live | DLT template status set by the admin (approved / pending / rejected); only approved templates send |
| SaveRefused · SMS · save refused | live | API refusal stays in the drawer |
| EditorPhone · SMS · edit account · phone | live | 390 px |

## 5. Rules built (and where they come from)

| rule | source | where |
|---|---|---|
| No disabled Button; Save / Discard with no change do nothing and "No changes yet" shows | founder rule 3 | `email-settings.tsx`, `sms-settings.tsx`; ui-rules guard (b) covers `notifications` |
| Success is a toast; refusals and a failed test stay inline | founder rule 2 | same files; ui-rules guard (a) |
| A test SMS goes only to the admin's own verified number; Send test pressed without one says why | P04 §7 (unchanged API rule) | `sms-settings.tsx` `test()` |

Company policy choices (already settings with a default): use the YukthiX shared SMS account (default on), monthly
SMS cap (default none), own accounts and their order, email branding and wording per email.

## 6. Questions for the founder (safe default built)

1. **PLT-13 Notification settings (Platform group, 5 stories).** The newer Email and SMS designs do the same jobs and
   are live; PLT-13 also shows an email delivery log and a usage page that the newer designs do not have. Built:
   nothing new; PLT-13 stays in the guard's `notLive` list. Suggested answer: retire the PLT-13 stories, and if an
   email delivery log is wanted, draw it into the Email design first (size M with its API: the email sender would
   need to keep a delivery row per message, as SMS does).

## 7. Left (sizes)

| item | why | size |
|---|---|---|
| PLT-13 Notification settings | question 1 | none if retired; M for an email delivery log |
