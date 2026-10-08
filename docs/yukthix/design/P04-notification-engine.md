# P04 · Notification Engine

> **Status:** ✅ Decided, 24 Sep 2026. All 8 questions answered (§11). **Extended 26 Sep 2026** (gap-register user decision): password-protected payslip PDF by email as a company option (B19, §4.5b), Slack & Microsoft Teams apps (B9, §4.9), desk-UI internationalisation (B18 part, §4.10); §11 rows B19 / B9 / B18.
> **Covers:** spec §2.1.7 (email, SMS, WhatsApp, in-app, per-tenant templates), mobile findings U93 (grouped, actionable notifications), UI brief §7 (push + WhatsApp), P03 (approval events and one-time links).
> **Builds on:** P01 (tenant, locations, time zones), P02 (who may see what), P03 (approval events).

---

## 1. Purpose & scope
One engine turns **events** from every module into the **right message, to the right people, on the right channel, in their language, at a sensible time**, and records delivery.

Examples:
- "Arjun requested leave 5–6 Oct" → Priya (in-app, push, WhatsApp card).
- "Your September payslip is ready" → everyone paid (in-app, push, WhatsApp).
- "Meera's PAN proof expires in 15 days" → HR.
- "PF payment due in 3 days" → Payroll Admin.
- "Priya's birthday today" → her team.

**Out of scope:** approval logic (P03); letters and documents (P05); marketing email to prospects.

---

## 2. What exists today (exam app, `origin/main`)

| Piece | Today | Keep / change |
|---|---|---|
| In-app | `UserNotification` (recipient, actor, type, entity, context text, link, read) + bell (ui-v2 `NotificationBell`) | **Keep** as the inbox; add category, grouping key, actions, priority |
| Preferences | `UserNotificationPreference` (per user × type: email on/off); `User.notificationDigest` immediate / daily / off | **Extend** to all channels + quiet hours |
| Email | Per-org SMTP + `OrgSenderAddress`; `email` module; approval / interview / candidate email templates in separate tables | **Keep providers**; unify templates (§4.3) |
| SMS / WhatsApp | Twilio (+ generic HTTP SMS); candidate-only; free-text templates (`Candidate*Template`) with stage triggers | **Generalise** to employees; add approved-template handling (§4.4) |
| Reminders / digests | `reminders` sweep (daily staff reminders), weekly scheduled report, daily digest | Fold into the scheduler (§4.6) |
| Invitation notifications | `Notification` (exam invitations) | Keep for Proctoring; migrate later |

---

## 3. Concepts

| Term | Meaning |
|---|---|
| **Event** | Something that happened, emitted by a module with a typed payload: `leave.request.submitted`, `payroll.payslip.published`, `document.expiring`, `approval.task.escalated` |
| **Notification type** | A registered, user-facing kind of message tied to an event: category (Approvals, Time, Pay, Documents, People, Security, Announcements), priority, **mandatory?**, default channels, sensitivity |
| **Audience** | Who receives it: explicit people from the payload (requester, approver), roles in scope (P02), followers, or an announcement audience |
| **Template** | Wording per notification type × channel × language; system defaults shipped by YukthiX; tenant overrides where allowed |
| **Channel** | In-app · push (PWA web push; native FCM / APNs from wave 3) · email · WhatsApp · SMS · Slack · Microsoft Teams (B9, §4.9) |
| **Delivery** | One attempt to deliver one message to one recipient on one channel: status, provider id, retries, cost |
| **Digest** | Several low-priority notifications combined into one message at a set time |
| **Group** | In-app / push collapsing: "3 leave requests waiting for you" instead of three items |

**Catalogue:** every notification type, its category (the seven above plus Learning, Performance, Engage, Helpdesk & Cases, Hiring, Assessment, Integrations & System, Billing & Account), trigger, audience, channels, mandatory flag and external-safe variables is listed in [Appendix A · Notification catalogue](APX-A-notifications.md); the events that trigger them are in [Appendix B · Domain event catalogue](APX-B-events.md).

---

## 4. Design

### 4.1 Pipeline
```
module emits event (in DB transaction, outbox table)
 → router: which notification types listen to this event
 → audience resolver (P02 visibility re-checked per recipient at send time)
 → preference & policy filter (mandatory, user choices, quiet hours, sensitivity)
 → render template (recipient's language, time zone, number/date formats)
 → group / digest / dedupe (grouping key, idempotency key)
 → channel adapters (BullMQ queues per channel, retries with backoff)
 → delivery log + provider callbacks (delivered / read / failed / bounced / opted-out)
```
- **Outbox pattern:** events are written in the same transaction as the business change, so no notification is lost or sent for a rolled-back change.
- **Idempotency:** each (event, recipient, channel) is sent at most once, whatever the retries.

### 4.2 In-app inbox & push
- **Inbox:** grouped by category, with unread counts. Items carry **actions**: Approve / Reject for approval tasks (P03 rules apply), Open, Mark done. Groups expand.
- The same feed powers the bell (desktop) and the mobile Home to-dos, so counts match everywhere (P03 YX-WF-14).
- **Push:** web push to the PWA (Android fully; iOS only when installed to the home screen). From wave 3, when the store apps ship (M04 Q1), a **native push adapter** (FCM / APNs device tokens) is added; web push remains for the PWA. The message is short and never includes sensitive values (§4.5).

### 4.3 Templates
- **Store:** `notification_templates (type, channel, language, subject, body, variables, version, source = system/tenant)`.
- **Variables** are typed and permission-aware: a variable the recipient isn't allowed to see (P02) renders as "—" and is flagged in preview.
- **Editing** (Q5): email and in-app are editable by the tenant with preview + test send. WhatsApp and SMS come from **pre-approved** sets (§4.4).
- **Languages** (Q4): each template exists per supported language; the recipient's preferred language is used, falling back to the tenant default, then English.
- **Branding:** tenant logo and colours in email; sender name "Workfox HR via YukthiX" or the tenant's own sender.

### 4.4 Channel specifics (India)

| Channel | Constraint | Design |
|---|---|---|
| **WhatsApp** | Business-initiated messages must use **Meta-approved templates**; free text only within 24 h after the user writes | **Company's own WhatsApp Business number** (Q2), connected via guided sign-up; YukthiX's template library per notification type × language is submitted for approval under the company's account; approvals as interactive buttons (P03 one-time links); inactive until connected |
| **SMS** | India requires **DLT registration** (entity, sender header, template) with TRAI | Use YukthiX's registered sender and templates by default; tenants with their own DLT can plug in theirs |
| **Email** | Deliverability (SPF/DKIM/DMARC) | YukthiX sending domain by default; tenant SMTP / verified domain optional (exam-app SMTP kept) |
| **Push** | Needs the PWA installed + permission; native apps need FCM / APNs device tokens | Web push for the PWA; native push adapter from wave 3 with the store apps (M04 Q1). Prompt after first login on mobile; fall back to WhatsApp for key types if push isn't enabled |

**Cost:** WhatsApp is billed by Meta directly to the company's own WhatsApp Business account (Q2). SMS has per-message costs: included quota, metered overage and a cap, or separate billing on request (Q3), metered with the exam app's billing meters.

### 4.5 Sensitive content
- External channels (email, WhatsApp, SMS, push) **never carry Confidential or Special values** (P02 classes): no salary, net pay, bank details, PAN, Aadhaar, health or POSH content. They say *what* happened and link into the app, which requires login.
  - "Your September payslip is ready" ✅
  - "Net pay ₹1,09,826" ❌
- Approval messages for low-risk types may show the essentials (dates, amount of a small expense); the request-type registry marks which variables are safe for external channels.
- **Confidential cases** (grievance, POSH, disciplinary, whistleblower) use neutral text only, "You have an update on a confidential matter", with an in-app link (M08 YX-CASE-06).
- **One explicit exception (B19, §4.5b):** a company may switch on emailing the payslip as a **password-protected PDF attachment**. The email body itself still carries no amounts; nothing else is attached anywhere; WhatsApp, SMS, push, Slack and Teams stay link-only.

### 4.5b Payslip PDF by email (company option, B19)
Buyers and RFPs ask for the payslip in the inbox. This is a deliberate, narrow exception to Q6 / YX-NTF-04, recorded in §11 B19.
- **Off by default.** The company switches it on per legal entity (optionally per pay group) in *Settings › Payroll › Payslip delivery*; switching it on is audited and notifies the other admins. Company policy (D17) also decides whether employees may opt out individually.
- **What is sent:** on `payslip.published`, the employee's payslip as a PDF (the P05 payslip document, same hash) attached to the `payslip.published.employee` email. The subject and body keep the external-safe text ("Your September payslip is attached"), never an amount.
- **Password:** the PDF is encrypted (AES-256). The password scheme is **company policy**, chosen from labelled starter templates: (a) first 5 characters of PAN in capitals + date of birth `DDMMYYYY` (default template); (b) employee code + date of birth `DDMM`; (c) a password the employee sets in *Me › Notifications*. The email states the **rule** ("PAN first 5 + DOB"), never the password. If the scheme's inputs are missing (no PAN on file, no employee-set password), that employee gets the link-only email and HR sees them in the delivery log.
- **Address:** only the employee's **verified** email of the type the company chooses (work email default; personal verified email allowed, e.g. for field staff without work mail). Never CC / BCC, never a manager or group address; one email per payslip.
- **Other channels:** WhatsApp, SMS, push, Slack and Teams remain **link-only** (user decision 26 Sep 2026); they never attach the PDF.
- **Audit:** each send is a `notification_deliveries` row (masked address, document hash, password scheme id, status) plus an audit event (P08). Bounces fall back to link-only (YX-NTF-11). Corrected payslips (re-publish) send a new PDF marked "revised".
- **Cost:** email only, no third-party per-use cost, so it is included in the price (D18).

### 4.5a OTP / transactional authentication
A separate message class for one-time codes: SMS OTP and WhatsApp **authentication** templates (M04 Q2), e-sign OTP (P05), critical-policy acknowledgement OTP (M08 Q6) and external-login OTPs (P02 §4.7).
- **Bypasses** quiet hours, digests and grouping; sent immediately, never batched.
- Not user-configurable; the body carries only the code, its purpose and expiry.
- SMS OTPs **count toward the tenant's SMS quota** (Q3).

### 4.6 Scheduler (time-based events)
- A daily/hourly job raises events for: document / ID expiry, probation end, contract end, birthdays and work anniversaries (respecting the P02 directory opt-out), holiday tomorrow, statutory due dates (compliance calendar), payroll cut-off, pending proofs, and missing check-in.
- The exam app's `reminders` and scheduled-report jobs move here.
- The full rule list with starter lead times (company-editable, D17) is [APX-A §3](APX-A-notifications.md) (`SCH-01`…`SCH-79`). Statutory due dates have one producer: the compliance-calendar rule SCH-07.

### 4.7 Preferences, quiet hours & digests
- **User preferences:** per category × channel (on/off) + digest cadence for email (immediate / daily / weekly).
- **Mandatory** types can't be switched off: security alerts, bank-detail change confirmation, payslip published, statutory deadlines for owners, POSH notices to committee members.
- **Quiet hours** (Q7): no push/WhatsApp/SMS at night in the recipient's time zone, except urgent types. Messages wait until the morning.
- **Tenant policy** can switch channels off entirely (e.g. no WhatsApp) or set defaults for new employees (Q1).

### 4.8 Announcements (Q8) → Engage (wave 5)
HR posts an announcement:
- **audience:** entity / location / department / grade / everyone;
- **channels;**
- optional **acknowledgement required** (e.g. policy change), with read / acknowledged tracking.

Announcements appear on the mobile Home. They are stored as a post type (`posts.type = announcement`) so the **Engage** module (spec §1.3.16, D14: feed, polls, kudos, celebrations) extends the same table and notification types in wave 5.

### 4.9 Slack & Microsoft Teams apps (B9)
Companies that live in Slack or Teams get an **interactive YukthiX app** there, built on the same conversation design as the WhatsApp assistant (M04 Q6): same intents, same answers, same "sensitive → link to app" rule. Connector and install: P10 B3.

| Capability | In Slack / Teams | Rules |
|---|---|---|
| **Notifications** | Direct messages from the app for any notification type whose user preference includes the new **Slack** / **Teams** channel (§4.7 matrix) | External channel: YX-NTF-04 external-safe variables only; quiet hours as push (YX-NTF-06); grouping as in-app |
| **Approve / reject cards** | Slack Block Kit / Teams Adaptive Card with the request essentials, **Approve**, **Reject** (reason prompt), **Open in YukthiX** | Only request types the P03 registry marks **chat-safe** (same list as WhatsApp one-time approvals; payroll, bank file, compensation and case items are never chat-approvable, they show *Open* only); P03 permissions and no-self-approval re-checked at click; card updates to "Approved by you" for everyone who got it |
| **Check-in / check-out** | `/yukthix in`, `/yukthix out` or a button | Allowed only where the employee's M02 check-in rules permit a **chat punch** (company option, off by default; punch source `slack` / `teams`, IP / geofence rules still apply where configured) |
| **Leave balance** | "What's my leave balance?" | Own balances only (Internal class) |
| **Apply leave** | Modal / card form (type, dates, half-day, reason) | Submitted through the same API as the app (P11 YX-API-02); validation errors identical; company may require in-app confirmation instead |
| **Ask** (wave 5, with the AI helpdesk, P10 Q8) | Policy / holiday questions | Same answers and citations as the WhatsApp assistant; AI credits metered |

- **Account linking:** the tenant admin installs the app to the workspace / tenant (OAuth). Each person links once by **SSO / OAuth**: "Sign in with Slack" or Microsoft Entra ID, matched to a YukthiX user by the verified work email (or the P12 SSO subject). No link, no personal data: the app answers "Connect your YukthiX account" only. Unlinking, exit (M01 deprovisioning) or a workspace change revokes the link immediately.
- **Sensitive data never in chat:** salary, payslips, bank, PAN, tax, cases and health are answered with an **Open in YukthiX** link (login required), exactly like WhatsApp (M04 Q6). The payslip PDF (§4.5b) is never posted to chat.
- **Cost:** Slack and Teams APIs carry no per-use fee, so the apps are included in the price (D18).

### 4.10 Desk UI internationalisation (B18 part)
Q4 set the notification languages; the same languages apply to the screens.
- **Catalogue:** every UI string in `packages/ui` and every product screen (desk, mobile, T9 portals) comes from a **message catalogue** (key, English source, ICU MessageFormat with plurals and gender, context note, max length). CI fails on a hard-coded user-facing string and on a key missing from the English source.
- **Languages:** **English, Hindi, Tamil, Telugu** for all **employee-facing** screens, desk as well as mobile (self-service, requests, payslip viewer, tax centre, policies, portals); **admin / configuration screens English first**, then the same languages in later releases. More languages on demand; the design supports any number.
- **Selection:** the user's language preference (shared with notifications, YX-NTF-08), fallback tenant default → English per missing string (logged). Numbers, currency (₹ lakh / crore grouping), dates and times follow the locale.
- **Translation workflow:** English source frozen per release → machine draft → review by a native-speaker HR reviewer → glossary check (automated) → pseudo-localisation and truncation test in CI (layouts tolerate ~40 % expansion) → published with the release. Tenant-edited content (templates, policy text, custom fields) is translated by the company.
- **Glossary:** a governed HR / statutory glossary per language (e.g. "Loss of pay", "Gratuity", "Full & final") with approved terms; statutory acronyms (PF, ESI, PAN, TDS, UAN) stay untranslated. Companies may override **labels** (e.g. "Leave" → "Time off") per language as a tenant glossary (D17), never legal or statutory terms.
- **Cost:** included (D18).

---

## 5. Data model

| Table | Key columns |
|---|---|
| `event_outbox` | `organization_id`, `event_type`, `payload jsonb`, `occurred_at`, `processed_at` |
| `notification_types` (registry in code, mirrored) | `key`, `category`, `priority`, `mandatory`, `default_channels[]`, `sensitivity`, `group_key_rule`; every key must exist in [APX-A](APX-A-notifications.md) |
| `notification_templates` | `organization_id` (null = system), `type`, `channel`, `language`, `subject`, `body`, `version`, `approved_ref` (WhatsApp/SMS) |
| `notifications` (inbox, extends `UserNotification`) | `recipient_user_id`, `type`, `category`, `entity_type/id`, `title`, `body`, `actions jsonb`, `group_key`, `priority`, `read_at`, `done_at` |
| `notification_deliveries` | `notification_id`, `channel`, `address` (masked), `status`, `provider`, `provider_msg_id`, `attempts`, `error`, `cost_units`, `sent_at`, `delivered_at`, `read_at` |
| `notification_preferences` | `user_id`, `category`, `channel`, `enabled`, `digest` |
| `channel_accounts` | `organization_id`, `channel`, `provider`, `config_encrypted`, `sender`, `status` (shared YukthiX / tenant-owned) |
| `posts` (`type = announcement`, §4.8, M09) + `post_receipts` | audience filter, channels, body, ack required, publish/expiry; per-user read/ack |
| `push_devices` | `user_id`, `platform` (web / android / ios), `token` (web-push subscription, FCM or APNs), `last_seen_at`, `status` |
| `channel_consents` | per-recipient WhatsApp / SMS opt-in record: `recipient_type`, `recipient_id`, `channel` (whatsapp / sms), `address_hash`, `address_masked`, `scope` (all service / authentication only), `source` (M04 first run, Me settings, pre-boarding, candidate apply / portal, kiosk or HR-recorded paper form, client portal, OTP prompt, inbound WhatsApp, import), `text_version`, `language`, `captured_at`, `captured_by`, `evidence`, `withdrawn_at`, `withdrawal_source`; append-only (details: [APX-A §5](APX-A-notifications.md)) |
| `payslip_email_policies` (B19) | `legal_entity_id`, `pay_group_id?`, `enabled` (default false), `password_scheme` (pan5_dob · empcode_dobddmm · employee_set), `address_type` (work / personal_verified), `employee_opt_out_allowed`, `valid_from`, `changed_by` |
| `chat_links` (B9) | `user_id`, `platform` (slack / teams), `workspace_id`, `external_user_id`, `linked_via` (slack_oauth / entra_oidc / sso), `linked_at`, `revoked_at` |
| `ui_messages` / `ui_translations` (B18, platform catalogue) | key, English source, context, max length, version · key × language, text, status (machine / reviewed / published), reviewer; `tenant_label_overrides` (tenant, key, language, text) carries `organization_id` |

All tables carry `organization_id` + RLS (P01), except the platform string catalogue (`ui_messages` / `ui_translations`, P07 YX-STAT-10 exemption).

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-NTF-01 | Events are written through a transactional outbox; a notification is never sent for a rolled-back change and never lost for a committed one. |
| YX-NTF-02 | Each (event, recipient, channel) is delivered at most once (idempotency key), across retries and restarts. |
| YX-NTF-03 | Audience visibility is re-checked with P02 at send time; a recipient who can't see the subject gets nothing. |
| YX-NTF-04 | External channels never include Confidential or Special values; templates may only use variables marked external-safe for that type. **Sole exception:** the company-enabled password-protected payslip PDF attached to email (YX-NTF-15); no other channel, document or value is excepted. |
| YX-NTF-05 | Mandatory notification types can't be disabled by users; others follow user preferences, then tenant policy, then defaults. |
| YX-NTF-06 | Quiet hours apply per recipient time zone to push, WhatsApp and SMS; only urgent types and OTP messages (YX-NTF-13) bypass them. |
| YX-NTF-07 | WhatsApp business-initiated messages use approved templates only; SMS uses DLT-registered templates; a send without a valid approved template falls back to another enabled channel and logs why. |
| YX-NTF-08 | Rendering uses the recipient's language (fallback tenant default → English) and locale formats (₹ grouping, dates). |
| YX-NTF-09 | In-app items for the same group key within a window collapse into one grouped item with a count; counts equal the source query (P03 YX-WF-14). |
| YX-NTF-10 | Every delivery attempt is logged with status and provider id; failures retry with backoff, then surface in an admin delivery log. |
| YX-NTF-11 | Bounces, WhatsApp blocks and SMS opt-outs update the channel status for that address; the engine stops using it until the address changes. |
| YX-NTF-13 | OTP / transactional-authentication messages (§4.5a) bypass quiet hours, digests and grouping, are sent immediately via SMS or WhatsApp authentication templates, and SMS OTPs count toward the tenant's SMS quota. |
| YX-NTF-12 | Per-tenant SMS usage is metered for billing (included quota + overage, or separate billing) and can be capped by the tenant; WhatsApp message counts are logged for the tenant's own reference (Meta bills the tenant directly). |
| YX-NTF-14 | WhatsApp and SMS are sent to a recipient only with an **active opt-in** for that channel and number in `channel_consents` (source, consent text version, time; Meta and TRAI-DLT requirement). Without one, the message goes by in-app, push and email instead and the fallback is logged; mandatory and transactional types are never dropped. An OTP goes by SMS / WhatsApp only when the person asked for it on that channel or has an active opt-in. A STOP reply, the user's toggle, HR or a provider opt-out sets `withdrawn_at` and stops that channel (YX-NTF-11). |
| YX-NTF-15 | **Payslip PDF by email (B19):** only when the legal entity's `payslip_email_policies` is enabled (default **off**); the PDF is AES-256 password-protected with the company's chosen scheme; the email states the scheme, never the password, and no amount; it goes only to the employee's verified address of the configured type, never CC / BCC; missing scheme inputs → link-only email; every send is logged and audited with the document hash. WhatsApp, SMS, push, Slack and Teams never carry the PDF (link only). |
| YX-NTF-16 | **Slack / Teams apps (B9):** act only for users linked by SSO / OAuth (`chat_links`); unlinked users get no personal data; approve / reject only for request types marked chat-safe in the P03 registry, with P03 permissions and self-approval re-checked at the click; chat check-in only where the M02 rules allow a chat punch; all writes go through the public API layer (P11 YX-API-02); messages follow YX-NTF-04 and sensitive answers are an in-app link; exit or unlink revokes access at once. |
| YX-NTF-17 | **UI strings (B18):** every user-facing string comes from the message catalogue (CI fails on hard-coded strings); employee-facing desk, mobile and portal screens ship in English, Hindi, Tamil and Telugu, admin screens English first; missing translations fall back per string to the tenant default then English and are logged; published translations pass native review and the glossary check; tenant label overrides never change statutory or legal terms. |

---

## 7. UI
- **Bell / inbox** (desktop) and **mobile Home to-dos**: grouped, actionable, filter by category.
- **Me › Notifications:** a channel × category matrix with toggles, digest choice, quiet hours, language.
- **Settings › Notifications** (admin): enable channels, sender identity, tenant defaults, template editor (email/in-app) with variable picker, preview and test send; WhatsApp/SMS template picker; delivery log with search; usage and costs.
- **Announcements:** composer with audience picker, channel choice, acknowledgement tracking.
- **Settings › Payroll › Payslip delivery** (B19): off / on per entity or pay group, password-scheme picker (starter templates), address type, employee opt-out switch, preview of the email.
- **Settings › Integrations › Slack / Teams** (B9): install, linked-user count, chat-safe request types, chat punch switch; **Me › Connected apps:** link / unlink.
- **Me › Language** applies to screens and notifications (B18); **Settings › Language & labels:** tenant default language, label overrides per language.

---

## 8. Migration (exam app)
1. `UserNotification` → `notifications` (add columns); preferences mapped (email on/off → category × email).
2. Email/SMS/WhatsApp modules become channel adapters behind the pipeline; candidate templates stay for ATS flows and join the unified store later.
3. `reminders` and scheduled-report jobs move to the scheduler (§4.6).
4. `ApprovalEmailTemplate` → templates for `approval.*` types.

---

## 9. Acceptance tests (samples)
- A leave approved inside a transaction that later rolls back sends nothing (YX-NTF-01).
- A crash between provider send and DB update does not produce a duplicate WhatsApp on retry (YX-NTF-02).
- The payslip-published WhatsApp contains no amount; the in-app item links to the payslip after login (YX-NTF-04).
- A 10 pm request notifies Priya's in-app inbox immediately and her WhatsApp at 8 am (YX-NTF-06).
- Five leave requests in an hour show as one grouped item "5 leave requests waiting" (YX-NTF-09).
- A Tamil-preference employee receives Tamil WhatsApp templates; missing translation falls back to English (YX-NTF-08).
- B19: with the option off (default), the payslip email has no attachment. With it on and scheme "PAN5 + DOB", the PDF opens only with `ABCDE01011990` for PAN ABCDE1234F / DOB 01-01-1990; the email body contains neither the password nor any amount; the WhatsApp message for the same payslip is still link-only (YX-NTF-15).
- B19: an employee with no PAN on file under scheme "PAN5 + DOB" gets the link-only email and appears in the delivery log as "no password input" (YX-NTF-15).
- B9: a manager linked via Entra ID approves a leave card in Teams; the leave is approved with source "teams" in the timeline; a payroll-run approval arrives in Teams with **Open in YukthiX** only; an unlinked Slack user asking "my leave balance" gets only a connect prompt (YX-NTF-16).
- B18: a Telugu-preference employee sees the desk leave screen in Telugu with "PF" untranslated; a string missing in Telugu shows in English and is logged; a build with a hard-coded English label fails CI (YX-NTF-17).

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Default channels for employees? | **In-app + push always; WhatsApp for key events** (approvals to managers, request outcomes, payslip ready, check-in reminders) when the tenant enables WhatsApp; **email** for desk users and admins. Users can adjust. |
| Q2 | WhatsApp number: one shared YukthiX business number, or each company's own? | **Shared YukthiX number by default** ("Workfox HR via YukthiX"); a company can connect its own WhatsApp Business number for branding. |
| Q3 | Who pays for SMS (WhatsApp is now billed by Meta to the company's own account, per Q2)? | **Included monthly SMS quota per employee in each plan**, with metered overage; the tenant can cap spend. |
| Q4 | Languages at launch for employee notifications? | **English, Hindi, Tamil, Telugu** at launch (admin screens English first); more later. |
| Q5 | Can companies edit notification wording? | **Email and in-app: yes**, with preview and test send. **WhatsApp/SMS:** choose from our pre-approved set; new wording requests go through Meta/DLT approval by us. |
| Q6 | Sensitive data in email/WhatsApp/SMS/push? | **Never** Confidential/Special values; link to the app instead (YX-NTF-04). |
| Q7 | Quiet hours? | **Default 9 pm–8 am** local, per-user adjustable; urgent types (security, same-day shift change) bypass. |
| Q8 | Company announcements (broadcast with optional acknowledgement) in this engine at launch? | **Yes**, simple version: audience, channels, read/acknowledge tracking. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Defaults:** in-app + push for everyone; WhatsApp for key events (approval requests to managers, request outcomes, payslip ready, check-in reminders) when the tenant enables WhatsApp; email on for desk users/admins, off by default for field/shop-floor staff (tenant sets which employment types or locations count as field). Users can change their own. | 24 Sep 2026 |
| Q2 | **Each company connects its own WhatsApp Business number** (no shared YukthiX number). WhatsApp stays inactive until connected; key events use push/SMS/email meanwhile. YukthiX provides guided connection (Meta embedded sign-up via our BSP) as a set-up checklist step, and auto-submits the YukthiX template library (all launch languages) for approval under the company's account, showing per-template status. Meta bills WhatsApp conversations to the company's own account. | 24 Sep 2026 |
| Q3 | **SMS: monthly quota per employee included in the plan (one plan per product + add-ons), metered overage, tenant-set spending cap.** On request, a company can instead be **billed separately for all SMS usage** (no included quota). Metering reuses the exam app's billing meters. | 24 Sep 2026 |
| Q4 | **Launch languages for employee-facing notifications: English, Hindi, Tamil, Telugu**; per-employee preference, fallback tenant default → English; admin screens English first. More languages added on customer demand (design supports any number). Also answers UI brief open decision 3 for notifications. | 24 Sep 2026 |
| Q5 | **Email and in-app wording editable** by the tenant (typed variables, preview, test send, reset to default). **WhatsApp and SMS: choose from the YukthiX pre-approved library**; new wording is requested in-app and submitted by YukthiX for Meta approval under the company's own WhatsApp account (or DLT registration), usable once approved. | 24 Sep 2026 |
| Q6 | **No Confidential or Special values in any external channel** (email, WhatsApp, SMS, push) — not configurable by tenants. Messages state what happened and link into the app (login required). Only variables marked external-safe per request type (e.g. leave dates, small-expense amount for approvers) may appear. Rule YX-NTF-04. | 24 Sep 2026 |
| Q7 | **Quiet hours 9 pm–8 am** in the recipient's time zone for push, WhatsApp and SMS (in-app unaffected); tenant can change the default, each user can adjust theirs. **Urgent types bypass:** security alerts, same-day shift changes, and shift-related reminders for employees whose current shift falls in those hours (night shift). Held messages are sent at the end of quiet hours, grouped. | 24 Sep 2026 |
| Q8 | **Simple announcements at launch** (audience, channels, optional acknowledgement with tracking and reminders; shown on mobile Home). Designed so an announcement becomes one **post type** of the Engage feed (spec §1.3.16, D14, wave 5); notification grouping already covers social activity ("12 people reacted to your post"). | 24 Sep 2026 |
| F1/F3/H6 | **Consistency fix — catalogue appendix and channel opt-in added** (GAP-REGISTER F1, F3, H6): every notification type is enumerated in [APX-A](APX-A-notifications.md) (categories extended with Learning, Performance, Engage, Helpdesk & Cases, Hiring, Assessment, Integrations & System, Billing & Account; trigger, audience, channels, mandatory, external-safe variables, digest); the scheduler rules with starter lead times are APX-A §3 (SCH-01…72; statutory due dates from SCH-07 only); the WhatsApp / SMS template pack is APX-A §4; a per-recipient WhatsApp / SMS opt-in record `channel_consents` and rule YX-NTF-14 are added (§5, §6, APX-A §5). | 26 Sep 2026 |
| B19 | **Gap-register extension (user decision 26 Sep 2026): payslip as a password-protected PDF by email — an explicit, narrow exception to Q6.** Company option per legal entity / pay group, **off by default**; PDF AES-256 encrypted with a company-chosen password scheme from starter templates (PAN first 5 + DOB default; employee code + DOB; employee-set); the email states the scheme, never the password or any amount; only to the employee's verified address, never CC; missing inputs → link-only; every send logged and audited. **WhatsApp stays link-only** (as do SMS, push, Slack, Teams). Included in the price (D18). Q6 and its row above are unchanged except for this exception; YX-NTF-04 amended to point to the new rule YX-NTF-15 (§4.5, §4.5b). | 26 Sep 2026 |
| B9 | **Gap-register extension (user decision 26 Sep 2026): Slack & Microsoft Teams interactive apps** reusing the WhatsApp assistant conversation design (M04 Q6): notifications as a channel, approve / reject cards for chat-safe request types, check-in / out where the company allows a chat punch, leave balance, apply leave, policy questions with the wave-5 AI helpdesk; account linking by SSO / OAuth; sensitive data never in chat (link to the app). Included in the price (D18); connector in P10 B3. §4.9, YX-NTF-16. | 26 Sep 2026 |
| B18 | **Gap-register extension (user decision 26 Sep 2026): desk-UI internationalisation.** All UI strings in a message catalogue (ICU, CI-enforced); English, Hindi, Tamil, Telugu for employee-facing desk, mobile and portal screens (extends Q4 from notifications to screens); admin screens English first, then the same languages; translation workflow (machine draft → native HR review → glossary check → pseudo-localisation in CI); governed HR / statutory glossary; tenant label overrides per language (D17), never for statutory terms. Included (D18). §4.10, YX-NTF-17. Multi-currency expenses and WCAG remain with M05 / the UI brief. | 26 Sep 2026 |
| Q5 build | **Built 8 Oct 2026 (founder: "customer can also customise the email how they want"), email part, for the account emails.** Settings › Notifications › Email: per company, **branding** (company logo from Branding settings on/off, button accent colour checked for WCAG AA 4.5:1 against white text, sender display name always shown as "<name> via YukthiX" from YukthiX's verified address, optional reply-to) and **wording** per email type and language (English now): subject, heading, intro, button label, footer, with a typed placeholder picker (whitelist per type, e.g. `{{firstName}}`, `{{companyName}}`), live preview of the real email, "Send me a test" (to the admin's own address only) and "Reset to YukthiX wording". **Locked:** the button's link, codes, expiry lines, the "If this wasn't you / Didn't ask for this" safety lines, the When / Device / Place / IP block, what changed, the YukthiX footer. Tenants type plain text only: Handlebars parses it, only bare whitelisted placeholders are accepted (no blocks, helpers, paths, partials or raw output), no markup, links, web or email addresses; every value is escaped into the HTML; a stored text that breaks the rules falls back to the YukthiX wording. Tables `email_branding`, `email_template_overrides` (forced RLS); permission `notification.template.manage` (System Admin by default, assignable); every change audited with before / after. The platform console's emails to YukthiX staff and the new-company welcome stay YukthiX-owned. In-app wording, other languages and the remaining notification types follow with the unified template store (§4.3). | 8 Oct 2026 |
| Account emails | **No unsubscribe line on account and security emails** (sign-in codes, set-password, reset, security alerts): they are transactional and must always arrive (founder, confirmed 8 Oct 2026). Set-password links: **72 hours** for welcome and invitation emails, **15 minutes** for password reset; single-use, newest link only. | 8 Oct 2026 |
